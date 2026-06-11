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
  shiftId: Id<'shifts'>;
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
  const shiftId = await asOwner.mutation(api.shifts.open, {
    cashierId,
    openingFloatIDR: 100000,
  });
  return { asOwner, cafeId, cashierId, shiftId };
}

describe('cashierSessions', () => {
  it('record attaches the open shift; listForShift returns ordered events with names', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId } = await setup(t);
    await asOwner.mutation(api.cashierSessions.record, { cashierId, type: 'login' });
    await asOwner.mutation(api.cashierSessions.record, { cashierId, type: 'switch' });
    await asOwner.mutation(api.cashierSessions.record, { cashierId, type: 'logout' });
    const list = await asOwner.query(api.cashierSessions.listForShift, { shiftId });
    expect(list.map((e) => e.type)).toEqual(['login', 'switch', 'logout']);
    expect(list.every((e) => e.cashierName.length > 0)).toBe(true);
  });

  it('record omits shiftId when no shift is open', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId } = await setup(t);
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 });
    const id = await asOwner.mutation(api.cashierSessions.record, { cashierId, type: 'logout' });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.shiftId).toBeUndefined();
  });
});
