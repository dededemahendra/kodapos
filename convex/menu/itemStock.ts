import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';

/**
 * Recipe + low-stock status for one menu item. Shared by items.list (catalog)
 * and items.listForSale (cashier). hasRecipe is true when a recipe row exists
 * (even if it has no lines). lowStockIngredientNames lists active recipe
 * ingredients whose summed inventory movements are below their reorder
 * threshold. Cafe-scale data is dozens of items; the per-item reads are fine.
 */
export async function itemRecipeStatus(
  ctx: QueryCtx,
  cafeId: Id<'cafes'>,
  menuItemId: Id<'menuItems'>
): Promise<{ hasRecipe: boolean; lowStockIngredientNames: string[] }> {
  const recipe = await ctx.db
    .query('recipes')
    .withIndex('by_cafe_item', (q) => q.eq('cafeId', cafeId).eq('menuItemId', menuItemId))
    .unique();
  if (!recipe) return { hasRecipe: false, lowStockIngredientNames: [] };

  const lowStockIngredientNames: string[] = [];
  for (const recipeLine of recipe.lines) {
    const ing = await ctx.db.get(recipeLine.ingredientId);
    if (!ing || ing.cafeId !== cafeId || ing.archived) continue;
    const movements = await ctx.db
      .query('inventoryMovements')
      .withIndex('by_cafe_ingredient', (q) =>
        q.eq('cafeId', cafeId).eq('ingredientId', ing._id)
      )
      .collect();
    const stock = movements.reduce((sum, m) => sum + m.delta, 0);
    if (stock < ing.reorderThreshold) lowStockIngredientNames.push(ing.name);
  }
  return { hasRecipe: true, lowStockIngredientNames };
}
