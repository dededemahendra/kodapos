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
