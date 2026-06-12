import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { action, internalAction, internalMutation, internalQuery, mutation } from '../_generated/server';
import { requireOwnerCafe } from '../lib/auth';
import { buildOrder, settleSale, saleArgs, voidPendingOrder } from '../lib/sale';
import { resolveProvider, qrisWebhookSecret } from './providers';
import { signMockBody } from './providers/mock';

/**
 * Internal: connected-integration check for the action (which can't read ctx.db).
 * Returns the connected qris integration's config (server-only — it carries creds,
 * which is fine for an internalQuery) so the action can select/configure a provider.
 */
export const assertQrisConnected = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    const qris = (row?.integrations ?? []).find((i) => i.key === 'qris' && i.connected);
    if (!qris) throw new Error('Integrasi QRIS dinamis belum terhubung.');
    return qris.config ?? {};
  },
});

/** Internal: resolve the order + cafe owning a payment by its provider ref (webhook lookup). */
export const getPaymentCafeByRef = internalQuery({
  args: { providerRef: v.string() },
  returns: v.union(v.object({ orderId: v.id('orders'), cafeId: v.id('cafes') }), v.null()),
  handler: async (ctx, { providerRef }) => {
    const p = await ctx.db
      .query('payments')
      .withIndex('by_provider_ref', (q) => q.eq('providerRef', providerRef))
      .unique();
    return p ? { orderId: p.orderId, cafeId: p.cafeId } : null;
  },
});

/** Internal: a cafe's connected qris integration config (creds — server-only). */
export const getQrisConfig = internalQuery({
  args: { cafeId: v.id('cafes') },
  returns: v.any(),
  handler: async (ctx, { cafeId }) => {
    const row = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    const qris = (row?.integrations ?? []).find((i) => i.key === 'qris' && i.connected);
    return qris?.config ?? null;
  },
});

/** Internal: insert the pending order via the shared buildOrder (no charge yet). */
export const buildPendingDynamicOrder = internalMutation({
  args: saleArgs,
  returns: v.object({ orderId: v.id('orders'), totalIDR: v.number(), changeIDR: v.number() }),
  handler: async (ctx, args) => buildOrder(ctx, args, { method: 'qris_dynamic' }),
});

/** Internal: patch the pending payment row with the provider ref + expiry once charged. */
export const patchCharge = internalMutation({
  args: { orderId: v.id('orders'), providerRef: v.string(), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { orderId, providerRef, expiresAt }) => {
    const payment = await ctx.db
      .query('payments')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .filter((q) => q.eq(q.field('method'), 'qris_dynamic'))
      .unique();
    if (payment) await ctx.db.patch(payment._id, { providerRef, expiresAt, providerStatus: 'pending' });
    return null;
  },
});

/** Internal: void a pending order by id (charge-create failed). */
export const voidPendingOrderByRef = internalMutation({
  args: { orderId: v.id('orders'), providerStatus: v.string() },
  returns: v.null(),
  handler: async (ctx, { orderId, providerStatus }) => {
    await voidPendingOrder(ctx, orderId, providerStatus);
    return null;
  },
});

/** Owner-triggered: build the pending order first, then create the provider charge. */
export const createQrisDynamicSale = action({
  args: saleArgs,
  returns: v.object({ orderId: v.id('orders'), qrString: v.string(), expiresAt: v.number() }),
  handler: async (
    ctx,
    args
  ): Promise<{ orderId: Id<'orders'>; qrString: string; expiresAt: number }> => {
    const config = await ctx.runQuery(internal.payments.qrisDynamic.assertQrisConnected, {});
    const { orderId, totalIDR } = await ctx.runMutation(
      internal.payments.qrisDynamic.buildPendingDynamicOrder,
      args
    );
    let charge: { providerRef: string; qrString: string; expiresAt: number };
    try {
      charge = await resolveProvider(config).createCharge({ amountIDR: totalIDR, referenceId: orderId });
    } catch (err) {
      await ctx.runMutation(internal.payments.qrisDynamic.voidPendingOrderByRef, {
        orderId,
        providerStatus: 'failed',
      });
      throw err;
    }
    await ctx.runMutation(internal.payments.qrisDynamic.patchCharge, {
      orderId,
      providerRef: charge.providerRef,
      expiresAt: charge.expiresAt,
    });
    return { orderId, qrString: charge.qrString, expiresAt: charge.expiresAt };
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
    await voidPendingOrder(ctx, payment.orderId, 'void');
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
    await voidPendingOrder(ctx, orderId, 'void');
    return null;
  },
});

/** Internal: list up to 50 pending dynamic payments whose order is still pending (reconcile candidates). */
export const listPendingDynamic = internalQuery({
  args: {},
  returns: v.array(
    v.object({ orderId: v.id('orders'), cafeId: v.id('cafes'), providerRef: v.string(), expiresAt: v.number() })
  ),
  handler: async (ctx) => {
    const payments = await ctx.db
      .query('payments')
      .withIndex('by_method_provider_status', (q) =>
        q.eq('method', 'qris_dynamic').eq('providerStatus', 'pending')
      )
      .take(50);
    const out: Array<{ orderId: Id<'orders'>; cafeId: Id<'cafes'>; providerRef: string; expiresAt: number }> = [];
    for (const p of payments) {
      if (!p.providerRef || p.expiresAt === undefined) continue;
      const order = await ctx.db.get(p.orderId);
      if (order?.paymentStatus === 'pending') {
        out.push({ orderId: p.orderId, cafeId: order.cafeId, providerRef: p.providerRef, expiresAt: p.expiresAt });
      }
    }
    return out;
  },
});

const FAILSAFE_GRACE_MS = 60 * 60 * 1000;

/**
 * Internal cron: poll the provider for each pending dynamic order and reconcile.
 * Xendit is the source of truth: paid→settle, expired/failed→void, pending→leave,
 * unknown→void only when far past expiry (failsafe). Reuses idempotent, pending-guarded mutations.
 */
export const reconcilePending = internalAction({
  args: {},
  returns: v.object({ settled: v.number(), voided: v.number(), left: v.number() }),
  handler: async (ctx): Promise<{ settled: number; voided: number; left: number }> => {
    const candidates = await ctx.runQuery(internal.payments.qrisDynamic.listPendingDynamic, {});
    const now = Date.now();
    let settled = 0;
    let voided = 0;
    let left = 0;
    for (const c of candidates) {
      try {
        const config = await ctx.runQuery(internal.payments.qrisDynamic.getQrisConfig, { cafeId: c.cafeId });
        const status = config ? await resolveProvider(config).fetchStatus(c.providerRef) : 'unknown';
        if (status === 'paid') {
          await ctx.runMutation(internal.payments.qrisDynamic.confirmFromWebhook, { providerRef: c.providerRef });
          settled++;
        } else if (status === 'expired' || status === 'failed') {
          await ctx.runMutation(internal.payments.qrisDynamic.voidByRef, { providerRef: c.providerRef });
          voided++;
        } else if (status === 'pending') {
          left++;
        } else {
          if (now > c.expiresAt + FAILSAFE_GRACE_MS) {
            await ctx.runMutation(internal.payments.qrisDynamic.voidByRef, { providerRef: c.providerRef });
            voided++;
          } else {
            left++;
          }
        }
      } catch {
        left++;
      }
    }
    return { settled, voided, left };
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
