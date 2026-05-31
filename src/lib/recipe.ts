// Gross margin percent for a menu item given its price and cost-per-cup (HPP).
// Returns null when price is non-positive (margin is undefined/meaningless).
export function recipeMarginPct(priceIDR: number, costPerCupIDR: number): number | null {
  if (priceIDR <= 0) return null;
  return Math.round(((priceIDR - costPerCupIDR) / priceIDR) * 100);
}
