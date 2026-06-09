import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { action, internalAction, internalMutation, internalQuery, mutation } from '../_generated/server';
import { requireOwnerCafe } from '../lib/auth';
import { buildOrder, settleSale, saleArgs } from '../lib/sale';
import { resolveProvider, qrisWebhookSecret } from './providers';
import { signMockBody } from './providers/mock';

/** Internal: connected-integration check for the action (which can't read ctx.db). */
export const assertQrisConnected = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    const connected = (row?.integrations ?? []).some((i) => i.key === 'qris' && i.connected);
    if (!connected) throw new Error('Integrasi QRIS dinamis belum terhubung.');
    return null;
  },
});

/** Internal: insert the pending order via the shared buildOrder. */
export const buildPendingDynamicOrder = internalMutation({
  args: { ...saleArgs, providerRef: v.string(), expiresAt: v.number() },
  returns: v.object({ orderId: v.id('orders'), totalIDR: v.number(), changeIDR: v.number() }),
  handler: async (ctx, { providerRef, expiresAt, ...args }) =>
    buildOrder(ctx, args, { method: 'qris_dynamic', providerRef, expiresAt }),
});

/** Owner-triggered: create a charge with the provider and a pending order. */
export const createQrisDynamicSale = action({
  args: saleArgs,
  returns: v.object({ orderId: v.id('orders'), qrString: v.string(), expiresAt: v.number() }),
  handler: async (
    ctx,
    args
  ): Promise<{ orderId: Id<'orders'>; qrString: string; expiresAt: number }> => {
    await ctx.runQuery(internal.payments.qrisDynamic.assertQrisConnected, {});
    const provider = resolveProvider();
    // amountIDR is a placeholder here: the mock provider confirms by signature,
    // not amount, and the cashier-facing total is computed authoritatively in
    // buildOrder (mirrored client-side by usePaymentTotals). A real adapter would
    // pass the recomputed total instead.
    const charge = await provider.createCharge({
      amountIDR: 0,
      ref: args.clientId,
      idempotencyKey: args.clientId,
    });
    const res = await ctx.runMutation(internal.payments.qrisDynamic.buildPendingDynamicOrder, {
      ...args,
      providerRef: charge.providerRef,
      expiresAt: charge.expiresAt,
    });
    return { orderId: res.orderId, qrString: charge.qrString, expiresAt: charge.expiresAt };
  },
});

/** Internal: settle a pending order identified by provider ref (idempotent). */
export const confirmFromWebhook = internalMutation({
  args: { providerRef: v.string() },
  returns: v.union(v.literal('settled'), v.literal('unknown')),
  handler: async (ctx, { providerRef }) => {
    const payment = await ctx.db
      .query('payments')
      .withIndex('by_provider_ref', (q) => q.eq('providerRef', providerRef))
      .unique();
    if (!payment) return 'unknown';
    await settleSale(ctx, payment.orderId);
    return 'settled';
  },
});

/** Internal: void a pending order by provider ref (expired/failed webhook). */
export const voidByRef = internalMutation({
  args: { providerRef: v.string() },
  returns: v.null(),
  handler: async (ctx, { providerRef }) => {
    const payment = await ctx.db
      .query('payments')
      .withIndex('by_provider_ref', (q) => q.eq('providerRef', providerRef))
      .unique();
    if (!payment) return null;
    const order = await ctx.db.get(payment.orderId);
    if (order?.paymentStatus === 'pending') {
      await ctx.db.patch(order._id, { paymentStatus: 'void' });
      await ctx.db.patch(payment._id, { providerStatus: 'void' });
    }
    return null;
  },
});

/** Owner-triggered: cancel a pending dynamic order (cashier closed the dialog). */
export const cancelQrisDynamicSale = mutation({
  args: { orderId: v.id('orders') },
  returns: v.null(),
  handler: async (ctx, { orderId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const order = await ctx.db.get(orderId);
    if (!order || order.cafeId !== cafeId) throw new Error('Pesanan tidak ditemukan.');
    if (order.paymentStatus !== 'pending') return null;
    await ctx.db.patch(orderId, { paymentStatus: 'void' });
    const payment = await ctx.db
      .query('payments')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .unique();
    if (payment) await ctx.db.patch(payment._id, { providerStatus: 'void' });
    return null;
  },
});

/** Internal cron: void pending dynamic orders past expiry + grace (5 min). */
export const sweepExpired = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    const candidates = await ctx.db
      .query('payments')
      .withIndex('by_method_provider_status', (q) =>
        q.eq('method', 'qris_dynamic').eq('providerStatus', 'pending')
      )
      .collect();
    let voided = 0;
    for (const p of candidates) {
      if (!p.expiresAt || p.expiresAt > cutoff) continue;
      const order = await ctx.db.get(p.orderId);
      if (order?.paymentStatus === 'pending') {
        await ctx.db.patch(order._id, { paymentStatus: 'void' });
        await ctx.db.patch(p._id, { providerStatus: 'expired' });
        voided++;
      }
    }
    return voided;
  },
});

/** Dev-only: POST a correctly-signed webhook event to the local route (full round-trip). */
export const simulateWebhook = internalAction({
  args: { providerRef: v.string(), status: v.union(v.literal('paid'), v.literal('expired'), v.literal('failed')) },
  returns: v.number(),
  handler: async (_ctx, { providerRef, status }) => {
    const body = JSON.stringify({ providerRef, status });
    const sig = await signMockBody(qrisWebhookSecret(), body);
    const res = await fetch(`${process.env.CONVEX_SITE_URL}/webhooks/qris`, {
      method: 'POST', headers: { 'x-signature': sig, 'content-type': 'application/json' }, body,
    });
    return res.status;
  },
});
