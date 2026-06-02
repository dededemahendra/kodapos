import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireOwnerCafe } from './lib/auth';
import { computeDemand } from './lib/demand';
import { computeRestock } from './lib/restockCompute';
import { weatherSignalV } from './lib/weather';

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
    const snap = await ctx.db
      .query('forecasts')
      .withIndex('by_cafe_generated', (q) => q.eq('cafeId', cafeId))
      .order('desc')
      .first();
    if (snap) {
      if (snap.status === 'ready') {
        return { status: 'ready' as const, forDateKey: snap.forDateKey ?? '', lines: snap.lines ?? [] };
      }
      return {
        status: 'learning' as const,
        daysCollected: snap.daysCollected ?? 0,
        daysNeeded: 14,
        etaDateKey: snap.etaDateKey ?? '',
      };
    }
    return await computeDemand(ctx, cafeId);
  },
});

/**
 * Persist one cafe's nightly snapshot: a forecasts row, plus a draft
 * restockSuggestions row when the forecast is ready and there's something to
 * buy. Called once per cafe by generateNightly. weatherSignal (C2a) is stored
 * on the ready forecast when the action fetched it; absent on degradation.
 */
export const persistForecast = internalMutation({
  args: {
    cafeId: v.id('cafes'),
    weatherSignal: v.optional(weatherSignalV),
  },
  returns: v.null(),
  handler: async (ctx, { cafeId, weatherSignal }) => {
    const now = Date.now();
    const demand = await computeDemand(ctx, cafeId);
    const forecastId =
      demand.status === 'ready'
        ? await ctx.db.insert('forecasts', {
            cafeId, generatedAt: now, method: 'rule_v1', status: 'ready',
            forDateKey: demand.forDateKey, lines: demand.lines,
            ...(weatherSignal ? { weatherSignal } : {}),
          })
        : await ctx.db.insert('forecasts', {
            cafeId, generatedAt: now, method: 'rule_v1', status: 'learning',
            daysCollected: demand.daysCollected, etaDateKey: demand.etaDateKey,
          });
    if (demand.status === 'ready') {
      const lines = await computeRestock(ctx, cafeId, demand.lines);
      if (lines.length > 0) {
        await ctx.db.insert('restockSuggestions', {
          cafeId, forecastId, generatedAt: now, status: 'draft', lines,
        });
      }
    }
    return null;
  },
});

/** All cafes + their coordinates, for the nightly action (actions can't read ctx.db). */
export const listCafesForCron = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      cafeId: v.id('cafes'),
      latitude: v.optional(v.number()),
      longitude: v.optional(v.number()),
    })
  ),
  handler: async (ctx) => {
    const cafes = await ctx.db.query('cafes').collect();
    return cafes.map((c) => ({
      cafeId: c._id,
      ...(c.latitude !== undefined ? { latitude: c.latitude } : {}),
      ...(c.longitude !== undefined ? { longitude: c.longitude } : {}),
    }));
  },
});

/**
 * Nightly forecast generation. An action (not a mutation) because it fetches
 * weather over HTTP (C2a). For each cafe: fetch its 7-day forecast when it has
 * coordinates, then persist via persistForecast. Each cafe's fetch is wrapped
 * so one failure (or the weather API being down) doesn't abort the others —
 * that cafe simply gets a forecast with no weatherSignal (§6.2 degradation).
 */
export const generateNightly = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cafes: { cafeId: Id<'cafes'>; latitude?: number; longitude?: number }[] =
      await ctx.runQuery(internal.forecast.listCafesForCron, {});
    for (const cafe of cafes) {
      await ctx.runMutation(internal.forecast.persistForecast, { cafeId: cafe.cafeId });
    }
    return null;
  },
});
