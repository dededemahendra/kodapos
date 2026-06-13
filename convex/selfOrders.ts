import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, type QueryCtx, query } from './_generated/server';
import { heldLineValidator } from './lib/heldOrder';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { buildOrder, settleSale } from './lib/sale';

/**
 * Staff (OWNER-GATED) side of QR self-ordering. The public, unauthenticated
 * intake lives in `convex/public.ts`; everything here calls `requireOwnerCafe`
 * and scopes every read/write to the owner's cafe. A self-order only becomes a
 * real order via `accept` → the authenticated /sale register path.
 */

// ---------------------------------------------------------------------------
// queue — pending self-orders for the owner's cafe, newest-first
// ---------------------------------------------------------------------------

const queueRow = v.object({
  id: v.id('selfOrders'),
  tableName: v.optional(v.string()),
  lineCount: v.number(),
  subtotalIDR: v.number(),
  // Pay-now surfacing for the queue card ("Lunas (QRIS)" + the charged total).
  // Absent on pay-at-counter self-orders.
  paymentStatus: v.optional(
    v.union(v.literal('unpaid'), v.literal('awaiting'), v.literal('paid'))
  ),
  totalIDR: v.optional(v.number()),
  customerNote: v.optional(v.string()),
  createdAt: v.number(),
  // A compact line preview for the queue card (display fields only).
  lines: v.array(
    v.object({
      nameSnapshot: v.string(),
      qty: v.number(),
      variantName: v.optional(v.string()),
      modifierLabels: v.array(v.string()),
    })
  ),
});

export const queue = query({
  args: {},
  returns: v.array(queueRow),
  handler: async (ctx, _args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('selfOrders')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'new'))
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        id: r._id,
        ...(r.tableName ? { tableName: r.tableName } : {}),
        lineCount: r.lines.length,
        subtotalIDR: r.subtotalIDR,
        ...(r.paymentStatus ? { paymentStatus: r.paymentStatus } : {}),
        ...(r.totalIDR !== undefined ? { totalIDR: r.totalIDR } : {}),
        ...(r.customerNote ? { customerNote: r.customerNote } : {}),
        createdAt: r.createdAt,
        lines: r.lines.map((l) => ({
          nameSnapshot: l.nameSnapshot,
          qty: l.qty,
          ...(l.variantName ? { variantName: l.variantName } : {}),
          modifierLabels: l.modifierLabels,
        })),
      }));
  },
});

// ---------------------------------------------------------------------------
// getForCart — the held-order recall payload shape, so /sale loads a self-order
// identically to a parked held order
// ---------------------------------------------------------------------------

/**
 * Map a stored self-order line into the held-order recall line shape the
 * sale-screen's cart `load` action consumes. The only divergence is
 * `modifierLabels`: self-orders store option names as strings, but the cart line
 * expects `{groupName, optionName, priceAdjustmentIDR}` objects — so we rehydrate
 * them from the snapshot's `modifierOptionIds`. (Final pricing is recomputed
 * server-side from `modifierOptionIds` at ring-up; the labels are display-only.)
 */
async function toRecallLine(
  ctx: QueryCtx,
  line: Doc<'selfOrders'>['lines'][number]
): Promise<Doc<'heldOrders'>['lines'][number]> {
  const modifierLabels: Array<{
    groupName: string;
    optionName: string;
    priceAdjustmentIDR: number;
  }> = [];
  for (const optionId of line.modifierOptionIds) {
    const option = await ctx.db.get(optionId);
    if (!option) continue;
    const group = await ctx.db.get(option.groupId);
    modifierLabels.push({
      groupName: group?.name ?? '',
      optionName: option.name,
      priceAdjustmentIDR: option.priceAdjustmentIDR,
    });
  }
  return {
    menuItemId: line.menuItemId,
    nameSnapshot: line.nameSnapshot,
    qty: line.qty,
    unitPriceIDR: line.unitPriceIDR,
    ...(line.variantId ? { variantId: line.variantId } : {}),
    ...(line.variantName ? { variantName: line.variantName } : {}),
    modifierOptionIds: line.modifierOptionIds,
    modifierLabels,
  };
}

export const getForCart = query({
  args: { id: v.id('selfOrders') },
  returns: v.object({
    tableId: v.optional(v.id('tables')),
    lines: v.array(heldLineValidator),
  }),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await requireOwned(ctx, cafeId, id, 'Pesanan');
    const lines = await Promise.all(row.lines.map((l) => toRecallLine(ctx, l)));
    return {
      ...(row.tableId ? { tableId: row.tableId } : {}),
      lines,
    };
  },
});

// ---------------------------------------------------------------------------
// accept / reject — owner transitions
// ---------------------------------------------------------------------------

export const accept = mutation({
  args: { id: v.id('selfOrders') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Pesanan');
    await ctx.db.patch(id, { status: 'accepted', acceptedAt: Date.now() });
    return null;
  },
});

export const reject = mutation({
  args: { id: v.id('selfOrders') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await requireOwned(ctx, cafeId, id, 'Pesanan');
    // A pay-now (QRIS) self-order with a charge in-flight (awaiting) or already
    // paid can't be rejected: the customer may pay (or has paid) a live QR, so
    // rejecting would collect money on a never-fired order. It must be accepted
    // (or refunded out of band), never dropped.
    if (row.paymentStatus === 'awaiting' || row.paymentStatus === 'paid') {
      throw new Error('Tidak bisa menolak pesanan yang sedang atau sudah dibayar.');
    }
    await ctx.db.patch(id, { status: 'rejected' });
    return null;
  },
});

// ---------------------------------------------------------------------------
// acceptPaid — staff accept of a PRE-PAID (QRIS-dynamic) self-order. Turns the
// pre-collected charge into a real PAID order on the staff's open shift/cashier,
// records the existing providerRef (NO re-charge), and fires it to the kitchen.
// ---------------------------------------------------------------------------

export const acceptPaid = mutation({
  args: { id: v.id('selfOrders'), cashierId: v.id('cafeStaff') },
  returns: v.object({ orderId: v.id('orders') }),
  handler: async (ctx, { id, cashierId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const so = await requireOwned(ctx, cafeId, id, 'Pesanan');

    // Idempotent fast-path: already accepted → return the existing order.
    if (so.acceptedOrderId) return { orderId: so.acceptedOrderId };

    // A rejected self-order must never be turned into a real order, even if a
    // payment somehow landed on it ('new' is the normal path; 'accepted' covers
    // the idempotent retry before acceptedOrderId is stamped).
    if (so.status !== 'new' && so.status !== 'accepted') {
      throw new Error('Pesanan sudah ditolak.');
    }

    if (so.paymentStatus !== 'paid') throw new Error('Pesanan belum dibayar.');
    if (so.paidAmountIDR === undefined) throw new Error('Pesanan belum dibayar.');

    // The register context: this cafe's single open shift + the chosen cashier.
    const shift = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .unique();
    if (!shift) throw new Error('Buka shift dulu.');
    await requireOwned(ctx, cafeId, cashierId, 'Kasir');

    const lines = so.lines.map((l) => ({
      menuItemId: l.menuItemId,
      qty: l.qty,
      modifierOptionIds: l.modifierOptionIds,
      ...(l.variantId ? { variantId: l.variantId } : {}),
    }));

    // Build the order via the shared checkout core. The clientId is derived from
    // the self-order id so a retried acceptPaid hits buildOrder's idempotency
    // (a 2nd order is never created) on top of the acceptedOrderId fast-path.
    const { orderId, totalIDR } = await buildOrder(
      ctx,
      {
        clientId: `sop_${id}`,
        shiftId: shift._id,
        cashierId,
        lines,
        orderType: 'dine_in',
        ...(so.tableId ? { tableId: so.tableId } : {}),
      },
      { method: 'qris_dynamic' }
    );

    // Guard the money path: the server-recomputed total must match the amount the
    // customer already paid. A drift (e.g. a price edit after payment) rolls back
    // the inserted order + payment (Convex rolls back on throw) and is handled
    // manually rather than silently over/under-charging.
    if (totalIDR !== so.paidAmountIDR) {
      throw new Error('Harga berubah sejak pembayaran, tangani manual.');
    }

    // Stamp the pre-collected charge onto the new order's qris_dynamic payment row
    // (mirror patchCharge) so the providerRef round-trips for reconcile/audit.
    const payment = await ctx.db
      .query('payments')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .filter((q) => q.eq(q.field('method'), 'qris_dynamic'))
      .unique();
    if (payment) {
      await ctx.db.patch(payment._id, {
        ...(so.providerRef ? { providerRef: so.providerRef } : {}),
        ...(so.expiresAt !== undefined ? { expiresAt: so.expiresAt } : {}),
        providerStatus: 'pending',
      });
    }

    // Settle: inventory + loyalty side effects + order → paid + payment confirmedAt
    // + kitchenStatus 'new'. (No re-charge; the funds were collected up-front.)
    await settleSale(ctx, orderId);

    await ctx.db.patch(id, {
      status: 'accepted',
      acceptedAt: Date.now(),
      acceptedOrderId: orderId,
    });

    return { orderId };
  },
});
