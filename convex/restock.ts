import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';
import { computeDemand } from './lib/demand';
import { computeRestock } from './lib/restock-compute';

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
    const lines = await computeRestock(ctx, cafeId, demand.lines);
    return { status: 'ready' as const, lines };
  },
});
