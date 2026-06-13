import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: 'Asia/Jakarta',
    taxRatePct: 0,
    taxEnabled: false,
  });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id as Id<'cafes'>;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  return { asOwner, cafeId, cashierId };
}

// Asia/Jakarta (UTC+7); local noon of 2026-06-01.
const RANGE = { from: '2026-06-01', to: '2026-06-01' } as const;
const NOON = Date.UTC(2026, 5, 1, 5, 0, 0);
const MIN = 60_000;

describe('timeClock payroll', () => {
  it('a 120-minute session at 20000/hr → hours 2, pay 40000', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, cashierId } = await setup(t);

    await t.run(async (ctx) => {
      await ctx.db.insert('timeClock', {
        cafeId,
        cashierId,
        clockInAt: NOON,
        clockOutAt: NOON + 120 * MIN,
      });
    });
    await asOwner.mutation(api.staff.setHourlyRate, { id: cashierId, hourlyRateIDR: 20000 });

    const payroll = await asOwner.query(api.timeClock.payroll, { range: RANGE });
    expect(payroll.fromKey).toBe('2026-06-01');
    expect(payroll.toKey).toBe('2026-06-01');
    expect(payroll.rows).toHaveLength(1);
    const row = payroll.rows[0]!;
    expect(row.staffId).toBe(cashierId);
    expect(row.name).toBe('Andi');
    expect(row.totalMinutes).toBe(120);
    expect(row.hours).toBe(2);
    expect(row.hourlyRateIDR).toBe(20000);
    expect(row.payIDR).toBe(40000);
    expect(payroll.totalMinutes).toBe(120);
    expect(payroll.totalPayIDR).toBe(40000);
  });

  it('a staff with no rate → payIDR 0; total still includes the rated staff', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, cashierId } = await setup(t);
    const norateId = await asOwner.mutation(api.staff.create, { name: 'Zaki', pin: '5678' });

    await t.run(async (ctx) => {
      await ctx.db.insert('timeClock', {
        cafeId,
        cashierId,
        clockInAt: NOON,
        clockOutAt: NOON + 120 * MIN,
      });
      await ctx.db.insert('timeClock', {
        cafeId,
        cashierId: norateId,
        clockInAt: NOON,
        clockOutAt: NOON + 60 * MIN,
      });
    });
    await asOwner.mutation(api.staff.setHourlyRate, { id: cashierId, hourlyRateIDR: 20000 });

    const payroll = await asOwner.query(api.timeClock.payroll, { range: RANGE });
    expect(payroll.rows.map((r) => r.name)).toEqual(['Andi', 'Zaki']);
    const zaki = payroll.rows.find((r) => r.name === 'Zaki')!;
    expect(zaki.hourlyRateIDR).toBe(0);
    expect(zaki.payIDR).toBe(0);
    expect(zaki.hours).toBe(1);
    expect(payroll.totalPayIDR).toBe(40000);
    expect(payroll.totalMinutes).toBe(180);
  });

  it('setHourlyRate rejects a negative or non-integer rate', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    await expect(
      asOwner.mutation(api.staff.setHourlyRate, { id: cashierId, hourlyRateIDR: -1 })
    ).rejects.toThrow(/tarif tidak valid/i);
    await expect(
      asOwner.mutation(api.staff.setHourlyRate, { id: cashierId, hourlyRateIDR: 1000.5 })
    ).rejects.toThrow(/tarif tidak valid/i);
  });

  it('setHourlyRate rejects a foreign staff id', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const other = await setup(t, 'b@x.com');
    await expect(
      asOwner.mutation(api.staff.setHourlyRate, { id: other.cashierId, hourlyRateIDR: 10000 })
    ).rejects.toThrow();
  });
});
