# Predictive Demand — Slice C2a: weather data (geolocation + Open-Meteo + store) (V1 4.5c-2a)

**Date:** 2026-06-02
**Status:** Approved design, ready for implementation plan
**Branch:** `feat/weather-fetch` (off `main`)
**Depends on:** Slice C1 — the `forecasts` table (with the reserved `weatherSignal` field), the nightly cron + `generateNightly` (currently an `internalMutation`), `computeDemand`/`computeRestock` (merged, PR #25). The cafe profile page (`/settings/profile`) + `cafes.updateProfile` (merged).

## Context

Predictive Demand's weather layer (C2) is split into **C2a — weather data (this)** and **C2b — weather-aware predictions**. C2a establishes the external integration without touching forecast numbers: cafes gain coordinates (geocoded from their city via Open-Meteo), and the nightly job — restructured from a mutation into an **action** (HTTP `fetch` cannot run in a query/mutation) — fetches each cafe's 7-day forecast and **stores** it on `forecasts.weatherSignal`. The engine's `weatherMultiplier()` still returns `1.0`, so predictions are byte-identical to C1; C2b consumes the stored signal. This isolates and validates the external API (Open-Meteo — free, no key), the cron-action shape, and graceful degradation (§6.2: a weather outage degrades to `1.0`, never breaks generation).

Decisions from brainstorming: **Open-Meteo** for both geocoding and forecast; **geocode the city** (owner-triggered button on Settings → Profile, no manual coordinates); `weatherSignal` becomes a **structured per-day array**; the cron becomes an **action** that calls a `persistForecast` mutation.

## Goal

A cafe geocodes its city to lat/long via a Settings button; the nightly cron-action fetches the next-7-day forecast per cafe and stores a per-day `weatherSignal` (condition + temp + precip) on the `forecasts` row. Forecast quantities are unchanged in this slice.

## Geolocation

- **Schema:** `cafes` gains `latitude: v.optional(v.number())`, `longitude: v.optional(v.number())`.
- **`cafes.geocodeFromCity` action** (public, owner-triggered): reads the owner's cafe via `ctx.runQuery(internal.cafes.myCafeForGeocode)` (an internal query returning `{ cafeId, city }` for the authed owner), calls Open-Meteo geocoding `https://geocoding-api.open-meteo.com/v1/search?name=<city>&count=1&language=id&format=json`, parses via `parseGeocode`, and if found patches `latitude`/`longitude` via `ctx.runMutation(internal.cafes.setLocation, { cafeId, latitude, longitude })`. Returns `{ found: boolean }`. If the cafe has no `city` → `{ found: false }` (no fetch).
- **UI:** a "Perbarui lokasi cuaca" button on `/settings/profile` that calls `api.cafes.geocodeFromCity`, with a success toast ("Lokasi cuaca diperbarui.") or "Kota tidak ditemukan." on `found: false`.

> Actions cannot use `ctx.db`. The internal query (`myCafeForGeocode`) resolves the owner's cafe; the internal mutation (`setLocation`) patches it. `geocodeFromCity` orchestrates: runQuery → fetch → runMutation.

## Weather fetch + pure parsers (`convex/lib/weather.ts`)

All pure (no network), unit-tested:
```ts
export type WeatherCondition = 'hot' | 'rainy' | 'cool' | 'normal';
export type WeatherDay = { dateKey: string; condition: WeatherCondition; tempMaxC: number; precipMm: number };

export function conditionOf(tempMaxC: number, precipMm: number): WeatherCondition;
// rainy if precipMm >= 5; else hot if tempMaxC >= 32; else cool if tempMaxC < 24; else normal. (Thresholds tunable.)

export function parseGeocode(json: unknown): { latitude: number; longitude: number } | null;
// reads results[0].latitude/longitude; null when results empty/missing.

export function parseForecast(json: unknown): WeatherDay[];
// reads daily.time[] (YYYY-MM-DD), daily.temperature_2m_max[], daily.precipitation_sum[];
// zips into WeatherDay[] with conditionOf(...). Returns [] on a malformed payload.
```
Forecast endpoint: `https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lng>&daily=temperature_2m_max,precipitation_sum&timezone=Asia%2FJakarta&forecast_days=7`. (Open-Meteo `daily.time` keys are already local calendar dates for the requested `timezone`.)

The actions do `fetch(...).json()` then call the pure parser, so only the thin fetch wrapper is untested (the parsing/derivation is fully covered).

## Schema changes

- `cafes`: `+ latitude: v.optional(v.number()), longitude: v.optional(v.number())`.
- `forecasts.weatherSignal`: replace the C1-reserved `v.optional(v.string())` with:
```ts
  weatherSignal: v.optional(
    v.array(
      v.object({
        dateKey: v.string(),
        condition: v.union(v.literal('hot'), v.literal('rainy'), v.literal('cool'), v.literal('normal')),
        tempMaxC: v.number(),
        precipMm: v.number(),
      })
    )
  ),
```
(Optional → backward-compatible with C1 rows, which never set it.) Run `./node_modules/.bin/convex codegen`; commit drift.

## Cron restructure (mutation → action)

- **`internal.forecast.persistForecast`** (`internalMutation`, args `{ cafeId: v.id('cafes'), weatherSignal: v.optional(<the WeatherDay[] validator>) }`): the C1 per-cafe body — `computeDemand` → insert `forecasts` (ready/learning, now spreading `...(weatherSignal ? { weatherSignal } : {})` on the ready row) → when ready, `computeRestock` → insert draft `restockSuggestions`. (Predictions unchanged; `weatherMultiplier()` still `1.0`.)
- **`internal.forecast.listCafesForCron`** (`internalQuery`, no args): returns `Array<{ cafeId, latitude?, longitude? }>` for all cafes (actions can't read `ctx.db`).
- **`generateNightly`** changes from `internalMutation` to **`internalAction`**: `const cafes = await ctx.runQuery(internal.forecast.listCafesForCron, {})`; for each cafe: if it has lat & long, `try { fetch forecast → parseForecast → weatherSignal } catch { weatherSignal = undefined }`; `await ctx.runMutation(internal.forecast.persistForecast, { cafeId, ...(weatherSignal ? { weatherSignal } : {}) })`.
- **`convex/crons.ts`**: unchanged reference shape — `crons.cron('nightly forecast', '0 15 * * *', internal.forecast.generateNightly, {})` (now an action; Convex crons accept actions).

> Each cafe's fetch is wrapped in its own try/catch so one cafe's failure (or the API being down) doesn't abort the others — the cafe simply gets a forecast with no `weatherSignal`.

## Graceful degradation (§6.2)

No lat/long, geocode failure, or forecast-fetch failure → the forecast is still generated and persisted, just without a `weatherSignal`. C2b renders "Data cuaca tidak tersedia." when a ready forecast lacks a signal. C2a stores `undefined` cleanly; nothing throws out of `generateNightly`.

## Testing

- **Pure** (`tests/convex/weather.test.ts`): `conditionOf` (rainy ≥5; hot ≥32; cool <24; normal; precedence rainy-over-hot), `parseGeocode` (a hit; empty `results` → null; missing field → null), `parseForecast` (canned Open-Meteo daily arrays → `WeatherDay[]` with derived conditions; malformed → []).
- **Convex** (extend `tests/convex/forecast-cron.test.ts`): with `global.fetch` stubbed to canned Open-Meteo JSON and a cafe given lat/long → run the `generateNightly` action → the `forecasts` row has a `weatherSignal` (array of 7 WeatherDay). A cafe with **no lat/long** → forecast persisted, `weatherSignal` undefined. A stubbed fetch that **rejects** → still persisted, no signal (degradation), and the run completes for other cafes. The existing C1 cron assertions (ready/draft, cold-start, per-cafe) still hold via the action entry point (predictions unchanged).
- **Geocode** (`tests/convex/cafes.test.ts` or alongside): `cafes.geocodeFromCity` with `global.fetch` stubbed to a geocode hit → the cafe's `latitude`/`longitude` are set; a cafe with no `city` → `{ found: false }`, no patch; an empty-results geocode → `{ found: false }`.
- **Stubbing note:** convex-test runs actions; stub `global.fetch` (e.g. `vi.stubGlobal('fetch', vi.fn().mockResolvedValue(...))`) and restore after.
- Gate: `pnpm typecheck && pnpm test && pnpm lingui:compile`; `convex codegen` → commit drift.

## Affected / new files (anticipated)

**New:** `convex/lib/weather.ts` (+ `tests/convex/weather.test.ts`); a geocode test (`tests/convex/cafes.test.ts` or in the cron test file).
**Modified:** `convex/schema.ts` (cafe lat/long; `forecasts.weatherSignal` structured), `convex/_generated/*`, `convex/forecast.ts` (`generateNightly` → action; `persistForecast` internalMutation; `listCafesForCron` internalQuery), `convex/cafes.ts` (`geocodeFromCity` action + `myCafeForGeocode` query + `setLocation` mutation), `convex/crons.ts` (reference is unchanged but now points at an action), `src/routes/_pos/settings/profile.tsx` (the button), `tests/convex/forecast-cron.test.ts`, Lingui catalogs (button + toast strings).

## Out of scope (→ C2b)

- The category **weather-sensitivity taxonomy** + tagging UI; the real **`weatherMultiplier(sensitivity, condition)`** wired into `computeDemand`; the weather **driver** on the forecast cards; the **"Data cuaca tidak tersedia."** UI note. (C2a only fetches + stores the signal — `weatherMultiplier()` stays `1.0`.)
- Per-item weather overrides, multi-provider fallback, historical weather backfill — V2.
