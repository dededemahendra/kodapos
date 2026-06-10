import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
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

describe('shifts.listClosed', () => {
  const OPENING = 100000;
  // Espresso price without tax (tax is disabled in this suite via updateProfile).
  const ITEM_PRICE = 18000;

  /** Opens a shift and creates a no-tax cafe profile + Espresso menu item. */
  async function setupWithItem(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
    const { asOwner, cashierId } = await setup(t, email);
    // Disable tax so order totalIDR === item priceIDR (easier math).
    await asOwner.mutation(api.cafes.updateProfile, {
      name: 'Kopi Senja',
      timezone: 'Asia/Jakarta',
      taxRatePct: 0,
      taxEnabled: false,
    });
    const shiftId = await asOwner.mutation(api.shifts.open, {
      cashierId,
      openingFloatIDR: OPENING,
    });
    const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    const itemId = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Espresso',
      priceIDR: ITEM_PRICE,
    });
    return { asOwner, cashierId, shiftId, itemId };
  }

  it('summarizes a closed shift: totals/expected/variance; excludes open shifts', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setupWithItem(t);

    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'h1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] as Id<'modifierOptions'>[] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1,
    });

    // While the shift is OPEN, listClosed returns nothing.
    const before = await asOwner.query(api.shifts.listClosed, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(before.page).toHaveLength(0);

    // Close it: countedCash = openingFloat + cashSales(18000) + 2000 over.
    await asOwner.mutation(api.shifts.close, {
      id: shiftId,
      countedCashIDR: OPENING + ITEM_PRICE + 2000,
    });

    const res = await asOwner.query(api.shifts.listClosed, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(res.page).toHaveLength(1);
    const s = res.page[0]!;
    expect(s.ordersCount).toBe(1);
    expect(s.salesTotalIDR).toBe(ITEM_PRICE);
    expect(s.cashSalesIDR).toBe(ITEM_PRICE);
    expect(s.qrisSalesIDR).toBe(0);
    expect(s.openingFloatIDR).toBe(OPENING);
    expect(s.countedCashIDR).toBe(OPENING + ITEM_PRICE + 2000);
    expect(s.expectedCashIDR).toBe(OPENING + ITEM_PRICE);
    expect(s.varianceIDR).toBe(2000);
    expect(s.cashierName).toBe('Andi');
  });

  it('zero variance when counted equals expected; paid filter excludes no orders here', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setupWithItem(t);

    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'paid-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] as Id<'modifierOptions'>[] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1,
    });
    // Close with exact counted cash (no variance).
    await asOwner.mutation(api.shifts.close, {
      id: shiftId,
      countedCashIDR: OPENING + ITEM_PRICE,
    });

    const res = await asOwner.query(api.shifts.listClosed, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(res.page).toHaveLength(1);
    const s = res.page[0]!;
    expect(s.ordersCount).toBe(1);
    expect(s.salesTotalIDR).toBe(ITEM_PRICE);
    expect(s.varianceIDR).toBe(0);
  });

  it('isolates closed shifts by cafe — owner A cannot see owner B shifts', async () => {
    const t = convexTest(schema, modules);
    // Each setupWithItem call creates a cafe, opens a shift, and returns it.
    const { asOwner: ownerA, shiftId: shiftA } = await setupWithItem(t, 'a@x.com');
    const { asOwner: ownerB, shiftId: shiftB } = await setupWithItem(t, 'b@x.com');

    await ownerA.mutation(api.shifts.close, { id: shiftA, countedCashIDR: OPENING });
    await ownerB.mutation(api.shifts.close, { id: shiftB, countedCashIDR: OPENING });

    const resA = await ownerA.query(api.shifts.listClosed, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(resA.page).toHaveLength(1);
    expect(resA.page[0]!._id).toBe(shiftA);
    expect(resA.page.every((s) => s._id !== shiftB)).toBe(true);

    const resB = await ownerB.query(api.shifts.listClosed, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(resB.page).toHaveLength(1);
    expect(resB.page[0]!._id).toBe(shiftB);
    expect(resB.page.every((s) => s._id !== shiftA)).toBe(true);
  });
});
