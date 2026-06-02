# Predictive Demand — Slice C1 (nightly cron + persistence) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A nightly Convex cron (22:00 WIB) persists a forecast + restock snapshot per cafe; the `/forecast` pages read the latest snapshot (live fallback before the first run); the restock list becomes a persisted draft the owner edits and sends ("Terkirim").

**Architecture:** Two tables (`forecasts`, `restockSuggestions`). The restock derivation is extracted into a shared `computeRestock(ctx, cafeId, demandLines)` reused by the live query and the cron. An `internalMutation generateNightly` (triggered by a daily cron) iterates cafes, computes via `computeDemand` + `computeRestock`, and persists. The read queries serve the latest snapshot, falling back to live compute. A `markSent` mutation closes the draft→sent loop. No external dependencies (weather stays `1.0` — Slice C2).

**Tech Stack:** Convex (queries/mutations/internalMutations/crons) + convex-test, React 19, TanStack Router, Tailwind v4, Lingui, shadcn/ui, Vitest, Playwright. Package manager: **pnpm**. Branch: `feat/forecast-cron` (off `main`, has design-spec commit `939ed22`).

---

## Conventions for the implementing engineer (read once)

- **pnpm**; `~` = `src/`, `convex/...`. Convex codegen: `./node_modules/.bin/convex codegen` (NOT npx); commit `convex/_generated/*` drift.
- **Branch:** `feat/forecast-cron` (already created off `main`). Stay on it.
- **Pure/shared convex-helper tests go under `tests/convex/`** (vitest covers `tests/` and `src/`, NOT `convex/lib/`).
- **i18n:** `<Trans>` in JSX. Task 7 runs extract/fill/compile. Server `throw new Error('…')` strings stay raw Indonesian.
- **Strict TS** (`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`): conditional-spread optional fields; `computeDemand`/`computeRestock` take `ctx: QueryCtx | MutationCtx` (mirrors `currentStockQty`) so both queries and the cron mutation can call them.
- **Run before any push:** `pnpm typecheck && pnpm test && pnpm lingui:compile`.
- **Commit style:** small Conventional Commits ending with a blank line then:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File structure

**New:** `convex/lib/restock-compute.ts` (extracted `computeRestock`); `convex/crons.ts`; `tests/convex/forecast-cron.test.ts`.
**Modified:** `convex/schema.ts` (two tables), `convex/_generated/*`, `convex/lib/demand.ts` (widen ctx type), `convex/forecast.ts` (`generateNightly` + snapshot-read in `demand`), `convex/restock.ts` (use `computeRestock`, snapshot-read in `suggestion`, `markSent`), `src/routes/_pos/forecast.tsx` (panel), `tests/convex/{forecast,restock}.test.ts`, Lingui catalogs.

---

## Task 1: `forecasts` + `restockSuggestions` tables

**Files:** Modify `convex/schema.ts`; `convex/_generated/*`.

- [ ] **Step 1: Add both tables** — in `convex/schema.ts`'s `defineSchema({...})`, near the other forecast-related tables:
```ts
  forecasts: defineTable({
    cafeId: v.id('cafes'),
    generatedAt: v.number(),
    method: v.literal('rule_v1'),
    status: v.union(v.literal('learning'), v.literal('ready')),
    daysCollected: v.optional(v.number()),
    etaDateKey: v.optional(v.string()),
    forDateKey: v.optional(v.string()),
    lines: v.optional(
      v.array(
        v.object({
          menuItemId: v.id('menuItems'),
          name: v.string(),
          tomorrowQty: v.number(),
          sevenDayQty: v.number(),
          confidence: v.union(v.literal('low'), v.literal('med'), v.literal('high')),
          drivers: v.array(
            v.union(
              v.object({ code: v.union(v.literal('dow_busy'), v.literal('dow_quiet')), pct: v.number(), dow: v.number() }),
              v.object({ code: v.literal('holiday'), pct: v.number(), key: v.string() })
            )
          ),
        })
      )
    ),
    weatherSignal: v.optional(v.string()),
  }).index('by_cafe_generated', ['cafeId', 'generatedAt']),

  restockSuggestions: defineTable({
    cafeId: v.id('cafes'),
    forecastId: v.id('forecasts'),
    generatedAt: v.number(),
    status: v.union(v.literal('draft'), v.literal('sent'), v.literal('dismissed')),
    lines: v.array(
      v.object({
        ingredientId: v.id('ingredients'),
        name: v.string(),
        unit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
        suggestedQty: v.number(),
        currentStockQty: v.number(),
      })
    ),
    supplierId: v.optional(v.id('suppliers')),
    sentLines: v.optional(v.array(v.object({ name: v.string(), qty: v.number(), unit: v.string() }))),
    exportedAt: v.optional(v.number()),
  }).index('by_cafe_generated', ['cafeId', 'generatedAt']),
```

- [ ] **Step 2: Codegen** — `./node_modules/.bin/convex codegen`. `git status` shows `_generated` + schema.ts.

- [ ] **Step 3: Typecheck** — `pnpm typecheck` → clean.

- [ ] **Step 4: Commit**
```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(forecast): add forecasts + restockSuggestions tables"
```

---

## Task 2: Extract `computeRestock` + widen ctx types

**Files:** Create `convex/lib/restock-compute.ts`; Modify `convex/lib/demand.ts` (ctx type), `convex/restock.ts` (use the helper).

- [ ] **Step 1: Widen `computeDemand`'s ctx type** — in `convex/lib/demand.ts`, change the import + signature so it accepts a mutation ctx too:
```ts
import type { MutationCtx, QueryCtx } from '../_generated/server';
```
and change
```ts
export async function computeDemand(ctx: QueryCtx, cafeId: Id<'cafes'>): Promise<DemandResult> {
```
to
```ts
export async function computeDemand(ctx: QueryCtx | MutationCtx, cafeId: Id<'cafes'>): Promise<DemandResult> {
```
(No body change.)

- [ ] **Step 2: Create `convex/lib/restock-compute.ts`** — extract the per-ingredient derivation from `restock.suggestion`:
```ts
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { currentStockQty } from './inventory';
import { suggestRestock } from './restock';
import type { DemandLine } from './demand';

export type RestockLine = {
  ingredientId: Id<'ingredients'>;
  name: string;
  unit: 'g' | 'ml' | 'piece';
  suggestedQty: number;
  currentStockQty: number;
};

/** Restock lines from a ready forecast's per-item 7-day demand × recipes − stock + safety. */
export async function computeRestock(
  ctx: QueryCtx | MutationCtx,
  cafeId: Id<'cafes'>,
  demandLines: DemandLine[]
): Promise<RestockLine[]> {
  const required = new Map<string, number>();
  for (const line of demandLines) {
    const recipe = await ctx.db
      .query('recipes')
      .withIndex('by_cafe_item', (q) => q.eq('cafeId', cafeId).eq('menuItemId', line.menuItemId))
      .unique();
    if (!recipe) continue;
    for (const rl of recipe.lines) {
      const id = rl.ingredientId as string;
      required.set(id, (required.get(id) ?? 0) + line.sevenDayQty * rl.qty * rl.wastageFactor);
    }
  }
  const lines: RestockLine[] = [];
  for (const [idStr, req] of required) {
    const ing = await ctx.db.get(idStr as unknown as Id<'ingredients'>);
    if (!ing || ing.cafeId !== cafeId || ing.archived) continue;
    const stock = await currentStockQty(ctx, cafeId, ing._id);
    const suggestedQty = suggestRestock(req, stock, ing.reorderThreshold);
    if (suggestedQty > 0) {
      lines.push({ ingredientId: ing._id, name: ing.name, unit: ing.canonicalUnit, suggestedQty, currentStockQty: stock });
    }
  }
  lines.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
  return lines;
}
```

- [ ] **Step 3: Rewire `restock.suggestion`** to use it (behavior + return shape unchanged in this task). Replace the handler body of `suggestion` in `convex/restock.ts` with:
```ts
  handler: async (ctx, _args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const demand = await computeDemand(ctx, cafeId);
    if (demand.status === 'learning') return demand;
    const lines = await computeRestock(ctx, cafeId, demand.lines);
    return { status: 'ready' as const, lines };
  },
```
and update the imports at the top of `convex/restock.ts` (remove the now-unused `currentStockQty`/`suggestRestock`/`Id` if no longer referenced; add `computeRestock`):
```ts
import { computeRestock } from './lib/restock-compute';
```
(Keep `v`, `query`, `requireOwnerCafe`, `computeDemand`. The big inline `required`/`lines` block is gone.)

- [ ] **Step 4: Run to verify pass + typecheck** — `pnpm test -- tests/convex/restock.test.ts && pnpm typecheck`. The existing 4 restock tests MUST stay green (behavior unchanged). If a test fails, the extraction changed behavior — STOP and report.

- [ ] **Step 5: Commit**
```bash
git add convex/lib/restock-compute.ts convex/lib/demand.ts convex/restock.ts
git commit -m "refactor(restock): extract computeRestock for reuse by the cron"
```

---

## Task 3: `generateNightly` internalMutation + cron

**Files:** Modify `convex/forecast.ts`; Create `convex/crons.ts`, `tests/convex/forecast-cron.test.ts`.

- [ ] **Step 1: Write the failing test** — create `tests/convex/forecast-cron.test.ts`:
```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import { internal } from '../../convex/_generated/api';
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
  ingSusu: Id<'ingredients'>;
};

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
  const ingSusu = await asOwner.mutation(api.ingredients.upsert, { name: 'Susu', canonicalUnit: 'ml', reorderThreshold: 0, lastCostPerUnitIDR: 100 });
  await asOwner.mutation(api.recipes.upsert, { menuItemId: itemKopi, lines: [{ ingredientId: ingSusu, qty: 50, wastageFactor: 1 }] });
  return { asOwner, cafeId, cashierId, shiftId, itemKopi, ingSusu };
}

async function seedSales(t: ReturnType<typeof convexTest>, refs: Refs, days: number, nowMs: number) {
  for (let d = 1; d <= days; d++) {
    const at = nowMs - d * DAY;
    await t.run((ctx) =>
      ctx.db.insert('orders', {
        cafeId: refs.cafeId, shiftId: refs.shiftId, cashierId: refs.cashierId,
        clientId: `c-${d}`,
        lines: [{ menuItemId: refs.itemKopi, nameSnapshot: 'Kopi', qty: 10, unitPriceIDR: 15000, modifiersSnapshot: [], lineTotalIDR: 150000 }],
        subtotalIDR: 150000, taxRatePct: 0, taxIDR: 0, discountIDR: 0, totalIDR: 150000,
        paymentMethod: 'cash', paymentStatus: 'paid', createdAtClient: at, syncedAt: at,
      })
    );
  }
}

describe('generateNightly', () => {
  it('persists a ready forecast + a draft restock for a cafe with data', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    await t.mutation(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    const restocks = await t.run((ctx) => ctx.db.query('restockSuggestions').collect());
    expect(forecasts).toHaveLength(1);
    expect(forecasts[0]?.status).toBe('ready');
    expect((forecasts[0]?.lines ?? []).some((l) => l.name === 'Kopi')).toBe(true);
    expect(restocks).toHaveLength(1);
    expect(restocks[0]?.status).toBe('draft');
    expect(restocks[0]?.forecastId).toBe(forecasts[0]?._id);
    expect(restocks[0]?.lines.some((l) => l.name === 'Susu')).toBe(true);
  });

  it('cold-start cafe → learning forecast, no restock row', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 5, Date.now());
    await t.mutation(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    const restocks = await t.run((ctx) => ctx.db.query('restockSuggestions').collect());
    expect(forecasts[0]?.status).toBe('learning');
    expect(restocks).toHaveLength(0);
  });

  it('each cafe gets its own snapshot', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'a@x.com');
    await seedSales(t, a, 20, Date.now());
    await setup(t, 'b@x.com');
    await t.mutation(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    expect(forecasts).toHaveLength(2); // one per cafe
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm test -- tests/convex/forecast-cron.test.ts` → FAIL (`internal.forecast.generateNightly` missing).

- [ ] **Step 3: Implement `generateNightly`** — in `convex/forecast.ts`, add to the imports:
```ts
import { internalMutation, query } from './_generated/server';
import { computeDemand } from './lib/demand';
import { computeRestock } from './lib/restock-compute';
```
(merge with the existing `query`/`computeDemand` imports — don't duplicate) and append:
```ts
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
```
(Note: processes all cafes in one mutation — fine at V1 scale; a scheduler fan-out is a later optimization.)

- [ ] **Step 4: Create `convex/crons.ts`**:
```ts
import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
// 15:00 UTC = 22:00 WIB, nightly per cafe.
crons.cron('nightly forecast', '0 15 * * *', internal.forecast.generateNightly, {});

export default crons;
```

- [ ] **Step 5: Run to verify pass + codegen + typecheck** — `./node_modules/.bin/convex codegen && pnpm test -- tests/convex/forecast-cron.test.ts && pnpm typecheck` → 3 tests pass; commit drift.

- [ ] **Step 6: Commit**
```bash
git add convex/forecast.ts convex/crons.ts tests/convex/forecast-cron.test.ts convex/_generated
git commit -m "feat(forecast): nightly cron persisting forecast + restock snapshots"
```

---

## Task 4: `forecast.demand` reads the latest snapshot

**Files:** Modify `convex/forecast.ts`; extend `tests/convex/forecast.test.ts`.

- [ ] **Step 1: Add a failing test** — append to `tests/convex/forecast.test.ts` (inside the `describe('forecast.demand', …)` block; it already has `setup`/`seedOrder`/`internal`? — if `internal` isn't imported there, add `import { internal } from '../../convex/_generated/api';`):
```ts
  it('serves the persisted snapshot after the nightly cron runs', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const now = Date.now();
    for (let d = 1; d <= 20; d++) {
      await seedOrder(t, refs, d, [{ menuItemId: refs.itemKopi, name: 'Kopi', qty: 10, price: 15000 }], now);
    }
    await t.mutation(internal.forecast.generateNightly, {});
    const r = await refs.asOwner.query(api.forecast.demand, {});
    expect(r.status).toBe('ready'); // served from the snapshot
    if (r.status === 'ready') expect(r.lines.some((l) => l.name === 'Kopi')).toBe(true);
  });
```
(Confirm `import { internal } from '../../convex/_generated/api';` is present at the top of the file.)

- [ ] **Step 2: Run to verify it fails** — `pnpm test -- tests/convex/forecast.test.ts`. Expected: the new test currently PASSES via live fallback (no snapshot read yet) — it should still be green because the live path returns ready too. To make this a meaningful red→green, instead assert snapshot provenance: change the new test to also seed orders AFTER the cron and confirm the served result matches the snapshot, not the post-cron live value:
```ts
    await t.mutation(internal.forecast.generateNightly, {});
    // add a fresh order AFTER the snapshot; snapshot-read must ignore it
    await seedOrder(t, refs, 0, [{ menuItemId: refs.itemKopi, name: 'Kopi', qty: 9999, price: 15000 }], now);
    const r = await refs.asOwner.query(api.forecast.demand, {});
    expect(r.status).toBe('ready');
    if (r.status === 'ready') {
      const kopi = r.lines.find((l) => l.name === 'Kopi')!;
      // tomorrowQty reflects the pre-cron snapshot, NOT the 9999 spike
      expect(kopi.tomorrowQty).toBeLessThan(1000);
    }
```
Run again: with the current live-compute `demand`, the post-cron 9999 order WOULD inflate the result → test FAILS. Good (red).

- [ ] **Step 3: Implement snapshot-read** — replace the `demand` query handler in `convex/forecast.ts`:
```ts
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
```
(`requireOwnerCafe`/`computeDemand` already imported.)

- [ ] **Step 4: Run to verify pass** — `pnpm test -- tests/convex/forecast.test.ts && pnpm typecheck`. The new snapshot test passes (the 9999 post-cron order is ignored); the existing cold-start/ready/void/tenancy tests stay green (they don't run the cron, so they hit the live fallback — unchanged behavior).

- [ ] **Step 5: Commit**
```bash
git add convex/forecast.ts tests/convex/forecast.test.ts
git commit -m "feat(forecast): serve the latest forecast snapshot with live fallback"
```

---

## Task 5: `restock.suggestion` reads the snapshot + `markSent`

**Files:** Modify `convex/restock.ts`; extend `tests/convex/restock.test.ts`.

- [ ] **Step 1: Add failing tests** — append to `tests/convex/restock.test.ts` (add `import { internal } from '../../convex/_generated/api';` if not present, and a supplier via `api.suppliers.create`):
```ts
  it('serves the persisted draft suggestion after the cron', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    await t.mutation(internal.forecast.generateNightly, {});
    const r = await refs.asOwner.query(api.restock.suggestion, {});
    expect(r.status).toBe('ready');
    if (r.status === 'ready') {
      expect(r.suggestionId).not.toBeNull();
      expect(r.suggestionStatus).toBe('draft');
      expect(r.lines.some((l) => l.name === 'Susu')).toBe(true);
    }
  });

  it('markSent marks the suggestion sent with supplier + sentLines', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    await t.mutation(internal.forecast.generateNightly, {});
    const supplierId = await refs.asOwner.mutation(api.suppliers.create, { name: 'Sumber Susu', phone: '08123456789' });
    const r = await refs.asOwner.query(api.restock.suggestion, {});
    if (r.status !== 'ready' || r.suggestionId === null) throw new Error('expected a persisted draft');
    await refs.asOwner.mutation(api.restock.markSent, {
      id: r.suggestionId,
      supplierId,
      sentLines: [{ name: 'Susu', qty: 5000, unit: 'ml' }],
    });
    const row = await t.run((ctx) => ctx.db.get(r.suggestionId!));
    expect(row?.status).toBe('sent');
    expect(row?.supplierId).toBe(supplierId);
    expect(row?.sentLines).toEqual([{ name: 'Susu', qty: 5000, unit: 'ml' }]);
    expect(typeof row?.exportedAt).toBe('number');
  });

  it('live fallback when no snapshot → suggestionId null', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    const r = await refs.asOwner.query(api.restock.suggestion, {});
    expect(r.status).toBe('ready');
    if (r.status === 'ready') {
      expect(r.suggestionId).toBeNull();
      expect(r.suggestionStatus).toBe('draft');
    }
  });
```
(The existing cold-start/tenant tests assert `r.status` only and stay valid. The existing `'ready'` test that checks `r.lines` still works because the ready shape keeps `lines`.)

- [ ] **Step 2: Run to verify it fails** — `pnpm test -- tests/convex/restock.test.ts` → FAIL (`suggestionId`/`markSent` don't exist yet; also `pnpm typecheck` would flag the new fields).

- [ ] **Step 3: Implement** — in `convex/restock.ts`: add `mutation` + `requireOwned` + the `restockSuggestions`-read. Replace the `suggestion` query and add `markSent`. The imports become:
```ts
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { computeDemand } from './lib/demand';
import { computeRestock } from './lib/restock-compute';
```
The file body:
```ts
const learningV = v.object({
  status: v.literal('learning'),
  daysCollected: v.number(),
  daysNeeded: v.number(),
  etaDateKey: v.string(),
});
const restockLineV = v.object({
  ingredientId: v.id('ingredients'),
  name: v.string(),
  unit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
  suggestedQty: v.number(),
  currentStockQty: v.number(),
});

export const suggestion = query({
  args: {},
  returns: v.union(
    learningV,
    v.object({
      status: v.literal('ready'),
      suggestionId: v.union(v.id('restockSuggestions'), v.null()),
      suggestionStatus: v.union(v.literal('draft'), v.literal('sent'), v.literal('dismissed')),
      lines: v.array(restockLineV),
    })
  ),
  handler: async (ctx, _args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const snap = await ctx.db
      .query('restockSuggestions')
      .withIndex('by_cafe_generated', (q) => q.eq('cafeId', cafeId))
      .order('desc')
      .first();
    if (snap) {
      return { status: 'ready' as const, suggestionId: snap._id, suggestionStatus: snap.status, lines: snap.lines };
    }
    const demand = await computeDemand(ctx, cafeId);
    if (demand.status === 'learning') return demand;
    const lines = await computeRestock(ctx, cafeId, demand.lines);
    return { status: 'ready' as const, suggestionId: null, suggestionStatus: 'draft' as const, lines };
  },
});

export const markSent = mutation({
  args: {
    id: v.id('restockSuggestions'),
    supplierId: v.id('suppliers'),
    sentLines: v.array(v.object({ name: v.string(), qty: v.number(), unit: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, { id, supplierId, sentLines }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Saran belanja');
    await requireOwned(ctx, cafeId, supplierId, 'Pemasok');
    await ctx.db.patch(id, { status: 'sent', supplierId, sentLines, exportedAt: Date.now() });
    return null;
  },
});
```

- [ ] **Step 4: Run to verify pass + codegen + typecheck** — `./node_modules/.bin/convex codegen && pnpm test -- tests/convex/restock.test.ts && pnpm typecheck` → pass; commit drift.

- [ ] **Step 5: Commit**
```bash
git add convex/restock.ts tests/convex/restock.test.ts convex/_generated
git commit -m "feat(restock): serve persisted suggestion + add markSent"
```

---

## Task 6: Restock panel — snapshot status + markSent on send

**Files:** Modify `src/routes/_pos/forecast.tsx`.

- [ ] **Step 1: Update `RestockPanel`** — the `restock.suggestion` result now has `suggestionId` + `suggestionStatus` on the ready branch. Update the component:

a. Add `useMutation` to the convex/react import (the page imports `useQuery`):
```tsx
import { useMutation, useQuery } from 'convex/react';
```
and `StatusBadge` if not already imported:
```tsx
import { StatusBadge } from '~/components/ui/status-badge';
```

b. In `RestockPanel`, derive the suggestion fields and the mark-sent mutation:
```tsx
  const markSent = useMutation(api.restock.markSent);
  const ready = data?.status === 'ready' ? data : null;
  const lines = ready?.lines ?? [];
  const suggestionId = ready?.suggestionId ?? null;
  const isSent = ready?.suggestionStatus === 'sent';
```
(Replace the old `const lines = data?.status === 'ready' ? data.lines : [];`.)

c. Change `onSend` to persist before opening WhatsApp:
```tsx
  async function onSend() {
    const supplier = suppliers?.find((s) => s._id === supplierId);
    if (!supplier) return;
    const sentLines = lines.map((l) => ({ name: l.name, qty: qtyOf(l), unit: l.unit }));
    if (suggestionId) {
      await markSent({ id: suggestionId, supplierId: supplier._id, sentLines });
    }
    const text = formatRestockText(cafe?.name ?? '', sentLines);
    window.open(waUrl(supplier.phone, text), '_blank', 'noopener,noreferrer');
  }
```
(`onSend` is now async; the button's `onClick={onSend}` is fine.)

d. In the ready branch's header area (next to the "Daftar Belanja" heading or above the table), show a sent badge when `isSent`:
```tsx
      {isSent ? <StatusBadge variant="success"><Trans>Terkirim</Trans></StatusBadge> : null}
```
Place it inside the `<section>`, e.g. right after the `<h2>`.

- [ ] **Step 2: Typecheck + commit** — `pnpm typecheck` (clean). Confirm the `data.status === 'ready'` narrowing gives `suggestionId`/`suggestionStatus`/`lines`.
```bash
git add src/routes/_pos/forecast.tsx
git commit -m "feat(restock): panel marks suggestion sent + shows Terkirim"
```

---

## Task 7: i18n — extract, fill English, compile

**Files:** `src/locales/id/messages.po`, `src/locales/en/messages.po`

- [ ] **Step 1: Extract** — `pnpm lingui:extract`.

- [ ] **Step 2: Fill English** — in `src/locales/en/messages.po`, fill each NEW empty `msgstr ""`:
- `Terkirim` → `Sent`

For any other new empty `en` msgstr from this slice, translate sensibly and report.

- [ ] **Step 3: Compile + typecheck** — `pnpm lingui:compile && pnpm typecheck` → succeed; `en` 0 missing.

- [ ] **Step 4: Commit**
```bash
git add src/locales/id/messages.po src/locales/en/messages.po
git commit -m "i18n(forecast): fill en for the Terkirim status"
```

---

## Task 8: Full local verification + integrate

**Files:** none

- [ ] **Step 1: Full gate** — `pnpm typecheck && pnpm test && pnpm lingui:compile`. Expected: typecheck clean; all tests pass (existing + forecast-cron + the new snapshot/markSent tests; forecast/restock tests green after the `computeRestock` extraction + snapshot reads); compile clean.

- [ ] **Step 2: Lint** — `pnpm lint`. Expected: 0 errors (pre-existing warnings only).

- [ ] **Step 3: Confirm clean tree + no codegen drift** — `git status` → `./node_modules/.bin/convex codegen` → `git status`. Clean both times.

- [ ] **Step 4: Integrate (after user OK)** — per the trunk-based workflow, wait for go-ahead, then push `feat/forecast-cron` and open a PR to `main`. Do not merge without approval; surface the squash-vs-merge tradeoff at merge time.

---

## Self-Review (performed against the spec)

**Spec coverage:**
- `forecasts` + `restockSuggestions` tables (§2 of spec) → Task 1. `weatherSignal`/`dismissed` present in the schema but unwired (C2/later), as specified.
- Shared `computeRestock` extraction (§ shared compute) → Task 2 (+ widen `computeDemand` ctx for the cron); existing restock tests are the regression gate.
- Nightly cron + `generateNightly` (§ cron) → Task 3 (cron at `0 15 * * *`; per-cafe persist; learning → no restock; +tests).
- Snapshot-primary read with live fallback (§ read-path) → Task 4 (`forecast.demand`) + Task 5 (`restock.suggestion` new shape `suggestionId`/`suggestionStatus`); `markSent` mutation → Task 5.
- Panel: read suggestion id/status, markSent on send, "Terkirim" (§ panel) → Task 6; i18n → Task 7; verification/integrate → Task 8.
- Out-of-scope respected: weather/geolocation (C2), history-browse + dismiss UI, edit-logging, pruning — none added.

**Placeholder scan:** none — every code step is complete; commands state expected output. Task 4 Step 2 explicitly engineers a red (post-cron 9999 order ignored by the snapshot read).

**Type consistency:** `computeDemand`/`computeRestock` both take `ctx: QueryCtx | MutationCtx` (Task 2) so the query and the cron mutation (Task 3) both call them. `DemandResult`/`DemandLine` (slice A) feed `computeRestock` and the `forecasts.lines` payload (Task 1) — same field names (`menuItemId,name,tomorrowQty,sevenDayQty,confidence,drivers`). `RestockLine` (`ingredientId,name,unit,suggestedQty,currentStockQty`) matches the `restockSuggestions.lines` validator (Task 1), the `restock.suggestion` `restockLineV` (Task 5), and the panel's `RestockLine` type. The new `suggestion` ready shape (`suggestionId,suggestionStatus,lines`) matches `markSent`'s `id` arg and the panel's consumption (Task 6). `markSent` args (`id,supplierId,sentLines`) match the panel call.
