import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';
import { signMockBody } from '../../convex/payments/providers/mock';

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

async function connectQris(asOwner: Setup['asOwner']): Promise<void> {
  await asOwner.mutation(api.settings.connectIntegration, { key: 'qris', config: { apiKey: 'k' } });
}

function saleArgs(s: Setup, clientId: string) {
  return {
    clientId,
    shiftId: s.shiftId,
    cashierId: s.cashierId,
    lines: [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [] as Id<'modifierOptions'>[] }],
    createdAtClient: 1700000000000,
  };
}

describe('payments.qrisDynamic.createQrisDynamicSale', () => {
  it('throws when the qris integration is NOT connected', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await expect(
      s.asOwner.action(api.payments.qrisDynamic.createQrisDynamicSale, saleArgs(s, 'qd-1'))
    ).rejects.toThrow(/belum terhubung/i);
  });

  it('returns a mock qrString, leaves the order pending, writes no inventory movements', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);
    const res = await s.asOwner.action(
      api.payments.qrisDynamic.createQrisDynamicSale,
      saleArgs(s, 'qd-2')
    );
    expect(res.qrString).toContain('MOCKQR');
    expect(res.expiresAt).toEqual(expect.any(Number));

    const order = await t.run(async (ctx) => await ctx.db.get(res.orderId));
    expect(order?.paymentMethod).toBe('qris_dynamic');
    expect(order?.paymentStatus).toBe('pending');
    expect(order?.totalIDR).toBe(18000);

    const payment = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', res.orderId))
        .unique()
    );
    expect(payment?.method).toBe('qris_dynamic');
    expect(payment?.providerStatus).toBe('pending');
    expect(payment?.providerRef).toEqual(expect.any(String));
    expect(payment?.confirmedAt).toBeUndefined();

    // Espresso has no recipe, so no side effects until the webhook confirms.
    const movements = await t.run(async (ctx) =>
      await ctx.db.query('inventoryMovements').collect()
    );
    expect(movements).toHaveLength(0);
  });

  it('confirmFromWebhook flips the order to paid and is idempotent', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);
    const res = await s.asOwner.action(
      api.payments.qrisDynamic.createQrisDynamicSale,
      saleArgs(s, 'qd-3')
    );
    const payment = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', res.orderId))
        .unique()
    );
    const providerRef = payment!.providerRef!;

    const first = await t.mutation(internal.payments.qrisDynamic.confirmFromWebhook, {
      providerRef,
    });
    expect(first).toBe('settled');
    let order = await t.run(async (ctx) => await ctx.db.get(res.orderId));
    expect(order?.paymentStatus).toBe('paid');

    // Idempotent replay — no error, stays paid.
    const second = await t.mutation(internal.payments.qrisDynamic.confirmFromWebhook, {
      providerRef,
    });
    expect(second).toBe('settled');
    order = await t.run(async (ctx) => await ctx.db.get(res.orderId));
    expect(order?.paymentStatus).toBe('paid');

    const confirmed = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', res.orderId))
        .unique()
    );
    expect(confirmed?.providerStatus).toBe('paid');
    expect(confirmed?.confirmedAt).toEqual(expect.any(Number));
  });

  it('confirmFromWebhook returns unknown for an unrecognized ref', async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(internal.payments.qrisDynamic.confirmFromWebhook, {
      providerRef: 'nope',
    });
    expect(result).toBe('unknown');
  });

  it('cancelQrisDynamicSale voids a pending order', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);
    const res = await s.asOwner.action(
      api.payments.qrisDynamic.createQrisDynamicSale,
      saleArgs(s, 'qd-4')
    );
    await s.asOwner.mutation(api.payments.qrisDynamic.cancelQrisDynamicSale, {
      orderId: res.orderId,
    });
    const order = await t.run(async (ctx) => await ctx.db.get(res.orderId));
    expect(order?.paymentStatus).toBe('void');
    const payment = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', res.orderId))
        .unique()
    );
    expect(payment?.providerStatus).toBe('void');
  });

  it('voidByRef voids a pending order, no-ops on a paid one', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);

    // Pending order — voidByRef should void it.
    const pending = await s.asOwner.action(
      api.payments.qrisDynamic.createQrisDynamicSale,
      saleArgs(s, 'qd-void-1')
    );
    const pendingPayment = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', pending.orderId))
        .unique()
    );
    await t.mutation(internal.payments.qrisDynamic.voidByRef, {
      providerRef: pendingPayment!.providerRef!,
    });
    const voidedOrder = await t.run(async (ctx) => await ctx.db.get(pending.orderId));
    expect(voidedOrder?.paymentStatus).toBe('void');

    // Paid order — voidByRef must leave it paid (pending-guard).
    const paid = await s.asOwner.action(
      api.payments.qrisDynamic.createQrisDynamicSale,
      saleArgs(s, 'qd-void-2')
    );
    const paidPayment = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', paid.orderId))
        .unique()
    );
    const paidRef = paidPayment!.providerRef!;
    await t.mutation(internal.payments.qrisDynamic.confirmFromWebhook, { providerRef: paidRef });
    await t.mutation(internal.payments.qrisDynamic.voidByRef, { providerRef: paidRef });
    const stillPaid = await t.run(async (ctx) => await ctx.db.get(paid.orderId));
    expect(stillPaid?.paymentStatus).toBe('paid');
  });

});

describe('POST /webhooks/qris', () => {
  it('returns 401 for an invalid signature', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);
    const res = await s.asOwner.action(
      api.payments.qrisDynamic.createQrisDynamicSale,
      saleArgs(s, 'wh-1')
    );
    const payment = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', res.orderId))
        .unique()
    );
    const providerRef = payment!.providerRef!;
    const body = JSON.stringify({ providerRef, status: 'paid' });
    const response = await t.fetch('/webhooks/qris', {
      method: 'POST',
      headers: { 'x-signature': 'nope', 'content-type': 'application/json' },
      body,
    });
    expect(response.status).toBe(401);
    // Order must still be pending after the rejected call
    const order = await t.run(async (ctx) => await ctx.db.get(res.orderId));
    expect(order?.paymentStatus).toBe('pending');
  });

  it('returns 200 and flips order to paid with a valid signature', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await connectQris(s.asOwner);
    const res = await s.asOwner.action(
      api.payments.qrisDynamic.createQrisDynamicSale,
      saleArgs(s, 'wh-2')
    );
    const payment = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', res.orderId))
        .unique()
    );
    const providerRef = payment!.providerRef!;
    const body = JSON.stringify({ providerRef, status: 'paid' });
    const sig = await signMockBody('dev-qris-secret', body);
    const response = await t.fetch('/webhooks/qris', {
      method: 'POST',
      headers: { 'x-signature': sig, 'content-type': 'application/json' },
      body,
    });
    expect(response.status).toBe(200);
    const order = await t.run(async (ctx) => await ctx.db.get(res.orderId));
    expect(order?.paymentStatus).toBe('paid');
  });
});
