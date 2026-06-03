# Predictive Demand — Slice C2b (weather-aware predictions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the nightly engine apply a per-day global weather multiplier (rain ⇒ −15%) to predicted quantities, surface a weather driver on the forecast cards, and show "Data cuaca tidak tersedia." when a ready forecast has no signal.

**Architecture:** Approach A (fetch-first, single pass). `weatherMultiplier(condition)` (rain-only map) is applied inside `computeDemand`'s per-day loop. The nightly cron fetches each cafe's weather **before** persisting, passing the `weatherSignal` into `persistForecast` → `computeDemand`, so `lines` + restock + signal are written atomically. This reverts the C2a review's persist-first/`attachWeatherSignal` split (a coord'd learning cafe now fetches once/night, discarded), keeping the C2a window (`start_date`/tz) and pagination fixes.

**Tech Stack:** Convex (internalAction/internalMutation/internalQuery, `ctx.runQuery`/`runMutation`, `paginate`), `fetch` (default runtime), Open-Meteo, React 19 + TanStack Router + Lingui, Vitest + convex-test (`vi.stubGlobal('fetch', …)`).

**Key facts established from the codebase:**
- The forecast driver union is defined in **three** places that must stay in sync: `convex/schema.ts` (`forecasts.lines[].drivers`), `convex/forecast.ts` (`driverV`, the `demand` query return), and `src/components/forecast/render-driver.tsx` (the client copy). Adding a `weather` variant means touching all three. This duplication is the existing pattern — do not extract a shared validator in this slice.
- `convex/lib/forecast.ts` is otherwise pure TS (no `v`); it will import only the `WeatherCondition` **type** from `./lib/weather` (no import cycle — `weather.ts` imports only `convex/values`).
- `forecasts.weatherSignal` is already the structured `weatherSignalV` array (C2a) — **no schema change there**. Only `forecasts.lines[].drivers` needs the new variant.
- Single quotes, 2-space indent, semicolons ARE used. Match the existing files.
- Use `./node_modules/.bin/convex codegen` (NOT `npx`); commit regenerated `convex/_generated/*`.
- en catalog register for drivers is "expected up/down {pct}%" (e.g. `{label} holiday — expected down {0}%`).
- Run the gate before any push: `pnpm typecheck && pnpm test && pnpm lingui:compile`.

---

## File Structure

**Modified files:**
- `convex/lib/forecast.ts` — `WEATHER_MULT` + `weatherMultiplier(condition?)` (replaces the no-arg stub); `weather` variant on the `Driver` type; `weather?` param on `driversFor`.
- `convex/lib/demand.ts` — `computeDemand` accepts `weatherSignal?`, applies it per day, builds the tomorrow weather driver.
- `convex/schema.ts` — `forecasts.lines[].drivers` union gains the `weather` variant.
- `convex/forecast.ts` — `persistForecast` accepts+forwards+stores `weatherSignal` and returns `null`; `attachWeatherSignal` removed; `generateNightly` fetch-then-persist; `demand` query adds `weatherAvailable` + `driverV` weather variant.
- `convex/_generated/*` — regenerated.
- `src/components/forecast/render-driver.tsx` — render the weather driver.
- `src/routes/_pos/forecast.tsx` — "Data cuaca tidak tersedia." note.
- `src/locales/{id,en}/messages.po` (+ compiled `.mjs`) — new strings.
- Tests: `tests/convex/forecast-engine.test.ts`, `tests/convex/forecast-cron.test.ts`, `tests/convex/forecast.test.ts`.

**New files:** none.

---

## Task 1: Engine — `weatherMultiplier(condition)` + weather driver

**Files:**
- Modify: `convex/lib/forecast.ts:54-56` (stub), `:72-74` (`Driver` type), `:115-123` (`driversFor`)
- Test: `tests/convex/forecast-engine.test.ts:100-104` (existing `weatherMultiplier` describe), `:134-151` (`driversFor` describe)

- [ ] **Step 1: Write the failing tests**

In `tests/convex/forecast-engine.test.ts`, the import block (lines 1-11) already imports `weatherMultiplier`, `driversFor`, and `type Driver`. Replace the existing `weatherMultiplier` describe (lines 100-104):

```ts
describe('weatherMultiplier', () => {
  it('is the 1.0 stub in slice A', () => {
    expect(weatherMultiplier()).toBe(1);
  });
});
```

with:

```ts
describe('weatherMultiplier', () => {
  it('no condition → 1', () => {
    expect(weatherMultiplier()).toBe(1);
  });
  it('rain dampens by 15%', () => {
    expect(weatherMultiplier('rainy')).toBe(0.85);
  });
  it('hot/cool/normal are neutral in C2b (global rain-only model)', () => {
    expect(weatherMultiplier('hot')).toBe(1);
    expect(weatherMultiplier('cool')).toBe(1);
    expect(weatherMultiplier('normal')).toBe(1);
  });
});
```

Then in the `driversFor` describe, after the existing "includes the holiday driver and caps at 2" test (ends line 150), add two tests before the closing `});`:

```ts
  it('appends the weather driver after dow/holiday', () => {
    const weather: Driver = { code: 'weather', pct: -15, condition: 'rainy' };
    expect(driversFor({ dowMult: 1.05, dow: 2, weather })).toEqual([weather]);
  });
  it('drops the weather driver when dow + holiday already fill the 2-cap', () => {
    const holiday: Driver = { code: 'holiday', pct: -80, key: 'lebaran_day' };
    const weather: Driver = { code: 'weather', pct: -15, condition: 'rainy' };
    expect(driversFor({ dowMult: 1.3, dow: 6, holiday, weather })).toEqual([
      { code: 'dow_busy', pct: 30, dow: 6 },
      holiday,
    ]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- forecast-engine`
Expected: FAIL — `weatherMultiplier('rainy')` returns `1` (stub), and `driversFor` rejects the `weather` arg / `Driver` type has no `weather` variant (type error).

- [ ] **Step 3: Add the `WeatherCondition` import**

In `convex/lib/forecast.ts`, the first import is `import { DAY_MS, utcOfDayKey } from './time';` (line 1). Add below it:

```ts
import type { WeatherCondition } from './weather';
```

- [ ] **Step 4: Replace the `weatherMultiplier` stub**

Replace lines 54-56:

```ts
export function weatherMultiplier(): number {
  return 1; // stub in Slice A; Slice C wires a real weather signal
}
```

with:

```ts
// Tunable. Rain is the only globally-applicable foot-traffic effect for a cafe;
// hot/cool diverge per item (iced vs hot drinks) and are neutral until the C2c
// category-sensitivity taxonomy lands.
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

- [ ] **Step 5: Add the `weather` variant to the `Driver` type**

Replace the `Driver` type (lines 72-74):

```ts
export type Driver =
  | { code: 'dow_busy' | 'dow_quiet'; pct: number; dow: number }
  | { code: 'holiday'; pct: number; key: HolidayKey };
```

with:

```ts
export type Driver =
  | { code: 'dow_busy' | 'dow_quiet'; pct: number; dow: number }
  | { code: 'holiday'; pct: number; key: HolidayKey }
  | { code: 'weather'; pct: number; condition: WeatherCondition };
```

- [ ] **Step 6: Add the `weather?` param to `driversFor`**

Replace `driversFor` (lines 115-123):

```ts
export function driversFor(args: { dowMult: number; dow: number; holiday?: Driver }): Driver[] {
  const out: Driver[] = [];
  if (Math.abs(args.dowMult - 1) >= 0.1) {
    const pct = Math.round((args.dowMult - 1) * 100);
    out.push({ code: pct >= 0 ? 'dow_busy' : 'dow_quiet', pct, dow: args.dow });
  }
  if (args.holiday) out.push(args.holiday);
  return out.slice(0, 2);
}
```

with:

```ts
export function driversFor(args: { dowMult: number; dow: number; holiday?: Driver; weather?: Driver }): Driver[] {
  const out: Driver[] = [];
  if (Math.abs(args.dowMult - 1) >= 0.1) {
    const pct = Math.round((args.dowMult - 1) * 100);
    out.push({ code: pct >= 0 ? 'dow_busy' : 'dow_quiet', pct, dow: args.dow });
  }
  if (args.holiday) out.push(args.holiday);
  if (args.weather) out.push(args.weather);
  return out.slice(0, 2);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test -- forecast-engine`
Expected: PASS (all `weatherMultiplier` + `driversFor` cases green).

- [ ] **Step 8: Commit**

```bash
rtk proxy git add convex/lib/forecast.ts tests/convex/forecast-engine.test.ts
rtk proxy git commit -m "feat(forecast): weatherMultiplier(condition) + weather driver (C2b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Wire weather through the nightly forecast (schema + computeDemand + cron)

This is the cohesive end-to-end change: the schema must accept a `weather` driver in persisted lines, `computeDemand` must apply the signal, and the cron must fetch-then-persist so the test can feed weather in. They land together because none is independently testable.

**Files:**
- Modify: `convex/schema.ts:377-382` (drivers union)
- Modify: `convex/lib/demand.ts:1-16` (imports), `:32` (signature), `:74-94` (per-day + drivers)
- Modify: `convex/forecast.ts:8-9` (imports), `:58-100` (`persistForecast` + remove `attachWeatherSignal`), `:136-197` (`generateNightly`)
- Modify: `convex/_generated/*`
- Test: `tests/convex/forecast-cron.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/convex/forecast-cron.test.ts`, the `stubForecastFetch(days)` helper (lines 91-104) builds all-`hot` days. Add a rainy variant directly after it (after line 104). The dateKeys are built **relative to now** (tomorrow..today+days) with the same `dayKeyFn(TZ)` the engine uses — otherwise the stub's days won't line up with `computeDemand`'s `tomorrowKey` and the per-day weather lookup would miss. The file already imports `dayKeyFn` and defines `TZ`/`DAY`:

```ts
function stubRainyFetch(days: number) {
  const keyOf = dayKeyFn(TZ);
  const now = Date.now();
  const time: string[] = [];
  const temperature_2m_max: number[] = [];
  const precipitation_sum: number[] = [];
  for (let i = 0; i < days; i++) {
    time.push(keyOf(now + (i + 1) * DAY)); // tomorrow..today+days, matching futureKeys
    temperature_2m_max.push(28); // not hot
    precipitation_sum.push(10); // >= 5mm → rainy
  }
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ daily: { time, temperature_2m_max, precipitation_sum } }) })
  );
}
```

Then **replace** the existing "learning cafe with coordinates → no weather fetch" test (the last test in the `describe('generateNightly weather (C2a)', …)` block — it was added by the C2a #6 review and is now invalid under Approach A) with a weather-application test plus the corrected learning test:

```ts
  it('bakes the weather multiplier into the persisted lines (rain ⇒ lower qty)', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());

    // First run with NO weather → capture the dry-baseline tomorrowQty.
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await t.action(internal.forecast.generateNightly, {});
    const dry = await t.run((ctx) => ctx.db.query('forecasts').collect());
    const dryQty = dry[0]?.lines?.find((l) => l.name === 'Kopi')?.tomorrowQty ?? 0;
    expect(dryQty).toBeGreaterThan(0);
    vi.unstubAllGlobals();

    // Second run with coords + a rainy forecast → tomorrowQty should drop.
    await t.run((ctx) => ctx.db.patch(refs.cafeId, { latitude: -6.2, longitude: 106.8 }));
    stubRainyFetch(7);
    await t.action(internal.forecast.generateNightly, {});
    const wet = await t.run((ctx) => ctx.db.query('forecasts').collect());
    const latest = wet.sort((a, b) => b.generatedAt - a.generatedAt)[0];
    const wetLine = latest?.lines?.find((l) => l.name === 'Kopi');
    expect(latest?.weatherSignal?.every((d) => d.condition === 'rainy')).toBe(true);
    expect(wetLine?.tomorrowQty).toBe(Math.max(0, Math.round(dryQty * 0.85)));
    expect(wetLine?.drivers.some((d) => d.code === 'weather' && d.pct === -15)).toBe(true);
  });

  it('coord+learning cafe still fetches (Approach A) but persists learning with no signal', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 5, Date.now()); // < 14 days → learning
    await t.run((ctx) => ctx.db.patch(refs.cafeId, { latitude: -6.2, longitude: 106.8 }));
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ daily: { time: [], temperature_2m_max: [], precipitation_sum: [] } }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    await t.action(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    expect(forecasts[0]?.status).toBe('learning');
    expect(forecasts[0]?.weatherSignal).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalled(); // Approach A fetches before persisting
  });
```

> The "stores a weatherSignal when the cafe has coordinates", "no coordinates → no fetch", "fetch failure → degrades", and "fetch failure on one cafe…" tests in this block stay as-is — they remain valid under Approach A.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- forecast-cron`
Expected: FAIL — the rain test fails (weather isn't applied yet, so `wetLine.tomorrowQty === dryQty`, and no `weather` driver), and the rewritten learning test fails (`fetchSpy` not called, because the current code persists-first and skips the fetch for learning cafes).

- [ ] **Step 3: Add the `weather` variant to the schema drivers union**

In `convex/schema.ts`, replace the `forecasts.lines[].drivers` union (lines 377-382):

```ts
          drivers: v.array(
            v.union(
              v.object({ code: v.union(v.literal('dow_busy'), v.literal('dow_quiet')), pct: v.number(), dow: v.number() }),
              v.object({ code: v.literal('holiday'), pct: v.number(), key: v.string() })
            )
          ),
```

with (the file already imports `weatherSignalV` from `./lib/weather`; add `weatherConditionV` to that import — see Step 4):

```ts
          drivers: v.array(
            v.union(
              v.object({ code: v.union(v.literal('dow_busy'), v.literal('dow_quiet')), pct: v.number(), dow: v.number() }),
              v.object({ code: v.literal('holiday'), pct: v.number(), key: v.string() }),
              v.object({ code: v.literal('weather'), pct: v.number(), condition: weatherConditionV })
            )
          ),
```

- [ ] **Step 4: Import `weatherConditionV` in the schema**

In `convex/schema.ts`, find the existing weather import (`import { weatherSignalV } from './lib/weather';`) and change it to:

```ts
import { weatherConditionV, weatherSignalV } from './lib/weather';
```

- [ ] **Step 5: Apply the weather signal in `computeDemand`**

In `convex/lib/demand.ts`, add the `WeatherDay` type import. The imports from `./time` are on line 3 and from `./forecast` on lines 4-16. After the `./forecast` import block (after line 16), add:

```ts
import type { WeatherDay } from './weather';
```

Change the signature (line 32):

```ts
export async function computeDemand(ctx: QueryCtx | MutationCtx, cafeId: Id<'cafes'>): Promise<DemandResult> {
```

to:

```ts
export async function computeDemand(
  ctx: QueryCtx | MutationCtx,
  cafeId: Id<'cafes'>,
  weatherSignal?: WeatherDay[]
): Promise<DemandResult> {
```

Then, immediately after the `tomorrowKey` line (line 75, `const tomorrowKey = futureKeys[0]!;`), add the per-cafe condition map:

```ts
  const condByDate = new Map((weatherSignal ?? []).map((d) => [d.dateKey, d.condition]));
```

Change the `dayQty` closure (lines 85-86) from:

```ts
    const dayQty = (dk: string) =>
      predictedQty(base, dayOfWeekMultiplier(samples, dowOfKey(dk)), weatherMultiplier(), holidayMultiplier(dk).mult);
```

to:

```ts
    const dayQty = (dk: string) =>
      predictedQty(base, dayOfWeekMultiplier(samples, dowOfKey(dk)), weatherMultiplier(condByDate.get(dk)), holidayMultiplier(dk).mult);
```

Replace the drivers block (lines 89-94):

```ts
    const tomorrowHoliday = holidayMultiplier(tomorrowKey).driver;
    const drivers: Driver[] = driversFor({
      dowMult: dayOfWeekMultiplier(samples, dowOfKey(tomorrowKey)),
      dow: dowOfKey(tomorrowKey),
      ...(tomorrowHoliday ? { holiday: tomorrowHoliday } : {}),
    });
```

with:

```ts
    const tomorrowHoliday = holidayMultiplier(tomorrowKey).driver;
    const tomorrowCond = condByDate.get(tomorrowKey);
    const weatherMult = weatherMultiplier(tomorrowCond);
    const weatherDriver: Driver | undefined =
      tomorrowCond && Math.abs(weatherMult - 1) >= 0.1
        ? { code: 'weather', pct: Math.round((weatherMult - 1) * 100), condition: tomorrowCond }
        : undefined;
    const drivers: Driver[] = driversFor({
      dowMult: dayOfWeekMultiplier(samples, dowOfKey(tomorrowKey)),
      dow: dowOfKey(tomorrowKey),
      ...(tomorrowHoliday ? { holiday: tomorrowHoliday } : {}),
      ...(weatherDriver ? { weather: weatherDriver } : {}),
    });
```

- [ ] **Step 6: Make `persistForecast` accept + store the weather signal**

In `convex/forecast.ts`, change the weather import (line 9) to add the `WeatherDay` type:

```ts
import { type WeatherDay, parseForecast, weatherSignalV } from './lib/weather';
```

Replace the entire `persistForecast` block (lines 58-90, the doc comment through the closing `});`) with:

```ts
/**
 * Persist one cafe's nightly snapshot: a forecasts row (carrying the fetched
 * weatherSignal when present), plus a draft restockSuggestions row when the
 * forecast is ready and there's something to buy. Called once per cafe by
 * generateNightly. weatherSignal is threaded into computeDemand so the persisted
 * lines already reflect that day's weather (C2b).
 */
export const persistForecast = internalMutation({
  args: { cafeId: v.id('cafes'), weatherSignal: v.optional(weatherSignalV) },
  returns: v.null(),
  handler: async (ctx, { cafeId, weatherSignal }) => {
    const now = Date.now();
    const demand = await computeDemand(ctx, cafeId, weatherSignal);
    if (demand.status === 'ready') {
      const forecastId = await ctx.db.insert('forecasts', {
        cafeId, generatedAt: now, method: 'rule_v1', status: 'ready',
        forDateKey: demand.forDateKey, lines: demand.lines,
        ...(weatherSignal ? { weatherSignal } : {}),
      });
      const lines = await computeRestock(ctx, cafeId, demand.lines);
      if (lines.length > 0) {
        await ctx.db.insert('restockSuggestions', {
          cafeId, forecastId, generatedAt: now, status: 'draft', lines,
        });
      }
      return null;
    }
    await ctx.db.insert('forecasts', {
      cafeId, generatedAt: now, method: 'rule_v1', status: 'learning',
      daysCollected: demand.daysCollected, etaDateKey: demand.etaDateKey,
    });
    return null;
  },
});
```

- [ ] **Step 7: Remove `attachWeatherSignal`**

In `convex/forecast.ts`, delete the entire `attachWeatherSignal` block (the doc comment + `export const attachWeatherSignal = internalMutation({ … });`, originally lines 92-100). `listCafesForCron` (next block) is unchanged.

- [ ] **Step 8: Rewrite `generateNightly` to fetch-then-persist**

Replace the `generateNightly` handler body. The function's doc comment (originally lines 138-149) should be replaced too. Replace from the doc comment through the handler's closing, i.e. the block:

```ts
/**
 * Nightly forecast generation. An action (not a mutation) because it fetches
 * weather over HTTP (C2a). For each cafe: persist its forecast first, then —
 ... (through) ...
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    return null;
  },
});
```

with:

```ts
/**
 * Nightly forecast generation. An action (not a mutation) because it fetches
 * weather over HTTP. For each cafe with coordinates, fetch its 7-day Open-Meteo
 * forecast, then persist via persistForecast — passing the signal so computeDemand
 * bakes that day's weather into the lines (C2b). Each fetch is wrapped so one
 * failure (or the API being down) doesn't abort the others — that cafe simply
 * gets a forecast with no weatherSignal (§6.2 degradation). Cafes are paginated so
 * the cron never loads the whole all-tenant table at once; fetches are sequential
 * (fine at V1's cafe count).
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
        let weatherSignal: WeatherDay[] | undefined;
        if (cafe.latitude !== undefined && cafe.longitude !== undefined) {
          try {
            // Match the demand model's window exactly: tomorrow..today+7 keyed in
            // the cafe's own timezone (computeDemand keys days with dayKeyFn(tz)).
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
            if (days.length > 0) weatherSignal = days;
          } catch (err) {
            // Graceful degradation (§6.2): persist without weather; others proceed.
            console.warn(`weather fetch failed for cafe ${cafe.cafeId}:`, err);
          }
        }
        await ctx.runMutation(internal.forecast.persistForecast, {
          cafeId: cafe.cafeId,
          ...(weatherSignal ? { weatherSignal } : {}),
        });
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    return null;
  },
});
```

(The `CronCafe` type alias above `generateNightly` is unchanged and still used.)

- [ ] **Step 9: Regenerate types and run the tests**

Run: `./node_modules/.bin/convex codegen && pnpm test -- forecast-cron`
Expected: PASS — the rain test (tomorrowQty drops to `round(dryQty * 0.85)` with a `weather`/`-15` driver), the corrected learning test (fetch IS called, persists learning, no signal), and all retained C2a cron tests.

- [ ] **Step 10: Commit**

```bash
rtk proxy git add convex/schema.ts convex/lib/demand.ts convex/forecast.ts convex/_generated tests/convex/forecast-cron.test.ts
rtk proxy git commit -m "feat(forecast): apply weather signal in computeDemand; cron fetch-first (C2b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `demand` query — `weatherAvailable` flag + weather driver in the return

**Files:**
- Modify: `convex/forecast.ts:1-9` (import), `:11-15` (`driverV`), `:17-56` (`demand` query)
- Modify: `convex/_generated/*`
- Test: `tests/convex/forecast.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/convex/forecast.test.ts`, add a new describe block at the end of the file (after the closing `});` of `describe('forecast.demand', …)`, before EOF). It seeds a cafe, gives it coordinates, stubs a rainy fetch, runs the nightly action, and reads the served snapshot through the query:

First, at the TOP of the file, change the vitest import (line 2) to `import { afterEach, describe, expect, it, vi } from 'vitest';` and add `import { dayKeyFn } from '../../convex/lib/time';` next to the other imports. (`TZ` and `DAY` are already defined at the top.) Then append this block at the end of the file:

```ts
function stubRainyFetch(days: number) {
  const keyOf = dayKeyFn(TZ);
  const now = Date.now();
  const time: string[] = [];
  const temperature_2m_max: number[] = [];
  const precipitation_sum: number[] = [];
  for (let i = 0; i < days; i++) {
    time.push(keyOf(now + (i + 1) * DAY)); // tomorrow..today+days, matching futureKeys
    temperature_2m_max.push(28);
    precipitation_sum.push(10);
  }
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ daily: { time, temperature_2m_max, precipitation_sum } }) })
  );
}

describe('forecast.demand — weatherAvailable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('true and exposes the weather driver when the snapshot has a signal', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const now = Date.now();
    for (let d = 1; d <= 20; d++) {
      await seedOrder(t, refs, d, [{ menuItemId: refs.itemKopi, name: 'Kopi', qty: 10, price: 15000 }], now);
    }
    await t.run((ctx) => ctx.db.patch(refs.cafeId, { latitude: -6.2, longitude: 106.8 }));
    stubRainyFetch(7);
    await t.action(internal.forecast.generateNightly, {});
    const r = await refs.asOwner.query(api.forecast.demand, {});
    expect(r.status).toBe('ready');
    if (r.status === 'ready') {
      expect(r.weatherAvailable).toBe(true);
      const kopi = r.lines.find((l) => l.name === 'Kopi')!;
      expect(kopi.drivers.some((d) => d.code === 'weather')).toBe(true);
    }
  });

  it('false when the ready snapshot has no signal (no coordinates)', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const now = Date.now();
    for (let d = 1; d <= 20; d++) {
      await seedOrder(t, refs, d, [{ menuItemId: refs.itemKopi, name: 'Kopi', qty: 10, price: 15000 }], now);
    }
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await t.action(internal.forecast.generateNightly, {});
    const r = await refs.asOwner.query(api.forecast.demand, {});
    expect(r.status).toBe('ready');
    if (r.status === 'ready') expect(r.weatherAvailable).toBe(false);
  });

  it('false for a live-computed ready result (no snapshot yet)', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const now = Date.now();
    for (let d = 1; d <= 20; d++) {
      await seedOrder(t, refs, d, [{ menuItemId: refs.itemKopi, name: 'Kopi', qty: 10, price: 15000 }], now);
    }
    // No generateNightly run → the query computes live.
    const r = await refs.asOwner.query(api.forecast.demand, {});
    expect(r.status).toBe('ready');
    if (r.status === 'ready') expect(r.weatherAvailable).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- forecast.test`
Expected: FAIL — `r.weatherAvailable` is `undefined` (TS error: property doesn't exist on the ready type), and the query's return validator rejects a `weather` driver in `lines`.

- [ ] **Step 3: Add `weatherConditionV` to the forecast import**

In `convex/forecast.ts`, change the weather import (line 9, now `import { type WeatherDay, parseForecast, weatherSignalV } from './lib/weather';` after Task 2) to:

```ts
import { type WeatherDay, parseForecast, weatherConditionV, weatherSignalV } from './lib/weather';
```

- [ ] **Step 4: Add the `weather` variant to `driverV`**

Replace `driverV` (lines 12-15):

```ts
const driverV = v.union(
  v.object({ code: v.union(v.literal('dow_busy'), v.literal('dow_quiet')), pct: v.number(), dow: v.number() }),
  v.object({ code: v.literal('holiday'), pct: v.number(), key: v.string() })
);
```

with:

```ts
const driverV = v.union(
  v.object({ code: v.union(v.literal('dow_busy'), v.literal('dow_quiet')), pct: v.number(), dow: v.number() }),
  v.object({ code: v.literal('holiday'), pct: v.number(), key: v.string() }),
  v.object({ code: v.literal('weather'), pct: v.number(), condition: weatherConditionV })
);
```

- [ ] **Step 5: Add `weatherAvailable` to the `demand` query return + handler**

In the `demand` query's `returns`, add `weatherAvailable: v.boolean(),` to the **ready** object (after the `lines: v.array(...)` field, before the object's closing `})`):

```ts
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
      weatherAvailable: v.boolean(),
    })
```

Then update the handler (lines 36-54). Replace the snapshot ready return and the live-compute fallback:

```ts
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
```

with:

```ts
    if (snap) {
      if (snap.status === 'ready') {
        return {
          status: 'ready' as const,
          forDateKey: snap.forDateKey ?? '',
          lines: snap.lines ?? [],
          weatherAvailable: (snap.weatherSignal?.length ?? 0) > 0,
        };
      }
      return {
        status: 'learning' as const,
        daysCollected: snap.daysCollected ?? 0,
        daysNeeded: 14,
        etaDateKey: snap.etaDateKey ?? '',
      };
    }
    const live = await computeDemand(ctx, cafeId);
    return live.status === 'ready' ? { ...live, weatherAvailable: false } : live;
```

- [ ] **Step 6: Regenerate types and run the tests**

Run: `./node_modules/.bin/convex codegen && pnpm test -- forecast.test`
Expected: PASS — `weatherAvailable` is `true` for a rainy snapshot (with a `weather` driver in the line), `false` for a signal-less ready snapshot, and `false` for a live-computed ready result.

- [ ] **Step 7: Commit**

```bash
rtk proxy git add convex/forecast.ts convex/_generated tests/convex/forecast.test.ts
rtk proxy git commit -m "feat(forecast): demand query exposes weatherAvailable + weather driver (C2b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Frontend — weather driver chip + "Data cuaca tidak tersedia." note

**Files:**
- Modify: `src/components/forecast/render-driver.tsx:5-7` (type), `:30-38` (render)
- Modify: `src/routes/_pos/forecast.tsx:144-153` (note)

This task is verified by `pnpm typecheck` (the repo has no React component tests — `tests/` is convex-only). The strings are extracted/filled in Task 5.

- [ ] **Step 1: Extend the client driver type**

In `src/components/forecast/render-driver.tsx`, replace the `ForecastDriver` type (lines 5-7):

```ts
export type ForecastDriver =
  | { code: 'dow_busy' | 'dow_quiet'; pct: number; dow: number }
  | { code: 'holiday'; pct: number; key: string };
```

with:

```ts
export type ForecastDriver =
  | { code: 'dow_busy' | 'dow_quiet'; pct: number; dow: number }
  | { code: 'holiday'; pct: number; key: string }
  | { code: 'weather'; pct: number; condition: 'hot' | 'rainy' | 'cool' | 'normal' };
```

- [ ] **Step 2: Render the weather driver**

In the same file, replace the `RenderDriver` function (lines 30-38):

```ts
/** Renders a single forecast driver as a localized line. */
export function RenderDriver({ driver }: { driver: ForecastDriver }) {
  if (driver.code === 'holiday') return <HolidayText pct={driver.pct} hkey={driver.key} />;
  const day = DAY_NAMES[driver.dow] ?? '';
  return driver.code === 'dow_busy' ? (
    <Trans>+{driver.pct}% — biasanya ramai di hari {day}</Trans>
  ) : (
    <Trans>{driver.pct}% — biasanya sepi di hari {day}</Trans>
  );
}
```

with:

```ts
/** Renders a single forecast driver as a localized line. */
export function RenderDriver({ driver }: { driver: ForecastDriver }) {
  if (driver.code === 'holiday') return <HolidayText pct={driver.pct} hkey={driver.key} />;
  if (driver.code === 'weather') {
    if (driver.condition === 'rainy') return <Trans>Hujan — perkiraan turun {Math.abs(driver.pct)}%</Trans>;
    // Defensive: only 'rainy' is emitted in C2b; the C2c taxonomy may add hot/cool.
    return driver.pct >= 0 ? (
      <Trans>Cuaca — perkiraan naik {driver.pct}%</Trans>
    ) : (
      <Trans>Cuaca — perkiraan turun {Math.abs(driver.pct)}%</Trans>
    );
  }
  const day = DAY_NAMES[driver.dow] ?? '';
  return driver.code === 'dow_busy' ? (
    <Trans>+{driver.pct}% — biasanya ramai di hari {day}</Trans>
  ) : (
    <Trans>{driver.pct}% — biasanya sepi di hari {day}</Trans>
  );
}
```

- [ ] **Step 3: Add the "Data cuaca tidak tersedia." note**

In `src/routes/_pos/forecast.tsx`, the ready branch opens with `<div className="mt-4 space-y-4">` (line 145) containing the horizon toggle `<div className="flex gap-2">…</div>` (lines 146-153). Insert the note immediately after that horizon-toggle `</div>` (after line 153, before the `<ul …>` on line 154):

```tsx
          {!data.weatherAvailable ? (
            <p className="text-xs text-muted-foreground">
              <Trans>Data cuaca tidak tersedia.</Trans>
            </p>
          ) : null}
```

(`data` is narrowed to the ready variant here, so `data.weatherAvailable` is typed. `Trans` is already imported in this file.)

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk proxy git add src/components/forecast/render-driver.tsx src/routes/_pos/forecast.tsx
rtk proxy git commit -m "feat(forecast): weather driver chip + data-unavailable note (C2b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: i18n — extract, fill English, compile

**Files:**
- Modify: `src/locales/id/messages.po`, `src/locales/en/messages.po` (+ regenerated `.mjs`)

New Indonesian source strings from Task 4: `Hujan — perkiraan turun {0}%`, `Cuaca — perkiraan naik {0}%`, `Cuaca — perkiraan turun {0}%`, `Data cuaca tidak tersedia.` (Lingui renders `{Math.abs(driver.pct)}` / `{driver.pct}` as the `{0}` placeholder.)

- [ ] **Step 1: Extract new messages**

Run: `pnpm lingui:extract`
Expected: the four new messages are added to both `src/locales/id/messages.po` and `src/locales/en/messages.po`. Verify each new `id` catalog entry has a non-empty `msgstr` matching its `msgid` (the existing convention).

- [ ] **Step 2: Fill the English translations**

In `src/locales/en/messages.po`, fill each new empty `msgstr` (register matches the existing `… — expected down {0}%` drivers):

| msgid (id source) | msgstr (en) |
|---|---|
| `Hujan — perkiraan turun {0}%` | `Rain — expected down {0}%` |
| `Cuaca — perkiraan naik {0}%` | `Weather — expected up {0}%` |
| `Cuaca — perkiraan turun {0}%` | `Weather — expected down {0}%` |
| `Data cuaca tidak tersedia.` | `Weather data unavailable.` |

- [ ] **Step 3: Compile catalogs**

Run: `pnpm lingui:compile`
Expected: compiles both locales without "missing translation" warnings for the new strings.

- [ ] **Step 4: Commit**

```bash
rtk proxy git add src/locales
rtk proxy git commit -m "i18n(forecast): weather driver + data-unavailable strings (C2b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (before PR)

- [ ] **Run the full gate locally**

Run: `pnpm typecheck && pnpm test && pnpm lingui:compile`
Expected: all green. Confirm no uncommitted `convex/_generated` drift: `rtk proxy git status` is clean.

- [ ] **Confirm the dispatch summary covers the spec:**
  - Engine `weatherMultiplier(condition)` + weather driver (Task 1) ✓
  - Schema drivers variant + `computeDemand` applies weather + cron fetch-first (Task 2) ✓
  - `demand` query `weatherAvailable` + weather driver in return (Task 3) ✓
  - Weather chip + "Data cuaca tidak tersedia." note (Task 4) ✓
  - i18n (Task 5) ✓
  - Out of scope (category sensitivity taxonomy, hot/cool divergence) — correctly NOT in this plan (→ C2c).

---

## Self-Review notes

- **Spec coverage:** engine multiplier + driver (Task 1); `computeDemand` application + nightly fetch-first single pass / Approach A (Task 2); `weatherAvailable` read path (Task 3); UI chip + note (Task 4); i18n (Task 5). The spec-missed schema constraint (`forecasts.lines[].drivers` must accept `weather`) is handled in Task 2 Steps 3-4. ✓
- **Type consistency:** the `weather` driver shape `{ code: 'weather'; pct; condition }` is identical across `Driver` (lib/forecast.ts, Task 1), the schema union (Task 2), `driverV` (Task 3), and the client `ForecastDriver` (Task 4). `weatherMultiplier(condition?)` signature is used consistently in demand.ts (Task 2). `persistForecast` args `{ cafeId, weatherSignal? }` match `generateNightly`'s `runMutation` call. `computeDemand`'s new third param is optional, so the live `demand`-query call site (no weather) still type-checks. ✓
- **No placeholders:** every code step shows full code; every run step shows the command + expected result. ✓
- **#6 reconciliation:** the C2a review's "learning cafe → no fetch" test is explicitly rewritten in Task 2 Step 1 (Approach A fetches before persisting). ✓
