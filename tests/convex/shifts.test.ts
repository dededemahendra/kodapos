import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const cashierId = await asOwner.mutation(api.staff.create, {
    name: 'Andi',
    pin: '1234',
  });
  return { asOwner, cashierId };
}

describe('shifts', () => {
  it('current returns null when no open shift', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    expect(await asOwner.query(api.shifts.current, {})).toBeNull();
  });

  it('open creates a shift; current returns it', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    const shiftId = await asOwner.mutation(api.shifts.open, {
      cashierId,
      openingFloatIDR: 100000,
    });
    expect(shiftId).toBeTruthy();
    const current = await asOwner.query(api.shifts.current, {});
    expect(current?._id).toBe(shiftId);
    expect(current?.status).toBe('open');
    expect(current?.openingFloatIDR).toBe(100000);
    expect(current?.cashierName).toBe('Andi');
  });

  it('open rejects when another shift is already open', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
    await expect(
      asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 50000 })
    ).rejects.toThrow(/shift sudah dibuka/i);
  });

  it('open rejects cashier from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setup(t, 'a@x.com');
    const { cashierId: cashierB } = await setup(t, 'b@x.com');
    await expect(
      ownerA.mutation(api.shifts.open, { cashierId: cashierB, openingFloatIDR: 100000 })
    ).rejects.toThrow(/tidak ditemukan/i);
  });

  it('open rejects archived cashier', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    await asOwner.mutation(api.staff.archive, { id: cashierId });
    await expect(
      asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 })
    ).rejects.toThrow(/diarsipkan/i);
  });

  it('open rejects fractional or negative float', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    await expect(
      asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100.5 })
    ).rejects.toThrow(/bulat|rupiah/i);
    await expect(
      asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: -1 })
    ).rejects.toThrow(/negatif/i);
  });

  it('close records counted cash and clears the open shift', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    const shiftId = await asOwner.mutation(api.shifts.open, {
      cashierId,
      openingFloatIDR: 100000,
    });
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 });
    expect(await asOwner.query(api.shifts.current, {})).toBeNull();
    const closed = await t.run(async (ctx) => await ctx.db.get(shiftId));
    expect(closed?.status).toBe('closed');
    expect(closed?.countedCashIDR).toBe(100000);
    expect(closed?.closedAt).toEqual(expect.any(Number));
    expect(closed?.expectedCashIDR).toBeUndefined();
    expect(closed?.varianceIDR).toBeUndefined();
  });

  it('close rejects already-closed shift', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    const shiftId = await asOwner.mutation(api.shifts.open, {
      cashierId,
      openingFloatIDR: 100000,
    });
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 });
    await expect(
      asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 })
    ).rejects.toThrow(/sudah ditutup/i);
  });

  it('close rejects negative counted cash', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    const shiftId = await asOwner.mutation(api.shifts.open, {
      cashierId,
      openingFloatIDR: 100000,
    });
    await expect(
      asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: -1 })
    ).rejects.toThrow(/negatif/i);
  });
});
