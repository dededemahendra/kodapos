import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

type Setup = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
};

async function setup(
  t: ReturnType<typeof convexTest>,
  opts: { email?: string } = {}
): Promise<Setup> {
  const email = opts.email ?? 'o@x.com';
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: 'Asia/Jakarta',
    taxRatePct: 0,
    taxEnabled: false,
  });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  return { asOwner, cafeId, cashierId };
}

// Deterministic range: a fixed local day in Asia/Jakarta (UTC+7). Local midnight
// of 2026-06-01 is 2026-05-31T17:00:00Z. We seed sessions at noon local that day.
const RANGE = { from: '2026-06-01', to: '2026-06-01' } as const;
const NOON = Date.UTC(2026, 5, 1, 5, 0, 0); // 12:00 Asia/Jakarta on 2026-06-01
const MIN = 60_000;

describe('timeClock clock in/out', () => {
  it('clockIn lists in currentlyIn; a second clockIn for the same cashier rejects', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);

    await asOwner.mutation(api.timeClock.clockIn, { cashierId });
    const inNow = await asOwner.query(api.timeClock.currentlyIn, {});
    expect(inNow).toHaveLength(1);
    expect(inNow[0]?.cashierId).toBe(cashierId);
    expect(inNow[0]?.cashierName).toBe('Andi');

    await expect(asOwner.mutation(api.timeClock.clockIn, { cashierId })).rejects.toThrow(/sudah/i);
  });

  it('clockOut closes the session; currentlyIn excludes them; clockOut with no open session throws', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);

    await asOwner.mutation(api.timeClock.clockIn, { cashierId });
    await asOwner.mutation(api.timeClock.clockOut, { cashierId });
    const inNow = await asOwner.query(api.timeClock.currentlyIn, {});
    expect(inNow).toHaveLength(0);

    await expect(asOwner.mutation(api.timeClock.clockOut, { cashierId })).rejects.toThrow(/belum/i);
  });
});

describe('timeClock report', () => {
  it('sums closed sessions (60 + 30 = 90 min, 2 sessions) within the range', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, cashierId } = await setup(t);

    await t.run(async (ctx) => {
      await ctx.db.insert('timeClock', {
        cafeId,
        cashierId,
        clockInAt: NOON,
        clockOutAt: NOON + 60 * MIN,
      });
      await ctx.db.insert('timeClock', {
        cafeId,
        cashierId,
        clockInAt: NOON + 120 * MIN,
        clockOutAt: NOON + 150 * MIN,
      });
    });

    const report = await asOwner.query(api.timeClock.report, { range: RANGE });
    expect(report.fromKey).toBe('2026-06-01');
    expect(report.toKey).toBe('2026-06-01');
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.cashierId).toBe(cashierId);
    expect(report.rows[0]?.cashierName).toBe('Andi');
    expect(report.rows[0]?.sessionCount).toBe(2);
    expect(report.rows[0]?.totalMinutes).toBe(90);
    expect(report.totalMinutes).toBe(90);
  });

  it('an open session counts up to now (totalMinutes >= 0)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, cashierId } = await setup(t);

    // Open session clocked in today; counts up to now.
    await asOwner.mutation(api.timeClock.clockIn, { cashierId });
    const report = await asOwner.query(api.timeClock.report, { range: { preset: 'today' } });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.sessionCount).toBe(1);
    expect(report.rows[0]?.totalMinutes).toBeGreaterThanOrEqual(0);
  });

  it('a session outside the range is excluded', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, cashierId } = await setup(t);

    await t.run(async (ctx) => {
      // In range
      await ctx.db.insert('timeClock', {
        cafeId,
        cashierId,
        clockInAt: NOON,
        clockOutAt: NOON + 60 * MIN,
      });
      // Out of range (a day earlier)
      await ctx.db.insert('timeClock', {
        cafeId,
        cashierId,
        clockInAt: NOON - 24 * 60 * MIN,
        clockOutAt: NOON - 24 * 60 * MIN + 60 * MIN,
      });
    });

    const report = await asOwner.query(api.timeClock.report, { range: RANGE });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.sessionCount).toBe(1);
    expect(report.rows[0]?.totalMinutes).toBe(60);
  });

  it('a second cashier is a separate row; rows sorted by name', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, cashierId } = await setup(t);
    const cashierZId = await asOwner.mutation(api.staff.create, { name: 'Zaki', pin: '5678' });
    const cashierBId = await asOwner.mutation(api.staff.create, { name: 'Budi', pin: '4321' });

    await t.run(async (ctx) => {
      await ctx.db.insert('timeClock', {
        cafeId,
        cashierId: cashierZId,
        clockInAt: NOON,
        clockOutAt: NOON + 30 * MIN,
      });
      await ctx.db.insert('timeClock', {
        cafeId,
        cashierId: cashierBId,
        clockInAt: NOON,
        clockOutAt: NOON + 30 * MIN,
      });
      await ctx.db.insert('timeClock', {
        cafeId,
        cashierId,
        clockInAt: NOON,
        clockOutAt: NOON + 30 * MIN,
      });
    });

    const report = await asOwner.query(api.timeClock.report, { range: RANGE });
    expect(report.rows.map((r) => r.cashierName)).toEqual(['Andi', 'Budi', 'Zaki']);
    expect(report.rows).toHaveLength(3);
  });
});

describe('timeClock owner-scope', () => {
  it('a foreign cashier id rejects in clockIn and clockOut', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const other = await setup(t, { email: 'b@x.com' });

    await expect(
      asOwner.mutation(api.timeClock.clockIn, { cashierId: other.cashierId })
    ).rejects.toThrow();
    await expect(
      asOwner.mutation(api.timeClock.clockOut, { cashierId: other.cashierId })
    ).rejects.toThrow();
  });
});
