/** Default service-charge line label when a cafe hasn't customized it. */
export const DEFAULT_SERVICE_CHARGE_NAME = 'Biaya Layanan';

export type PricingInput = {
  subtotalIDR: number;
  /** 0 today (promo engine unbuilt); kept so discount slots into the formula. */
  discountIDR?: number;
  serviceChargeEnabled: boolean;
  serviceChargePct: number;
  taxEnabled: boolean;
  taxRatePct: number;
};

export type PricingResult = {
  serviceChargeIDR: number;
  taxIDR: number;
  totalIDR: number;
};

/**
 * Discount amount in IDR for a promo applied to an order subtotal. Pure, so
 * `createCashSale` (authoritative) and the sale screen (preview) compute it
 * identically. Clamped to [0, subtotal] — a fixed promo never exceeds the
 * subtotal, so the discounted base floors at 0.
 */
export function promoDiscountIDR(
  type: 'percent' | 'fixed',
  value: number,
  subtotalIDR: number,
): number {
  const raw = type === 'percent' ? Math.round((subtotalIDR * value) / 100) : value;
  return Math.max(0, Math.min(raw, subtotalIDR));
}

/**
 * Single source of truth for order totals. Pure (no ctx/React/convex-server
 * imports) so both `createCashSale` (server) and the sale screen (client) can
 * import it and never drift. PB1 tax is applied AFTER service charge.
 */
export function computeOrderTotals(input: PricingInput): PricingResult {
  const base = input.subtotalIDR - (input.discountIDR ?? 0);
  const serviceChargeIDR = input.serviceChargeEnabled
    ? Math.round((base * input.serviceChargePct) / 100)
    : 0;
  const taxIDR = input.taxEnabled
    ? Math.round(((base + serviceChargeIDR) * input.taxRatePct) / 100)
    : 0;
  return { serviceChargeIDR, taxIDR, totalIDR: base + serviceChargeIDR + taxIDR };
}
