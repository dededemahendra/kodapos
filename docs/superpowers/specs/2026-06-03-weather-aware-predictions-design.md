# Predictive Demand — Slice C2b: weather-aware predictions (global rain multiplier) (V1 4.5c-2b)

**Date:** 2026-06-03
**Status:** Approved design, ready for implementation plan
**Branch:** `feat/weather-aware-predictions` (off `main`)
**Depends on:** Slice C2a (PR #26, merged) — `forecasts.weatherSignal` (structured `WeatherDay[]`), the nightly cron-action (`generateNightly` + `persistForecast` + `listCafesForCron`), cafe coordinates + the geocode button, and `convex/lib/weather.ts` (`WeatherCondition`, `WeatherDay`, `conditionOf`, `weatherSignalV`). Also C1 — `computeDemand`/`computeRestock`, the `demand` query, the forecast page (`/forecast`) + `render-driver.tsx`.

## Context

Predictive Demand's weather layer (C2) is split into **C2a — weather data** (geolocation + Open-Meteo fetch + store, merged) and **C2b — weather-aware predictions (this)**. C2a stored a per-day `weatherSignal` on each ready `forecasts` row without touching the numbers — `weatherMultiplier()` was a no-arg stub returning `1.0`. C2b consumes that stored signal: the nightly engine applies a **per-day weather multiplier** to predicted quantities, surfaces a **weather driver** on the forecast cards, and shows a **"Data cuaca tidak tersedia."** note when a ready forecast has no signal.

**Scope decision (from brainstorming):** a **global foot-traffic multiplier**, not a per-category sensitivity model. One multiplier per day applies to *all* items — the only weather effect that is unambiguously global for a cafe is **rain dampening walk-in traffic**. Hot/cool diverge by item (iced vs hot drinks) and require a category taxonomy; that is deferred to **C2c**. So C2b ships **rain-only**: `rainy → ×0.85`, every other condition `→ ×1.0`. Values are tunable constants.

**Architecture decision (Approach A — fetch-first, single pass):** weather is applied inside `computeDemand`'s per-day loop, so it must be baked into the persisted `lines` at night. The cron therefore **fetches weather first, then persists in one pass** — `persistForecast(cafeId, weatherSignal?)` passes the signal into `computeDemand`, and `lines` + restock + `weatherSignal` are written atomically in a single insert. This relaxes the C2a review's #6 micro-optimization (a coord'd cafe still *learning* now fetches weather once/night that goes unused); justified because Open-Meteo is free/keyless, learning is a ~14-day transient, and single-pass guarantees `lines` and `weatherSignal` never drift apart. The C2a #1 (tz/window) and #7 (pagination) fixes are retained.

## Goal

The nightly cron bakes each ready forecast's per-day weather into its predicted quantities (rain ⇒ −15% that day), the forecast cards explain it with a "Hujan — perkiraan turun 15%" driver, and a ready forecast with no weather signal shows "Data cuaca tidak tersedia." Predictions for cafes without coordinates (or on a weather outage) degrade to the C2a numbers unchanged.

## Engine (`convex/lib/forecast.ts`)

All pure, unit-tested.

- **Multiplier map + function:**
  ```ts
  import type { WeatherCondition } from './weather';

  // Tunable. Rain is the only globally-applicable foot-traffic effect for a
  // cafe; hot/cool diverge per item (iced vs hot drinks) → C2c taxonomy.
  export const WEATHER_MULT: Record<WeatherCondition, number> = {
    rainy: 0.85,
    hot: 1,
    cool: 1,
    normal: 1,
  };

  export function weatherMultiplier(condition?: WeatherCondition): number {
    return condition ? WEATHER_MULT[condition] : 1;
  }
  ```
  (Replaces the no-arg stub. `undefined` — no signal for that day — returns `1`.)

- **Weather driver:** extend the `Driver` union with
  ```ts
  | { code: 'weather'; pct: number; condition: WeatherCondition }
  ```
  `driversFor` gains an optional `weather?: Driver` param and appends it (after dow, after holiday) when present. The existing `out.slice(0, 2)` cap stays — order is **dow → holiday → weather**, so on a rare rainy holiday busy-day the weather chip is the one dropped. A weather driver is only constructed when `|WEATHER_MULT[condition] − 1| ≥ 0.1` (i.e. only `rainy` under the current map), keeping cards uncluttered.

- `predictedQty(base, dow, weather, holiday)` is unchanged — it already multiplies the `weather` factor in; C2b simply passes a real value instead of `1`.

## Demand model (`convex/lib/demand.ts`)

`computeDemand(ctx, cafeId, weatherSignal?: WeatherDay[])` gains an optional signal:

- Build `const condByDate = new Map(weatherSignal?.map((d) => [d.dateKey, d.condition]))`.
- The per-day quantity closure uses it:
  ```ts
  const dayQty = (dk: string) =>
    predictedQty(base, dayOfWeekMultiplier(samples, dowOfKey(dk)), weatherMultiplier(condByDate.get(dk)), holidayMultiplier(dk).mult);
  ```
  So `tomorrowQty` and each of the 7 days summed into `sevenDayQty` reflect that day's own condition.
- **Tomorrow's weather driver:** compute `const tomorrowCond = condByDate.get(tomorrowKey)` and, when its multiplier deviates, build a driver `{ code: 'weather', pct: Math.round((WEATHER_MULT[tomorrowCond] − 1) * 100), condition: tomorrowCond }`, passed into `driversFor({ dowMult, dow, holiday?, weather? })`.
- When `weatherSignal` is absent (no coords, degradation, or a live query), `condByDate` is empty → every day multiplies by `1` → byte-identical to C2a. No weather driver.

## Read path (`convex/forecast.ts`)

- **`persistForecast`** regains a `weatherSignal: v.optional(weatherSignalV)` arg and forwards it to `computeDemand(ctx, cafeId, weatherSignal)`. The ready insert again stores `...(weatherSignal ? { weatherSignal } : {})` on the row. It returns `v.null()` again (no `{ ready, forecastId }`). **`attachWeatherSignal` is removed** (its patch-after-insert role is gone under single-pass).
- **`generateNightly`** returns to **fetch-then-persist** per cafe, keeping the C2a #1/#7 fixes: paginated `listCafesForCron` loop; for each cafe with coordinates, build the `start_date`/`end_date` + cafe-timezone Open-Meteo URL, `fetch` → `parseForecast`, per-cafe `try/catch` degradation (a failure ⇒ no signal, others proceed); then `ctx.runMutation(internal.forecast.persistForecast, { cafeId, ...(weatherSignal ? { weatherSignal } : {}) })`. `listCafesForCron` is unchanged (still returns `timezone`/`latitude`/`longitude` per cafe).
- **`demand` query** adds `weatherAvailable: v.boolean()` to the **ready** result variant: `true` iff the served snapshot has a non-empty `weatherSignal`, else `false` (a degraded snapshot, or a live-computed result where weather can't be fetched in a query). The `learning` variant is unchanged. The query's `driverV` validator gains the `weather` variant so the new driver passes return validation.
  - Snapshot path: `weatherAvailable: (snap.weatherSignal?.length ?? 0) > 0`.
  - Live-compute fallback (`computeDemand` with no snapshot): `weatherAvailable: false`.

> Weather is **baked into the persisted `lines` at night**; the `demand` query serves those lines as-is — it does not (and cannot) fetch weather. So mid-day reads reflect last night's weather, consistent with how the rest of the forecast already works.

## Frontend

- **`src/components/forecast/render-driver.tsx`:** extend the client `ForecastDriver` copy with `{ code: 'weather'; pct: number; condition: 'hot' | 'rainy' | 'cool' | 'normal' }` and render it. For `rainy`: `<Trans>Hujan — perkiraan turun {Math.abs(pct)}%</Trans>`. (Only `rainy` is emitted under the current map; a generic "Cuaca" branch covers other conditions defensively for when C2c widens the map.)
- **`src/routes/_pos/forecast.tsx`:** when `data.status === 'ready' && !data.weatherAvailable`, render a muted note near the horizon toggle: `<Trans>Data cuaca tidak tersedia.</Trans>`. No note when weather is available or while learning.
- **i18n:** new id-source strings — `Hujan — perkiraan turun {pct}%` (and any defensive weather label) and `Data cuaca tidak tersedia.` Run `pnpm lingui:extract`, fill the en catalog, `pnpm lingui:compile`.

## Graceful degradation

Unchanged contract from C2a §6.2: no coordinates, a geocode miss, or a forecast-fetch failure ⇒ the forecast is still generated, just with no `weatherSignal` ⇒ `computeDemand` applies `×1.0` everywhere ⇒ numbers equal C2a, and the card shows "Data cuaca tidak tersedia." Nothing throws out of `generateNightly`.

## Testing

- **Pure (`tests/convex/forecast-engine.test.ts`):** extend the existing `weatherMultiplier` describe — `weatherMultiplier('rainy') === 0.85`; `hot`/`cool`/`normal`, `undefined`, and the no-arg call `=== 1` (the current `weatherMultiplier() === 1` assertion stays green). `driversFor` appends a `weather` driver when supplied and respects the 2-cap (dow + holiday present ⇒ weather dropped). `predictedQty` already covered — confirm it threads the weather factor.
- **`computeDemand` via the `demand` query (`tests/convex/forecast.test.ts`, the `forecast.demand` describe):** seed a ready cafe, persist a forecast carrying a `weatherSignal` with a rainy `tomorrowKey` ⇒ the served `tomorrowQty` is the no-weather value ×0.85 (rounded), `sevenDayQty` reflects each day under its own condition (mixed rainy/clear), and the tomorrow line carries a `weather` driver `{ code:'weather', pct:-15, condition:'rainy' }`. A snapshot with no signal ⇒ numbers identical to the C2a baseline, no weather driver.
- **Nightly (`tests/convex/forecast-cron.test.ts`):** with `global.fetch` stubbed to rainy days and a coord'd cafe ⇒ persisted `lines` reflect ×0.85 and the row has a `weatherSignal`. Degradation (no coords / rejecting fetch) ⇒ weatherless lines, no signal. The C2a window/pagination/degradation tests still hold (the `learning`-cafe "no fetch" test from the #6 review is **removed/rewritten** — Approach A fetches before persisting, so a coord'd learning cafe now does fetch; assert it persists `learning` with no `weatherSignal`).
- **`demand` query (`tests/convex/forecast.test.ts`):** snapshot with a non-empty signal ⇒ `weatherAvailable: true`; degraded snapshot ⇒ `false`; live-computed (no snapshot) ⇒ `false`.
- **Stubbing note:** convex-test runs actions; stub `global.fetch` with `vi.stubGlobal` and restore after (as in C2a).
- **Gate:** `pnpm typecheck && pnpm test && pnpm lingui:compile`; no `convex/_generated` drift after `./node_modules/.bin/convex codegen`.

## Affected / new files (anticipated)

**Modified:**
- `convex/lib/forecast.ts` — `WEATHER_MULT` + `weatherMultiplier(condition?)`; `weather` driver variant; `driversFor` weather param.
- `convex/lib/demand.ts` — `computeDemand` accepts + applies `weatherSignal`; builds the tomorrow weather driver.
- `convex/forecast.ts` — `persistForecast` regains `weatherSignal?` (passes to `computeDemand`); remove `attachWeatherSignal`; `generateNightly` fetch-then-persist; `demand` query `+weatherAvailable` + `driverV` weather variant.
- `src/components/forecast/render-driver.tsx` — weather driver rendering.
- `src/routes/_pos/forecast.tsx` — "Data cuaca tidak tersedia." note.
- `src/locales/{id,en}/messages.po` (+ compiled `.mjs`) — new strings.
- Tests: `tests/convex/forecast-engine.test.ts` (pure: `weatherMultiplier`/`driversFor`), `tests/convex/forecast.test.ts` (the `forecast.demand` query: weather-baked lines + `weatherAvailable`), `tests/convex/forecast-cron.test.ts` (nightly fetch+persist; rewrite the #6 "no fetch" test).

**New:** none.

## Out of scope (→ C2c / V2)

- The category **weather-sensitivity taxonomy** + tagging UI, and the per-item **hot/cool divergence** (iced vs hot drinks) — this is exactly why C2b is rain-only/global. (C2c)
- Per-item weather overrides, multi-provider fallback, historical-weather backfill, intra-day re-fetch. (V2)
