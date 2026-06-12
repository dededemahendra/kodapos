import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { QueryCtx } from '../../convex/_generated/server';
import schema from '../../convex/schema';

// Extracted helpers widen `t` to ReturnType<typeof convexTest>, which erases the
// schema generic on `t.run`'s ctx. Re-attach the generated db typing so the
// helper queries stay strict (tests at the call site already are).
type TestCtx = { run: <T>(fn: (ctx: { db: QueryCtx['db'] }) => Promise<T>) => Promise<T> };

const modules = import.meta.glob('../../convex/**/*.*s');

type Setup = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
  shiftId: Id<'shifts'>;
  categoryId: Id<'categories'>;
  itemId: Id<'menuItems'>;
  susuId: Id<'ingredients'>;
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

/**
 * Owner + open shift + a recipe-backed Espresso (200ml Susu per unit) + loyalty
 * enabled. Mirrors the orders.test.ts inventory setup so refunds restock stock.
 */
async function setup(
  t: ReturnType<typeof convexTest>,
  opts: { email?: string } = {}
): Promise<Setup> {
  const email = opts.email ?? 'o@x.com';
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
  const cafeId = cafe!._id;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
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
  await asOwner.mutation(api.loyalty.updateConfig, {
    enabled: true,
    earnRatePerIDR: 1000,
    redeemBlockPoints: 100,
    redeemBlockIDR: 10000,
  });
  return { asOwner, cafeId, cashierId, shiftId, categoryId, itemId, susuId };
}

async function configureQrisImage(
  t: ReturnType<typeof convexTest>,
  asOwner: Setup['asOwner']
): Promise<void> {
  const storageId = await t.run(
    async (ctx) => await ctx.storage.store(new Blob(['qr'], { type: 'image/png' }))
  );
  await asOwner.mutation(api.settings.updatePayment, {
    payment: { ...DEFAULT_PAYMENT, qrisImageStorageId: storageId },
  });
}

function stockOf(
  t: TestCtx,
  cafeId: Id<'cafes'>,
  ingredientId: Id<'ingredients'>
): Promise<number> {
  return t.run(async (ctx) => {
    const ms = await ctx.db
      .query('inventoryMovements')
      .withIndex('by_cafe_ingredient', (q) =>
        q.eq('cafeId', cafeId).eq('ingredientId', ingredientId)
      )
      .collect();
    return ms.reduce((s, m) => s + m.delta, 0);
  });
}

function refundAdjustmentMovements(
  t: TestCtx,
  cafeId: Id<'cafes'>,
  ingredientId: Id<'ingredients'>
) {
  return t.run(async (ctx) => {
    const ms = await ctx.db
      .query('inventoryMovements')
      .withIndex('by_cafe_ingredient', (q) =>
        q.eq('cafeId', cafeId).eq('ingredientId', ingredientId)
      )
      .collect();
    return ms.filter((m) => m.reason === 'adjustment');
  });
}

describe('refunds.create — partial line refund', () => {
  it('restocks exactly the refunded line recipe×qty, bumps refundedIDR, pro-rates loyalty', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, cashierId, shiftId, itemId, susuId } = await setup(t);
    const customerId = await asOwner.mutation(api.customers.create, {
      name: 'Budi',
      phone: '08121111111',
    });
    // 3 Espresso = subtotal 54000, total 54000, earns 54 points.
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sale-partial',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      cashTenderedIDR: 60000,
      customerId,
      createdAtClient: 1700000000000,
    });
    expect(sale.totalIDR).toBe(54000);

    const stockAfterSale = await stockOf(t, cafeId, susuId); // -600
    expect(stockAfterSale).toBe(-600);

    await asOwner.mutation(api.refunds.create, {
      orderId: sale.orderId,
      clientId: 'refund-partial-1',
      cashierId,
      method: 'cash',
      lines: [{ lineIndex: 0, qty: 1 }],
    });

    // Stock up by exactly one unit's recipe (200ml): -600 → -400.
    expect(await stockOf(t, cafeId, susuId)).toBe(-400);
    const adj = await refundAdjustmentMovements(t, cafeId, susuId);
    expect(adj).toHaveLength(1);
    expect(adj[0]?.delta).toBe(200);
    expect(adj[0]?.reasonLabel).toBe('Pengembalian pesanan');
    expect(adj[0]?.refType).toBe('order');
    expect(adj[0]?.refId).toBe(sale.orderId);

    const order = await t.run((ctx) => ctx.db.get(sale.orderId));
    expect(order?.refundedIDR).toBe(18000);
    expect(order?.paymentStatus).toBe('paid'); // unchanged

    // Loyalty: fraction 18000/54000 = 1/3; clawback round(54/3)=18.
    const detail = await asOwner.query(api.customers.getDetail, { id: customerId });
    expect(detail?.pointsBalance).toBe(54 - 18);
    expect(detail?.totalSpentIDR).toBe(54000 - 18000);

    // refundInfo shows remaining reduced.
    const info = await asOwner.query(api.orders.refundInfo, { orderId: sale.orderId });
    expect(info.refundedIDR).toBe(18000);
    expect(info.fullyRefunded).toBe(false);
    expect(info.lines[0]?.refundedQty).toBe(1);
    expect(info.lines[0]?.remainingQty).toBe(2);
  });
});

describe('refunds.create — full refund exact rounding', () => {
  it('lands cumulative refundedIDR === totalIDR exactly and fully restores stock', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, cashierId, shiftId, categoryId, susuId } = await setup(t);
    // Use a taxed cafe so total != subtotal and rounding matters.
    await asOwner.mutation(api.cafes.updateProfile, {
      name: 'Kopi Senja',
      timezone: 'Asia/Jakarta',
      taxRatePct: 11,
      taxEnabled: true,
    });
    // Item priced 3333 so per-unit proportional rounding is lossy.
    const oddItem = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Odd',
      priceIDR: 3333,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: oddItem,
      lines: [{ ingredientId: susuId, qty: 50, wastageFactor: 1.0 }],
    });
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sale-full',
      shiftId,
      cashierId,
      lines: [{ menuItemId: oddItem, qty: 3, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    const order0 = await t.run((ctx) => ctx.db.get(sale.orderId));
    const totalIDR = order0!.totalIDR;

    const stockAfterSale = await stockOf(t, cafeId, susuId); // -150

    await asOwner.mutation(api.refunds.create, {
      orderId: sale.orderId,
      clientId: 'refund-full-1',
      cashierId,
      method: 'cash',
      lines: [{ lineIndex: 0, qty: 3 }],
    });

    const order = await t.run((ctx) => ctx.db.get(sale.orderId));
    expect(order?.refundedIDR).toBe(totalIDR); // EXACTLY, rounding absorbed.

    // Stock fully restored to where it was before the sale.
    expect(await stockOf(t, cafeId, susuId)).toBe(stockAfterSale + 150);
    expect(await stockOf(t, cafeId, susuId)).toBe(0);

    const info = await asOwner.query(api.orders.refundInfo, { orderId: sale.orderId });
    expect(info.fullyRefunded).toBe(true);
    expect(info.lines[0]?.remainingQty).toBe(0);
  });
});

describe('refunds.create — over-refund rejected, nothing applied', () => {
  it('throws and leaves stock + refundedIDR untouched (validate-before-apply)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, cashierId, shiftId, itemId, susuId } = await setup(t);
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sale-over',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 2, modifierOptionIds: [] }],
      cashTenderedIDR: 40000,
      createdAtClient: 1700000000000,
    });
    const stockBefore = await stockOf(t, cafeId, susuId); // -400

    await expect(
      asOwner.mutation(api.refunds.create, {
        orderId: sale.orderId,
        clientId: 'refund-over-1',
        cashierId,
        method: 'cash',
        lines: [{ lineIndex: 0, qty: 3 }], // only 2 available
      })
    ).rejects.toThrow(/melebihi/i);

    expect(await stockOf(t, cafeId, susuId)).toBe(stockBefore);
    const order = await t.run((ctx) => ctx.db.get(sale.orderId));
    expect(order?.refundedIDR).toBeUndefined();
    const refundRows = await t.run((ctx) =>
      ctx.db.query('refunds').withIndex('by_order', (q) => q.eq('orderId', sale.orderId)).collect()
    );
    expect(refundRows).toHaveLength(0);
  });

  it('rejects a second refund that exceeds the remaining after a first partial', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setup(t);
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sale-over2',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 2, modifierOptionIds: [] }],
      cashTenderedIDR: 40000,
      createdAtClient: 1700000000000,
    });
    await asOwner.mutation(api.refunds.create, {
      orderId: sale.orderId,
      clientId: 'refund-r1',
      cashierId,
      method: 'cash',
      lines: [{ lineIndex: 0, qty: 1 }],
    });
    await expect(
      asOwner.mutation(api.refunds.create, {
        orderId: sale.orderId,
        clientId: 'refund-r2',
        cashierId,
        method: 'cash',
        lines: [{ lineIndex: 0, qty: 2 }], // only 1 remaining
      })
    ).rejects.toThrow(/melebihi/i);
  });
});

describe('refunds.create — idempotency', () => {
  it('same clientId twice → one refund, effects applied once', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, cashierId, shiftId, itemId, susuId } = await setup(t);
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sale-idem',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      cashTenderedIDR: 60000,
      createdAtClient: 1700000000000,
    });
    const args = {
      orderId: sale.orderId,
      clientId: 'refund-idem-1',
      cashierId,
      method: 'cash' as const,
      lines: [{ lineIndex: 0, qty: 1 }],
    };
    const a = await asOwner.mutation(api.refunds.create, args);
    const b = await asOwner.mutation(api.refunds.create, args);
    expect(b).toBe(a);

    const refundRows = await t.run((ctx) =>
      ctx.db.query('refunds').withIndex('by_order', (q) => q.eq('orderId', sale.orderId)).collect()
    );
    expect(refundRows).toHaveLength(1);
    expect(await stockOf(t, cafeId, susuId)).toBe(-400); // -600 sale + 200 refund once
    const order = await t.run((ctx) => ctx.db.get(sale.orderId));
    expect(order?.refundedIDR).toBe(18000);
  });
});

describe('refunds.create — cash drawer', () => {
  it('writes exactly one cashMovements{out} of amountIDR', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setup(t);
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sale-cash',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      cashTenderedIDR: 60000,
      createdAtClient: 1700000000000,
    });
    await asOwner.mutation(api.refunds.create, {
      orderId: sale.orderId,
      clientId: 'refund-cash-1',
      cashierId,
      method: 'cash',
      lines: [{ lineIndex: 0, qty: 1 }],
    });
    const moves = await asOwner.query(api.cashMovements.listForShift, { shiftId });
    const outs = moves.filter((m) => m.direction === 'out');
    expect(outs).toHaveLength(1);
    expect(outs[0]?.amountIDR).toBe(18000);
  });

  it('throws when there is no open shift for a cash refund', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setup(t);
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sale-noshift',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 });
    await expect(
      asOwner.mutation(api.refunds.create, {
        orderId: sale.orderId,
        clientId: 'refund-noshift-1',
        cashierId,
        method: 'cash',
        lines: [{ lineIndex: 0, qty: 1 }],
      })
    ).rejects.toThrow(/shift/i);
  });
});

describe('refunds.create — gift card', () => {
  it('credits card balance by amountIDR and writes a refund txn', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setup(t);
    const gid = await asOwner.mutation(api.giftCards.issue, {
      code: 'REFUNDGC',
      balanceIDR: 100000,
    });
    // 3 Espresso = 54000 paid by gift card → card balance 46000.
    const sale = await asOwner.mutation(api.orders.createGiftCardSale, {
      clientId: 'sale-gc',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      giftCardCode: 'refundgc',
      createdAtClient: 1700000000000,
    });
    expect(sale.totalIDR).toBe(54000);
    const before = await asOwner.query(api.giftCards.getByCode, { code: 'REFUNDGC' });
    expect(before?.balanceIDR).toBe(46000);

    await asOwner.mutation(api.refunds.create, {
      orderId: sale.orderId,
      clientId: 'refund-gc-1',
      cashierId,
      method: 'giftcard',
      lines: [{ lineIndex: 0, qty: 1 }],
    });
    const after = await asOwner.query(api.giftCards.getByCode, { code: 'REFUNDGC' });
    expect(after?.balanceIDR).toBe(46000 + 18000);

    const txns = await asOwner.query(api.giftCards.transactions, { id: gid });
    expect(txns[0]?.type).toBe('refund');
    expect(txns[0]?.amountIDR).toBe(18000);
    expect(txns[0]?.orderId).toBe(sale.orderId);
  });
});

describe('refunds.create — guards', () => {
  it('throws when method is not one of the order tenders', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setup(t);
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sale-method',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    await expect(
      asOwner.mutation(api.refunds.create, {
        orderId: sale.orderId,
        clientId: 'refund-method-1',
        cashierId,
        method: 'giftcard', // order was cash-only
        lines: [{ lineIndex: 0, qty: 1 }],
      })
    ).rejects.toThrow(/metode/i);
  });

  it('throws when refunding a non-paid (pending) order', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setup(t);
    await asOwner.mutation(api.settings.connectIntegration, { key: 'qris', config: { apiKey: 'k' } });
    const pending = await asOwner.action(api.payments.qrisDynamic.createQrisDynamicSale, {
      clientId: 'pending-refund',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] as Id<'modifierOptions'>[] }],
      createdAtClient: 1700000000000,
    });
    await expect(
      asOwner.mutation(api.refunds.create, {
        orderId: pending.orderId,
        clientId: 'refund-pending-1',
        cashierId,
        method: 'qris_dynamic',
        lines: [{ lineIndex: 0, qty: 1 }],
      })
    ).rejects.toThrow(/lunas/i);
  });

  it('throws when refunding a voided order', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setup(t);
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sale-void',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    await asOwner.mutation(api.orders.voidSale, { orderId: sale.orderId, cashierId });
    await expect(
      asOwner.mutation(api.refunds.create, {
        orderId: sale.orderId,
        clientId: 'refund-void-1',
        cashierId,
        method: 'cash',
        lines: [{ lineIndex: 0, qty: 1 }],
      })
    ).rejects.toThrow(/lunas/i);
  });

  it('rejects a foreign order (owner scope)', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, { email: 'a@x.com' });
    const b = await setup(t, { email: 'b@x.com' });
    const saleB = await b.asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sale-foreign',
      shiftId: b.shiftId,
      cashierId: b.cashierId,
      lines: [{ menuItemId: b.itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    await expect(
      a.asOwner.mutation(api.refunds.create, {
        orderId: saleB.orderId,
        clientId: 'refund-foreign-1',
        cashierId: a.cashierId,
        method: 'cash',
        lines: [{ lineIndex: 0, qty: 1 }],
      })
    ).rejects.toThrow(/tidak ditemukan/i);
  });

  it('rejects a foreign cashier (owner scope)', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, { email: 'a@x.com' });
    const b = await setup(t, { email: 'b@x.com' });
    const saleA = await a.asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sale-fcash',
      shiftId: a.shiftId,
      cashierId: a.cashierId,
      lines: [{ menuItemId: a.itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    await expect(
      a.asOwner.mutation(api.refunds.create, {
        orderId: saleA.orderId,
        clientId: 'refund-fcash-1',
        cashierId: b.cashierId, // foreign cashier
        method: 'cash',
        lines: [{ lineIndex: 0, qty: 1 }],
      })
    ).rejects.toThrow(/tidak ditemukan/i);
  });
});

describe('refunds.create — qris record-only', () => {
  it('refunds a qris_static order without any cash drawer movement', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setup(t);
    await configureQrisImage(t, asOwner);
    const sale = await asOwner.mutation(api.orders.createQrisStaticSale, {
      clientId: 'sale-qris',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 2, modifierOptionIds: [] }],
      createdAtClient: 1700000000000,
    });
    await asOwner.mutation(api.refunds.create, {
      orderId: sale.orderId,
      clientId: 'refund-qris-1',
      cashierId,
      method: 'qris_static',
      lines: [{ lineIndex: 0, qty: 1 }],
    });
    const order = await t.run((ctx) => ctx.db.get(sale.orderId));
    expect(order?.refundedIDR).toBe(18000);
    const moves = await asOwner.query(api.cashMovements.listForShift, { shiftId });
    expect(moves.filter((m) => m.direction === 'out')).toHaveLength(0);
  });
});

// A calendar day key (YYYY-MM-DD) in Asia/Jakarta for a given instant.
function jakartaKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

describe('reports — refunds net out revenue + COGS by refund date', () => {
  it('profitLoss: refundsIDR, netRevenue, reduced COGS, gross/net profit', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setup(t);
    const now = Date.now();
    // 3 Espresso @ 18000 = 54000; recipe 200ml Susu @ 25/ml ⇒ unit COGS 5000.
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'rep-sale',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      cashTenderedIDR: 60000,
      createdAtClient: now,
    });
    expect(sale.totalIDR).toBe(54000);
    // Refund 1 of the 3 ⇒ amount 18000, refund COGS 5000.
    await asOwner.mutation(api.refunds.create, {
      orderId: sale.orderId,
      clientId: 'rep-refund',
      cashierId,
      method: 'cash',
      lines: [{ lineIndex: 0, qty: 1 }],
    });

    const range = { from: jakartaKey(now), to: jakartaKey(now) } as const;
    const pl = await asOwner.query(api.reports.profitLoss, { range });

    expect(pl.revenueIDR).toBe(54000); // GROSS, unchanged
    expect(pl.refundsIDR).toBe(18000);
    expect(pl.netRevenueIDR).toBe(54000 - 18000); // 36000
    expect(pl.cogsIDR).toBe(15000 - 5000); // 10000 (net of refund COGS)
    expect(pl.grossProfitIDR).toBe(36000 - 10000); // 26000 = netRevenue − net COGS
    expect(pl.netProfitIDR).toBe(26000); // no expenses / other income
    expect(pl.grossMarginPct).toBe(Math.round((26000 / 36000) * 100));
  });

  it('overview.revenueIDR is net of in-range refunds and exposes refundsIDR', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setup(t);
    const now = Date.now();
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'ov-sale',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      cashTenderedIDR: 60000,
      createdAtClient: now,
    });
    await asOwner.mutation(api.refunds.create, {
      orderId: sale.orderId,
      clientId: 'ov-refund',
      cashierId,
      method: 'cash',
      lines: [{ lineIndex: 0, qty: 1 }],
    });
    const range = { from: jakartaKey(now), to: jakartaKey(now) } as const;
    const ov = await asOwner.query(api.reports.overview, { range });
    expect(ov.refundsIDR).toBe(18000);
    expect(ov.revenueIDR).toBe(54000 - 18000); // net
    expect(ov.orders).toBe(1);
  });

  it('dashboard kpis revenue is net of in-range refunds', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setup(t);
    const now = Date.now();
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'kpi-sale',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      cashTenderedIDR: 60000,
      createdAtClient: now,
    });
    await asOwner.mutation(api.refunds.create, {
      orderId: sale.orderId,
      clientId: 'kpi-refund',
      cashierId,
      method: 'cash',
      lines: [{ lineIndex: 0, qty: 1 }],
    });
    const kpis = await asOwner.query(api.dashboard.kpis, {});
    expect(kpis.refundsIDR).toBe(18000);
    expect(kpis.revenueIDR).toBe(54000 - 18000); // net
  });

  it('a refund dated OUTSIDE the range does not affect an in-range report', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, cashierId, shiftId, itemId } = await setup(t);
    const now = Date.now();
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'out-sale',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      cashTenderedIDR: 60000,
      createdAtClient: now,
    });
    await asOwner.mutation(api.refunds.create, {
      orderId: sale.orderId,
      clientId: 'out-refund',
      cashierId,
      method: 'cash',
      lines: [{ lineIndex: 0, qty: 1 }],
    });
    // Backdate the refund 60 days so it falls before the report window.
    const past = now - 60 * 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query('refunds')
        .withIndex('by_cafe_at', (q) => q.eq('cafeId', cafeId))
        .collect();
      for (const r of rows) await ctx.db.patch(r._id, { at: past });
    });

    const range = { from: jakartaKey(now), to: jakartaKey(now) } as const;
    const pl = await asOwner.query(api.reports.profitLoss, { range });
    expect(pl.refundsIDR).toBe(0); // refund is out of range
    expect(pl.netRevenueIDR).toBe(54000); // full gross revenue, no net-out
    expect(pl.cogsIDR).toBe(15000); // full COGS, not reduced
  });
});

// ── Finding 1: sequential partial-refund loyalty over-clawback ──────────────
describe('refunds.create — cumulative loyalty clawback (Finding 1)', () => {
  it('N partial refunds claw back EXACTLY pointsEarned, never more (no over-clawback)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, categoryId, susuId } = await setup(t);
    const customerId = await asOwner.mutation(api.customers.create, {
      name: 'Budi',
      phone: '08121111111',
    });
    // A SECOND order for the same customer earns points that must NOT be touched
    // by refunds against the first order (the over-clawback would silently eat
    // these via the max(0, …) floor only after draining the order's own points,
    // but the invariant is that cross-order points are never the source).
    const otherItem = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Other',
      priceIDR: 50000,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: otherItem,
      lines: [{ ingredientId: susuId, qty: 10, wastageFactor: 1.0 }],
    });
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'other-sale',
      shiftId,
      cashierId,
      lines: [{ menuItemId: otherItem, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 50000,
      customerId,
      createdAtClient: 1700000000000,
    });
    // 50000 earns 50 points at 1pt/1000IDR.
    const otherEarned = 50;

    // Target order: priced 1000 ⇒ totalIDR 10000 for qty 10, earning 10 points…
    // but the spec example is "earns 7 pts on totalIDR 10000". Force pointsEarned
    // to 7 by patching the order so the rounding stress is exactly as described.
    const targetItem = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Target',
      priceIDR: 1000,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: targetItem,
      lines: [{ ingredientId: susuId, qty: 1, wastageFactor: 1.0 }],
    });
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'target-sale',
      shiftId,
      cashierId,
      lines: [{ menuItemId: targetItem, qty: 10, modifierOptionIds: [] }],
      cashTenderedIDR: 10000,
      customerId,
      createdAtClient: 1700000000000,
    });
    expect(sale.totalIDR).toBe(10000);
    // Patch pointsEarned to 7 (and the customer balance to match: 7 + 50 = 57).
    await t.run(async (ctx) => {
      await ctx.db.patch(sale.orderId, { pointsEarned: 7 });
      await ctx.db.patch(customerId, { pointsBalance: 7 + otherEarned });
    });

    const balanceOf = () =>
      asOwner.query(api.customers.getDetail, { id: customerId }).then((d) => d!.pointsBalance);
    expect(await balanceOf()).toBe(57);

    // Refund all 10 units in 10 × 1-unit (1000 IDR) increments.
    for (let i = 0; i < 10; i++) {
      await asOwner.mutation(api.refunds.create, {
        orderId: sale.orderId,
        clientId: `target-refund-${i}`,
        cashierId,
        method: 'cash',
        lines: [{ lineIndex: 0, qty: 1 }],
      });
    }

    // After fully refunding the target order: EXACTLY 7 points clawed back (not
    // 8+ from naive per-refund rounding), and the other order's 50 are intact.
    expect(await balanceOf()).toBe(57 - 7); // 50
    // Sum of all adjust txns for THIS order === −7 exactly.
    const adjSum = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query('loyaltyTransactions')
        .withIndex('by_customer_at', (q) => q.eq('customerId', customerId))
        .collect();
      return rows
        .filter((r) => r.orderId === sale.orderId && r.type === 'adjust')
        .reduce((s, r) => s + r.points, 0);
    });
    expect(adjSum).toBe(-7);
  });

  it('3 uneven partials then a full refund land cumulative clawback EXACTLY on pointsEarned', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, categoryId, susuId } = await setup(t);
    const customerId = await asOwner.mutation(api.customers.create, {
      name: 'Sari',
      phone: '08122222222',
    });
    const item = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Uneven',
      priceIDR: 1000,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: item,
      lines: [{ ingredientId: susuId, qty: 1, wastageFactor: 1.0 }],
    });
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'uneven-sale',
      shiftId,
      cashierId,
      lines: [{ menuItemId: item, qty: 10, modifierOptionIds: [] }],
      cashTenderedIDR: 10000,
      customerId,
      createdAtClient: 1700000000000,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(sale.orderId, { pointsEarned: 7 });
      await ctx.db.patch(customerId, { pointsBalance: 7 });
    });

    // Uneven: 2, then 3, then 5 (full) units.
    for (const [i, qty] of [2, 3, 5].entries()) {
      await asOwner.mutation(api.refunds.create, {
        orderId: sale.orderId,
        clientId: `uneven-refund-${i}`,
        cashierId,
        method: 'cash',
        lines: [{ lineIndex: 0, qty }],
      });
    }

    const detail = await asOwner.query(api.customers.getDetail, { id: customerId });
    expect(detail?.pointsBalance).toBe(0); // 7 − 7 exactly
  });
});

// ── Finding 4: gift-card / tender over-credit on split orders ────────────────
describe('refunds.create — per-tender cap on split orders (Finding 4)', () => {
  async function splitSale(t: ReturnType<typeof convexTest>, s: Setup) {
    const gid = await s.asOwner.mutation(api.giftCards.issue, {
      code: 'SPLITGC',
      balanceIDR: 100000,
    });
    // 50000-priced item × 2 = 100000; split cash 70000 + giftcard 30000.
    const item = await s.asOwner.mutation(api.menu.items.create, {
      categoryId: s.categoryId,
      name: 'Fifty',
      priceIDR: 50000,
    });
    await s.asOwner.mutation(api.recipes.upsert, {
      menuItemId: item,
      lines: [{ ingredientId: s.susuId, qty: 10, wastageFactor: 1.0 }],
    });
    const sale = await s.asOwner.mutation(api.orders.createSplitSale, {
      clientId: 'split-sale',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [{ menuItemId: item, qty: 2, modifierOptionIds: [] }],
      tenders: [
        { method: 'cash', amountIDR: 70000, tenderedIDR: 70000 },
        { method: 'giftcard', giftCardCode: 'SPLITGC', amountIDR: 30000 },
      ],
      createdAtClient: 1700000000000,
    });
    expect(sale.totalIDR).toBe(100000);
    return { sale };
  }

  it('refunding the full 100000 to giftcard THROWS and applies nothing', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const { sale } = await splitSale(t, s);
    // Card was 100000, 30000 redeemed at sale ⇒ 70000.
    const before = await s.asOwner.query(api.giftCards.getByCode, { code: 'SPLITGC' });
    expect(before?.balanceIDR).toBe(70000);

    await expect(
      s.asOwner.mutation(api.refunds.create, {
        orderId: sale.orderId,
        clientId: 'split-refund-over',
        cashierId: s.cashierId,
        method: 'giftcard',
        lines: [
          { lineIndex: 0, qty: 2 }, // full order = 100000, but only 30000 on the card
        ],
      })
    ).rejects.toThrow(/tender/i);

    // Card balance unchanged, no refund row, refundedIDR untouched.
    const after = await s.asOwner.query(api.giftCards.getByCode, { code: 'SPLITGC' });
    expect(after?.balanceIDR).toBe(70000);
    const refundRows = await t.run((ctx) =>
      ctx.db.query('refunds').withIndex('by_order', (q) => q.eq('orderId', sale.orderId)).collect()
    );
    expect(refundRows).toHaveLength(0);
    const order = await t.run((ctx) => ctx.db.get(sale.orderId));
    expect(order?.refundedIDR).toBeUndefined();
  });

  it('cash leg: refunding within the 70000 cash leg succeeds, exceeding it throws', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const { sale } = await splitSale(t, s);
    // First 50000 ≤ 70000 cash leg → OK.
    await s.asOwner.mutation(api.refunds.create, {
      orderId: sale.orderId,
      clientId: 'split-refund-cash-ok',
      cashierId: s.cashierId,
      method: 'cash',
      lines: [{ lineIndex: 0, qty: 1 }], // 50000 ≤ 70000 cash leg
    });
    const order = await t.run((ctx) => ctx.db.get(sale.orderId));
    expect(order?.refundedIDR).toBe(50000);
    // Now a SECOND 50000 to cash would exceed the 70000 cash leg (50000 already
    // refunded ⇒ only 20000 left) and must throw.
    await expect(
      s.asOwner.mutation(api.refunds.create, {
        orderId: sale.orderId,
        clientId: 'split-refund-cash-over',
        cashierId: s.cashierId,
        method: 'cash',
        lines: [{ lineIndex: 0, qty: 1 }],
      })
    ).rejects.toThrow(/tender/i);
  });

  it('giftcard leg: refunding within the 30000 gc leg succeeds and credits exactly that', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    // A cleaner split where a single line equals the giftcard leg: 30000 item ×1
    // (giftcard) + 70000 item ×1 (cash). Refund the 30000 line to giftcard.
    const gid = await s.asOwner.mutation(api.giftCards.issue, {
      code: 'GCLEG',
      balanceIDR: 100000,
    });
    const cheap = await s.asOwner.mutation(api.menu.items.create, {
      categoryId: s.categoryId,
      name: 'Cheap30',
      priceIDR: 30000,
    });
    const pricey = await s.asOwner.mutation(api.menu.items.create, {
      categoryId: s.categoryId,
      name: 'Pricey70',
      priceIDR: 70000,
    });
    const sale = await s.asOwner.mutation(api.orders.createSplitSale, {
      clientId: 'gcleg-sale',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [
        { menuItemId: cheap, qty: 1, modifierOptionIds: [] },
        { menuItemId: pricey, qty: 1, modifierOptionIds: [] },
      ],
      tenders: [
        { method: 'cash', amountIDR: 70000, tenderedIDR: 70000 },
        { method: 'giftcard', giftCardCode: 'GCLEG', amountIDR: 30000 },
      ],
      createdAtClient: 1700000000000,
    });
    expect(sale.totalIDR).toBe(100000);
    const before = await s.asOwner.query(api.giftCards.getByCode, { code: 'GCLEG' });
    expect(before?.balanceIDR).toBe(70000); // 100000 − 30000 redeemed

    // Refund the 30000 line (lineIndex 0) to giftcard — equals the gc leg exactly.
    await s.asOwner.mutation(api.refunds.create, {
      orderId: sale.orderId,
      clientId: 'gcleg-refund',
      cashierId: s.cashierId,
      method: 'giftcard',
      lines: [{ lineIndex: 0, qty: 1 }],
    });
    const after = await s.asOwner.query(api.giftCards.getByCode, { code: 'GCLEG' });
    expect(after?.balanceIDR).toBe(70000 + 30000); // credited exactly the leg
    const txns = await s.asOwner.query(api.giftCards.transactions, { id: gid });
    const refundTxn = txns.find((x) => x.type === 'refund');
    expect(refundTxn?.amountIDR).toBe(30000);
  });
});

// ── Finding 2: daily charts subtract refunds ────────────────────────────────
describe('reports.salesDaily + dashboard.revenueDaily net out refunds (Finding 2)', () => {
  it('salesDaily subtracts a refund from its day bucket', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setup(t);
    const now = Date.now();
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'daily-sale',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      cashTenderedIDR: 60000,
      createdAtClient: now,
    });
    await asOwner.mutation(api.refunds.create, {
      orderId: sale.orderId,
      clientId: 'daily-refund',
      cashierId,
      method: 'cash',
      lines: [{ lineIndex: 0, qty: 1 }],
    });
    const range = { from: jakartaKey(now), to: jakartaKey(now) } as const;
    const daily = await asOwner.query(api.reports.salesDaily, { range });
    const today = daily.days.find((d) => d.day === jakartaKey(now));
    expect(today?.revenueIDR).toBe(54000 - 18000); // net of the refund
    expect(today?.orders).toBe(1);
  });

  it('dashboard.revenueDaily subtracts a refund from its day bucket', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setup(t);
    const now = Date.now();
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'rd-sale',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      cashTenderedIDR: 60000,
      createdAtClient: now,
    });
    await asOwner.mutation(api.refunds.create, {
      orderId: sale.orderId,
      clientId: 'rd-refund',
      cashierId,
      method: 'cash',
      lines: [{ lineIndex: 0, qty: 1 }],
    });
    const rd = await asOwner.query(api.dashboard.revenueDaily, {});
    const today = rd.find((d) => d.day === jakartaKey(now));
    expect(today?.revenueIDR).toBe(54000 - 18000); // net of the refund
  });
});
