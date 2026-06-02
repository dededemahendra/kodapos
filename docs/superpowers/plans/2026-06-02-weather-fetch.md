# Predictive Demand — Slice C2a (weather data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get weather data flowing into storage — cafes geocode their city to lat/long, and the nightly job (restructured into an action) fetches each cafe's 7-day Open-Meteo forecast and stores it on `forecasts.weatherSignal`. Predictions are unchanged (`weatherMultiplier()` still returns `1.0`).

**Architecture:** Pure parsers in `convex/lib/weather.ts` (unit-tested) turn Open-Meteo JSON into a `WeatherDay[]`. The nightly cron becomes an `internalAction` (HTTP `fetch` can't run in a mutation) that reads cafes via an `internalQuery`, fetches per cafe with per-cafe `try/catch` degradation, and calls a `persistForecast` `internalMutation` (the C1 per-cafe body, moved out of `generateNightly`). A `cafes.geocodeFromCity` action geocodes the city on demand from a Settings button.

**Tech Stack:** Convex (action / internalAction / internalQuery / internalMutation, `ctx.runQuery`/`ctx.runMutation`), `fetch` (default runtime — no `"use node"`), Open-Meteo (free, no key), React 19 + TanStack Router + Lingui, Vitest + convex-test (`vi.stubGlobal('fetch', …)`).

**Key facts established from the codebase:**
- `fetch()` is available in the default Convex runtime — **do NOT add `"use node";`**. Actions therefore co-locate in the same file as that file's queries/mutations.
- When an action calls a query/mutation **in the same file** via `ctx.runQuery`/`ctx.runMutation`, you MUST annotate the return value's type to break TypeScript's circular inference.
- The repo uses single quotes, 2-space indent, no semicolons-optional → semicolons ARE used. Match the existing files exactly.
- Pure convex-helper tests live under `tests/convex/` (vitest does NOT cover `convex/lib/`).
- Use `./node_modules/.bin/convex codegen` (NOT `npx`); commit the regenerated `convex/_generated/*`.
- Run the gate locally before any push: `pnpm typecheck && pnpm test && pnpm lingui:compile`.

---

## File Structure

**New files:**
- `convex/lib/weather.ts` — pure parsers (`conditionOf`, `parseGeocode`, `parseForecast`) + the shared Convex validators (`weatherConditionV`, `weatherDayV`, `weatherSignalV`) + types (`WeatherCondition`, `WeatherDay`). Imported by `schema.ts`, `forecast.ts`, and the action code.
- `tests/convex/weather.test.ts` — pure-parser unit tests.

**Modified files:**
- `convex/schema.ts` — `cafes` `+latitude/+longitude`; `forecasts.weatherSignal` `string` → structured array (via `weatherSignalV`).
- `convex/forecast.ts` — add `persistForecast` (internalMutation) + `listCafesForCron` (internalQuery); change `generateNightly` from `internalMutation` to `internalAction`.
- `convex/cafes.ts` — `+latitude/+longitude` in `cafeFields`; add `myCafeForGeocode` (internalQuery), `setLocation` (internalMutation), `geocodeFromCity` (action).
- `convex/crons.ts` — no code change (reference shape identical; now points at an action). No task needed — verified in Task 4.
- `src/routes/_pos/settings/profile.tsx` — "Perbarui lokasi cuaca" button.
- `tests/convex/forecast-cron.test.ts` — switch the 3 `t.mutation(generateNightly)` calls to `t.action`; add weather-storage + degradation tests.
- `tests/convex/forecast.test.ts` (1 call), `tests/convex/restock.test.ts` (3 calls) — switch `t.mutation(generateNightly)` → `t.action`.
- `convex/_generated/*` — regenerated.
- `src/locales/{id,en}/messages.po` + `.mjs` — new UI strings.

---

## Task 1: Pure weather helpers + validators

**Files:**
- Create: `convex/lib/weather.ts`
- Test: `tests/convex/weather.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/convex/weather.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { conditionOf, parseGeocode, parseForecast } from '../../convex/lib/weather';

describe('conditionOf', () => {
  it('rainy when precip >= 5 (takes precedence over hot temp)', () => {
    expect(conditionOf(35, 5)).toBe('rainy');
    expect(conditionOf(20, 12)).toBe('rainy');
  });
  it('hot when temp >= 32 and dry', () => {
    expect(conditionOf(32, 0)).toBe('hot');
    expect(conditionOf(34, 4.9)).toBe('hot');
  });
  it('cool when temp < 24 and dry', () => {
    expect(conditionOf(23.9, 0)).toBe('cool');
  });
  it('normal otherwise', () => {
    expect(conditionOf(28, 0)).toBe('normal');
    expect(conditionOf(24, 4)).toBe('normal');
  });
});

describe('parseGeocode', () => {
  it('reads the first result lat/long', () => {
    const json = { results: [{ latitude: -6.2, longitude: 106.8, name: 'Jakarta' }] };
    expect(parseGeocode(json)).toEqual({ latitude: -6.2, longitude: 106.8 });
  });
  it('null when results empty', () => {
    expect(parseGeocode({ results: [] })).toBeNull();
  });
  it('null when results missing', () => {
    expect(parseGeocode({})).toBeNull();
    expect(parseGeocode(null)).toBeNull();
  });
  it('null when a coordinate is missing', () => {
    expect(parseGeocode({ results: [{ latitude: -6.2 }] })).toBeNull();
  });
});

describe('parseForecast', () => {
  it('zips daily arrays into WeatherDay[] with derived conditions', () => {
    const json = {
      daily: {
        time: ['2026-06-03', '2026-06-04', '2026-06-05'],
        temperature_2m_max: [33, 22, 28],
        precipitation_sum: [0, 0, 10],
      },
    };
    expect(parseForecast(json)).toEqual([
      { dateKey: '2026-06-03', condition: 'hot', tempMaxC: 33, precipMm: 0 },
      { dateKey: '2026-06-04', condition: 'cool', tempMaxC: 22, precipMm: 0 },
      { dateKey: '2026-06-05', condition: 'rainy', tempMaxC: 28, precipMm: 10 },
    ]);
  });
  it('returns [] on a malformed payload', () => {
    expect(parseForecast({})).toEqual([]);
    expect(parseForecast({ daily: { time: ['2026-06-03'] } })).toEqual([]);
    expect(parseForecast(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- weather`
Expected: FAIL — `conditionOf`/`parseGeocode`/`parseForecast` not exported (module not found).

- [ ] **Step 3: Implement `convex/lib/weather.ts`**

Create `convex/lib/weather.ts`:

```ts
import { v } from 'convex/values';

export type WeatherCondition = 'hot' | 'rainy' | 'cool' | 'normal';
export type WeatherDay = {
  dateKey: string;
  condition: WeatherCondition;
  tempMaxC: number;
  precipMm: number;
};

// Shared Convex validators — imported by schema.ts (forecasts.weatherSignal)
// and forecast.ts (persistForecast args) so the shape is defined once.
export const weatherConditionV = v.union(
  v.literal('hot'),
  v.literal('rainy'),
  v.literal('cool'),
  v.literal('normal')
);
export const weatherDayV = v.object({
  dateKey: v.string(),
  condition: weatherConditionV,
  tempMaxC: v.number(),
  precipMm: v.number(),
});
export const weatherSignalV = v.array(weatherDayV);

/**
 * Derive a coarse weather condition. Rainy takes precedence over hot/cool —
 * rain suppresses sales regardless of temperature. Thresholds are tunable;
 * C2b maps condition → multiplier.
 */
export function conditionOf(tempMaxC: number, precipMm: number): WeatherCondition {
  if (precipMm >= 5) return 'rainy';
  if (tempMaxC >= 32) return 'hot';
  if (tempMaxC < 24) return 'cool';
  return 'normal';
}

/** Open-Meteo geocoding: results[0].latitude/longitude. null when absent. */
export function parseGeocode(json: unknown): { latitude: number; longitude: number } | null {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const first = results[0] as { latitude?: unknown; longitude?: unknown };
  if (typeof first?.latitude !== 'number' || typeof first?.longitude !== 'number') return null;
  return { latitude: first.latitude, longitude: first.longitude };
}

/**
 * Open-Meteo forecast: daily.time[] (YYYY-MM-DD, already local to the
 * requested timezone), daily.temperature_2m_max[], daily.precipitation_sum[].
 * Zips by index into WeatherDay[]. Returns [] on any malformed/missing array.
 */
export function parseForecast(json: unknown): WeatherDay[] {
  const daily = (json as { daily?: unknown })?.daily as
    | { time?: unknown; temperature_2m_max?: unknown; precipitation_sum?: unknown }
    | undefined;
  const time = daily?.time;
  const temps = daily?.temperature_2m_max;
  const precs = daily?.precipitation_sum;
  if (!Array.isArray(time) || !Array.isArray(temps) || !Array.isArray(precs)) return [];
  const n = Math.min(time.length, temps.length, precs.length);
  const days: WeatherDay[] = [];
  for (let i = 0; i < n; i++) {
    const dateKey = time[i];
    const tempMaxC = temps[i];
    const precipMm = precs[i];
    if (typeof dateKey !== 'string' || typeof tempMaxC !== 'number' || typeof precipMm !== 'number') {
      return [];
    }
    days.push({ dateKey, condition: conditionOf(tempMaxC, precipMm), tempMaxC, precipMm });
  }
  return days;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- weather`
Expected: PASS (all `conditionOf`/`parseGeocode`/`parseForecast` cases green).

- [ ] **Step 5: Commit**

```bash
rtk proxy git add convex/lib/weather.ts tests/convex/weather.test.ts
rtk proxy git commit -m "feat(forecast): pure weather parsers + validators (C2a)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Schema — cafe coordinates + structured weatherSignal

**Files:**
- Modify: `convex/schema.ts:8-38` (cafes), `convex/schema.ts:383` (`forecasts.weatherSignal`)
- Modify: `convex/_generated/*` (regenerated)

- [ ] **Step 1: Add lat/long to the `cafes` table**

In `convex/schema.ts`, inside the `cafes: defineTable({ … })` object, after the `postalCode: v.optional(v.string()),` line (line 26) add:

```ts
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
```

- [ ] **Step 2: Replace the `weatherSignal` validator**

At the top of `convex/schema.ts`, the import block currently is:

```ts
import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
```

Add the weather-signal validator import below it:

```ts
import { weatherSignalV } from './lib/weather';
```

Then in the `forecasts` table, replace this line (currently line 383):

```ts
    weatherSignal: v.optional(v.string()),
```

with:

```ts
    weatherSignal: v.optional(weatherSignalV),
```

- [ ] **Step 3: Regenerate Convex types**

Run: `./node_modules/.bin/convex codegen`
Expected: completes without error; `convex/_generated/*` updated to reflect the new cafe fields + `weatherSignal` shape.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (The `forecast.demand` query reads `snap.lines`/`snap.status` only — the `weatherSignal` type change doesn't touch it. No existing code reads `weatherSignal`.)

- [ ] **Step 5: Commit**

```bash
rtk proxy git add convex/schema.ts convex/_generated
rtk proxy git commit -m "feat(forecast): cafe coordinates + structured weatherSignal schema (C2a)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Cron restructure — generateNightly becomes an action

**Files:**
- Modify: `convex/forecast.ts:1-86`
- Modify: `tests/convex/forecast-cron.test.ts:56,72,84` · `tests/convex/forecast.test.ts:165` · `tests/convex/restock.test.ts:105,119,151` (switch `t.mutation` → `t.action`)
- Verify: `convex/crons.ts` unchanged

This task does the structural mutation→action move WITHOUT adding weather yet (weatherSignal stays undefined). Weather fetching lands in Task 4. This keeps the refactor isolated and the existing cron behavior provably unchanged.

- [ ] **Step 1: Update the imports in `convex/forecast.ts`**

Replace the current import lines 1-5:

```ts
import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';
import { computeDemand } from './lib/demand';
import { computeRestock } from './lib/restockCompute';
```

with:

```ts
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireOwnerCafe } from './lib/auth';
import { computeDemand } from './lib/demand';
import { computeRestock } from './lib/restockCompute';
import { weatherSignalV } from './lib/weather';
```

- [ ] **Step 2: Replace the `generateNightly` internalMutation (lines 54-86) with the new three functions**

Delete the entire existing `export const generateNightly = internalMutation({ … });` block and replace with:

```ts
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
```

(Weather fetching is added to the loop in Task 4. For now `generateNightly` just calls `persistForecast` with no `weatherSignal`, so behavior == C1.)

- [ ] **Step 3: Switch the test call sites from `t.mutation` to `t.action`**

`generateNightly` is now an action, so `t.mutation(internal.forecast.generateNightly, {})` would throw. Update every call site:

- `tests/convex/forecast-cron.test.ts` lines 56, 72, 84
- `tests/convex/forecast.test.ts` line 165
- `tests/convex/restock.test.ts` lines 105, 119, 151

In each file, replace every occurrence of:

```ts
    await t.mutation(internal.forecast.generateNightly, {});
```

with:

```ts
    await t.action(internal.forecast.generateNightly, {});
```

(Use a single find-replace per file — the call text is identical at each site.)

- [ ] **Step 4: Regenerate types and run the full convex suite**

Run: `./node_modules/.bin/convex codegen && pnpm test -- forecast restock`
Expected: PASS — all existing cron, forecast read-path, and restock tests stay green through the action entry point (predictions unchanged; weatherSignal still undefined so the C1 assertions hold).

- [ ] **Step 5: Verify the cron reference still resolves**

Run: `pnpm typecheck`
Expected: PASS. `convex/crons.ts` line 6 (`crons.cron('nightly forecast', '0 15 * * *', internal.forecast.generateNightly, {})`) is unchanged — Convex crons accept an action reference the same way.

- [ ] **Step 6: Commit**

```bash
rtk proxy git add convex/forecast.ts convex/_generated tests/convex/forecast-cron.test.ts tests/convex/forecast.test.ts tests/convex/restock.test.ts
rtk proxy git commit -m "refactor(forecast): generateNightly becomes an action; extract persistForecast + listCafesForCron (C2a)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire weather fetch into the nightly action + tests

**Files:**
- Modify: `convex/forecast.ts` (`generateNightly` handler — add the fetch)
- Test: `tests/convex/forecast-cron.test.ts` (add weather + degradation tests)

- [ ] **Step 1: Write the failing tests**

In `tests/convex/forecast-cron.test.ts`, first add `afterEach` to the vitest import and a fetch-stub helper. Change line 2:

```ts
import { describe, expect, it } from 'vitest';
```

to:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
```

Then add, at the end of the file (after the closing `});` of the existing `describe('generateNightly', …)` block), a new describe block:

```ts
function stubForecastFetch(days: number) {
  const time: string[] = [];
  const temperature_2m_max: number[] = [];
  const precipitation_sum: number[] = [];
  for (let i = 0; i < days; i++) {
    time.push(`2026-06-${String(3 + i).padStart(2, '0')}`);
    temperature_2m_max.push(33); // hot
    precipitation_sum.push(0);
  }
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ json: async () => ({ daily: { time, temperature_2m_max, precipitation_sum } }) })
  );
}

describe('generateNightly weather (C2a)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores a weatherSignal when the cafe has coordinates', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    await t.run((ctx) => ctx.db.patch(refs.cafeId, { latitude: -6.2, longitude: 106.8 }));
    stubForecastFetch(7);
    await t.action(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    const signal = forecasts[0]?.weatherSignal;
    expect(signal).toHaveLength(7);
    expect(signal?.[0]).toMatchObject({ condition: 'hot', tempMaxC: 33, precipMm: 0 });
    expect(typeof signal?.[0]?.dateKey).toBe('string');
  });

  it('no coordinates → forecast persisted, weatherSignal undefined (no fetch)', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await t.action(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    expect(forecasts[0]?.status).toBe('ready');
    expect(forecasts[0]?.weatherSignal).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetch failure → degrades to a forecast with no weatherSignal', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    await t.run((ctx) => ctx.db.patch(refs.cafeId, { latitude: -6.2, longitude: 106.8 }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await t.action(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    expect(forecasts).toHaveLength(1);
    expect(forecasts[0]?.status).toBe('ready');
    expect(forecasts[0]?.weatherSignal).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- forecast-cron`
Expected: FAIL — the "stores a weatherSignal" test fails (`generateNightly` doesn't fetch yet, so `weatherSignal` is undefined). The other two may already pass (no signal is the current behavior) — that's fine; they lock in the degradation contract.

- [ ] **Step 3: Add the weather fetch to the `generateNightly` handler**

In `convex/forecast.ts`, add the `parseForecast` + `WeatherDay` import. Change the weather import line:

```ts
import { weatherSignalV } from './lib/weather';
```

to:

```ts
import { type WeatherDay, parseForecast, weatherSignalV } from './lib/weather';
```

Then replace the `generateNightly` handler body (the `for` loop) so it fetches per cafe:

```ts
  handler: async (ctx) => {
    const cafes: { cafeId: Id<'cafes'>; latitude?: number; longitude?: number }[] =
      await ctx.runQuery(internal.forecast.listCafesForCron, {});
    for (const cafe of cafes) {
      let weatherSignal: WeatherDay[] | undefined;
      if (cafe.latitude !== undefined && cafe.longitude !== undefined) {
        try {
          const url =
            `https://api.open-meteo.com/v1/forecast?latitude=${cafe.latitude}` +
            `&longitude=${cafe.longitude}` +
            `&daily=temperature_2m_max,precipitation_sum&timezone=Asia%2FJakarta&forecast_days=7`;
          const res = await fetch(url);
          const json = await res.json();
          const days = parseForecast(json);
          if (days.length > 0) weatherSignal = days;
        } catch {
          weatherSignal = undefined;
        }
      }
      await ctx.runMutation(internal.forecast.persistForecast, {
        cafeId: cafe.cafeId,
        ...(weatherSignal ? { weatherSignal } : {}),
      });
    }
    return null;
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- forecast-cron`
Expected: PASS — all three weather tests green, plus the original C1 cron tests still green.

- [ ] **Step 5: Commit**

```bash
rtk proxy git add convex/forecast.ts tests/convex/forecast-cron.test.ts
rtk proxy git commit -m "feat(forecast): nightly action fetches Open-Meteo weather per cafe (C2a)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Geocode the city — cafes action + internal query/mutation

**Files:**
- Modify: `convex/cafes.ts:1-35` (imports + `cafeFields`), add new functions
- Test: `tests/convex/cafes.test.ts` (create or extend)

- [ ] **Step 1: Write the failing tests**

Create (or extend) `tests/convex/cafes.test.ts`:

```ts
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function ownerWithCafe(t: ReturnType<typeof convexTest>, city?: string) {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id as Id<'cafes'>;
  if (city !== undefined) {
    await t.run((ctx) => ctx.db.patch(cafeId, { city }));
  }
  return { asOwner, cafeId };
}

describe('cafes.geocodeFromCity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets latitude/longitude from the geocode hit', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await ownerWithCafe(t, 'Bandung');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ results: [{ latitude: -6.9, longitude: 107.6 }] }) })
    );
    const res = await asOwner.action(api.cafes.geocodeFromCity, {});
    expect(res).toEqual({ found: true });
    const cafe = await t.run((ctx) => ctx.db.get(cafeId));
    expect(cafe?.latitude).toBe(-6.9);
    expect(cafe?.longitude).toBe(107.6);
  });

  it('returns found:false and does not fetch when the cafe has no city', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await ownerWithCafe(t); // no city
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await asOwner.action(api.cafes.geocodeFromCity, {});
    expect(res).toEqual({ found: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns found:false on an empty geocode result (no patch)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await ownerWithCafe(t, 'Atlantis');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ results: [] }) }));
    const res = await asOwner.action(api.cafes.geocodeFromCity, {});
    expect(res).toEqual({ found: false });
    const cafe = await t.run((ctx) => ctx.db.get(cafeId));
    expect(cafe?.latitude).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- cafes`
Expected: FAIL — `api.cafes.geocodeFromCity` does not exist.

- [ ] **Step 3: Update imports + `cafeFields` in `convex/cafes.ts`**

Change the import block (lines 1-4):

```ts
import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';
```

to:

```ts
import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireOwnerCafe } from './lib/auth';
import { parseGeocode } from './lib/weather';
```

In `cafeFields`, after the `postalCode: v.optional(v.string()),` line (line 23) add:

```ts
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
```

(This keeps `myCafe`/`mine` return-validation accepting cafes that have coordinates.)

- [ ] **Step 4: Add the three functions**

Append to `convex/cafes.ts` (after `markSetupComplete`, before the final close of file):

```ts
/** The signed-in owner's cafe id + city, for the geocode action (which can't read ctx.db). */
export const myCafeForGeocode = internalQuery({
  args: {},
  returns: v.object({ cafeId: v.id('cafes'), city: v.union(v.string(), v.null()) }),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cafe = await ctx.db.get(cafeId);
    return { cafeId, city: cafe?.city ?? null };
  },
});

/** Patch a cafe's weather coordinates. Internal: only geocodeFromCity calls it. */
export const setLocation = internalMutation({
  args: { cafeId: v.id('cafes'), latitude: v.number(), longitude: v.number() },
  returns: v.null(),
  handler: async (ctx, { cafeId, latitude, longitude }) => {
    await ctx.db.patch(cafeId, { latitude, longitude });
    return null;
  },
});

/**
 * Owner-triggered: geocode the cafe's city to lat/long via Open-Meteo and
 * store the coordinates (used by the nightly weather fetch). Returns
 * { found } so the UI can toast success vs "city not found". No city, a
 * geocode miss, or a fetch failure all return { found: false } without
 * patching.
 */
export const geocodeFromCity = action({
  args: {},
  returns: v.object({ found: v.boolean() }),
  handler: async (ctx): Promise<{ found: boolean }> => {
    const info: { cafeId: Id<'cafes'>; city: string | null } = await ctx.runQuery(
      internal.cafes.myCafeForGeocode,
      {}
    );
    if (!info.city) return { found: false };
    let coords: { latitude: number; longitude: number } | null = null;
    try {
      const url =
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(info.city)}` +
        `&count=1&language=id&format=json`;
      const res = await fetch(url);
      const json = await res.json();
      coords = parseGeocode(json);
    } catch {
      coords = null;
    }
    if (!coords) return { found: false };
    await ctx.runMutation(internal.cafes.setLocation, {
      cafeId: info.cafeId,
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    return { found: true };
  },
});
```

- [ ] **Step 5: Regenerate types and run the tests**

Run: `./node_modules/.bin/convex codegen && pnpm test -- cafes`
Expected: PASS — all three geocode tests green.

- [ ] **Step 6: Commit**

```bash
rtk proxy git add convex/cafes.ts convex/_generated tests/convex/cafes.test.ts
rtk proxy git commit -m "feat(cafes): geocodeFromCity action + setLocation (C2a)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Settings → Profile "Perbarui lokasi cuaca" button

**Files:**
- Modify: `src/routes/_pos/settings/profile.tsx`

This adds a button to the existing **Wilayah** (timezone) section that calls the geocode action and toasts the result. No new dependency — `useAction` from `convex/react` and `toast` from `sonner` (already used across the app).

- [ ] **Step 1: Add imports**

In `src/routes/_pos/settings/profile.tsx`, change the convex/react import (line 6):

```ts
import { useMutation, useQuery } from 'convex/react';
```

to:

```ts
import { useAction, useMutation, useQuery } from 'convex/react';
```

Add a `sonner` import alongside the other imports (after the `useRef, useState, useMemo` import on line 7):

```ts
import { toast } from 'sonner';
```

- [ ] **Step 2: Wire the action + handler in the component**

Inside `SettingsProfile`, after the existing mutation hooks (after line 93 `const removeLogo = useMutation(api.cafes.removeLogo);`) add:

```ts
  const geocodeFromCity = useAction(api.cafes.geocodeFromCity);
  const [geocoding, setGeocoding] = useState(false);
```

Then add a handler alongside the others (e.g. after `handleRemoveLogo`, before the Render comment block on line 215):

```ts
  async function handleUpdateWeatherLocation() {
    setGeocoding(true);
    try {
      const res = await geocodeFromCity();
      if (res.found) {
        toast.success(t`Lokasi cuaca diperbarui.`);
      } else {
        toast.error(t`Kota tidak ditemukan.`);
      }
    } catch {
      toast.error(t`Gagal memperbarui lokasi cuaca.`);
    } finally {
      setGeocoding(false);
    }
  }
```

- [ ] **Step 3: Add the button to the Wilayah section**

In the **Wilayah** `SettingsSection` (lines 442-466), add a `SettingRow` for the weather location after the timezone row. Replace the closing of the timezone `SettingRow` + section:

```tsx
          />
        </FieldGroup>
      </SettingsSection>
```

(the one immediately after the `Select` for timezone) — find the FIRST `</FieldGroup></SettingsSection>` that closes the Wilayah section (after line 464) and insert a `RowSep` + `SettingRow` before `</FieldGroup>`:

```tsx
          />

          <RowSep />

          <SettingRow
            label={<Trans>Lokasi cuaca</Trans>}
            description={
              <Trans>Gunakan kota di atas untuk prakiraan cuaca pada prediksi permintaan.</Trans>
            }
            control={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={geocoding}
                onClick={handleUpdateWeatherLocation}
              >
                {geocoding && <Spinner data-icon="inline-start" />}
                <Trans>Perbarui lokasi cuaca</Trans>
              </Button>
            }
          />
        </FieldGroup>
      </SettingsSection>
```

(`Button` and `Spinner` are already imported in this file.)

- [ ] **Step 4: Typecheck + build the route tree**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk proxy git add src/routes/_pos/settings/profile.tsx
rtk proxy git commit -m "feat(settings): Perbarui lokasi cuaca button on profile (C2a)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: i18n — extract, fill English, compile

**Files:**
- Modify: `src/locales/id/messages.po`, `src/locales/en/messages.po` (+ regenerated `.mjs`)

New source (Indonesian) strings introduced in Task 6: `Lokasi cuaca`, `Gunakan kota di atas untuk prakiraan cuaca pada prediksi permintaan.`, `Perbarui lokasi cuaca`, `Lokasi cuaca diperbarui.`, `Kota tidak ditemukan.`, `Gagal memperbarui lokasi cuaca.`. (Server throw strings — none added here; `geocodeFromCity` returns a flag, the UI owns the messages.)

- [ ] **Step 1: Extract new messages**

Run: `pnpm lingui:extract`
Expected: reports new messages added to `src/locales/id/messages.po` and `src/locales/en/messages.po` (the 6 strings above).

- [ ] **Step 2: Fill the English translations**

In `src/locales/en/messages.po`, find each new `msgid` (empty `msgstr ""`) and fill the English:

| msgid (id source) | msgstr (en) |
|---|---|
| `Lokasi cuaca` | `Weather location` |
| `Gunakan kota di atas untuk prakiraan cuaca pada prediksi permintaan.` | `Use the city above for weather in demand predictions.` |
| `Perbarui lokasi cuaca` | `Update weather location` |
| `Lokasi cuaca diperbarui.` | `Weather location updated.` |
| `Kota tidak ditemukan.` | `City not found.` |
| `Gagal memperbarui lokasi cuaca.` | `Failed to update weather location.` |

(Leave the `id` catalog `msgstr` as the Indonesian source — Lingui fills `id` from the msgid; verify each new `id` entry is non-empty after extract, matching the existing convention in that file.)

- [ ] **Step 3: Compile catalogs**

Run: `pnpm lingui:compile`
Expected: compiles `messages.mjs` for both locales without "missing translation" warnings for the new strings.

- [ ] **Step 4: Commit**

```bash
rtk proxy git add src/locales
rtk proxy git commit -m "i18n(settings): weather-location strings (C2a)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (before PR)

- [ ] **Run the full gate locally**

Run: `pnpm typecheck && pnpm test && pnpm lingui:compile`
Expected: all green. Confirm no uncommitted `convex/_generated` drift: `rtk proxy git status` is clean.

- [ ] **Confirm the dispatch summary covers the spec:**
  - Pure parsers + validators (Task 1) ✓
  - Schema lat/long + structured weatherSignal (Task 2) ✓
  - Cron → action + persistForecast + listCafesForCron (Task 3) ✓
  - Weather fetch + degradation tests (Task 4) ✓
  - geocodeFromCity + setLocation + myCafeForGeocode + tests (Task 5) ✓
  - Settings button (Task 6) ✓
  - i18n (Task 7) ✓
  - Out of scope (category taxonomy, real weatherMultiplier, weather driver, "Data cuaca tidak tersedia." note) — correctly NOT in this plan (→ C2b).

---

## Self-Review notes

- **Spec coverage:** every section of the C2a spec maps to a task (geolocation → Tasks 5/6; pure parsers → Task 1; schema → Task 2; cron restructure → Tasks 3/4; degradation → Task 4 tests; testing → embedded per task). ✓
- **Type consistency:** `WeatherDay`/`weatherSignalV` defined once in `weather.ts` and reused in `schema.ts`, `forecast.ts`. `generateNightly` is an action in both `convex/forecast.ts` and all 7 test call sites (Task 3 Step 3) and the cron (unchanged). `persistForecast` args `{ cafeId, weatherSignal? }` match the action's `runMutation` call. ✓
- **No placeholders:** every code step shows full code; every run step shows the command + expected result. ✓
- **Same-file circularity:** annotated returns on `ctx.runQuery`/`ctx.runMutation` in both `forecast.ts` (`generateNightly`) and `cafes.ts` (`geocodeFromCity`). ✓
