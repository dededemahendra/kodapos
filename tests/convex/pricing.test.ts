import { describe, expect, it } from 'vitest';
import { computeOrderTotals, promoDiscountIDR } from '../../convex/lib/pricing';

describe('computeOrderTotals', () => {
  it('no service charge, no tax → total equals subtotal', () => {
    expect(
      computeOrderTotals({
        subtotalIDR: 100000,
        serviceChargeEnabled: false,
        serviceChargePct: 0,
        taxEnabled: false,
        taxRatePct: 0,
      })
    ).toEqual({ serviceChargeIDR: 0, taxIDR: 0, totalIDR: 100000 });
  });

  it('disabled flags zero out the charge even when pct values are set', () => {
    // Realistic: owner left serviceChargePct/taxRatePct configured, then toggled
    // both off. The enabled flags must gate the calculation to 0.
    expect(
      computeOrderTotals({
        subtotalIDR: 100000,
        serviceChargeEnabled: false,
        serviceChargePct: 5,
        taxEnabled: false,
        taxRatePct: 11,
      })
    ).toEqual({ serviceChargeIDR: 0, taxIDR: 0, totalIDR: 100000 });
  });

  it('tax only (no service charge) → tax on subtotal', () => {
    expect(
      computeOrderTotals({
        subtotalIDR: 100000,
        serviceChargeEnabled: false,
        serviceChargePct: 0,
        taxEnabled: true,
        taxRatePct: 11,
      })
    ).toEqual({ serviceChargeIDR: 0, taxIDR: 11000, totalIDR: 111000 });
  });

  it('service charge only (no tax)', () => {
    expect(
      computeOrderTotals({
        subtotalIDR: 100000,
        serviceChargeEnabled: true,
        serviceChargePct: 5,
        taxEnabled: false,
        taxRatePct: 0,
      })
    ).toEqual({ serviceChargeIDR: 5000, taxIDR: 0, totalIDR: 105000 });
  });

  it('PB1 applied AFTER service charge: tax computed on subtotal + service charge', () => {
    // 100000 + 5% SC (5000) = 105000 base; 11% tax = 11550; total 116550
    expect(
      computeOrderTotals({
        subtotalIDR: 100000,
        serviceChargeEnabled: true,
        serviceChargePct: 5,
        taxEnabled: true,
        taxRatePct: 11,
      })
    ).toEqual({ serviceChargeIDR: 5000, taxIDR: 11550, totalIDR: 116550 });
  });

  it('rounds service charge and tax at each step', () => {
    // 33333 * 5% = 1666.65 → 1667; taxBase 35000; 35000 * 11% = 3850; total 38850
    expect(
      computeOrderTotals({
        subtotalIDR: 33333,
        serviceChargeEnabled: true,
        serviceChargePct: 5,
        taxEnabled: true,
        taxRatePct: 11,
      })
    ).toEqual({ serviceChargeIDR: 1667, taxIDR: 3850, totalIDR: 38850 });
  });

  it('discount reduces the base before service charge and tax', () => {
    // base 80000; SC 5% = 4000; taxBase 84000; tax 11% = 9240; total 93240
    expect(
      computeOrderTotals({
        subtotalIDR: 100000,
        discountIDR: 20000,
        serviceChargeEnabled: true,
        serviceChargePct: 5,
        taxEnabled: true,
        taxRatePct: 11,
      })
    ).toEqual({ serviceChargeIDR: 4000, taxIDR: 9240, totalIDR: 93240 });
  });
});

describe('promoDiscountIDR', () => {
  it('percent: rounds to the nearest rupiah', () => {
    // 11% of 9090 = 999.9 → 1000
    expect(promoDiscountIDR('percent', 11, 9090)).toBe(1000);
  });
  it('percent: 20% of 50000 = 10000', () => {
    expect(promoDiscountIDR('percent', 20, 50000)).toBe(10000);
  });
  it('fixed: applies the full value when under subtotal', () => {
    expect(promoDiscountIDR('fixed', 10000, 50000)).toBe(10000);
  });
  it('fixed: clamps to subtotal when value exceeds it', () => {
    expect(promoDiscountIDR('fixed', 10000, 6000)).toBe(6000);
  });
  it('returns 0 on a zero subtotal (both types)', () => {
    expect(promoDiscountIDR('percent', 20, 0)).toBe(0);
    expect(promoDiscountIDR('fixed', 5000, 0)).toBe(0);
  });
});
