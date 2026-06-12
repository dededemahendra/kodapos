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

const DEFAULT_PAYMENT = {
  methods: {
    cash: true,
    qrisStatic: true,
    qrisDynamic: false,
    card: false,
    ewallet: false,
    transfer: false,
  },
  defaultMethod: 'cash' as const,
  cashRounding: 'none' as const,
  quickCashButtons: [20000, 50000, 100000],
  serviceChargeEnabled: false,
  serviceChargePct: 0,
  serviceChargeName: 'Biaya Layanan',
};

async function setup(t: ReturnType<typeof convexTest>): Promise<Setup> {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
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
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
  // A static-QRIS leg requires a configured QR image.
  const storageId = await t.run(
    async (ctx) => await ctx.storage.store(new Blob(['qr'], { type: 'image/png' }))
  );
  await asOwner.mutation(api.settings.updatePayment, {
    payment: { ...DEFAULT_PAYMENT, qrisImageStorageId: storageId },
  });
  return { asOwner, cafeId, cashierId, shiftId, categoryId, itemId };
}

// Seeded Espresso is 18000; qty 1 → order total 18000. Split = cash 10000 + qris_static 8000.
const TOTAL = 18000;

describe('orders.createSplitSale', () => {
  it('splits cash + qris_static summing to total → 2 confirmed payment rows, breakdown, paid', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const res = await asOwner.mutation(api.orders.createSplitSale, {
      clientId: 'split-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      tenders: [
        { method: 'cash', amountIDR: 10000, tenderedIDR: 10000 },
        { method: 'qris_static', amountIDR: 8000 },
      ],
      createdAtClient: 1700000000000,
    });
    expect(res.totalIDR).toBe(TOTAL);

    const order = await t.run(async (ctx) => await ctx.db.get(res.orderId));
    expect(order?.paymentMethod).toBe('split');
    expect(order?.paymentStatus).toBe('paid');
    expect(order?.totalIDR).toBe(TOTAL);
    expect(order?.paymentBreakdown).toHaveLength(2);
    expect(
      order?.paymentBreakdown?.reduce((s, b) => s + b.amountIDR, 0)
    ).toBe(TOTAL);

    const payments = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', res.orderId))
        .collect()
    );
    expect(payments).toHaveLength(2);
    expect(payments.reduce((s, p) => s + p.amountIDR, 0)).toBe(TOTAL);
    for (const p of payments) {
      expect(p.confirmedAt).toEqual(expect.any(Number));
    }
    expect(payments.map((p) => p.method).sort()).toEqual(['cash', 'qris_static']);
  });

  it('cash overpay leg → that row changeIDR + returned changeIDR === 5000', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const res = await asOwner.mutation(api.orders.createSplitSale, {
      clientId: 'split-overpay',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      tenders: [
        { method: 'cash', amountIDR: 10000, tenderedIDR: 15000 },
        { method: 'qris_static', amountIDR: 8000 },
      ],
      createdAtClient: 1700000000000,
    });
    expect(res.changeIDR).toBe(5000);
    const payments = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', res.orderId))
        .collect()
    );
    const cashRow = payments.find((p) => p.method === 'cash');
    expect(cashRow?.changeIDR).toBe(5000);
    expect(cashRow?.cashTenderedIDR).toBe(15000);
  });

  it('rejects Σ amountIDR ≠ total', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await expect(
      asOwner.mutation(api.orders.createSplitSale, {
        clientId: 'split-bad-sum',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        tenders: [
          { method: 'cash', amountIDR: 10000, tenderedIDR: 10000 },
          { method: 'qris_static', amountIDR: 5000 },
        ],
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/total tender tidak sama/i);
  });

  it('rejects a cash leg tenderedIDR < amountIDR', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await expect(
      asOwner.mutation(api.orders.createSplitSale, {
        clientId: 'split-short',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        tenders: [
          { method: 'cash', amountIDR: 10000, tenderedIDR: 9000 },
          { method: 'qris_static', amountIDR: 8000 },
        ],
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/kurang dari/i);
  });

  it('rejects a non-positive amount', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await expect(
      asOwner.mutation(api.orders.createSplitSale, {
        clientId: 'split-zero',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        tenders: [
          { method: 'cash', amountIDR: 0, tenderedIDR: 0 },
          { method: 'qris_static', amountIDR: 18000 },
        ],
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow();
  });
});
