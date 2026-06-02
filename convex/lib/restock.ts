/** Units to buy for one ingredient: shortfall vs stock plus safety stock, rounded up.
 *  safetyStock = max(reorderThreshold, ~1 day of demand = required/7). */
export function suggestRestock(required: number, currentStock: number, reorderThreshold: number): number {
  const safetyStock = Math.max(reorderThreshold, required / 7);
  return Math.ceil(Math.max(0, required - currentStock + safetyStock));
}
