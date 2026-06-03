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

describe('orders.createCashSale', () => {
  it('creates an order with a single no-modifier line and a paired cash payment', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    expect(result.totalIDR).toBe(18000);
    expect(result.changeIDR).toBe(2000);

    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.paymentStatus).toBe('paid');
    expect(order?.paymentMethod).toBe('cash');
    expect(order?.subtotalIDR).toBe(18000);
    expect(order?.taxIDR).toBe(0);
    expect(order?.totalIDR).toBe(18000);
    expect(order?.discountIDR).toBe(0);
    expect(order?.lines).toHaveLength(1);
    expect(order?.lines?.[0]?.nameSnapshot).toBe('Espresso');
    expect(order?.lines?.[0]?.unitPriceIDR).toBe(18000);
    expect(order?.lines?.[0]?.lineTotalIDR).toBe(18000);
    expect(order?.lines?.[0]?.modifiersSnapshot).toEqual([]);

    const payments = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', result.orderId))
        .collect()
    );
    expect(payments).toHaveLength(1);
    expect(payments?.[0]?.method).toBe('cash');
    expect(payments?.[0]?.amountIDR).toBe(18000);
    expect(payments?.[0]?.cashTenderedIDR).toBe(20000);
    expect(payments?.[0]?.changeIDR).toBe(2000);
    expect(payments?.[0]?.confirmedAt).toEqual(expect.any(Number));
  });

  it('applies tax when cafe.taxEnabled is true; snapshots taxRatePct at sale time', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t, {
      taxEnabled: true,
      taxRatePct: 11,
    });
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-tax',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 30000,
      createdAtClient: 1700000000000,
    });
    // 18000 * 11 / 100 = 1980; total = 19980.
    expect(result.totalIDR).toBe(19980);
    expect(result.changeIDR).toBe(10020);
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.taxRatePct).toBe(11);
    expect(order?.taxIDR).toBe(1980);

    // Owner later edits PPN; the existing order still snapshots the original rate.
    await asOwner.mutation(api.cafes.updateProfile, {
      name: 'Kopi Senja',
      timezone: 'Asia/Jakarta',
      taxRatePct: 5,
      taxEnabled: true,
    });
    const orderAgain = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(orderAgain?.taxRatePct).toBe(11);
  });

  it('zero tax when cafe.taxEnabled is false even if taxRatePct is non-zero', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t, {
      taxEnabled: false,
      taxRatePct: 11,
    });
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-notax',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 18000,
      createdAtClient: 1700000000000,
    });
    expect(result.totalIDR).toBe(18000);
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.taxRatePct).toBe(0);
    expect(order?.taxIDR).toBe(0);
  });

  it('multi-line order with modifiers — snapshot + unit price calculation', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);

    // Build a modifier group with two options, attach to the item.
    const groupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Susu',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: 'Reguler', priceAdjustmentIDR: 0, position: 0 },
        { name: 'Oat (+5k)', priceAdjustmentIDR: 5000, position: 1 },
      ],
    });
    await asOwner.mutation(api.menu.itemGroups.attach, {
      menuItemId: itemId,
      modifierGroupId: groupId,
    });

    const group = await asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
    const oat = group!.options.find((o) => o.name === 'Oat (+5k)')!;
    const regular = group!.options.find((o) => o.name === 'Reguler')!;

    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-mod',
      shiftId,
      cashierId,
      lines: [
        { menuItemId: itemId, qty: 2, modifierOptionIds: [oat._id] },
        { menuItemId: itemId, qty: 1, modifierOptionIds: [regular._id] },
      ],
      cashTenderedIDR: 100000,
      createdAtClient: 1700000000000,
    });
    // line 1: qty 2 * (18000 + 5000) = 46000
    // line 2: qty 1 * (18000 + 0)    = 18000
    // subtotal = 64000; tax disabled; total = 64000
    expect(result.totalIDR).toBe(64000);
    expect(result.changeIDR).toBe(36000);

    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.lines).toHaveLength(2);
    expect(order?.lines?.[0]?.unitPriceIDR).toBe(23000);
    expect(order?.lines?.[0]?.lineTotalIDR).toBe(46000);
    expect(order?.lines?.[0]?.modifiersSnapshot).toEqual([
      { groupName: 'Susu', optionName: 'Oat (+5k)', priceAdjustmentIDR: 5000 },
    ]);
    expect(order?.lines?.[1]?.unitPriceIDR).toBe(18000);
    expect(order?.lines?.[1]?.modifiersSnapshot).toEqual([
      { groupName: 'Susu', optionName: 'Reguler', priceAdjustmentIDR: 0 },
    ]);
  });

  it('idempotent: same clientId twice → one order, one payment, returns same orderId', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t);
    const args = {
      clientId: 'dup-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] as Id<'modifierOptions'>[] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    };
    const first = await asOwner.mutation(api.orders.createCashSale, args);
    const second = await asOwner.mutation(api.orders.createCashSale, args);
    expect(second.orderId).toBe(first.orderId);
    expect(second.totalIDR).toBe(first.totalIDR);
    expect(second.changeIDR).toBe(first.changeIDR);

    const allOrders = await t.run(async (ctx) =>
      await ctx.db
        .query('orders')
        .withIndex('by_cafe_clientId', (q) => q.eq('cafeId', cafeId).eq('clientId', 'dup-1'))
        .collect()
    );
    expect(allOrders).toHaveLength(1);
    const allPayments = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', first.orderId))
        .collect()
    );
    expect(allPayments).toHaveLength(1);
  });

  it('different clientId for otherwise identical args → two orders', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const base = {
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] as Id<'modifierOptions'>[] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    };
    const a = await asOwner.mutation(api.orders.createCashSale, { ...base, clientId: 'A' });
    const b = await asOwner.mutation(api.orders.createCashSale, { ...base, clientId: 'B' });
    expect(b.orderId).not.toBe(a.orderId);
  });

  it('rejects empty cart', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId } = await setup(t);
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'empty',
        shiftId,
        cashierId,
        lines: [],
        cashTenderedIDR: 0,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/kosong/i);
  });

  it('rejects qty < 1 or qty > 99 or fractional', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    for (const qty of [0, -1, 100, 1.5]) {
      await expect(
        asOwner.mutation(api.orders.createCashSale, {
          clientId: `qty-${qty}`,
          shiftId,
          cashierId,
          lines: [{ menuItemId: itemId, qty, modifierOptionIds: [] }],
          cashTenderedIDR: 1000000,
          createdAtClient: 1700000000000,
        })
      ).rejects.toThrow(/tidak valid/i);
    }
  });

  it('rejects archived item', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.menu.items.archive, { id: itemId });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'arch-item',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/tidak tersedia/i);
  });

  it('rejects inactive item', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.menu.items.setActive, { id: itemId, isActive: false });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'inactive',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/tidak tersedia/i);
  });

  it('rejects modifier option from a group not attached to the item', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const detachedGroupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Detached',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'Solo', priceAdjustmentIDR: 1000, position: 0 }],
    });
    const detached = await asOwner.query(api.menu.modifierGroups.getById, { id: detachedGroupId });
    const opt = detached!.options[0]!;
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'detached-opt',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [opt._id] }],
        cashTenderedIDR: 100000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/tidak tersedia/i);
  });

  it('rejects insufficient cash tender', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'short',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 10000, // < 18000
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/kurang dari total/i);
  });

  it('rejects fractional or negative tendered amount', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'frac',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000.5,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/bulat|rupiah/i);
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'neg',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: -1,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/negatif/i);
  });

  it('rejects closed shift', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'closed',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/sudah ditutup/i);
  });

  it('rejects cashier from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA, shiftId: shiftA, itemId: itemA } = await setup(t, { email: 'a@x.com' });
    const { cashierId: cashierB } = await setup(t, { email: 'b@x.com' });
    await expect(
      ownerA.mutation(api.orders.createCashSale, {
        clientId: 'cross-cashier',
        shiftId: shiftA,
        cashierId: cashierB,
        lines: [{ menuItemId: itemA, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/tidak ditemukan/i);
  });

  it('rejects shift from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA, cashierId: cashierA, itemId: itemA } = await setup(t, { email: 'a@x.com' });
    const { shiftId: shiftB } = await setup(t, { email: 'b@x.com' });
    await expect(
      ownerA.mutation(api.orders.createCashSale, {
        clientId: 'cross-shift',
        shiftId: shiftB,
        cashierId: cashierA,
        lines: [{ menuItemId: itemA, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/tidak ditemukan/i);
  });

  it('server recomputes — client-provided prices are ignored', async () => {
    // The mutation signature only accepts menuItemId/qty/modifierOptionIds
    // from the client. There is no way to pass a price. This test simply
    // re-asserts that totals match the menu, even when the client used the
    // mutation contract correctly.
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'override',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      cashTenderedIDR: 100000,
      createdAtClient: 1700000000000,
    });
    expect(result.totalIDR).toBe(54000); // 3 * 18000
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.lines?.[0]?.unitPriceIDR).toBe(18000);
    expect(order?.lines?.[0]?.lineTotalIDR).toBe(54000);
  });

  it('rejects required modifier group with no selection', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const groupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Susu',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: 'Reguler', priceAdjustmentIDR: 0, position: 0 },
      ],
    });
    await asOwner.mutation(api.menu.itemGroups.attach, {
      menuItemId: itemId,
      modifierGroupId: groupId,
    });

    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'no-mod-selection',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/wajib/i);
  });

  it('rejects modifier count exceeding group maxSelect', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const groupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Toppings',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [
        { name: 'A', priceAdjustmentIDR: 1000, position: 0 },
        { name: 'B', priceAdjustmentIDR: 1000, position: 1 },
      ],
    });
    await asOwner.mutation(api.menu.itemGroups.attach, {
      menuItemId: itemId,
      modifierGroupId: groupId,
    });
    const group = await asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
    const [a, b] = group!.options;

    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'too-many-mods',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [a!._id, b!._id] }],
        cashTenderedIDR: 30000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/melebihi batas/i);
  });

  it('rejects archived modifier option', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const groupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Susu',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [
        { name: 'Oat', priceAdjustmentIDR: 5000, position: 0 },
      ],
    });
    await asOwner.mutation(api.menu.itemGroups.attach, {
      menuItemId: itemId,
      modifierGroupId: groupId,
    });
    const group = await asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
    const oat = group!.options[0]!;

    // Archive the option by calling upsert with an empty options list.
    await asOwner.mutation(api.menu.modifierGroups.upsert, {
      id: groupId,
      name: 'Susu',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [],
    });

    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'archived-opt',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [oat._id] }],
        cashTenderedIDR: 30000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/tidak tersedia/i);
  });

  it('applies a percent promo: discounts subtotal, snapshots the promo', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const promoId = await asOwner.mutation(api.promotions.create, {
      name: 'Diskon 25',
      type: 'percent',
      value: 25,
    });
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-promo-pct',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      promoId,
      createdAtClient: 1700000000000,
    });
    // subtotal 18000; 25% = 4500; no tax → total 13500
    expect(result.totalIDR).toBe(13500);
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.discountIDR).toBe(4500);
    expect(order?.appliedPromo).toEqual({
      promoId,
      name: 'Diskon 25',
      type: 'percent',
      value: 25,
    });
  });

  it('clamps a fixed promo that exceeds the subtotal', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const promoId = await asOwner.mutation(api.promotions.create, {
      name: 'Gratis',
      type: 'fixed',
      value: 50000, // > 18000 subtotal
    });
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-promo-clamp',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 0,
      promoId,
      createdAtClient: 1700000000000,
    });
    expect(result.totalIDR).toBe(0);
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.discountIDR).toBe(18000);
    expect(order?.appliedPromo).toMatchObject({ name: 'Gratis', type: 'fixed', value: 50000 });
  });

  it('rejects an archived promo', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const promoId = await asOwner.mutation(api.promotions.create, {
      name: 'Lama',
      type: 'percent',
      value: 10,
    });
    await asOwner.mutation(api.promotions.archive, { id: promoId });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'order-promo-archived',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        promoId,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/tidak tersedia/i);
  });

  it("rejects a promo owned by another cafe", async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, { email: 'a@x.com' });
    const b = await setup(t, { email: 'b@x.com' });
    const foreignPromo = await a.asOwner.mutation(api.promotions.create, {
      name: 'A only',
      type: 'percent',
      value: 10,
    });
    await expect(
      b.asOwner.mutation(api.orders.createCashSale, {
        clientId: 'order-promo-foreign',
        shiftId: b.shiftId,
        cashierId: b.cashierId,
        lines: [{ menuItemId: b.itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        promoId: foreignPromo,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/tidak ditemukan/i);
  });

  it('no promoId → discountIDR 0 and no appliedPromo (regression)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-no-promo',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.discountIDR).toBe(0);
    expect(order?.appliedPromo).toBeUndefined();
    expect(result.totalIDR).toBe(18000);
  });

  it('attaches a customer and earns points on the net base', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.loyalty.updateConfig, {
      enabled: true, earnRatePerIDR: 1000, redeemBlockPoints: 100, redeemBlockIDR: 10000,
    });
    const customerId = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111111' });
    const res = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-loyal-1', shiftId, cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }], // Espresso 18000
      cashTenderedIDR: 20000, customerId, createdAtClient: 1700000000000,
    });
    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    expect(order?.customerId).toBe(customerId);
    expect(order?.pointsEarned).toBe(18); // floor(18000 / 1000)
    const detail = await asOwner.query(api.customers.getDetail, { id: customerId });
    expect(detail?.pointsBalance).toBe(18);
    expect(detail?.visitCount).toBe(1);
    expect(detail?.totalSpentIDR).toBe(18000);
    expect(detail?.transactions[0]?.type).toBe('earn');
  });

  it('idempotent replay does not double-earn', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.loyalty.updateConfig, {
      enabled: true, earnRatePerIDR: 1000, redeemBlockPoints: 100, redeemBlockIDR: 10000,
    });
    const customerId = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111111' });
    const args = {
      clientId: 'order-loyal-2', shiftId, cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000, customerId, createdAtClient: 1700000000000,
    };
    await asOwner.mutation(api.orders.createCashSale, args);
    await asOwner.mutation(api.orders.createCashSale, args); // replay
    const detail = await asOwner.query(api.customers.getDetail, { id: customerId });
    expect(detail?.pointsBalance).toBe(18);
    expect(detail?.visitCount).toBe(1);
  });
});

describe('orders read queries', () => {
  it('listForShift returns shift orders in createdAtClient desc', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const a = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'A',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    const b = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'B',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 2, modifierOptionIds: [] }],
      cashTenderedIDR: 50000,
      createdAtClient: 1700000001000,
    });
    const rows = await asOwner.query(api.orders.listForShift, { shiftId });
    expect(rows.map((r) => r._id)).toEqual([b.orderId, a.orderId]);
    expect(rows[0]?.totalIDR).toBe(36000);
    expect(rows[1]?.totalIDR).toBe(18000);
  });

  it('listForShift rejects a shift from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setup(t, { email: 'a@x.com' });
    const { shiftId: shiftB } = await setup(t, { email: 'b@x.com' });
    await expect(ownerA.query(api.orders.listForShift, { shiftId: shiftB })).rejects.toThrow(
      /tidak ditemukan/i
    );
  });

  it('getById returns null for an order in another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setup(t, { email: 'a@x.com' });
    const { asOwner: ownerB, shiftId: shiftB, cashierId: cashierB, itemId: itemB } = await setup(t, {
      email: 'b@x.com',
    });
    const created = await ownerB.mutation(api.orders.createCashSale, {
      clientId: 'B-only',
      shiftId: shiftB,
      cashierId: cashierB,
      lines: [{ menuItemId: itemB, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    expect(await ownerA.query(api.orders.getById, { id: created.orderId })).toBeNull();
    const own = await ownerB.query(api.orders.getById, { id: created.orderId });
    expect(own?._id).toBe(created.orderId);
    expect(own?.payment?.method).toBe('cash');
    expect(own?.cashierName).toBe('Andi');
  });
});

async function enableServiceCharge(
  asOwner: Setup['asOwner'],
  pct: number
): Promise<void> {
  await asOwner.mutation(api.settings.updatePayment, {
    payment: {
      methods: {
        cash: true,
        qrisStatic: true,
        qrisDynamic: false,
        card: false,
        ewallet: false,
        transfer: false,
      },
      defaultMethod: 'cash',
      cashRounding: 'none',
      quickCashButtons: [20000, 50000, 100000],
      serviceChargeEnabled: true,
      serviceChargePct: pct,
      serviceChargeName: 'Biaya Layanan',
    },
  });
}

describe('orders.createCashSale service charge', () => {
  it('applies service charge then taxes subtotal + service charge (PB1 after SC)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t, {
      taxEnabled: true,
      taxRatePct: 11,
    });
    await enableServiceCharge(asOwner, 5);

    // Espresso 18000 → subtotal 18000; SC 5% = 900; taxBase 18900; tax 11% = 2079; total 20979
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sc-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 21000,
      createdAtClient: 1700000000000,
    });
    expect(result.totalIDR).toBe(20979);

    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.subtotalIDR).toBe(18000);
    expect(order?.serviceChargeIDR).toBe(900);
    expect(order?.serviceChargePct).toBe(5);
    expect(order?.serviceChargeName).toBe('Biaya Layanan');
    expect(order?.taxIDR).toBe(2079);
    expect(order?.totalIDR).toBe(20979);
  });

  it('records serviceChargeIDR 0 and taxes only the subtotal when disabled', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t, {
      taxEnabled: true,
      taxRatePct: 11,
    });
    // service charge never enabled → no cafeSettings row

    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sc-2',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    // subtotal 18000; tax 11% = 1980; total 19980
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.serviceChargeIDR).toBe(0);
    expect(order?.taxIDR).toBe(1980);
    expect(order?.totalIDR).toBe(19980);
  });
});

describe('orders.createCashSale — inventory deduction', () => {
  it('writes one inventoryMovements row per recipe ingredient', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    const beanId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Biji',
      canonicalUnit: 'g',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 100,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [
        { ingredientId: susuId, qty: 200, wastageFactor: 1.0 },
        { ingredientId: beanId, qty: 18, wastageFactor: 1.0 },
      ],
    });

    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'inv-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });

    const movements = await t.run(
      async (ctx) =>
        await ctx.db
          .query('inventoryMovements')
          .withIndex('by_cafe_ingredient', (q) =>
            q.eq('cafeId', cafeId).eq('ingredientId', susuId)
          )
          .collect()
    );
    expect(movements).toHaveLength(1);
    expect(movements[0]?.delta).toBe(-200);
    expect(movements[0]?.reason).toBe('sale');
    expect(movements[0]?.refType).toBe('order');
    expect(movements[0]?.refId).toBe(result.orderId);

    const beanMovements = await t.run(
      async (ctx) =>
        await ctx.db
          .query('inventoryMovements')
          .withIndex('by_cafe_ingredient', (q) =>
            q.eq('cafeId', cafeId).eq('ingredientId', beanId)
          )
          .collect()
    );
    expect(beanMovements).toHaveLength(1);
    expect(beanMovements[0]?.delta).toBe(-18);
  });

  it('multiplies by line qty: order line qty 3 with 200ml recipe → -600ml', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
    });
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'inv-3x',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      cashTenderedIDR: 100000,
      createdAtClient: 1700000000000,
    });
    const movements = await t.run(
      async (ctx) =>
        await ctx.db
          .query('inventoryMovements')
          .withIndex('by_cafe_ingredient', (q) =>
            q.eq('cafeId', cafeId).eq('ingredientId', susuId)
          )
          .collect()
    );
    expect(movements[0]?.delta).toBe(-600);
  });

  it('snapshots recipe at sale time; later recipe edits do not mutate the order', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
    });
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'snap-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 999, wastageFactor: 1.0 }],
    });
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.lines?.[0]?.recipeSnapshot?.[0]?.qty).toBe(200);
  });

  it('item without a recipe writes zero movements and recipeSnapshot is empty', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t);
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'no-recipe',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.lines?.[0]?.recipeSnapshot).toEqual([]);
    const movements = await t.run(
      async (ctx) =>
        await ctx.db
          .query('inventoryMovements')
          .withIndex('by_cafe_ingredient_at', (q) => q.eq('cafeId', cafeId))
          .collect()
    );
    expect(movements).toHaveLength(0);
  });

  it('skips archived ingredients silently; other lines still deduct', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    const beanId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Biji',
      canonicalUnit: 'g',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 100,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [
        { ingredientId: susuId, qty: 200, wastageFactor: 1.0 },
        { ingredientId: beanId, qty: 18, wastageFactor: 1.0 },
      ],
    });
    // Archive susu AFTER the recipe was built.
    await asOwner.mutation(api.ingredients.archive, { id: susuId });
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'skip-archived',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    const susuMovements = await t.run(
      async (ctx) =>
        await ctx.db
          .query('inventoryMovements')
          .withIndex('by_cafe_ingredient', (q) =>
            q.eq('cafeId', cafeId).eq('ingredientId', susuId)
          )
          .collect()
    );
    expect(susuMovements).toHaveLength(0);
    const beanMovements = await t.run(
      async (ctx) =>
        await ctx.db
          .query('inventoryMovements')
          .withIndex('by_cafe_ingredient', (q) =>
            q.eq('cafeId', cafeId).eq('ingredientId', beanId)
          )
          .collect()
    );
    expect(beanMovements[0]?.delta).toBe(-18);
    // recipeSnapshot only has the non-archived line.
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.lines?.[0]?.recipeSnapshot).toHaveLength(1);
  });

  it('idempotent: duplicate clientId does not re-write movements', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
    });
    const args = {
      clientId: 'idemp-inv',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    };
    await asOwner.mutation(api.orders.createCashSale, args);
    await asOwner.mutation(api.orders.createCashSale, args);
    const movements = await t.run(
      async (ctx) =>
        await ctx.db
          .query('inventoryMovements')
          .withIndex('by_cafe_ingredient', (q) =>
            q.eq('cafeId', cafeId).eq('ingredientId', susuId)
          )
          .collect()
    );
    expect(movements).toHaveLength(1);
  });

  it('redeems points (stacks on promo) and earns on the net base', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, categoryId } = await setup(t);
    await asOwner.mutation(api.loyalty.updateConfig, {
      enabled: true, earnRatePerIDR: 1000, redeemBlockPoints: 100, redeemBlockIDR: 10000,
    });
    const big = await asOwner.mutation(api.menu.items.create, { categoryId, name: 'Beans 1kg', priceIDR: 100000 });
    const promoId = await asOwner.mutation(api.promotions.create, { name: 'Disc10', type: 'percent', value: 10 });
    const customerId = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111111' });
    await asOwner.mutation(api.customers.adjustPoints, { id: customerId, points: 100 });

    const res = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-redeem-1', shiftId, cashierId,
      lines: [{ menuItemId: big, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 100000, promoId, customerId, redeemPoints: 100,
      createdAtClient: 1700000000000,
    });
    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    // subtotal 100000; promo -10000 → 90000; points -10000 → discountIDR 20000
    expect(order?.discountIDR).toBe(20000);
    expect(order?.pointsRedeemedIDR).toBe(10000);
    expect(order?.pointsRedeemed).toBe(100);
    expect(order?.totalIDR).toBe(80000); // no tax/service in this setup
    expect(order?.pointsEarned).toBe(80); // floor((100000-20000)/1000)
    const detail = await asOwner.query(api.customers.getDetail, { id: customerId });
    expect(detail?.pointsBalance).toBe(80); // 100 - 100 redeemed + 80 earned
    // adjust row is from seeding (adjustPoints); the order itself writes earn + redeem.
    expect(
      detail?.transactions
        .filter((x) => x.orderId === res.orderId)
        .map((x) => x.type)
        .sort()
    ).toEqual(['earn', 'redeem']);
  });

  it('rejects redeeming more points than the balance', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.loyalty.updateConfig, {
      enabled: true, earnRatePerIDR: 1000, redeemBlockPoints: 100, redeemBlockIDR: 10000,
    });
    const customerId = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111111' });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'order-redeem-2', shiftId, cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000, customerId, redeemPoints: 100,
      })
    ).rejects.toThrow(/poin/i);
  });
});
