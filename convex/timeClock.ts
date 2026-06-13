import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { rangeArg, resolveRange, tzFor } from './lib/time';

export const clockIn = mutation({
  args: { cashierId: v.id('cafeStaff') },
  returns: v.id('timeClock'),
  handler: async (ctx, { cashierId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, cashierId, 'Staf');
    const open = await ctx.db
      .query('timeClock')
      .withIndex('by_cafe_cashier', (q) => q.eq('cafeId', cafeId).eq('cashierId', cashierId))
      .filter((q) => q.eq(q.field('clockOutAt'), undefined))
      .first();
    if (open) throw new Error('Sudah clock in.');
    return await ctx.db.insert('timeClock', {
      cafeId,
      cashierId,
      clockInAt: Date.now(),
    });
  },
});

export const clockOut = mutation({
  args: { cashierId: v.id('cafeStaff') },
  returns: v.null(),
  handler: async (ctx, { cashierId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, cashierId, 'Staf');
    const open = await ctx.db
      .query('timeClock')
      .withIndex('by_cafe_cashier', (q) => q.eq('cafeId', cafeId).eq('cashierId', cashierId))
      .filter((q) => q.eq(q.field('clockOutAt'), undefined))
      .first();
    if (!open) throw new Error('Belum clock in.');
    await ctx.db.patch(open._id, { clockOutAt: Date.now() });
    return null;
  },
});

export const currentlyIn = query({
  args: {},
  returns: v.array(
    v.object({
      cashierId: v.id('cafeStaff'),
      cashierName: v.string(),
      clockInAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('timeClock')
      .withIndex('by_cafe_clockin', (q) => q.eq('cafeId', cafeId))
      .filter((q) => q.eq(q.field('clockOutAt'), undefined))
      .collect();
    const staff = await ctx.db
      .query('cafeStaff')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    const nameById = new Map(staff.map((s) => [s._id, s.name] as const));
    return rows
      .sort((a, b) => a.clockInAt - b.clockInAt)
      .map((r) => ({
        cashierId: r.cashierId,
        cashierName: nameById.get(r.cashierId) ?? '—',
        clockInAt: r.clockInAt,
      }));
  },
});

export const report = query({
  args: { range: rangeArg },
  returns: v.object({
    rows: v.array(
      v.object({
        cashierId: v.id('cafeStaff'),
        cashierName: v.string(),
        sessionCount: v.number(),
        totalMinutes: v.number(),
      })
    ),
    totalMinutes: v.number(),
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { range }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const tz = await tzFor(ctx, cafeId);
    const now = Date.now();
    const { startMs, endMs, fromKey, toKey } = resolveRange(tz, range, now);
    const rows = await ctx.db
      .query('timeClock')
      .withIndex('by_cafe_clockin', (q) =>
        q.eq('cafeId', cafeId).gte('clockInAt', startMs).lte('clockInAt', endMs)
      )
      .collect();
    const staff = await ctx.db
      .query('cafeStaff')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    const nameById = new Map(staff.map((s) => [s._id, s.name] as const));

    const byCashier = new Map<string, { sessionCount: number; totalMinutes: number }>();
    for (const r of rows) {
      const minutes = Math.round(((r.clockOutAt ?? now) - r.clockInAt) / 60000);
      const key = r.cashierId;
      const acc = byCashier.get(key) ?? { sessionCount: 0, totalMinutes: 0 };
      acc.sessionCount += 1;
      acc.totalMinutes += minutes;
      byCashier.set(key, acc);
    }

    const reportRows = [...byCashier.entries()]
      .map(([cashierId, acc]) => ({
        cashierId: cashierId as (typeof rows)[number]['cashierId'],
        cashierName: nameById.get(cashierId as (typeof rows)[number]['cashierId']) ?? '—',
        sessionCount: acc.sessionCount,
        totalMinutes: acc.totalMinutes,
      }))
      .sort((a, b) => a.cashierName.localeCompare(b.cashierName));

    const totalMinutes = reportRows.reduce((s, r) => s + r.totalMinutes, 0);
    return { rows: reportRows, totalMinutes, fromKey, toKey };
  },
});

export const payroll = query({
  args: { range: rangeArg },
  returns: v.object({
    rows: v.array(
      v.object({
        staffId: v.id('cafeStaff'),
        name: v.string(),
        totalMinutes: v.number(),
        hours: v.number(),
        hourlyRateIDR: v.number(),
        payIDR: v.number(),
      })
    ),
    totalPayIDR: v.number(),
    totalMinutes: v.number(),
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { range }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const tz = await tzFor(ctx, cafeId);
    const now = Date.now();
    const { startMs, endMs, fromKey, toKey } = resolveRange(tz, range, now);
    const rows = await ctx.db
      .query('timeClock')
      .withIndex('by_cafe_clockin', (q) =>
        q.eq('cafeId', cafeId).gte('clockInAt', startMs).lte('clockInAt', endMs)
      )
      .collect();
    const staff = await ctx.db
      .query('cafeStaff')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    const nameById = new Map(staff.map((s) => [s._id, s.name] as const));
    const rateById = new Map(staff.map((s) => [s._id, s.hourlyRateIDR ?? 0] as const));

    const byStaff = new Map<string, number>();
    for (const r of rows) {
      const minutes = Math.round(((r.clockOutAt ?? now) - r.clockInAt) / 60000);
      const key = r.cashierId;
      byStaff.set(key, (byStaff.get(key) ?? 0) + minutes);
    }

    const payrollRows = [...byStaff.entries()]
      .map(([staffId, mins]) => {
        const id = staffId as (typeof rows)[number]['cashierId'];
        const hourlyRateIDR = rateById.get(id) ?? 0;
        const hours = Math.round((mins / 60) * 100) / 100;
        const payIDR = Math.round((mins / 60) * hourlyRateIDR);
        return {
          staffId: id,
          name: nameById.get(id) ?? '?',
          totalMinutes: mins,
          hours,
          hourlyRateIDR,
          payIDR,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const totalMinutes = payrollRows.reduce((s, r) => s + r.totalMinutes, 0);
    const totalPayIDR = payrollRows.reduce((s, r) => s + r.payIDR, 0);
    return { rows: payrollRows, totalPayIDR, totalMinutes, fromKey, toKey };
  },
});
