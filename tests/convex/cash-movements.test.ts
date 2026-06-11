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

describe('cashMovements', () => {
  it('records a movement against the open shift and lists it', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId } = await setup(t);
    const id = await asOwner.mutation(api.cashMovements.record, {
      direction: 'out',
      amountIDR: 15000,
      note: 'beli es',
    });
    expect(id).toBeDefined();
    const list = await asOwner.query(api.cashMovements.listForShift, { shiftId });
    expect(list).toHaveLength(1);
    expect(list[0]?.direction).toBe('out');
    expect(list[0]?.amountIDR).toBe(15000);
    expect(list[0]?.note).toBe('beli es');
  });

  it('rejects when no shift is open', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId } = await setup(t);
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 });
    await expect(
      asOwner.mutation(api.cashMovements.record, { direction: 'in', amountIDR: 5000 })
    ).rejects.toThrow(/tidak ada shift terbuka/i);
  });

  it('rejects a non-positive amount', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    await expect(
      asOwner.mutation(api.cashMovements.record, { direction: 'in', amountIDR: 0 })
    ).rejects.toThrow(/lebih dari nol/i);
  });
});
