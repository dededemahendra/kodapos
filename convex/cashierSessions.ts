import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireActiveOutlet } from './lib/auth';

export const record = mutation({
  args: {
    cashierId: v.id('cafeStaff'),
    type: v.union(v.literal('login'), v.literal('switch'), v.literal('logout')),
  },
  returns: v.id('cashierSessions'),
  handler: async (ctx, { cashierId, type }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const openShift = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .first();
    return await ctx.db.insert('cashierSessions', {
      cafeId,
      cashierId,
      ...(openShift ? { shiftId: openShift._id } : {}),
      type,
      at: Date.now(),
    });
  },
});

export const listForShift = query({
  args: { shiftId: v.id('shifts') },
  returns: v.array(
    v.object({
      _id: v.id('cashierSessions'),
      cashierId: v.id('cafeStaff'),
      cashierName: v.string(),
      type: v.union(v.literal('login'), v.literal('switch'), v.literal('logout')),
      at: v.number(),
    })
  ),
  handler: async (ctx, { shiftId }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const rows = await ctx.db
      .query('cashierSessions')
      .withIndex('by_shift', (q) => q.eq('shiftId', shiftId))
      .collect();
    const staff = await ctx.db
      .query('cafeStaff')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    const nameById = new Map(staff.map((s) => [s._id, s.name] as const));
    return rows
      .filter((r) => r.cafeId === cafeId)
      .sort((a, b) => a.at - b.at)
      .map((r) => ({
        _id: r._id,
        cashierId: r.cashierId,
        cashierName: nameById.get(r.cashierId) ?? '—',
        type: r.type,
        at: r.at,
      }));
  },
});
