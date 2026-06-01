# Predictive Demand — Slice A (forecast engine + live /forecast page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner-only `/forecast` page that, live from sales history, shows tomorrow's predicted demand per menu item (and a 7-day total), each with a confidence label and plain-Bahasa drivers — or a cold-start "sedang belajar" message under 14 days of data.

**Architecture:** A pure rule-based engine in `convex/lib/forecast.ts` (base estimate × day-of-week × holiday × weather-stub), driven by a `forecast.demand` Convex query that scans 56 days of paid orders and runs the engine per item for the next 7 local days. The page renders demand cards; structured "driver" codes from the engine are localized client-side. No weather API and no cron in this slice (Slice C).

**Tech Stack:** React 19, TanStack Router, Convex + convex-test, Tailwind v4, Lingui (id source / en target), shadcn/ui kit, Vitest, Playwright. Package manager: **pnpm**. Branch: `feat/forecast-engine` (off `main`, already has the design-spec commit `d941f45`).

---

## Conventions for the implementing engineer (read once)

- **pnpm**; `~` = `src/`, `convex/...` for backend/generated. Convex codegen: `./node_modules/.bin/convex codegen` (NOT npx); commit `convex/_generated/*` drift.
- **Branch:** `feat/forecast-engine` (already created off `main`). Stay on it.
- **i18n:** author Indonesian; `<Trans>` in JSX, `` t`…` `` for attributes. Task 8 runs extract/fill/compile. The engine emits NO prose — only structured driver codes; the client renders localized text.
- **Strict TS:** `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Build optional object fields via conditional spread.
- **Empty states use shadcn `Empty`** (project convention).
- **`StatusBadge` variants are `success | warn | danger | muted`** (no "default"). Confidence maps: high→success, med→warn, low→muted.
- **dow convention is `0=Mon … 6=Sun`** everywhere in this feature.
- **Run before any push:** `pnpm lingui:extract` → fill `en` → `pnpm typecheck && pnpm test && pnpm lingui:compile`.
- **Commit style:** small Conventional Commits ending with a blank line then:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File structure

**New:** `convex/lib/forecast.ts` (+ `tests/convex/forecast-engine.test.ts`), `convex/forecast.ts` (+ `tests/convex/forecast.test.ts`), `src/components/forecast/render-driver.tsx`, `src/routes/_pos/forecast.tsx`.
**Modified:** `convex/lib/time.ts` (+ `dowOfKey`/`addDaysToKey`) + `tests/convex/time.test.ts`, `convex/_generated/*` (codegen), `src/components/app-shared.tsx` (nav entry), Lingui catalogs, `tests/e2e/sale.spec.ts`.

---

## Task 1: time.ts helpers — `dowOfKey` + `addDaysToKey`

**Files:** Modify `convex/lib/time.ts`; append to `tests/convex/time.test.ts`.

- [ ] **Step 1: Write the failing tests** — append to `tests/convex/time.test.ts`:
```ts
import { dowOfKey, addDaysToKey } from '../../convex/lib/time';

describe('dowOfKey (0=Mon..6=Sun)', () => {
  it('maps known dates', () => {
    expect(dowOfKey('2026-06-01')).toBe(0); // Monday
    expect(dowOfKey('2026-06-06')).toBe(5); // Saturday
    expect(dowOfKey('2026-06-07')).toBe(6); // Sunday
  });
});

describe('addDaysToKey', () => {
  it('adds days across a month boundary', () => {
    expect(addDaysToKey('2026-05-30', 3)).toBe('2026-06-02');
  });
  it('subtracts with negative n', () => {
    expect(addDaysToKey('2026-06-02', -3)).toBe('2026-05-30');
  });
  it('zero is identity', () => {
    expect(addDaysToKey('2026-06-01', 0)).toBe('2026-06-01');
  });
});
```
(Extend the existing top import in the file to include `dowOfKey, addDaysToKey`, or add the import line shown — match the file's existing import style.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- tests/convex/time.test.ts`
Expected: FAIL — `dowOfKey`/`addDaysToKey` not exported.

- [ ] **Step 3: Implement** — append to `convex/lib/time.ts`:
```ts
/** Weekday of a calendar day key, 0=Mon .. 6=Sun. */
export function dowOfKey(dateKey: string): number {
  const utcDow = new Date(utcOfDayKey(dateKey)).getUTCDay(); // 0=Sun..6=Sat
  return (utcDow + 6) % 7; // shift to 0=Mon..6=Sun
}

/** Calendar day key `n` days after `dateKey` (n may be negative). */
export function addDaysToKey(dateKey: string, n: number): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date(utcOfDayKey(dateKey) + n * DAY_MS));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- tests/convex/time.test.ts`
Expected: PASS (existing time tests + new ones).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/time.ts tests/convex/time.test.ts
git commit -m "feat(forecast): add dowOfKey + addDaysToKey time helpers"
```

---

## Task 2: forecast engine — core stats

**Files:** Create `convex/lib/forecast.ts`, `tests/convex/forecast-engine.test.ts` (pure convex-helper tests live in `tests/convex/`, matching `pricing.test.ts`/`time.test.ts` — the vitest config covers `tests/`, not `convex/lib/`).

- [ ] **Step 1: Write the failing tests** — create `tests/convex/forecast-engine.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  type DaySample,
  baseEstimate,
  coeffOfVariation,
  confidence,
  dayOfWeekMultiplier,
  predictedQty,
  weatherMultiplier,
} from '../../convex/lib/forecast';

const sample = (daysAgo: number, dow: number, qty: number): DaySample => ({ daysAgo, dow, qty });

describe('baseEstimate', () => {
  it('empty → 0', () => {
    expect(baseEstimate([])).toBe(0);
  });
  it('constant series → that constant', () => {
    const s = Array.from({ length: 20 }, (_, i) => sample(i, 0, 10));
    expect(baseEstimate(s)).toBeCloseTo(10, 5);
  });
  it('weights recent days more (exp decay)', () => {
    // recent (daysAgo 0) = 20, old (daysAgo 27) = 0, rest = 0 → weighted toward recent > simple mean
    const s = [sample(0, 0, 20), ...Array.from({ length: 9 }, (_, i) => sample(i + 1, 0, 0))];
    const est = baseEstimate(s);
    const simpleMean = 20 / 10;
    expect(est).toBeGreaterThan(simpleMean);
  });
  it('trims extremes when n >= 10', () => {
    // 18 tens + one 1000 outlier; trimmed mean stays near 10, untrimmed would spike
    const s = [
      ...Array.from({ length: 18 }, (_, i) => sample(i, 0, 10)),
      sample(18, 0, 1000),
    ];
    expect(baseEstimate(s)).toBeLessThan(50);
  });
});

describe('dayOfWeekMultiplier', () => {
  it('< 2 weeks of data → 1', () => {
    const s = [sample(0, 0, 5), sample(1, 1, 5)];
    expect(dayOfWeekMultiplier(s, 0)).toBe(1);
  });
  it('busier weekday → >1, clamped to 2', () => {
    // Saturdays (dow 5) sell 20, other days 5, spanning >2 weeks
    const s = [
      sample(0, 5, 20), sample(1, 4, 5), sample(7, 5, 20), sample(8, 4, 5),
      sample(14, 5, 20), sample(15, 4, 5),
    ];
    const m = dayOfWeekMultiplier(s, 5);
    expect(m).toBeGreaterThan(1);
    expect(m).toBeLessThanOrEqual(2);
  });
  it('overall avg 0 → 1', () => {
    const s = [sample(0, 0, 0), sample(7, 1, 0)];
    expect(dayOfWeekMultiplier(s, 0)).toBe(1);
  });
});

describe('coeffOfVariation', () => {
  it('constant → 0', () => {
    expect(coeffOfVariation([5, 5, 5])).toBeCloseTo(0, 5);
  });
  it('mean 0 → Infinity', () => {
    expect(coeffOfVariation([0, 0])).toBe(Infinity);
  });
});

describe('confidence', () => {
  it('high needs span>=21 and CoV<0.5', () => {
    expect(confidence(21, 0.4)).toBe('high');
    expect(confidence(21, 0.6)).toBe('med');
  });
  it('med needs span>=14 and CoV<1.0', () => {
    expect(confidence(14, 0.9)).toBe('med');
    expect(confidence(13, 0.2)).toBe('low');
    expect(confidence(30, 1.5)).toBe('low');
  });
});

describe('predictedQty', () => {
  it('rounds and clamps to >= 0', () => {
    expect(predictedQty(10, 1.2, 1, 1)).toBe(12);
    expect(predictedQty(10, 0, 1, 0.2)).toBe(0);
    expect(predictedQty(2.4, 1, 1, 1)).toBe(2);
  });
});

describe('weatherMultiplier', () => {
  it('is the 1.0 stub in slice A', () => {
    expect(weatherMultiplier()).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- tests/convex/forecast-engine.test.ts`
Expected: FAIL — `./forecast` does not exist.

- [ ] **Step 3: Implement** — create `convex/lib/forecast.ts`:
```ts
export type Confidence = 'low' | 'med' | 'high';

// An item's qty on each ACTIVE day (a day the cafe had >=1 paid order).
// daysAgo = integer offset from today (0=today); dow = 0=Mon..6=Sun; qty = units (0 allowed).
export type DaySample = { daysAgo: number; dow: number; qty: number };

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** stddev / mean over `values`; Infinity when mean is 0. */
export function coeffOfVariation(values: number[]): number {
  if (values.length === 0) return Infinity;
  const m = mean(values);
  if (m === 0) return Infinity;
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance) / m;
}

/** Exp-decay weighted, trimmed mean of qty over the trailing 28 active days. */
export function baseEstimate(samples: DaySample[], lambda = 0.05): number {
  if (samples.length === 0) return 0;
  const recent = [...samples].sort((a, b) => a.daysAgo - b.daysAgo).slice(0, 28);
  const drop = Math.floor(0.1 * recent.length);
  const byQty = [...recent].sort((a, b) => a.qty - b.qty);
  // Trim outliers only once there are >=14 days; with sparser data a single
  // recent sale must not be trimmed away (it carries the recency signal).
  const pool = recent.length >= 14 && drop > 0 ? byQty.slice(drop, byQty.length - drop) : recent;
  let wsum = 0;
  let num = 0;
  for (const s of pool) {
    const w = Math.exp(-lambda * s.daysAgo);
    wsum += w;
    num += w * s.qty;
  }
  return wsum === 0 ? 0 : num / wsum;
}

/** Ratio of avg qty on `forDow` to overall avg over the trailing 8 weeks. */
export function dayOfWeekMultiplier(samples: DaySample[], forDow: number): number {
  if (samples.length === 0) return 1;
  const weeks = new Set(samples.map((s) => Math.floor(s.daysAgo / 7)));
  if (weeks.size < 2) return 1;
  const overall = mean(samples.map((s) => s.qty));
  if (overall === 0) return 1;
  const onDow = samples.filter((s) => s.dow === forDow).map((s) => s.qty);
  if (onDow.length === 0) return 1;
  const mult = mean(onDow) / overall;
  return Math.min(2, Math.max(0.5, mult));
}

export function weatherMultiplier(): number {
  return 1; // stub in Slice A; Slice C wires a real weather signal
}

export function confidence(itemSpanDays: number, cov: number): Confidence {
  if (itemSpanDays >= 21 && cov < 0.5) return 'high';
  if (itemSpanDays >= 14 && cov < 1.0) return 'med';
  return 'low';
}

export function predictedQty(base: number, dow: number, weather: number, holiday: number): number {
  return Math.max(0, Math.round(base * dow * weather * holiday));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- tests/convex/forecast-engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/forecast.ts tests/convex/forecast-engine.test.ts
git commit -m "feat(forecast): add core stats engine (base/dow/confidence/predict)"
```

---

## Task 3: forecast engine — holidays + drivers

**Files:** Modify `convex/lib/forecast.ts`; append to `tests/convex/forecast-engine.test.ts`.

- [ ] **Step 1: Write the failing tests** — append to `tests/convex/forecast-engine.test.ts`:
```ts
import { holidayMultiplier, driversFor, type Driver } from '../../convex/lib/forecast';

describe('holidayMultiplier', () => {
  it('Lebaran three-day rule', () => {
    expect(holidayMultiplier('2026-03-19').mult).toBe(0.5);
    expect(holidayMultiplier('2026-03-20').mult).toBe(0.2);
    expect(holidayMultiplier('2026-03-21').mult).toBe(1.2);
    expect(holidayMultiplier('2026-03-20').driver).toEqual({ code: 'holiday', pct: -80, key: 'lebaran_day' });
  });
  it('fixed-date nationals by MM-DD across years', () => {
    expect(holidayMultiplier('2026-08-17').mult).toBe(0.7);
    expect(holidayMultiplier('2027-12-25').mult).toBe(0.8);
    expect(holidayMultiplier('2026-01-01').driver).toEqual({ code: 'holiday', pct: -20, key: 'new_year' });
  });
  it('ordinary weekday → 1, no driver', () => {
    expect(holidayMultiplier('2026-06-03')).toEqual({ mult: 1 });
  });
  it('weekend within 2 days of a holiday → 1.1, no driver key', () => {
    // 2026-08-15 is the Saturday two days before 08-17 (Mon)
    expect(holidayMultiplier('2026-08-15')).toEqual({ mult: 1.1 });
  });
  it('weekend NOT near a holiday → 1', () => {
    expect(holidayMultiplier('2026-06-06').mult).toBe(1); // a plain Saturday
  });
});

describe('driversFor', () => {
  it('emits a busy dow driver past the 0.1 threshold', () => {
    expect(driversFor({ dowMult: 1.2, dow: 5 })).toEqual([{ code: 'dow_busy', pct: 20, dow: 5 }]);
  });
  it('emits a quiet dow driver for < 1', () => {
    expect(driversFor({ dowMult: 0.8, dow: 1 })).toEqual([{ code: 'dow_quiet', pct: -20, dow: 1 }]);
  });
  it('suppresses dow driver within the +/-0.1 deadband', () => {
    expect(driversFor({ dowMult: 1.05, dow: 2 })).toEqual([]);
  });
  it('includes the holiday driver and caps at 2', () => {
    const holiday: Driver = { code: 'holiday', pct: -80, key: 'lebaran_day' };
    expect(driversFor({ dowMult: 1.3, dow: 6, holiday })).toEqual([
      { code: 'dow_busy', pct: 30, dow: 6 },
      holiday,
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- tests/convex/forecast-engine.test.ts`
Expected: FAIL — `holidayMultiplier`/`driversFor`/`Driver` not exported.

- [ ] **Step 3: Implement** — add to `convex/lib/forecast.ts`. First extend the import at the top of the file (add a new import line):
```ts
import { DAY_MS, utcOfDayKey } from './time';
```
Then append:
```ts
export type HolidayKey =
  | 'lebaran_eve' | 'lebaran_day' | 'lebaran_after'
  | 'independence' | 'christmas' | 'new_year';

export type Driver =
  | { code: 'dow_busy' | 'dow_quiet'; pct: number; dow: number }
  | { code: 'holiday'; pct: number; key: HolidayKey };

// Fixed-date holidays keyed by MM-DD.
const FIXED: Record<string, { mult: number; key: HolidayKey }> = {
  '08-17': { mult: 0.7, key: 'independence' },
  '12-25': { mult: 0.8, key: 'christmas' },
  '01-01': { mult: 0.8, key: 'new_year' },
};
// Lebaran is lunar — list per-year (extend as future dates become known).
const LEBARAN: Record<string, { mult: number; key: HolidayKey }> = {
  '2026-03-19': { mult: 0.5, key: 'lebaran_eve' },
  '2026-03-20': { mult: 0.2, key: 'lebaran_day' },
  '2026-03-21': { mult: 1.2, key: 'lebaran_after' },
};

function holidayDriver(mult: number, key: HolidayKey): Driver {
  return { code: 'holiday', pct: Math.round((mult - 1) * 100), key };
}

function isWeekendNearHoliday(dateKey: string): boolean {
  const t = utcOfDayKey(dateKey);
  const utcDow = new Date(t).getUTCDay(); // 0=Sun..6=Sat
  if (utcDow !== 0 && utcDow !== 6) return false;
  const year = dateKey.slice(0, 4);
  const holidays = [...Object.keys(LEBARAN), ...Object.keys(FIXED).map((mmdd) => `${year}-${mmdd}`)];
  return holidays.some((hk) => Math.abs(utcOfDayKey(hk) - t) <= 2 * DAY_MS);
}

/** Holiday multiplier + optional driver for a calendar day key. */
export function holidayMultiplier(dateKey: string): { mult: number; driver?: Driver } {
  const leb = LEBARAN[dateKey];
  if (leb) return { mult: leb.mult, driver: holidayDriver(leb.mult, leb.key) };
  const fixed = FIXED[dateKey.slice(5)];
  if (fixed) return { mult: fixed.mult, driver: holidayDriver(fixed.mult, fixed.key) };
  if (isWeekendNearHoliday(dateKey)) return { mult: 1.1 };
  return { mult: 1 };
}

/** Up to 2 structured drivers for a prediction (dow first, then holiday). */
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

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- tests/convex/forecast-engine.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/forecast.ts tests/convex/forecast-engine.test.ts
git commit -m "feat(forecast): add holiday table + structured drivers"
```

---

## Task 4: `forecast.demand` query

**Files:** Create `convex/forecast.ts`, `tests/convex/forecast.test.ts`.

- [ ] **Step 1: Write the failing tests** — create `tests/convex/forecast.test.ts`. The helper seeds an owner + cafe (Asia/Jakarta) + cashier + shift + item, and inserts paid orders at instants relative to `Date.now()` (the query also uses `Date.now()`, so offsets stay consistent within the run). Assertions are structural (status, line count, ordering) — exact qty is covered by the pure engine tests.
```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');
const TZ = 'Asia/Jakarta';
const DAY = 86_400_000;

type Refs = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
  shiftId: Id<'shifts'>;
  itemKopi: Id<'menuItems'>;
  itemTeh: Id<'menuItems'>;
};

// Two REAL menu items are created (convex-test validates v.id() on insert, and
// the forecast query groups by menuItemId — fabricated/shared ids would fail
// validation or merge distinct items into one line).
async function setup(t: ReturnType<typeof convexTest>, email = 'o@x.com'): Promise<Refs> {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, { name: 'Kopi Senja', timezone: TZ, taxRatePct: 0, taxEnabled: false });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id as Id<'cafes'>;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Minuman' });
  const itemKopi = await asOwner.mutation(api.menu.items.create, { categoryId, name: 'Kopi', priceIDR: 15000 });
  const itemTeh = await asOwner.mutation(api.menu.items.create, { categoryId, name: 'Teh', priceIDR: 10000 });
  return { asOwner, cafeId, cashierId, shiftId, itemKopi, itemTeh };
}

type SeedLine = { menuItemId: Id<'menuItems'>; name: string; qty: number; price: number };

// One paid order on the day `daysAgo` local days before now (same time-of-day,
// so each daysAgo is a distinct local day).
async function seedOrder(
  t: ReturnType<typeof convexTest>,
  refs: Refs,
  daysAgo: number,
  lines: SeedLine[],
  nowMs: number
) {
  const at = nowMs - daysAgo * DAY;
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  await t.run((ctx) =>
    ctx.db.insert('orders', {
      cafeId: refs.cafeId,
      shiftId: refs.shiftId,
      cashierId: refs.cashierId,
      clientId: `c-${daysAgo}-${Math.round(total)}`,
      lines: lines.map((l) => ({
        menuItemId: l.menuItemId,
        nameSnapshot: l.name,
        qty: l.qty,
        unitPriceIDR: l.price,
        modifiersSnapshot: [],
        lineTotalIDR: l.qty * l.price,
      })),
      subtotalIDR: total,
      taxRatePct: 0,
      taxIDR: 0,
      discountIDR: 0,
      totalIDR: total,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      createdAtClient: at,
      syncedAt: at,
    })
  );
}

describe('forecast.demand', () => {
  it('cold-start: fewer than 14 active days → learning', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const now = Date.now();
    for (let d = 1; d <= 5; d++) {
      await seedOrder(t, refs, d, [{ menuItemId: refs.itemKopi, name: 'Kopi', qty: 3, price: 15000 }], now);
    }
    const r = await refs.asOwner.query(api.forecast.demand, {});
    expect(r.status).toBe('learning');
    if (r.status === 'learning') {
      expect(r.daysCollected).toBe(5);
      expect(r.daysNeeded).toBe(14);
      expect(typeof r.etaDateKey).toBe('string');
    }
  });

  it('ready: >=14 active days → per-item lines sorted by tomorrowQty desc', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const now = Date.now();
    for (let d = 1; d <= 20; d++) {
      await seedOrder(t, refs, d, [
        { menuItemId: refs.itemKopi, name: 'Kopi', qty: 10, price: 15000 },
        { menuItemId: refs.itemTeh, name: 'Teh', qty: 2, price: 10000 },
      ], now);
    }
    const r = await refs.asOwner.query(api.forecast.demand, {});
    expect(r.status).toBe('ready');
    if (r.status === 'ready') {
      const names = r.lines.map((l) => l.name);
      expect(names).toContain('Kopi');
      expect(names).toContain('Teh');
      expect(r.lines[0]?.name).toBe('Kopi'); // higher demand sorts first
      const kopi = r.lines.find((l) => l.name === 'Kopi')!;
      expect(kopi.tomorrowQty).toBeGreaterThan(0);
      expect(kopi.sevenDayQty).toBeGreaterThanOrEqual(kopi.tomorrowQty);
    }
  });

  it('cafe B (no orders) is tenant-isolated → learning', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'a@x.com');
    const now = Date.now();
    for (let d = 1; d <= 20; d++) {
      await seedOrder(t, a, d, [{ menuItemId: a.itemKopi, name: 'Kopi', qty: 5, price: 15000 }], now);
    }
    const b = await setup(t, 'b@x.com');
    const rb = await b.asOwner.query(api.forecast.demand, {});
    expect(rb.status).toBe('learning'); // cafe B sees none of cafe A's orders
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- tests/convex/forecast.test.ts`
Expected: FAIL — `api.forecast` does not exist.

- [ ] **Step 3: Implement** — create `convex/forecast.ts`:
```ts
import { v } from 'convex/values';
import { query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireOwnerCafe } from './lib/auth';
import { DAY_MS, addDaysToKey, dayKeyFn, dowOfKey, startOfLocalDay, tzFor, utcOfDayKey } from './lib/time';
import {
  type DaySample,
  type Driver,
  baseEstimate,
  coeffOfVariation,
  confidence,
  dayOfWeekMultiplier,
  driversFor,
  holidayMultiplier,
  predictedQty,
  weatherMultiplier,
} from './lib/forecast';

const confidenceV = v.union(v.literal('low'), v.literal('med'), v.literal('high'));
const driverV = v.union(
  v.object({ code: v.union(v.literal('dow_busy'), v.literal('dow_quiet')), pct: v.number(), dow: v.number() }),
  v.object({ code: v.literal('holiday'), pct: v.number(), key: v.string() })
);

export const demand = query({
  args: {},
  returns: v.union(
    v.object({
      status: v.literal('learning'),
      daysCollected: v.number(),
      daysNeeded: v.number(),
      etaDateKey: v.string(),
    }),
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
    const tz = await tzFor(ctx, cafeId);
    const now = Date.now();
    const windowStart = startOfLocalDay(tz, 55, now);
    const rows = await ctx.db
      .query('orders')
      .withIndex('by_cafe_created', (q) => q.eq('cafeId', cafeId).gte('createdAtClient', windowStart))
      .collect();
    const paid = rows.filter((o) => o.paymentStatus === 'paid');

    const keyOf = dayKeyFn(tz);
    const todayKey = keyOf(now);
    const todayUtc = utcOfDayKey(todayKey);
    const daysAgoOf = (dk: string) => Math.round((todayUtc - utcOfDayKey(dk)) / DAY_MS);

    // Active days + per-item qty-by-day + display name.
    const activeKeys = new Set<string>();
    type Item = { name: string; byDay: Map<string, number> };
    const items = new Map<string, Item>(); // key = menuItemId
    for (const o of paid) {
      const dk = keyOf(o.createdAtClient);
      activeKeys.add(dk);
      for (const l of o.lines) {
        const id = l.menuItemId as string;
        let it = items.get(id);
        if (!it) {
          it = { name: l.nameSnapshot, byDay: new Map() };
          items.set(id, it);
        }
        it.name = l.nameSnapshot; // latest snapshot wins
        it.byDay.set(dk, (it.byDay.get(dk) ?? 0) + l.qty);
      }
    }

    const daysCollected = activeKeys.size;
    if (daysCollected < 14) {
      const firstKey = [...activeKeys].sort()[0] ?? todayKey;
      return {
        status: 'learning' as const,
        daysCollected,
        daysNeeded: 14,
        etaDateKey: addDaysToKey(firstKey, 14),
      };
    }

    // Shared active-day axis (recent first), each carrying daysAgo + dow.
    const axis = [...activeKeys]
      .map((dk) => ({ dk, daysAgo: daysAgoOf(dk), dow: dowOfKey(dk) }))
      .sort((a, b) => a.daysAgo - b.daysAgo);

    // The next 7 local days (tomorrow = +1).
    const futureKeys = Array.from({ length: 7 }, (_, i) => keyOf(now + (i + 1) * DAY_MS));
    const tomorrowKey = futureKeys[0]!;

    const lines = [];
    for (const [id, it] of items) {
      const samples: DaySample[] = axis.map((a) => ({ daysAgo: a.daysAgo, dow: a.dow, qty: it.byDay.get(a.dk) ?? 0 }));
      const base = baseEstimate(samples);

      // Confidence over the item's data span (first sale → most recent active day).
      const soldDaysAgo = axis.filter((a) => (it.byDay.get(a.dk) ?? 0) > 0).map((a) => a.daysAgo);
      const firstSaleDaysAgo = soldDaysAgo.length ? Math.max(...soldDaysAgo) : 0;
      const spanQtys = samples.filter((s) => s.daysAgo <= firstSaleDaysAgo).map((s) => s.qty);
      const conf = confidence(spanQtys.length, coeffOfVariation(spanQtys));

      const dayQty = (dk: string) =>
        predictedQty(base, dayOfWeekMultiplier(samples, dowOfKey(dk)), weatherMultiplier(), holidayMultiplier(dk).mult);
      const tomorrowQty = dayQty(tomorrowKey);
      const sevenDayQty = futureKeys.reduce((s, dk) => s + dayQty(dk), 0);

      const drivers: Driver[] = driversFor({
        dowMult: dayOfWeekMultiplier(samples, dowOfKey(tomorrowKey)),
        dow: dowOfKey(tomorrowKey),
        ...(holidayMultiplier(tomorrowKey).driver ? { holiday: holidayMultiplier(tomorrowKey).driver } : {}),
      });

      lines.push({
        menuItemId: id as unknown as Id<'menuItems'>,
        name: it.name,
        tomorrowQty,
        sevenDayQty,
        confidence: conf,
        drivers,
      });
    }
    lines.sort((a, b) => b.tomorrowQty - a.tomorrowQty || a.name.localeCompare(b.name, 'id-ID'));

    return { status: 'ready' as const, forDateKey: tomorrowKey, lines };
  },
});
```

- [ ] **Step 4: Run to verify pass + codegen + typecheck**

Run: `./node_modules/.bin/convex codegen && pnpm test -- tests/convex/forecast.test.ts && pnpm typecheck`
Expected: 3 tests pass; codegen may update `_generated` (commit drift); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add convex/forecast.ts tests/convex/forecast.test.ts convex/_generated
git commit -m "feat(forecast): add demand query (cold-start + live per-item forecast)"
```

---

## Task 5: driver rendering component

**Files:** Create `src/components/forecast/render-driver.tsx`.

- [ ] **Step 1: Create the component** — `src/components/forecast/render-driver.tsx`:
```tsx
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';

// Structured driver shapes mirror convex/lib/forecast.ts (client copy — the
// query returns plain objects; we render them localized here).
export type ForecastDriver =
  | { code: 'dow_busy' | 'dow_quiet'; pct: number; dow: number }
  | { code: 'holiday'; pct: number; key: string };

// 0=Mon..6=Sun
const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', "Jumat", 'Sabtu', 'Minggu'];

function HolidayText({ pct, hkey }: { pct: number; hkey: string }) {
  const label = hkey.startsWith('lebaran')
    ? 'Lebaran'
    : hkey === 'independence'
      ? 'HUT RI'
      : hkey === 'christmas'
        ? 'Natal'
        : hkey === 'new_year'
          ? 'Tahun Baru'
          : hkey;
  return pct >= 0 ? (
    <Trans>Libur {label} — perkiraan naik {pct}%</Trans>
  ) : (
    <Trans>Libur {label} — perkiraan turun {Math.abs(pct)}%</Trans>
  );
}

/** Renders a single forecast driver as a localized line. */
export function RenderDriver({ driver }: { driver: ForecastDriver }) {
  const { t } = useLingui();
  if (driver.code === 'holiday') return <HolidayText pct={driver.pct} hkey={driver.key} />;
  const day = DAY_NAMES[driver.dow] ?? '';
  return driver.code === 'dow_busy' ? (
    <Trans>+{driver.pct}% — biasanya ramai di hari {day}</Trans>
  ) : (
    <Trans>{driver.pct}% — biasanya sepi di hari {day}</Trans>
  );
}
```
(Note: the day names are Bahasa data labels in a fixed array — they are the source text and render the same in `en` mode, which is acceptable for Indonesian weekday names; the surrounding sentence is translated.)

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: clean.
```bash
git add src/components/forecast/render-driver.tsx
git commit -m "feat(forecast): add client-side driver renderer"
```

---

## Task 6: `/forecast` page

**Files:** Create `src/routes/_pos/forecast.tsx`.

- [ ] **Step 1: Create the page** — `src/routes/_pos/forecast.tsx`:
```tsx
import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { Spinner } from '~/components/ui/spinner';
import { StatusBadge } from '~/components/ui/status-badge';
import { RenderDriver, type ForecastDriver } from '~/components/forecast/render-driver';

export const Route = createFileRoute('/_pos/forecast')({
  component: ForecastPage,
});

type Horizon = 'tomorrow' | 'week';

function ConfidenceBadge({ level }: { level: 'low' | 'med' | 'high' }) {
  if (level === 'high') return <StatusBadge variant="success"><Trans>Tinggi</Trans></StatusBadge>;
  if (level === 'med') return <StatusBadge variant="warn"><Trans>Sedang</Trans></StatusBadge>;
  return <StatusBadge variant="muted"><Trans>Rendah</Trans></StatusBadge>;
}

function ForecastPage() {
  const data = useQuery(api.forecast.demand, {});
  const [horizon, setHorizon] = useState<Horizon>('tomorrow');

  return (
    <main className="p-6">
      <PageHeader title={<Trans>Prediksi Permintaan</Trans>} />
      {data === undefined ? (
        <div className="mt-6 flex items-center justify-center py-12 text-muted-foreground"><Spinner /></div>
      ) : data.status === 'learning' ? (
        <Empty className="mt-6">
          <EmptyHeader>
            <EmptyMedia variant="icon"><TrendingUp /></EmptyMedia>
            <EmptyTitle><Trans>Kami sedang belajar</Trans></EmptyTitle>
            <EmptyDescription>
              <Trans>
                Memerlukan minimal {data.daysNeeded} hari data (terkumpul {data.daysCollected}). Perkiraan akan aktif sekitar {data.etaDateKey}.
              </Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={horizon === 'tomorrow' ? 'default' : 'outline'} onClick={() => setHorizon('tomorrow')}>
              <Trans>Besok</Trans>
            </Button>
            <Button type="button" size="sm" variant={horizon === 'week' ? 'default' : 'outline'} onClick={() => setHorizon('week')}>
              <Trans>7 hari</Trans>
            </Button>
          </div>
          <ul className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            {data.lines.map((line) => (
              <li key={line.menuItemId} className="bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{line.name}</span>
                  <ConfidenceBadge level={line.confidence} />
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  ~{horizon === 'tomorrow' ? line.tomorrowQty : line.sevenDayQty}
                </div>
                {line.drivers.length > 0 ? (
                  <ul className="mt-1 text-xs text-muted-foreground">
                    {line.drivers.map((d, i) => (
                      <li key={i}><RenderDriver driver={d as ForecastDriver} /></li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: clean.
```bash
git add src/routes/_pos/forecast.tsx
git commit -m "feat(forecast): build the /forecast page"
```

---

## Task 7: nav entry

**Files:** Modify `src/components/app-shared.tsx`.

- [ ] **Step 1: Add the nav item** — in `src/components/app-shared.tsx`:

Add `TrendingUp` to the `lucide-react` import block (alphabetically near the others):
```ts
	TrendingUp,
```
Then add a `Prediksi` item to the `Laporan` group's `items` array, before the `Laporan` sub-nav object:
```tsx
			{ title: msg`Prediksi`, path: "/forecast", icon: <TrendingUp /> },
```
So that group becomes `{ label: msg\`Laporan\`, items: [ { Prediksi … }, { Laporan, subItems: [...] } ] }`.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: clean.
```bash
git add src/components/app-shared.tsx
git commit -m "feat(forecast): add Prediksi to the owner nav"
```

---

## Task 8: i18n — extract, fill English, compile

**Files:** `src/locales/id/messages.po`, `src/locales/en/messages.po`

- [ ] **Step 1: Extract**

Run: `pnpm lingui:extract`

- [ ] **Step 2: Fill English** — in `src/locales/en/messages.po`, fill each NEW empty `msgstr ""`. Mapping (preserve placeholders exactly):
- `Prediksi Permintaan` → `Demand Forecast`
- `Prediksi` → `Forecast`
- `Besok` → `Tomorrow`
- `7 hari` → `7 days`  (may already exist from Reports — leave if filled)
- `Tinggi` → `High`
- `Sedang` → `Medium`
- `Rendah` → `Low`
- `Kami sedang belajar` → `We're still learning`
- `Memerlukan minimal {daysNeeded} hari data (terkumpul {daysCollected}). Perkiraan akan aktif sekitar {etaDateKey}.` → `Needs at least {daysNeeded} days of data (collected {daysCollected}). Forecasts go live around {etaDateKey}.`
- `+{pct}% — biasanya ramai di hari {day}` → `+{pct}% — usually busy on {day}`
- `{pct}% — biasanya sepi di hari {day}` → `{pct}% — usually quiet on {day}`
- `Libur {label} — perkiraan naik {pct}%` → `{label} holiday — expected up {pct}%`
- `Libur {label} — perkiraan turun {Math.abs(pct)}%` / `Libur {label} — perkiraan turun {pct}%` → `{label} holiday — expected down {pct}%` (match the exact extracted msgid, including whatever placeholder name Lingui emits for the `Math.abs(pct)` expression).

For any other new empty `en` msgstr, translate sensibly and report it. Re-running extract should show `en` 0 missing.

- [ ] **Step 3: Compile + typecheck**

Run: `pnpm lingui:compile && pnpm typecheck`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/locales/id/messages.po src/locales/en/messages.po
git commit -m "i18n(forecast): extract + fill en for the forecast page"
```

---

## Task 9: Playwright smoke — cold-start state

**Files:** Modify `tests/e2e/sale.spec.ts`.

- [ ] **Step 1: Add the test** — append inside the `test.describe('sale (auth-gated)', …)` block. A brand-new cafe has <14 days of data, so the deterministic e2e path is the "learning" message:
```ts
  test('forecast: a fresh cafe sees the cold-start learning message', async ({ page }) => {
    const email = `e2e+forecast+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Forecast');
    await page.getByLabel('Nama kafe').fill('Kopi Forecast');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByRole('button', { name: /Lanjut/ }).click();
    await waitForUrlHydrated(page, /\/onboarding\/menu$/);

    await page.goto('/forecast');
    await waitForUrlHydrated(page, /\/forecast$/);
    await expect(page.getByText(/sedang belajar/i)).toBeVisible();
  });
```

- [ ] **Step 2: Typecheck the spec**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Attempt to run (auth-gated — may be unavailable)**

Run: `RUN_AUTH_E2E=1 pnpm exec playwright test tests/e2e/sale.spec.ts -g "forecast:"`
Needs a dev server + Convex. If unavailable, that's ACCEPTABLE — gated + skipped in CI. Report whether it ran or was skipped.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/sale.spec.ts
git commit -m "test(e2e): forecast cold-start learning message"
```

---

## Task 10: Full local verification + integrate

**Files:** none

- [ ] **Step 1: Full gate**

Run: `pnpm typecheck && pnpm test && pnpm lingui:compile`
Expected: typecheck clean; all unit/convex tests pass (existing + `time` additions + `forecast` engine + `forecast` query); compile clean.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: 0 errors (pre-existing warnings only; none in the new forecast files).

- [ ] **Step 3: Confirm clean tree + no codegen drift**

Run: `git status` then `./node_modules/.bin/convex codegen` then `git status`
Expected: clean both times (Task 4 committed any drift).

- [ ] **Step 4: Integrate (after user OK)**

Per the trunk-based workflow, wait for the user's go-ahead, then push `feat/forecast-engine` and open a PR to `main`. Do not merge without approval; surface the squash-vs-merge tradeoff at merge time.

---

## Self-Review (performed against the spec)

**Spec coverage:**
- Engine (`baseEstimate` 28d exp-decay trimmed mean; `dayOfWeekMultiplier` 8wk ratio clamped; `holidayMultiplier` Lebaran+fixed table+weekend-near; `weatherMultiplier`=1 stub; `confidence` span+CoV; `predictedQty`; `driversFor`) → Tasks 2–3 (+ unit tests). `dowOfKey`/`addDaysToKey` time utils → Task 1.
- `forecast.demand` query (owner-scoped, 56-day paid scan, active-day axis, cold-start <14, per-item base/dow/confidence, next-7-day loop, tomorrow + 7-day total, sorted) → Task 4 (+ convex tests: cold-start, ready+ordering, paid-only/tenant).
- `/forecast` page (Besok/7-hari toggle, demand cards, confidence badge high→success/med→warn/low→muted, drivers, cold-start Empty, Spinner) → Task 6; client driver rendering (structured codes → localized text) → Task 5; nav entry → Task 7.
- i18n → Task 8; Playwright (cold-start path) → Task 9; verification/integrate → Task 10.
- Out-of-scope respected: weather stubbed at 1.0 (no API), no `forecasts`/`restockSuggestions` tables or cron, no restock/supplier/export, no inline edits — all deferred to B/C.

**Placeholder scan:** none — every code step is complete; commands state expected output.

**Type consistency:** `DaySample` (`{daysAgo,dow,qty}`) is identical in engine (Task 2) and the query's sample construction (Task 4). `Driver`/`Confidence` shapes match across engine (Tasks 2–3), the query's `driverV`/`confidenceV` validators + returned objects (Task 4), and the client `ForecastDriver` copy + `RenderDriver` (Task 5). `holidayMultiplier(dateKey) → {mult, driver?}` and `driversFor({dowMult,dow,holiday?})` signatures match their call sites in Task 4. `dowOfKey`/`addDaysToKey`/`utcOfDayKey`/`DAY_MS`/`startOfLocalDay`/`dayKeyFn`/`tzFor` are all from `convex/lib/time.ts` and imported where used. Confidence→StatusBadge variant mapping (high→success, med→warn, low→muted) is consistent between the spec and Task 6.
