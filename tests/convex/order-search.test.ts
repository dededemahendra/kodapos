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
  categoryId: Id<'categories'>;
  itemId: Id<'menuItems'>;
};

async function setup(
  t: ReturnType<typeof convexTest>,
  opts: { email?: string; taxEnabled?: boolean; taxRatePct?: number } = {}
): Promise<Setup> {
  const email = opts.email ?? 'o@x.com';
  const taxEnabled = opts.taxEnabled ?? false;
  const taxRatePct = opts.taxRatePct ?? 0;
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: 'Asia/Jakarta',
    taxRatePct,
    taxEnabled,
  });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, {
    cashierId,
    openingFloatIDR: 100000,
  });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
  return { asOwner, cafeId, cashierId, shiftId, categoryId, itemId };
}

describe('orders.search', () => {
  it('returns all statuses in range, filters by status, resolves cashier name', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, shiftId, cashierId, itemId } = await setup(t);
    const now = Date.now();
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'os1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: now,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('orders', {
        cafeId,
        shiftId,
        cashierId,
        clientId: 'os-void',
        lines: [],
        subtotalIDR: 10000,
        taxRatePct: 0,
        taxIDR: 0,
        discountIDR: 0,
        serviceChargeIDR: 0,
        serviceChargePct: 0,
        serviceChargeName: 'Biaya Layanan',
        totalIDR: 10000,
        paymentMethod: 'qris_dynamic',
        paymentStatus: 'void',
        createdAtClient: now,
        syncedAt: now,
      });
    });
    const all = await asOwner.query(api.orders.search, {
      range: { preset: 'today' },
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(all.page).toHaveLength(2);
    expect(all.page.every((r) => r.cashierName.length > 0)).toBe(true);
    const paidOnly = await asOwner.query(api.orders.search, {
      range: { preset: 'today' },
      status: 'paid',
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(paidOnly.page).toHaveLength(1);
    expect(paidOnly.page[0]?.paymentStatus).toBe('paid');
    const voidOnly = await asOwner.query(api.orders.search, {
      range: { preset: 'today' },
      status: 'void',
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(voidOnly.page).toHaveLength(1);
  });

  it('filters by payment method', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'os2',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: Date.now(),
    });
    const cash = await asOwner.query(api.orders.search, {
      range: { preset: 'today' },
      paymentMethod: 'cash',
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(cash.page).toHaveLength(1);
    const qris = await asOwner.query(api.orders.search, {
      range: { preset: 'today' },
      paymentMethod: 'qris_static',
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(qris.page).toHaveLength(0);
  });

  it('filters by cashierId', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t);
    const otherCashierId = await asOwner.mutation(api.staff.create, { name: 'Budi', pin: '5678' });
    const now = Date.now();
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'os3',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: now,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('orders', {
        cafeId,
        shiftId,
        cashierId: otherCashierId,
        clientId: 'os3b',
        lines: [],
        subtotalIDR: 10000,
        taxRatePct: 0,
        taxIDR: 0,
        discountIDR: 0,
        totalIDR: 10000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        createdAtClient: now,
      });
    });
    const byAndi = await asOwner.query(api.orders.search, {
      range: { preset: 'today' },
      cashierId,
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(byAndi.page).toHaveLength(1);
    expect(byAndi.page[0]?.cashierName).toBe('Andi');
    const byBudi = await asOwner.query(api.orders.search, {
      range: { preset: 'today' },
      cashierId: otherCashierId,
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(byBudi.page).toHaveLength(1);
    expect(byBudi.page[0]?.cashierName).toBe('Budi');
  });

  it('pagination: isDone and continueCursor work correctly', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      await asOwner.mutation(api.orders.createCashSale, {
        clientId: `page-${i}`,
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        createdAtClient: now + i,
      });
    }
    const page1 = await asOwner.query(api.orders.search, {
      range: { preset: 'today' },
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(page1.page).toHaveLength(2);
    expect(page1.isDone).toBe(false);
    const page2 = await asOwner.query(api.orders.search, {
      range: { preset: 'today' },
      paginationOpts: { numItems: 2, cursor: page1.continueCursor },
    });
    expect(page2.page).toHaveLength(1);
    expect(page2.isDone).toBe(true);
  });
});
