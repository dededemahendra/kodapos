import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { mutation } from './_generated/server';
import { requireOwned, requireActiveOutlet } from './lib/auth';
import { methodTotals } from './lib/payment';
import { type RefundOrderLine, validateRefundLines } from './lib/refund';

const refundMethod = v.union(
  v.literal('cash'),
  v.literal('qris_static'),
  v.literal('qris_dynamic'),
  v.literal('giftcard')
);

/**
 * Sum prior refunded qty per order-line index from the refunds ledger
 * (`refunds.by_order`). The single source of truth for what's already been
 * returned, so the over-refund cap can never be bypassed by replays.
 */
async function alreadyRefundedQtyByIndex(
  ctx: MutationCtx,
  orderId: Id<'orders'>
): Promise<Record<number, number>> {
  const prior = await ctx.db
    .query('refunds')
    .withIndex('by_order', (q) => q.eq('orderId', orderId))
    .collect();
  const byIndex: Record<number, number> = {};
  for (const r of prior) {
    for (const l of r.lines) {
      byIndex[l.lineIndex] = (byIndex[l.lineIndex] ?? 0) + l.qty;
    }
  }
  return byIndex;
}

/**
 * Full + partial refund against a paid order — the money path. Mirrors
 * `reverseSettledSale` scaled to the returned qty: restocks the returned
 * items, pro-rates loyalty, reverses the gift card / cash drawer, and
 * materializes `order.refundedIDR`. paymentStatus stays 'paid'.
 *
 * Validate-before-apply: every guard + the full validation runs and the amount
 * is computed BEFORE any side effect, so a rejected refund applies nothing.
 * Idempotent on (cafeId, clientId).
 */
export const create = mutation({
  args: {
    orderId: v.id('orders'),
    clientId: v.string(),
    cashierId: v.id('cafeStaff'),
    method: refundMethod,
    lines: v.array(v.object({ lineIndex: v.number(), qty: v.number() })),
    reason: v.optional(v.string()),
  },
  returns: v.id('refunds'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);

    // Idempotency FIRST — an existing refund for this clientId is returned
    // unchanged, bypassing all further validation.
    const existing = await ctx.db
      .query('refunds')
      .withIndex('by_cafe_clientId', (q) => q.eq('cafeId', cafeId).eq('clientId', args.clientId))
      .unique();
    if (existing) return existing._id;

    const order = await requireOwned(ctx, cafeId, args.orderId, 'Pesanan');
    await requireOwned(ctx, cafeId, args.cashierId, 'Kasir');

    if (order.paymentStatus !== 'paid') {
      throw new Error('Hanya pesanan lunas yang bisa direfund.');
    }

    // method must be one of the order's tenders.
    const tenders = methodTotals(order);
    const tenderMethods = new Set(tenders.map((t) => t.method));
    if (!tenderMethods.has(args.method)) {
      throw new Error('Metode refund tidak cocok.');
    }

    // Resolve the ledger shiftId. Cash refunds REQUIRE an open shift (the drawer
    // outflow must land somewhere); non-cash use the open shift if present, else
    // fall back to the order's original shift.
    const openShift = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .first();
    if (args.method === 'cash' && !openShift) {
      throw new Error('Buka shift untuk refund tunai.');
    }
    const shiftId = openShift?._id ?? order.shiftId;

    // Validate + compute the amount (pure). Throws before any side effect.
    const already = await alreadyRefundedQtyByIndex(ctx, args.orderId);
    const subtotalIDR = order.lines.reduce((s, l) => s + l.unitPriceIDR * l.qty, 0);
    const refundLines: RefundOrderLine[] = order.lines.map((l) => ({
      nameSnapshot: l.nameSnapshot,
      qty: l.qty,
      unitPriceIDR: l.unitPriceIDR,
      orderTotalIDR: order.totalIDR,
      orderSubtotalIDR: subtotalIDR,
    }));
    const validated = validateRefundLines(refundLines, already, args.lines);

    const priorRefundedIDR = order.refundedIDR ?? 0;
    // On a full refund, snap to the exact remaining total so cumulative refunds
    // equal totalIDR EXACTLY (absorbing per-unit rounding drift).
    const amountIDR = validated.fullyRefundsOrder
      ? order.totalIDR - priorRefundedIDR
      : validated.amountIDR;

    // Hard cap: cumulative refunds must never exceed the order total.
    if (priorRefundedIDR + amountIDR > order.totalIDR) {
      throw new Error('Melebihi jumlah yang bisa direfund.');
    }

    // Per-tender cap: never refund more to a method than was actually tendered
    // to it. Without this, a split (e.g. cash 70k + giftcard 30k) could refund
    // the whole 100k to `giftcard`, minting 70k of phantom stored value.
    const methodTenderedIDR = tenders
      .filter((t) => t.method === args.method)
      .reduce((s, t) => s + t.amountIDR, 0);
    const alreadyRefundedToMethodIDR = (
      await ctx.db
        .query('refunds')
        .withIndex('by_order', (q) => q.eq('orderId', args.orderId))
        .collect()
    )
      .filter((r) => r.method === args.method)
      .reduce((s, r) => s + r.amountIDR, 0);
    if (amountIDR > methodTenderedIDR - alreadyRefundedToMethodIDR) {
      throw new Error('Melebihi jumlah tender metode ini.');
    }

    // ── Side effects (validate-before-apply: everything above already threw) ──
    const now = Date.now();

    // 1) Inventory restock — one positive movement per (refunded line × ingredient).
    for (const refLine of validated.lines) {
      const orderLine = order.lines[refLine.lineIndex]!;
      for (const rl of orderLine.recipeSnapshot ?? []) {
        await ctx.db.insert('inventoryMovements', {
          cafeId: order.cafeId,
          ingredientId: rl.ingredientId,
          delta: refLine.qty * rl.qty * rl.wastageFactor,
          reason: 'adjustment',
          reasonLabel: 'Pengembalian pesanan',
          refType: 'order',
          refId: args.orderId as unknown as string,
          at: now,
        });
      }
    }

    // 2) Loyalty (pro-rated, cumulative-target) — claw back earned, re-credit
    // redeemed, floor at 0. Computing each refund's clawback independently from
    // its OWN fraction lets N partial refunds claw back MORE than was ever earned
    // (rounding compounds, and the floor silently eats the customer's other
    // points). Instead, target the cumulative clawback for the order's lifetime
    // refunded-so-far and apply only the delta vs. what prior refunds already
    // took. On a full refund cumRefundedIDR === totalIDR, so the target lands
    // EXACTLY on pointsEarned / pointsRedeemed.
    if (order.customerId) {
      const customer = await ctx.db.get(order.customerId);
      if (customer) {
        const cumRefundedIDR = priorRefundedIDR + amountIDR;
        const pointsEarned = order.pointsEarned ?? 0;
        const pointsRedeemed = order.pointsRedeemed ?? 0;
        const targetCumClawback = Math.round((pointsEarned * cumRefundedIDR) / order.totalIDR);
        const targetCumRecredit = Math.round((pointsRedeemed * cumRefundedIDR) / order.totalIDR);
        const alreadyClawed = Math.round((pointsEarned * priorRefundedIDR) / order.totalIDR);
        const alreadyRecredited = Math.round((pointsRedeemed * priorRefundedIDR) / order.totalIDR);
        const clawback = targetCumClawback - alreadyClawed;
        const recredit = targetCumRecredit - alreadyRecredited;
        const newBalance = Math.max(0, customer.pointsBalance - clawback + recredit);
        const appliedPoints = newBalance - customer.pointsBalance;
        if (appliedPoints !== 0) {
          await ctx.db.insert('loyaltyTransactions', {
            cafeId: order.cafeId,
            customerId: customer._id,
            orderId: args.orderId,
            type: 'adjust',
            points: appliedPoints,
            note: 'Pengembalian pesanan',
            at: now,
          });
        }
        await ctx.db.patch(customer._id, {
          pointsBalance: newBalance,
          totalSpentIDR: Math.max(0, customer.totalSpentIDR - amountIDR),
          // visitCount unchanged — a return doesn't un-visit.
        });
      }
    }

    // 3) Gift card — credit the order's gift-card payment row's card.
    if (args.method === 'giftcard') {
      const pays = await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', args.orderId))
        .collect();
      const gcPay = pays.find((p) => p.method === 'giftcard' && p.giftCardId);
      if (gcPay?.giftCardId) {
        const card = await ctx.db.get(gcPay.giftCardId);
        if (card) {
          await ctx.db.patch(card._id, { balanceIDR: card.balanceIDR + amountIDR });
          await ctx.db.insert('giftCardTransactions', {
            cafeId: order.cafeId,
            giftCardId: card._id,
            type: 'refund',
            amountIDR,
            orderId: args.orderId,
            at: now,
          });
        }
      }
    }

    // 4) Cash — one drawer outflow (the audit trail void lacks). Guarded above.
    if (args.method === 'cash') {
      await ctx.db.insert('cashMovements', {
        cafeId,
        shiftId,
        cashierId: args.cashierId,
        direction: 'out',
        amountIDR,
        note: 'Refund pesanan',
        at: now,
      });
    }

    // 5) Ledger row + materialized cumulative refunded total.
    const refundId = await ctx.db.insert('refunds', {
      cafeId,
      orderId: args.orderId,
      shiftId,
      cashierId: args.cashierId,
      clientId: args.clientId,
      method: args.method,
      amountIDR,
      lines: validated.lines,
      ...(args.reason?.trim() ? { reason: args.reason.trim() } : {}),
      at: now,
    });
    await ctx.db.patch(args.orderId, { refundedIDR: priorRefundedIDR + amountIDR });

    return refundId;
  },
});
