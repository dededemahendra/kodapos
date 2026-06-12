/**
 * Pure (ctx-free) refund math, shared by the `refunds.create` mutation and its
 * unit tests. Keeps the proportional-allocation + over-refund cap logic
 * independently testable from the side-effect-heavy mutation.
 */

/**
 * A minimal view of an order line — only the fields refund math needs.
 * `totalIDR`/`subtotalIDR` for the order are carried on each line (duplicated)
 * so the helper signature stays `(orderLines, alreadyRefunded, requested)`.
 */
export type RefundOrderLine = {
  nameSnapshot: string;
  qty: number;
  unitPriceIDR: number;
  /** The order's grand total (same on every line). */
  orderTotalIDR: number;
  /** The order's subtotal (Σ line.unitPriceIDR × line.qty; same on every line). */
  orderSubtotalIDR: number;
};

export type RequestedRefundLine = { lineIndex: number; qty: number };

export type ValidatedRefundLine = {
  lineIndex: number;
  nameSnapshot: string;
  qty: number;
  lineRefundIDR: number;
};

export type ValidatedRefund = {
  lines: ValidatedRefundLine[];
  amountIDR: number;
  fullyRefundsOrder: boolean;
};

/**
 * Per-unit refund value, allocating the order's discounts / tax / service
 * charge proportionally: a unit's share of `totalIDR` is its share of
 * `subtotalIDR`. `orderSubtotalIDR > 0` is guaranteed by ≥1 line.
 */
export function unitRefundIDR(
  unitPriceIDR: number,
  orderTotalIDR: number,
  orderSubtotalIDR: number
): number {
  return Math.round((unitPriceIDR * orderTotalIDR) / orderSubtotalIDR);
}

/**
 * Validate a refund request against the order's lines and what's already been
 * refunded, computing the per-line + total refund value and whether this
 * transaction fully refunds the order.
 *
 * Throws (Bahasa Indonesia, off-catalog) on:
 *  - empty / all-zero request                 → 'Pilih item untuk direfund.'
 *  - out-of-range index / non-integer / qty≤0 → 'Pilih item untuk direfund.'
 *  - qty > remaining-refundable for a line     → 'Melebihi jumlah yang bisa direfund.'
 *
 * @param orderLines                the order's lines (each carries order total/subtotal)
 * @param alreadyRefundedQtyByIndex prior refunded qty per line index (missing = 0)
 * @param requested                 the requested {lineIndex, qty} rows
 */
export function validateRefundLines(
  orderLines: RefundOrderLine[],
  alreadyRefundedQtyByIndex: Record<number, number>,
  requested: RequestedRefundLine[]
): ValidatedRefund {
  const lines: ValidatedRefundLine[] = [];
  let amountIDR = 0;

  // Collapse duplicate requests for the same lineIndex so the cap can't be
  // bypassed by splitting one line across two request rows.
  const requestedQtyByIndex = new Map<number, number>();
  for (const req of requested) {
    if (!Number.isInteger(req.lineIndex) || req.lineIndex < 0 || req.lineIndex >= orderLines.length) {
      throw new Error('Pilih item untuk direfund.');
    }
    if (!Number.isInteger(req.qty) || req.qty < 0) {
      throw new Error('Pilih item untuk direfund.');
    }
    requestedQtyByIndex.set(
      req.lineIndex,
      (requestedQtyByIndex.get(req.lineIndex) ?? 0) + req.qty
    );
  }

  for (const [lineIndex, qty] of requestedQtyByIndex) {
    if (qty <= 0) continue; // a 0-qty row contributes nothing
    const line = orderLines[lineIndex]!;
    const already = alreadyRefundedQtyByIndex[lineIndex] ?? 0;
    const remaining = line.qty - already;
    if (qty > remaining) {
      throw new Error('Melebihi jumlah yang bisa direfund.');
    }
    const lineRefundIDR =
      unitRefundIDR(line.unitPriceIDR, line.orderTotalIDR, line.orderSubtotalIDR) * qty;
    amountIDR += lineRefundIDR;
    lines.push({ lineIndex, nameSnapshot: line.nameSnapshot, qty, lineRefundIDR });
  }

  if (lines.length === 0) {
    throw new Error('Pilih item untuk direfund.');
  }

  // fullyRefundsOrder: after applying these refunds, EVERY order line's
  // cumulative refunded qty equals its ordered qty.
  const refundedNowByIndex = new Map<number, number>();
  for (const l of lines) refundedNowByIndex.set(l.lineIndex, l.qty);
  const fullyRefundsOrder = orderLines.every((line, idx) => {
    const cumulative = (alreadyRefundedQtyByIndex[idx] ?? 0) + (refundedNowByIndex.get(idx) ?? 0);
    return cumulative === line.qty;
  });

  return { lines, amountIDR, fullyRefundsOrder };
}
