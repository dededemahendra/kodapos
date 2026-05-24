import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

/**
 * Sum all inventoryMovements for a (cafe, ingredient) pair. Current stock
 * is event-sourced: never a stored counter.
 *
 * Counter-cafe scale (<500 movements per ingredient per month) makes this
 * cheap enough to call from list queries. V2 would cache or snapshot.
 */
export async function currentStockQty(
  ctx: QueryCtx | MutationCtx,
  cafeId: Id<'cafes'>,
  ingredientId: Id<'ingredients'>
): Promise<number> {
  const movements = await ctx.db
    .query('inventoryMovements')
    .withIndex('by_cafe_ingredient', (q) =>
      q.eq('cafeId', cafeId).eq('ingredientId', ingredientId)
    )
    .collect();
  return movements.reduce((sum, m) => sum + m.delta, 0);
}
