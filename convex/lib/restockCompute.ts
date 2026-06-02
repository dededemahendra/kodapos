import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { currentStockQty } from './inventory';
import { suggestRestock } from './restock';
import type { DemandLine } from './demand';

export type RestockLine = {
  ingredientId: Id<'ingredients'>;
  name: string;
  unit: 'g' | 'ml' | 'piece';
  suggestedQty: number;
  currentStockQty: number;
};

/** Restock lines from a ready forecast's per-item 7-day demand × recipes − stock + safety. */
export async function computeRestock(
  ctx: QueryCtx | MutationCtx,
  cafeId: Id<'cafes'>,
  demandLines: DemandLine[]
): Promise<RestockLine[]> {
  const required = new Map<string, number>();
  for (const line of demandLines) {
    const recipe = await ctx.db
      .query('recipes')
      .withIndex('by_cafe_item', (q) => q.eq('cafeId', cafeId).eq('menuItemId', line.menuItemId))
      .unique();
    if (!recipe) continue;
    for (const rl of recipe.lines) {
      const id = rl.ingredientId as string;
      required.set(id, (required.get(id) ?? 0) + line.sevenDayQty * rl.qty * rl.wastageFactor);
    }
  }
  const lines: RestockLine[] = [];
  for (const [idStr, req] of required) {
    const ing = await ctx.db.get(idStr as unknown as Id<'ingredients'>);
    if (!ing || ing.cafeId !== cafeId || ing.archived) continue;
    const stock = await currentStockQty(ctx, cafeId, ing._id);
    const suggestedQty = suggestRestock(req, stock, ing.reorderThreshold);
    if (suggestedQty > 0) {
      lines.push({ ingredientId: ing._id, name: ing.name, unit: ing.canonicalUnit, suggestedQty, currentStockQty: stock });
    }
  }
  lines.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
  return lines;
}
