/** Loyalty program config. Stored in cafeSettings.loyalty; merged over DEFAULT_LOYALTY. */
export type LoyaltyConfig = {
  enabled: boolean;
  earnRatePerIDR: number; // Rp spent per 1 point earned
  redeemBlockPoints: number; // points per redemption block
  redeemBlockIDR: number; // Rp value of one block
};

export const DEFAULT_LOYALTY: LoyaltyConfig = {
  enabled: false,
  earnRatePerIDR: 1000,
  redeemBlockPoints: 100,
  redeemBlockIDR: 10000,
};

/** Points earned on a net base (subtotal − discounts, excl. tax/service). Floored. */
export function pointsEarned(baseIDR: number, cfg: LoyaltyConfig): number {
  if (!cfg.enabled || cfg.earnRatePerIDR <= 0 || baseIDR <= 0) return 0;
  return Math.floor(baseIDR / cfg.earnRatePerIDR);
}

/** Rp value of redeeming `points`, counting only whole blocks. */
export function redemptionIDR(points: number, cfg: LoyaltyConfig): number {
  if (!cfg.enabled || cfg.redeemBlockPoints <= 0 || cfg.redeemBlockIDR <= 0) return 0;
  const blocks = Math.floor(points / cfg.redeemBlockPoints);
  return Math.max(0, blocks) * cfg.redeemBlockIDR;
}

/** Largest whole-block point amount redeemable given balance and remaining goods value. */
export function maxRedeemablePoints(
  balance: number,
  afterPromoIDR: number,
  cfg: LoyaltyConfig
): number {
  if (!cfg.enabled || cfg.redeemBlockPoints <= 0 || cfg.redeemBlockIDR <= 0) return 0;
  const blocksByBalance = Math.floor(balance / cfg.redeemBlockPoints);
  const blocksByValue = Math.floor(afterPromoIDR / cfg.redeemBlockIDR);
  const blocks = Math.max(0, Math.min(blocksByBalance, blocksByValue));
  return blocks * cfg.redeemBlockPoints;
}
