import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireOwnerCafe } from './lib/auth';
import { computeDemand } from './lib/demand';
import { computeRestock } from './lib/restockCompute';
import { DAY_MS, DEFAULT_TZ, dayKeyFn } from './lib/time';
import { parseForecast, weatherSignalV } from './lib/weather';

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
 * buy. Called once per cafe by generateNightly. Returns the new forecast id
 * and whether it's ready, so the action knows whether to fetch+attach weather
 * (weather only matters for a ready forecast — see attachWeatherSignal).
 */
export const persistForecast = internalMutation({
  args: { cafeId: v.id('cafes') },
  returns: v.object({ ready: v.boolean(), forecastId: v.id('forecasts') }),
  handler: async (ctx, { cafeId }) => {
    const now = Date.now();
    const demand = await computeDemand(ctx, cafeId);
    if (demand.status === 'ready') {
      const forecastId = await ctx.db.insert('forecasts', {
        cafeId, generatedAt: now, method: 'rule_v1', status: 'ready',
        forDateKey: demand.forDateKey, lines: demand.lines,
      });
      const lines = await computeRestock(ctx, cafeId, demand.lines);
      if (lines.length > 0) {
        await ctx.db.insert('restockSuggestions', {
          cafeId, forecastId, generatedAt: now, status: 'draft', lines,
        });
      }
      return { ready: true, forecastId };
    }
    const forecastId = await ctx.db.insert('forecasts', {
      cafeId, generatedAt: now, method: 'rule_v1', status: 'learning',
      daysCollected: demand.daysCollected, etaDateKey: demand.etaDateKey,
    });
    return { ready: false, forecastId };
  },
});

/** Attach a freshly-fetched weather signal to an already-persisted forecast (C2a). */
export const attachWeatherSignal = internalMutation({
  args: { forecastId: v.id('forecasts'), weatherSignal: weatherSignalV },
  returns: v.null(),
  handler: async (ctx, { forecastId, weatherSignal }) => {
    await ctx.db.patch(forecastId, { weatherSignal });
    return null;
  },
});

/**
 * One page of cafes + their timezone/coordinates, for the nightly action
 * (actions can't read ctx.db). Paginated so the cron never loads the entire
 * cafes table — across all tenants — into a single query's read set.
 */
export const listCafesForCron = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    cafes: v.array(
      v.object({
        cafeId: v.id('cafes'),
        timezone: v.optional(v.string()),
        latitude: v.optional(v.number()),
        longitude: v.optional(v.number()),
      })
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db.query('cafes').paginate({ numItems: 200, cursor });
    return {
      cafes: result.page.map((c) => ({
        cafeId: c._id,
        ...(c.timezone !== undefined ? { timezone: c.timezone } : {}),
        ...(c.latitude !== undefined ? { latitude: c.latitude } : {}),
        ...(c.longitude !== undefined ? { longitude: c.longitude } : {}),
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

type CronCafe = { cafeId: Id<'cafes'>; timezone?: string; latitude?: number; longitude?: number };

/**
 * Nightly forecast generation. An action (not a mutation) because it fetches
 * weather over HTTP (C2a). For each cafe: persist its forecast first, then —
 * only when that forecast is ready and the cafe has coordinates — fetch its
 * 7-day Open-Meteo forecast and attach it. Skipping the fetch for learning
 * cafes avoids HTTP calls whose result would be discarded.
 *
 * Each fetch is wrapped so one failure (or the weather API being down) doesn't
 * abort the others — that cafe simply keeps its forecast with no weatherSignal
 * (§6.2 degradation). Fetches are sequential (fine at V1's cafe count); revisit
 * bounded-concurrency if that stops holding.
 */
export const generateNightly = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    let cursor: string | null = null;
    for (;;) {
      const page: { cafes: CronCafe[]; isDone: boolean; continueCursor: string } =
        await ctx.runQuery(internal.forecast.listCafesForCron, { cursor });
      for (const cafe of page.cafes) {
        const { ready, forecastId }: { ready: boolean; forecastId: Id<'forecasts'> } =
          await ctx.runMutation(internal.forecast.persistForecast, { cafeId: cafe.cafeId });
        if (!ready || cafe.latitude === undefined || cafe.longitude === undefined) continue;
        try {
          // Match the demand model's window exactly: tomorrow..today+7 keyed in
          // the cafe's own timezone (computeDemand keys days with dayKeyFn(tz)).
          // A bare forecast_days=7 would return today..today+6 — off by one,
          // omitting today+7 and wasting a row on today.
          const tz = cafe.timezone ?? DEFAULT_TZ;
          const keyOf = dayKeyFn(tz);
          const now = Date.now();
          const startDate = keyOf(now + DAY_MS);
          const endDate = keyOf(now + 7 * DAY_MS);
          const url =
            `https://api.open-meteo.com/v1/forecast?latitude=${cafe.latitude}` +
            `&longitude=${cafe.longitude}` +
            `&daily=temperature_2m_max,precipitation_sum` +
            `&timezone=${encodeURIComponent(tz)}&start_date=${startDate}&end_date=${endDate}`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
          const json = await res.json();
          const days = parseForecast(json);
          if (days.length > 0) {
            await ctx.runMutation(internal.forecast.attachWeatherSignal, {
              forecastId,
              weatherSignal: days,
            });
          }
        } catch (err) {
          // Graceful degradation (§6.2): the forecast is already persisted
          // without weather; the other cafes still proceed. Log so it's observable.
          console.warn(`weather fetch failed for cafe ${cafe.cafeId}:`, err);
        }
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    return null;
  },
});
