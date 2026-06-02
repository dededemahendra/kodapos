import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';
import { computeDemand } from './lib/demand';

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
