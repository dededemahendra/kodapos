import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';
import { computeDemand } from './lib/demand';
import { computeRestock } from './lib/restock-compute';

const confidenceV = v.union(v.literal('low'), v.literal('med'), v.literal('high'));
const driverV = v.union(
  v.object({ code: v.union(v.literal('dow_busy'), v.literal('dow_quiet')), pct: v.number(), dow: v.number() }),
  v.object({ code: v.literal('holiday'), pct: v.number(), key: v.string() })
);

export const demand = query({
  args: {},
  returns: v.union(
    v.object({ status: v.literal('learning'), daysCollected: v.number(), daysNeeded: v.number(), etaDateKey: v.string() }),
    v.object({
      status: v.literal('ready'),
      forDateKey: v.string(),
      lines: v.array(
        v.object({
          menuItemId: v.id('menuItems'),
          name: v.string(),
          tomorrowQty: v.number(),
          sevenDayQty: v.number(),
          confidence: confidenceV,
          drivers: v.array(driverV),
        })
      ),
    })
  ),
  handler: async (ctx, _args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    return await computeDemand(ctx, cafeId);
  },
});

export const generateNightly = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cafes = await ctx.db.query('cafes').collect();
    const now = Date.now();
    for (const cafe of cafes) {
      const demand = await computeDemand(ctx, cafe._id);
      const forecastId =
        demand.status === 'ready'
          ? await ctx.db.insert('forecasts', {
              cafeId: cafe._id, generatedAt: now, method: 'rule_v1', status: 'ready',
              forDateKey: demand.forDateKey, lines: demand.lines,
            })
          : await ctx.db.insert('forecasts', {
              cafeId: cafe._id, generatedAt: now, method: 'rule_v1', status: 'learning',
              daysCollected: demand.daysCollected, etaDateKey: demand.etaDateKey,
            });
      if (demand.status === 'ready') {
        const lines = await computeRestock(ctx, cafe._id, demand.lines);
        if (lines.length > 0) {
          await ctx.db.insert('restockSuggestions', {
            cafeId: cafe._id, forecastId, generatedAt: now, status: 'draft', lines,
          });
        }
      }
    }
    return null;
  },
});
