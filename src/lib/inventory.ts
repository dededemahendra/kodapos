import type { Id } from 'convex/_generated/dataModel';

export type RecipeLineForCost = {
  ingredientId: Id<'ingredients'>;
  qty: number;
  wastageFactor: number;
};

export type IngredientCostInfo = {
  _id: Id<'ingredients'>;
  lastCostPerUnitIDR: number;
};

/**
 * Pure cost-per-cup calculation. Σ (qty * wastage * lastCostPerUnit), rounded
 * to integer rupiah. Returns 0 if any referenced ingredient is missing from
 * the lookup (e.g. ingredient archived; live editor hasn't refetched yet).
 */
export function costPerCupIDR(
  lines: RecipeLineForCost[],
  ingredientsById: Map<Id<'ingredients'>, IngredientCostInfo>
): number {
  let sum = 0;
  for (const line of lines) {
    const ing = ingredientsById.get(line.ingredientId);
    if (!ing) continue;
    sum += line.qty * line.wastageFactor * ing.lastCostPerUnitIDR;
  }
  return Math.round(sum);
}
