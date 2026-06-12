import { describe, expect, it } from 'vitest';
import {
  type RefundOrderLine,
  unitRefundIDR,
  validateRefundLines,
} from '../../convex/lib/refund';

/** Helper: build order lines carrying a shared total/subtotal. */
function lines(
  rows: { nameSnapshot: string; qty: number; unitPriceIDR: number }[],
  orderTotalIDR?: number
): RefundOrderLine[] {
  const subtotal = rows.reduce((s, r) => s + r.unitPriceIDR * r.qty, 0);
  const total = orderTotalIDR ?? subtotal;
  return rows.map((r) => ({ ...r, orderTotalIDR: total, orderSubtotalIDR: subtotal }));
}

describe('unitRefundIDR', () => {
  it('is the unit price when total === subtotal (no discount/tax)', () => {
    expect(unitRefundIDR(18000, 18000, 18000)).toBe(18000);
  });

  it('allocates a proportional share of a discounted total, rounded', () => {
    // subtotal 30000, total 20000 → fraction 2/3; a 10000 unit → 6667 (rounded).
    expect(unitRefundIDR(10000, 20000, 30000)).toBe(6667);
  });

  it('allocates a proportional share of a taxed (inflated) total, rounded', () => {
    // subtotal 18000, total 19980 (11% tax) → 18000 * 19980/18000 = 19980.
    expect(unitRefundIDR(18000, 19980, 18000)).toBe(19980);
  });
});

describe('validateRefundLines', () => {
  it('computes per-line + total refund for a partial line refund', () => {
    const ol = lines([{ nameSnapshot: 'Espresso', qty: 3, unitPriceIDR: 18000 }]);
    const res = validateRefundLines(ol, {}, [{ lineIndex: 0, qty: 1 }]);
    expect(res.amountIDR).toBe(18000);
    expect(res.lines).toEqual([
      { lineIndex: 0, nameSnapshot: 'Espresso', qty: 1, lineRefundIDR: 18000 },
    ]);
    expect(res.fullyRefundsOrder).toBe(false);
  });

  it('flags fullyRefundsOrder when every line is fully returned this txn', () => {
    const ol = lines([
      { nameSnapshot: 'Espresso', qty: 2, unitPriceIDR: 18000 },
      { nameSnapshot: 'Latte', qty: 1, unitPriceIDR: 24000 },
    ]);
    const res = validateRefundLines(ol, {}, [
      { lineIndex: 0, qty: 2 },
      { lineIndex: 1, qty: 1 },
    ]);
    expect(res.fullyRefundsOrder).toBe(true);
    expect(res.amountIDR).toBe(2 * 18000 + 1 * 24000);
  });

  it('flags fullyRefundsOrder when the last remaining qty across two refunds completes it', () => {
    const ol = lines([{ nameSnapshot: 'Espresso', qty: 3, unitPriceIDR: 18000 }]);
    // 2 already refunded; returning the last 1 → fully refunded.
    const res = validateRefundLines(ol, { 0: 2 }, [{ lineIndex: 0, qty: 1 }]);
    expect(res.fullyRefundsOrder).toBe(true);
  });

  it('throws over-refund when qty exceeds remaining', () => {
    const ol = lines([{ nameSnapshot: 'Espresso', qty: 3, unitPriceIDR: 18000 }]);
    expect(() => validateRefundLines(ol, { 0: 2 }, [{ lineIndex: 0, qty: 2 }])).toThrow(
      /melebihi/i
    );
  });

  it('throws over-refund when duplicate request rows together exceed remaining', () => {
    const ol = lines([{ nameSnapshot: 'Espresso', qty: 2, unitPriceIDR: 18000 }]);
    expect(() =>
      validateRefundLines(ol, {}, [
        { lineIndex: 0, qty: 1 },
        { lineIndex: 0, qty: 2 },
      ])
    ).toThrow(/melebihi/i);
  });

  it('throws empty-pick when nothing is requested', () => {
    const ol = lines([{ nameSnapshot: 'Espresso', qty: 3, unitPriceIDR: 18000 }]);
    expect(() => validateRefundLines(ol, {}, [])).toThrow(/pilih item/i);
  });

  it('throws empty-pick when all requested qty are zero', () => {
    const ol = lines([{ nameSnapshot: 'Espresso', qty: 3, unitPriceIDR: 18000 }]);
    expect(() => validateRefundLines(ol, {}, [{ lineIndex: 0, qty: 0 }])).toThrow(/pilih item/i);
  });

  it('throws on out-of-range line index', () => {
    const ol = lines([{ nameSnapshot: 'Espresso', qty: 3, unitPriceIDR: 18000 }]);
    expect(() => validateRefundLines(ol, {}, [{ lineIndex: 5, qty: 1 }])).toThrow(/pilih item/i);
  });

  it('throws on non-integer qty', () => {
    const ol = lines([{ nameSnapshot: 'Espresso', qty: 3, unitPriceIDR: 18000 }]);
    expect(() => validateRefundLines(ol, {}, [{ lineIndex: 0, qty: 1.5 }])).toThrow(/pilih item/i);
  });

  it('throws on negative qty', () => {
    const ol = lines([{ nameSnapshot: 'Espresso', qty: 3, unitPriceIDR: 18000 }]);
    expect(() => validateRefundLines(ol, {}, [{ lineIndex: 0, qty: -1 }])).toThrow(/pilih item/i);
  });

  // Finding 3: a per-line qty of 0 is invalid input, not a silently-skipped row.
  // A 0-qty row mixed with a valid one must still reject the whole request.
  it('throws on a zero-qty row even when another valid row is present', () => {
    const ol = lines([
      { nameSnapshot: 'Espresso', qty: 3, unitPriceIDR: 18000 },
      { nameSnapshot: 'Latte', qty: 1, unitPriceIDR: 24000 },
    ]);
    expect(() =>
      validateRefundLines(ol, {}, [
        { lineIndex: 0, qty: 1 },
        { lineIndex: 1, qty: 0 },
      ])
    ).toThrow(/pilih item/i);
  });
});
