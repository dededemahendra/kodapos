import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

const QR_TOKEN = 'a'.repeat(32);

function cid(base: string): string {
  return `${base}-${'0'.repeat(Math.max(0, 16 - base.length - 1))}`;
}

type Setup = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  tableId: Id<'tables'>;
  qrToken: string;
  itemId: Id<'menuItems'>;
};

/** Owner + cafe (tax 10% so total > subtotal) + a table w/ qrToken + a sellable
 * item. The PUBLIC functions are then called on the bare `t` (no identity). */
async function setup(
  t: ReturnType<typeof convexTest>,
  opts: { email?: string; qrToken?: string; taxEnabled?: boolean; taxRatePct?: number } = {}
): Promise<Setup> {
  const email = opts.email ?? 'o@x.com';
  const qrToken = opts.qrToken ?? QR_TOKEN;
  const taxEnabled = opts.taxEnabled ?? true;
  const taxRatePct = opts.taxRatePct ?? 10;
  const userId = await t.run(async (ctx) =>
    ctx.db.insert('users', { name: 'Owner', email })
  );
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

  const tableId = await asOwner.mutation(api.tables.create, { name: 'A1' });
  await t.run(async (ctx) => {
    await ctx.db.patch(tableId, { qrToken });
  });

  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 20000,
  });
  return { asOwner, cafeId, tableId, qrToken, itemId };
}

async function connectQris(asOwner: Setup['asOwner']): Promise<void> {
  await asOwner.mutation(api.settings.connectIntegration, { key: 'qris', config: { apiKey: 'k' } });
}

async function submit(
  t: ReturnType<typeof convexTest>,
  s: Setup,
  clientId: string
): Promise<Id<'selfOrders'>> {
  const { selfOrderId } = await t.mutation(api.public.submitSelfOrder, {
    qrToken: s.qrToken,
    clientId: cid(clientId),
    lines: [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [] }],
  });
  return selfOrderId;
}

describe('public.createSelfOrderCharge', () => {
  it('charges the TRUE total (subtotal + tax), sets awaiting + providerRef/qrString', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t); // tax 10%
    await connectQris(s.asOwner);
    const selfOrderId = await submit(t, s, 'c-true');

    const res = await t.action(api.public.createSelfOrderCharge, {
      qrToken: s.qrToken,
      selfOrderId,
    });

    // subtotal 20000, tax 10% → total 22000 (NOT the bare subtotal).
    expect(res.totalIDR).toBe(22000);
    expect(res.qrString).toContain('MOCKQR');
    expect(res.expiresAt).toEqual(expect.any(Number));

    const row = await t.run(async (ctx) => ctx.db.get(selfOrderId));
    expect(row!.paymentMode).toBe('qris');
    expect(row!.paymentStatus).toBe('awaiting');
    expect(row!.totalIDR).toBe(22000);
    expect(row!.providerRef).toEqual(expect.any(String));
    expect(row!.qrString).toContain('MOCKQR');
    // The mock encodes the charged amount into the qrString — must be the true total.
    expect(row!.qrString).toContain('22000');

    // No QRIS credentials leak to the public return.
    expect(JSON.stringify(res)).not.toMatch(/apiKey|secretApiKey|callbackToken/i);
  });

  it('is idempotent: a 2nd call returns the SAME providerRef/qrString (no new charge)', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);
    const selfOrderId = await submit(t, s, 'c-idem');

    const first = await t.action(api.public.createSelfOrderCharge, {
      qrToken: s.qrToken,
      selfOrderId,
    });
    const firstRef = await t.run(async (ctx) => (await ctx.db.get(selfOrderId))!.providerRef);

    const second = await t.action(api.public.createSelfOrderCharge, {
      qrToken: s.qrToken,
      selfOrderId,
    });
    const secondRef = await t.run(async (ctx) => (await ctx.db.get(selfOrderId))!.providerRef);

    expect(second.qrString).toBe(first.qrString);
    expect(second.totalIDR).toBe(first.totalIDR);
    expect(secondRef).toBe(firstRef);
  });

  it('throws QRIS tidak tersedia when the cafe has no QRIS connected', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t); // no connectQris
    const selfOrderId = await submit(t, s, 'c-noqris');
    await expect(
      t.action(api.public.createSelfOrderCharge, { qrToken: s.qrToken, selfOrderId })
    ).rejects.toThrow(/QRIS tidak tersedia/i);
  });

  it('throws when the qrToken belongs to a DIFFERENT table than the self-order', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);
    const other = await setup(t, { email: 'o2@x.com', qrToken: 'c'.repeat(32) });
    const selfOrderId = await submit(t, s, 'c-mismatch');
    await expect(
      t.action(api.public.createSelfOrderCharge, {
        qrToken: other.qrToken,
        selfOrderId,
      })
    ).rejects.toThrow();
  });
});

describe('payments.qrisDynamic.confirmSelfOrderFromWebhook', () => {
  it('flips awaiting → paid, paidAmountIDR === totalIDR, idempotent', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);
    const selfOrderId = await submit(t, s, 'c-confirm');
    await t.action(api.public.createSelfOrderCharge, { qrToken: s.qrToken, selfOrderId });
    const providerRef = await t.run(async (ctx) => (await ctx.db.get(selfOrderId))!.providerRef!);

    await t.mutation(internal.payments.qrisDynamic.confirmSelfOrderFromWebhook, { providerRef });
    let row = await t.run(async (ctx) => ctx.db.get(selfOrderId));
    expect(row!.paymentStatus).toBe('paid');
    expect(row!.paidAmountIDR).toBe(22000);
    expect(row!.paidAmountIDR).toBe(row!.totalIDR);

    // Idempotent replay — stays paid, paidAmount unchanged.
    await t.mutation(internal.payments.qrisDynamic.confirmSelfOrderFromWebhook, { providerRef });
    row = await t.run(async (ctx) => ctx.db.get(selfOrderId));
    expect(row!.paymentStatus).toBe('paid');
    expect(row!.paidAmountIDR).toBe(22000);
  });
});

describe('payments.qrisDynamic.getSelfOrderCafeByRef', () => {
  it('resolves the cafe owning a self-order providerRef', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);
    const selfOrderId = await submit(t, s, 'c-cafe');
    await t.action(api.public.createSelfOrderCharge, { qrToken: s.qrToken, selfOrderId });
    const providerRef = await t.run(async (ctx) => (await ctx.db.get(selfOrderId))!.providerRef!);

    const result = await t.query(internal.payments.qrisDynamic.getSelfOrderCafeByRef, { providerRef });
    expect(result).toEqual({ cafeId: s.cafeId });

    const miss = await t.query(internal.payments.qrisDynamic.getSelfOrderCafeByRef, {
      providerRef: 'nope',
    });
    expect(miss).toBeNull();
  });
});

describe('public.selfOrderStatus (pay-now)', () => {
  it('returns paymentStatus + qrString/expiresAt/totalIDR while awaiting', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);
    const selfOrderId = await submit(t, s, 'c-status');
    await t.action(api.public.createSelfOrderCharge, { qrToken: s.qrToken, selfOrderId });

    const status = await t.query(api.public.selfOrderStatus, { selfOrderId, qrToken: s.qrToken });
    expect(status!.status).toBe('new');
    expect(status!.paymentStatus).toBe('awaiting');
    expect(status!.qrString).toContain('MOCKQR');
    expect(status!.totalIDR).toBe(22000);
    expect(status!.expiresAt).toEqual(expect.any(Number));
  });

  it('defaults paymentStatus to unpaid for a counter self-order', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const selfOrderId = await submit(t, s, 'c-unpaid');
    const status = await t.query(api.public.selfOrderStatus, { selfOrderId, qrToken: s.qrToken });
    expect(status!.paymentStatus).toBe('unpaid');
  });
});

describe('public.menuForTable.payNowAvailable', () => {
  it('is true when QRIS-dynamic is connected, false otherwise', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    let menu = await t.query(api.public.menuForTable, { qrToken: s.qrToken });
    expect(menu!.payNowAvailable).toBe(false);

    await connectQris(s.asOwner);
    menu = await t.query(api.public.menuForTable, { qrToken: s.qrToken });
    expect(menu!.payNowAvailable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Task 2: staff accept of a pre-paid self-order
// ---------------------------------------------------------------------------

/** Open a shift for the cafe + return the cashier/shift ids (register context). */
async function openShift(
  asOwner: Setup['asOwner']
): Promise<{ cashierId: Id<'cafeStaff'>; shiftId: Id<'shifts'> }> {
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
  return { cashierId, shiftId };
}

/** Attach a single-ingredient recipe to the item so settleSale writes a movement. */
async function attachRecipe(
  asOwner: Setup['asOwner'],
  itemId: Id<'menuItems'>
): Promise<Id<'ingredients'>> {
  const beanId = await asOwner.mutation(api.ingredients.upsert, {
    name: 'Biji',
    canonicalUnit: 'g',
    reorderThreshold: 500,
    lastCostPerUnitIDR: 100,
  });
  await asOwner.mutation(api.recipes.upsert, {
    menuItemId: itemId,
    lines: [{ ingredientId: beanId, qty: 18, wastageFactor: 1.0 }],
  });
  return beanId;
}

/** Seed a PAID self-order on the table (submit → charge → webhook confirm). */
async function seedPaid(
  t: ReturnType<typeof convexTest>,
  s: Setup,
  clientId: string
): Promise<Id<'selfOrders'>> {
  const selfOrderId = await submit(t, s, clientId);
  await t.action(api.public.createSelfOrderCharge, { qrToken: s.qrToken, selfOrderId });
  const providerRef = await t.run(async (ctx) => (await ctx.db.get(selfOrderId))!.providerRef!);
  await t.mutation(internal.payments.qrisDynamic.confirmSelfOrderFromWebhook, { providerRef });
  return selfOrderId;
}

describe('selfOrders.acceptPaid', () => {
  it('creates exactly one paid order with the pre-collected amount + records the providerRef + fires kitchen + settles', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t); // tax 10%
    await connectQris(s.asOwner);
    const beanId = await attachRecipe(s.asOwner, s.itemId);
    const { cashierId } = await openShift(s.asOwner);
    const selfOrderId = await seedPaid(t, s, 'c-accept');

    const { providerRef, paidAmountIDR } = await t.run(async (ctx) => {
      const so = (await ctx.db.get(selfOrderId))!;
      return { providerRef: so.providerRef!, paidAmountIDR: so.paidAmountIDR! };
    });
    expect(paidAmountIDR).toBe(22000); // subtotal 20000 + 10% tax

    const { orderId } = await s.asOwner.mutation(api.selfOrders.acceptPaid, {
      id: selfOrderId,
      cashierId,
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order!.paymentStatus).toBe('paid');
    expect(order!.kitchenStatus).toBe('new');
    expect(order!.tableId).toBe(s.tableId);
    expect(order!.totalIDR).toBe(paidAmountIDR);
    expect(order!.totalIDR).toBe(22000);

    const payments = await t.run(async (ctx) =>
      ctx.db.query('payments').withIndex('by_order', (q) => q.eq('orderId', orderId)).collect()
    );
    expect(payments).toHaveLength(1);
    expect(payments[0]!.method).toBe('qris_dynamic');
    expect(payments[0]!.amountIDR).toBe(paidAmountIDR);
    expect(payments[0]!.confirmedAt).toEqual(expect.any(Number));
    expect(payments[0]!.providerRef).toBe(providerRef);

    const so = await t.run(async (ctx) => ctx.db.get(selfOrderId));
    expect(so!.status).toBe('accepted');
    expect(so!.acceptedOrderId).toBe(orderId);

    // settleSale side effects ran: a sale inventory movement for the recipe item.
    const movements = await t.run(async (ctx) =>
      ctx.db
        .query('inventoryMovements')
        .withIndex('by_cafe_ingredient', (q) =>
          q.eq('cafeId', s.cafeId).eq('ingredientId', beanId)
        )
        .collect()
    );
    expect(movements).toHaveLength(1);
    expect(movements[0]!.delta).toBe(-18);
    expect(movements[0]!.reason).toBe('sale');
  });

  it('is idempotent on retry: a 2nd acceptPaid returns the same orderId + creates no 2nd order/payment', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);
    await attachRecipe(s.asOwner, s.itemId);
    const { cashierId } = await openShift(s.asOwner);
    const selfOrderId = await seedPaid(t, s, 'c-idem-accept');

    const first = await s.asOwner.mutation(api.selfOrders.acceptPaid, { id: selfOrderId, cashierId });
    const second = await s.asOwner.mutation(api.selfOrders.acceptPaid, { id: selfOrderId, cashierId });
    expect(second.orderId).toBe(first.orderId);

    const orders = await t.run(async (ctx) =>
      ctx.db.query('orders').withIndex('by_cafe_clientId', (q) => q.eq('cafeId', s.cafeId)).collect()
    );
    expect(orders).toHaveLength(1);
    const payments = await t.run(async (ctx) =>
      ctx.db.query('payments').withIndex('by_order', (q) => q.eq('orderId', first.orderId)).collect()
    );
    expect(payments).toHaveLength(1);
  });

  it('rejects acceptPaid when the self-order is not paid (counter/unpaid)', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const { cashierId } = await openShift(s.asOwner);
    const selfOrderId = await submit(t, s, 'c-unpaid-accept'); // never charged/paid
    await expect(
      s.asOwner.mutation(api.selfOrders.acceptPaid, { id: selfOrderId, cashierId })
    ).rejects.toThrow(/sudah dibayar|belum dibayar/i);
  });

  it('throws on price-drift (recomputed total != paidAmount) and creates nothing', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);
    const { cashierId } = await openShift(s.asOwner);
    const selfOrderId = await seedPaid(t, s, 'c-drift');

    // Item price changed after the customer paid → recomputed total differs.
    await t.run(async (ctx) => ctx.db.patch(s.itemId, { priceIDR: 25000 }));

    await expect(
      s.asOwner.mutation(api.selfOrders.acceptPaid, { id: selfOrderId, cashierId })
    ).rejects.toThrow(/harga berubah/i);

    // Nothing created: no order, no payment; the self-order stays in the queue.
    const orders = await t.run(async (ctx) => ctx.db.query('orders').collect());
    expect(orders).toHaveLength(0);
    const payments = await t.run(async (ctx) => ctx.db.query('payments').collect());
    expect(payments).toHaveLength(0);
    const so = await t.run(async (ctx) => ctx.db.get(selfOrderId));
    expect(so!.status).toBe('new');
    expect(so!.acceptedOrderId).toBeUndefined();
  });

  it('throws Buka shift dulu when no shift is open', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);
    // a cashier exists but no shift is open
    const cashierId = await s.asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
    const selfOrderId = await seedPaid(t, s, 'c-noshift');
    await expect(
      s.asOwner.mutation(api.selfOrders.acceptPaid, { id: selfOrderId, cashierId })
    ).rejects.toThrow(/buka shift/i);
  });

  it('rejects a foreign self-order (owner scope)', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);
    const { cashierId } = await openShift(s.asOwner);
    const selfOrderId = await seedPaid(t, s, 'c-foreign');

    const other = await setup(t, { email: 'o2@x.com', qrToken: 'd'.repeat(32) });
    await expect(
      other.asOwner.mutation(api.selfOrders.acceptPaid, { id: selfOrderId, cashierId })
    ).rejects.toThrow();
  });
});

describe('selfOrders.reject (pay-now guard)', () => {
  it('throws sudah dibayar when rejecting a PAID self-order', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);
    const selfOrderId = await seedPaid(t, s, 'c-reject-paid');
    await expect(
      s.asOwner.mutation(api.selfOrders.reject, { id: selfOrderId })
    ).rejects.toThrow(/sudah dibayar/i);
  });
});
