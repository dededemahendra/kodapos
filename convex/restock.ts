import { v } from 'convex/values';
import { query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireOwnerCafe } from './lib/auth';
import { computeDemand } from './lib/demand';
import { currentStockQty } from './lib/inventory';
import { suggestRestock } from './lib/restock';

export const suggestion = query({
  args: {},
  returns: v.union(
    v.object({ status: v.literal('learning'), daysCollected: v.number(), daysNeeded: v.number(), etaDateKey: v.string() }),
    v.object({
      status: v.literal('ready'),
      lines: v.array(
        v.object({
          ingredientId: v.id('ingredients'),
          name: v.string(),
          unit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
          suggestedQty: v.number(),
          currentStockQty: v.number(),
        })
      ),
    })
  ),
  handler: async (ctx, _args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const demand = await computeDemand(ctx, cafeId);
    if (demand.status === 'learning') return demand;

    const required = new Map<string, number>();
    for (const line of demand.lines) {
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

    const lines = [];
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
    return { status: 'ready' as const, lines };
  },
});
