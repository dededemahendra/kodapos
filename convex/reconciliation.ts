import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireActiveOutlet, requireOwned } from './lib/auth';

/**
 * Reconciliation rows written by `orders.createReplayedCashSale` when a queued
 * offline sale posts against a world that moved while the till was offline: a
 * price changed, an item was archived, the shift had already closed. Every row
 * is a fact the owner needs to see once and then dismiss — the sale itself is
 * already recorded as it was rung and is never rewritten from here.
 */
const reconciliationRow = v.object({
  _id: v.id('saleReconciliations'),
  orderId: v.id('orders'),
  clientId: v.string(),
  kind: v.union(
    v.literal('price_drift'),
    v.literal('item_unavailable'),
    v.literal('promo_archived'),
    v.literal('negative_stock'),
    v.literal('modifier_rule_changed'),
    v.literal('payment_method_disabled'),
    v.literal('shift_closed'),
    v.literal('cashier_archived'),
    v.literal('price_category_archived')
  ),
  rungIDR: v.union(v.number(), v.null()),
  currentIDR: v.union(v.number(), v.null()),
  detail: v.union(v.string(), v.null()),
  createdAt: v.number(),
  /** Order total, so a row can be judged without opening the order. */
  orderTotalIDR: v.union(v.number(), v.null()),
  /** When the till rang the sale, not when it posted. */
  orderCreatedAtClient: v.union(v.number(), v.null()),
});

/**
 * Unresolved reconciliation rows for the caller's outlet, newest first.
 *
 * Scoped by `by_cafe` and then filtered in memory on `resolvedAt`: the table is
 * only ever written by offline replay, so it holds at most a handful of rows
 * per outage — not worth a second index.
 */
export const listOpen = query({
  args: {},
  returns: v.array(reconciliationRow),
  handler: async (ctx) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const rows = await ctx.db
      .query('saleReconciliations')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .collect();
    const open = rows
      .filter((row) => row.resolvedAt === undefined)
      .sort((a, b) => b.createdAt - a.createdAt);
    return await Promise.all(
      open.map(async (row) => {
        // The row is cafe-scoped already; the order is read only for display
        // context, and a missing one must not drop the row (the discrepancy is
        // still real).
        const order = await ctx.db.get(row.orderId);
        const sameCafe = order && order.cafeId === cafeId ? order : null;
        return {
          _id: row._id,
          orderId: row.orderId,
          clientId: row.clientId,
          kind: row.kind,
          rungIDR: row.rungIDR ?? null,
          currentIDR: row.currentIDR ?? null,
          detail: row.detail ?? null,
          createdAt: row.createdAt,
          orderTotalIDR: sameCafe?.totalIDR ?? null,
          orderCreatedAtClient: sameCafe?.createdAtClient ?? null,
        };
      })
    );
  },
});

/**
 * Mark one row handled. Idempotent: re-resolving an already-resolved row keeps
 * the original timestamp rather than moving it, so "when was this dealt with"
 * survives a double tap.
 */
export const resolve = mutation({
  args: { id: v.id('saleReconciliations') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const row = await requireOwned(ctx, cafeId, id, 'Catatan rekonsiliasi');
    if (row.resolvedAt === undefined) {
      await ctx.db.patch(id, { resolvedAt: Date.now() });
    }
    return null;
  },
});
