import type { LoyaltyConfig } from 'convex/lib/loyalty';
import { redemptionIDR } from 'convex/lib/loyalty';
import { computeOrderTotals } from 'convex/lib/pricing';

/**
 * Client-side mirror of the server's checkout total math, shared by every
 * payment dialog so the two can never drift. Redemption folds into the EXISTING
 * totals: promo first, then points off the remainder, then service charge + PB1
 * — the same order `buildAndInsertSale` uses on the server.
 */
export function usePaymentTotals(params: {
  subtotalIDR: number;
  /** Promo discount already applied to the cart (0 when no promo). */
  promoDiscountIDR: number;
  redeemPoints: number;
  loyaltyCfg: LoyaltyConfig;
  serviceChargeEnabled: boolean;
  serviceChargePct: number;
  taxEnabled: boolean;
  taxRatePct: number;
}): { afterPromoIDR: number; redeemIDR: number; totalIDR: number } {
  const afterPromoIDR = params.subtotalIDR - params.promoDiscountIDR;
  const redeemIDR = redemptionIDR(params.redeemPoints, params.loyaltyCfg);
  const discountIDR = params.promoDiscountIDR + redeemIDR;
  const { totalIDR } = computeOrderTotals({
    subtotalIDR: params.subtotalIDR,
    discountIDR,
    serviceChargeEnabled: params.serviceChargeEnabled,
    serviceChargePct: params.serviceChargePct,
    taxEnabled: params.taxEnabled,
    taxRatePct: params.taxRatePct,
  });
  return { afterPromoIDR, redeemIDR, totalIDR };
}
