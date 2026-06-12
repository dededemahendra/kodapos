/** A spend-based tier granting an earn multiplier. */
export type LoyaltyTier = { name: string; minSpendIDR: number; earnMultiplier: number };

/** Loyalty program config. Stored in cafeSettings.loyalty; merged over DEFAULT_LOYALTY. */
export type LoyaltyConfig = {
  enabled: boolean;
  earnRatePerIDR: number; // Rp spent per 1 point earned
  redeemBlockPoints: number; // points per redemption block
  redeemBlockIDR: number; // Rp value of one block
  tiers?: LoyaltyTier[];
};

export const DEFAULT_LOYALTY: LoyaltyConfig = {
  enabled: false,
  earnRatePerIDR: 1000,
  redeemBlockPoints: 100,
  redeemBlockIDR: 10000,
};

/** Highest tier whose minSpendIDR ≤ spend; null if none. */
export function tierFor(
  totalSpentIDR: number,
  tiers: LoyaltyTier[] | undefined
): LoyaltyTier | null {
  if (!tiers || tiers.length === 0) return null;
  const eligible = tiers.filter((t) => totalSpentIDR >= t.minSpendIDR);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, t) => (t.minSpendIDR > best.minSpendIDR ? t : best));
}

export function earnMultiplierFor(
  totalSpentIDR: number,
  tiers: LoyaltyTier[] | undefined
): number {
  return tierFor(totalSpentIDR, tiers)?.earnMultiplier ?? 1;
}

/** The next tier up (lowest minSpend strictly above spend), for progress display; null if at top. */
export function nextTierFor(
  totalSpentIDR: number,
  tiers: LoyaltyTier[] | undefined
): LoyaltyTier | null {
  if (!tiers) return null;
  const above = tiers
    .filter((t) => t.minSpendIDR > totalSpentIDR)
    .sort((a, b) => a.minSpendIDR - b.minSpendIDR);
  return above[0] ?? null;
}

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
