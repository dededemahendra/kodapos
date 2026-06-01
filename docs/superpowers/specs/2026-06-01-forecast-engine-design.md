# Predictive Demand — Slice A: forecast engine + live /forecast page (V1 4.5a)

**Date:** 2026-06-01
**Status:** Approved design, ready for implementation plan
**Branch:** `feat/forecast-engine` (off `main`)
**Depends on:** POS Core (`orders` with line snapshots, the `by_cafe_created` index — merged), the menu (`menuItems`), `convex/lib/time.ts` (tz/day helpers from the Reports slice — merged), the catalog UI kit (PageHeader, StatusBadge, Empty, Spinner).

## Context

Predictive Demand (V1 design §4.5) is the flagship AI feature. It's too large for one spec, so it's decomposed into three slices: **A — forecast engine + live `/forecast` page** (this spec); **B — restock suggestions (Daftar Belanja) + supplier export**; **C — weather integration + nightly cron persistence**. This slice ships the transparent, rule-based forecast with **zero external dependencies** (no weather API, no cron), computing demand live from the same sales history the Reports module reads.

Decisions from brainstorming: the page shows **tomorrow's per-item demand + a 7-day total** per item; the holiday table covers **Lebaran + fixed national holidays** (data-driven, extendable); the forecast is **computed live** by a query (no `forecasts` table / cron yet — those arrive in Slice C); the **weather multiplier is hardcoded `1.0`** in A; and **drivers are structured codes rendered client-side** (not server-generated prose), so the engine stays pure and the text stays translatable.

## Goal

Let an owner open `/forecast` and see, computed live from order history: tomorrow's predicted demand per menu item (and a 7-day summed total per item), each with a confidence label (`Tinggi`/`Sedang`/`Rendah`) and 1–2 plain-language drivers. A cafe with <14 days of data sees a "sedang belajar" cold-start message with an ETA instead.

## Pure engine — `convex/lib/forecast.ts`

All functions are pure (no ctx/React/Convex-server imports) so both the query and unit tests use them directly. Money/qty are numbers; qty predictions round to whole units.

```ts
export type DriverCode = 'dow_busy' | 'dow_quiet' | 'holiday'; // weather codes deferred to Slice C
export type Driver =
  | { code: 'dow_busy' | 'dow_quiet'; pct: number; dow: number } // dow 0=Mon..6=Sun
  | { code: 'holiday'; pct: number; key: HolidayKey };

export type Confidence = 'low' | 'med' | 'high';

// An item's qty on each ACTIVE day (a day the cafe had >=1 paid order), most-recent first.
// daysAgo = integer offset from "today" (0 = today); dow = weekday 0=Mon..6=Sun;
// qty = this item's units that day (0 on active days the item wasn't sold).
export type DaySample = { daysAgo: number; dow: number; qty: number };
```

### Functions

1. **`baseEstimate(samples: DaySample[], lambda = 0.05): number`**
   - Take the trailing 28 active days (`samples` already limited to active days; the caller passes up to 28). If `samples` is empty → `0`.
   - **Trim:** sort qty ascending; drop `floor(0.1 * n)` from each end (so for n=28, drop 2 low + 2 high). If trimming would remove everything (n < 5), skip the trim.
   - **Exponential-decay weighted mean** of the trimmed set: `weight_i = exp(-lambda * daysAgo_i)`; `base = Σ(weight_i * qty_i) / Σ(weight_i)`. (Recent days weigh more.)

2. **`dayOfWeekMultiplier(samples: DaySample[], forDow: number): number`**
   - Uses the trailing 8 weeks (caller passes up to 56 active days). Each sample carries its own `dow`.
   - If fewer than 2 distinct calendar weeks are represented (`< 14` active days span) → `1.0`.
   - `avgOnDow = mean(qty where dow === forDow)`, `overallAvg = mean(all qty)`. If `overallAvg === 0` → `1.0`.
   - `mult = avgOnDow / overallAvg`, clamped to `[0.5, 2.0]`.

3. **`holidayMultiplier(dateKey: string): { mult: number; driver?: Driver }`** — looks up `dateKey` ("YYYY-MM-DD") in `HOLIDAY_TABLE` (below). Returns `{ mult: 1 }` (no driver) for ordinary days.

4. **`weatherMultiplier(): number`** → `1.0` (stub in A; Slice C replaces with a real signal). Defined as a no-arg function so the call site is stable when C wires weather in.

5. **`confidence(itemSpanDays: number, coeffOfVariation: number): Confidence`**
   - `itemSpanDays` = the item's data span measured in **active days**: the count of active days from the item's first observed sale (in the window) through the most recent active day. A brand-new item has a small span → lower confidence even when the cafe has lots of data.
   - `high` if `itemSpanDays >= 21 && coeffOfVariation < 0.5`
   - `med` if `itemSpanDays >= 14 && coeffOfVariation < 1.0`
   - else `low`
   - (`coeffOfVariation = stddev(qty) / mean(qty)` over the item's qty on the active days within its span, zeros included; if `mean === 0` → treat as `Infinity` → `low`.)

6. **`predictedQty(base: number, dow: number, weather: number, holiday: number): number`** → `Math.max(0, Math.round(base * dow * weather * holiday))`.

7. **`driversFor({ dowMult, dow, holiday }): Driver[]`** — emits at most 2 drivers: a `dow_busy`/`dow_quiet` driver when `|dowMult − 1| >= 0.1` (`pct = round((dowMult − 1) * 100)`), and the holiday driver from `holidayMultiplier` when present. Weather driver deferred to C.

### Holiday table (data-driven)

```ts
export type HolidayKey =
  | 'lebaran_eve' | 'lebaran_day' | 'lebaran_after'
  | 'independence' | 'christmas' | 'new_year';

// Fixed-date holidays keyed by MM-DD; Lebaran is lunar so its dates are listed
// per-year (extend yearly). weekend-near-major (+10%) handled separately.
const FIXED: Record<string, { mult: number; key: HolidayKey }> = {
  '08-17': { mult: 0.7, key: 'independence' },  // -30%
  '12-25': { mult: 0.8, key: 'christmas' },     // -20%
  '01-01': { mult: 0.8, key: 'new_year' },      // -20%
};
const LEBARAN: Record<string, { mult: number; key: HolidayKey }> = {
  // 2026 Idul Fitri ~ 2026-03-20/21 (extend with future years as known)
  '2026-03-19': { mult: 0.5, key: 'lebaran_eve' },   // -50% day before
  '2026-03-20': { mult: 0.2, key: 'lebaran_day' },   // -80% on the day
  '2026-03-21': { mult: 1.2, key: 'lebaran_after' }, // +20% after
};
```
`holidayMultiplier(dateKey)`: exact match in `LEBARAN` first, else `FIXED[MM-DD]`, else a weekend (Sat/Sun) within 2 days of any listed holiday → `{ mult: 1.1 }` (no specific driver — generic "akhir pekan dekat libur"), else `{ mult: 1 }`. Multipliers are deliberately conservative; refinement is a later concern.

## Backend query — `convex/forecast.ts`

`export const demand = query({ args: {}, returns: <union>, handler })`:
- `requireOwnerCafe(ctx)` (owner-scoped; same gate as Dashboard/Reports).
- `tz = await tzFor(ctx, cafeId)`; `now = Date.now()`.
- Scan paid orders over the trailing 56 local days via `withIndex('by_cafe_created', q => q.eq('cafeId', cafeId).gte('createdAtClient', startOfLocalDay(tz, 55, now)))`; filter `paymentStatus === 'paid'`.
- **Active days** = distinct local day keys (`dayKeyFn(tz)`) with ≥1 paid order. `daysCollected = activeDays.size`.
- **Cold-start:** if `daysCollected < 14` → return `{ status: 'learning', daysCollected, daysNeeded: 14, etaDateKey }` where `etaDateKey` = the local day key 14 days after the **first** active day.
- Otherwise build, per menu item that appears in history, a `DaySample[]` (qty per active day, `daysAgo` from today, 0 on active days the item wasn't sold). For each of the next 7 local days (`+1`..`+7`): `holiday = holidayMultiplier(dayKey)`, `qty = predictedQty(base, dow=dayOfWeekMultiplier(...), weather=1, holiday.mult)`. `tomorrowQty` = the `+1` prediction; `sevenDayQty` = Σ over `+1..+7`.
- Return `{ status: 'ready', forDateKey, lines: [{ menuItemId, name, tomorrowQty, sevenDayQty, confidence, drivers }] }` sorted by `tomorrowQty` desc (then name). `drivers` are for the tomorrow (`+1`) prediction.
- Reactive query; recomputes on order changes. Heavier than a Reports scan (56-day window + per-item series + 7-day loop) but bounded at single-cafe scale. Slice C's cron persists nightly and the page will then read the stored row instead of recomputing.

> The query holds the orchestration (load → bucket → per-item series → per-day loop); all arithmetic lives in the pure engine so it's testable without a DB.

## Page — `src/routes/_pos/forecast.tsx`

Owner page (the `demand` query's `requireOwnerCafe` enforces access; the route lives in the owner nav, not the cashier sale flow).
- A `Besok | 7 hari` toggle (local `useState`).
- **ready:** demand cards — item name, predicted qty rendered as `~{qty}` (tomorrow or 7-day total per the toggle), a confidence `StatusBadge` (`Tinggi` success / `Sedang` default / `Rendah` muted), and the rendered drivers as muted lines. Sorted as returned.
- **learning:** shadcn `Empty` — title "Kami sedang belajar", description "Memerlukan minimal 14 hari data. Perkiraan akan aktif sekitar {etaDate}." (`daysCollected`/`daysNeeded` shown).
- **loading:** `Spinner`.

### Driver rendering (client-side i18n)
A small `renderDriver(driver)` helper in `src/components/forecast/` maps each structured `Driver` to localized text via Lingui, e.g.:
- `dow_busy` → `+{pct}% — biasanya ramai di hari {dayName}`
- `dow_quiet` → `{pct}% — biasanya sepi di hari {dayName}`
- `holiday` (by `key`) → e.g. `Libur Lebaran — perkiraan turun {|pct|}%`, `HUT RI — perkiraan turun {pct}%`
`dayName` comes from a Bahasa weekday lookup (0=Senin..6=Minggu). The engine never emits prose.

## i18n
New Bahasa source strings: page title ("Prediksi Permintaan"), toggle labels (`Besok`/`7 hari`), confidence labels, the cold-start copy, and the driver templates. `pnpm lingui:extract` → fill `en` → compile. Driver strings carry placeholders (`{pct}`, `{dayName}`) — preserve them.

## Testing

- **Pure** (`convex/lib/forecast.test.ts`): `baseEstimate` (exp-decay recency weighting; trim drops extremes; empty→0; n<5 skips trim), `dayOfWeekMultiplier` (ratio, <2 weeks→1, overallAvg 0→1, clamp to [0.5,2]), `holidayMultiplier` (Lebaran 3-day, each FIXED date, weekend-near-major, ordinary day→1), `confidence` (each threshold boundary), `predictedQty` (round + clamp ≥0), `driversFor` (emits dow driver past the 0.1 threshold, holiday driver, ≤2).
- **Convex** (`tests/convex/forecast.test.ts`): seed paid orders across ≥14 active days spanning multiple weeks → assert `ready` with correct `tomorrowQty`/`sevenDayQty` ordering and a visible day-of-week effect; a fresh cafe (<14 active days) → `learning` with `daysCollected` + `etaDateKey`; paid-only (a void order in range is ignored); tenant isolation (cafe B sees none of A's history). Use custom-seeded timestamps relative to a fixed reference where possible; where "today" matters, assert structural properties (counts, ordering, status) rather than exact dates to stay deterministic.
- **Playwright** (auth-gated, extend `tests/e2e/sale.spec.ts`): a fresh owner opens `/forecast` → sees the "sedang belajar" message (a brand-new cafe has <14 days, so this is the deterministic e2e path).

## Affected / new files (anticipated)

**New:** `convex/lib/forecast.ts` (+ `convex/lib/forecast.test.ts`), `convex/forecast.ts` (+ `tests/convex/forecast.test.ts`), `src/routes/_pos/forecast.tsx` (replace the `ComingSoon` stub if one exists, else add the route), `src/components/forecast/render-driver.tsx` (+ a Bahasa weekday helper).
**Modified:** `convex/_generated/*` (codegen), Lingui catalogs, possibly the owner nav to surface `/forecast`, `tests/e2e/sale.spec.ts`.

## Out of scope (later slices / V2)

- **Weather** — the real `weather_multiplier` and its driver (Slice C wires it; A stubs `1.0`).
- **`forecasts` / `restockSuggestions` tables + the nightly 22:00 WIB cron** — Slice C (A computes live).
- **Restock suggestions (Daftar Belanja), supplier picker, WhatsApp/PDF export, inline qty edits + edit logging, "mark sent"** — Slice B.
- Per-item weather overrides, ML, multi-day calendar/heatmap, live intraday re-forecasting — V2.
