# Predictive Demand — Slice C1: nightly cron + persistence (V1 4.5c-1)

**Date:** 2026-06-02
**Status:** Approved design, ready for implementation plan
**Branch:** `feat/forecast-cron` (off `main`)
**Depends on:** Slice A (`computeDemand` in `convex/lib/demand.ts`, the `forecast.demand` query — merged) and Slice B (`restock.suggestion` query, `suggestRestock`, suppliers, the Daftar Belanja panel — merged, PR #24).

## Context

Predictive Demand decomposes A → B → C, and C is further split into **C1 — nightly cron + persistence (this)** and **C2 — weather**. Today the forecast and restock are computed **live** on every page load (a reactive query re-scanning 56 days of orders). C1 introduces the scheduled-function + persistence layer the v1 design (§3.3) calls for: a nightly Convex cron computes and stores a forecast + restock snapshot per cafe; the pages read the latest snapshot. This validates the Convex cron deployment shape (flagged in §3.7), moves the compute off page-load, gives a stable "as of 22:00" daily plan, and persists the restock suggestion so it gains status + a "mark sent" workflow (deferred from B). Weather stays stubbed at `1.0` — C2 wires the real signal.

Decisions from brainstorming: **snapshot-primary read with a live fallback** (pages read the latest persisted snapshot; if none exists yet, fall back to live `computeDemand`); a **single daily cron at 15:00 UTC = 22:00 WIB** iterating all cafes; the restock workflow is **draft → sent** only (a history-browse page + the "dismiss" action are deferred; the `'dismissed'` status stays in the schema union but isn't wired). No new external dependencies.

## Goal

A nightly cron persists, per cafe, a `forecasts` snapshot and (when ready) a `restockSuggestions` draft. The `/forecast` page reads the latest snapshot (live fallback before the first run); the restock list is the persisted draft, which the owner edits, sends to WhatsApp (marking it "sent" with the sent quantities retained), or sees as "Terkirim".

## Schema (two tables, per §2.4)

```
forecasts: defineTable({
  cafeId: v.id('cafes'),
  generatedAt: v.number(),
  method: v.literal('rule_v1'),
  status: v.union(v.literal('learning'), v.literal('ready')),
  // learning fields:
  daysCollected: v.optional(v.number()),
  etaDateKey: v.optional(v.string()),
  // ready fields:
  forDateKey: v.optional(v.string()),
  lines: v.optional(v.array(v.object({
    menuItemId: v.id('menuItems'),
    name: v.string(),
    tomorrowQty: v.number(),
    sevenDayQty: v.number(),
    confidence: v.union(v.literal('low'), v.literal('med'), v.literal('high')),
    drivers: v.array(v.union(
      v.object({ code: v.union(v.literal('dow_busy'), v.literal('dow_quiet')), pct: v.number(), dow: v.number() }),
      v.object({ code: v.literal('holiday'), pct: v.number(), key: v.string() })
    )),
  }))),
  weatherSignal: v.optional(v.string()), // reserved for C2
}).index('by_cafe_generated', ['cafeId', 'generatedAt']),

restockSuggestions: defineTable({
  cafeId: v.id('cafes'),
  forecastId: v.id('forecasts'),
  generatedAt: v.number(),
  status: v.union(v.literal('draft'), v.literal('sent'), v.literal('dismissed')),
  lines: v.array(v.object({
    ingredientId: v.id('ingredients'),
    name: v.string(),
    unit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
    suggestedQty: v.number(),
    currentStockQty: v.number(),
  })),
  supplierId: v.optional(v.id('suppliers')),
  sentLines: v.optional(v.array(v.object({ name: v.string(), qty: v.number(), unit: v.string() }))),
  exportedAt: v.optional(v.number()),
}).index('by_cafe_generated', ['cafeId', 'generatedAt']),
```
Run `./node_modules/.bin/convex codegen`; commit drift. The `forecasts.lines` validator mirrors the `forecast.demand` ready shape exactly; the `restockSuggestions.lines` mirror `restock.suggestion`'s ready shape.

## Shared compute extraction (refactor)

Extract the restock derivation out of the `restock.suggestion` query into a shared server helper `computeRestock(ctx, cafeId, demandLines): Promise<RestockLine[]>` in `convex/lib/restock-compute.ts` (takes the `DemandLine[]` from a `ready` demand result; reads recipes + stock; applies `suggestRestock`; returns the lines). Both the live `restock.suggestion` query and the cron use it — same DRY pattern as `computeDemand` in slice B. `RestockLine = { ingredientId, name, unit, suggestedQty, currentStockQty }`. The existing restock tests must stay green.

## Cron + nightly generation

- **`convex/crons.ts`**: `crons.cron('nightly forecast', '0 15 * * *', internal.forecast.generateNightly)` (15:00 UTC = 22:00 WIB).
- **`internal.forecast.generateNightly`** (an `internalMutation`, no args): iterate `ctx.db.query('cafes').collect()`. For each cafe:
  - `const demand = await computeDemand(ctx, cafeId)` (works in a mutation ctx — it only reads).
  - Insert a `forecasts` row: `{ cafeId, generatedAt: Date.now(), method: 'rule_v1', status: demand.status, …payload }` (learning → daysCollected/etaDateKey; ready → forDateKey/lines).
  - If `ready`: `const lines = await computeRestock(ctx, cafeId, demand.lines)`; insert a `restockSuggestions` row `{ cafeId, forecastId, generatedAt, status: 'draft', lines }` (only if `lines.length > 0`).
  - Snapshots accumulate (one per cafe per night); "latest" is by `generatedAt`. No pruning in C1.
- Expose `generateNightly` as `internalMutation` so it's callable by the cron and directly in tests (via `t.mutation(internal.forecast.generateNightly, {})`).

## Read-path changes

- **`forecast.demand`** query: fetch the latest `forecasts` row for the cafe (`by_cafe_generated`, descending, first). If present → return its payload (reconstruct the union from `status` + fields). If none → fall back to `computeDemand(ctx, cafeId)` (so behavior is unchanged before the first cron run). Returns the same union as today.
- **`restock.suggestion`** query: fetch the latest `restockSuggestions` row. If present → return `{ status: 'ready', suggestionId, suggestionStatus: row.status, lines: row.lines }`. If none → check the latest forecast / live `computeDemand`: if learning → return learning; else compute live via `computeRestock` and return `{ status:'ready', suggestionId: null, suggestionStatus: 'draft', lines }`. (The panel needs the suggestion id + status to drive "mark sent"; `suggestionId: null` means "not persisted yet, send won't mark".)
- **`restock.markSent`** mutation `({ id: v.id('restockSuggestions'), supplierId: v.id('suppliers'), sentLines })`: `requireOwned` the suggestion + the supplier; patch `{ status: 'sent', supplierId, sentLines, exportedAt: Date.now() }`. Returns null.

> Note the `restock.suggestion` return shape changes (adds `suggestionId`/`suggestionStatus`). Update the panel accordingly (§ next).

## Restock panel changes (on `/forecast`)

- Reads `api.restock.suggestion` (now snapshot-backed). Quantities edited client-side, seeded from the returned `lines`.
- Supplier picker as before. **"Kirim ke WhatsApp"**: if `suggestionId` is non-null, call `restock.markSent({ id: suggestionId, supplierId, sentLines: editedLines })` first, then `window.open(waUrl(...))`. If `suggestionId` is null (live fallback, pre-cron) just open WhatsApp (no persistence).
- When `suggestionStatus === 'sent'`, show a "Terkirim" `StatusBadge` and keep the list read-only (or still allow re-send). The forecast cards are unchanged except they now read the snapshot.

## Testing

- **Convex** (`tests/convex/forecast-cron.test.ts`): seed cafe + ≥14 active days of orders + a recipe → call `t.mutation(internal.forecast.generateNightly, {})` → assert a `forecasts` row (status `ready`, lines) + a `restockSuggestions` draft row persisted; a cold-start cafe (<14 days) → a `forecasts` row status `learning` and NO restock row; two cafes → each gets its own rows (tenant separation). Run twice → two snapshots, latest by `generatedAt`.
- **Read-path** (extend `tests/convex/forecast.test.ts` / `restock.test.ts`): after `generateNightly`, `forecast.demand`/`restock.suggestion` return the persisted snapshot; with no snapshot, they fall back to live (the existing tests cover the live path — keep them green).
- **`markSent`** (`tests/convex/restock.test.ts`): generate → markSent({id, supplierId, sentLines}) → the row is `sent` with `sentLines`/`supplierId`/`exportedAt`; tenant isolation (cafe B can't markSent cafe A's row).
- **Shared `computeRestock`**: existing restock-query tests stay green after the extraction.
- **Playwright**: the existing fresh-cafe `/forecast` cold-start path still shows the learning state (no snapshot + live fallback → learning).
- Gate: `pnpm typecheck && pnpm test && pnpm lingui:compile`; `convex codegen` → commit drift.

## Affected / new files (anticipated)

**New:** `convex/crons.ts`; `convex/lib/restock-compute.ts`; `tests/convex/forecast-cron.test.ts`.
**Modified:** `convex/schema.ts` (two tables), `convex/_generated/*`, `convex/forecast.ts` (`generateNightly` internalMutation + read-from-snapshot in `demand`), `convex/restock.ts` (read-from-snapshot in `suggestion`, `markSent` mutation, use `computeRestock`), `src/routes/_pos/forecast.tsx` (panel reads suggestionId/status, markSent on send, "Terkirim"), `tests/convex/{forecast,restock}.test.ts`, Lingui catalogs (the "Terkirim" string).

## Out of scope (later)

- **Weather + geolocation + category taxonomy** → Slice C2 (fills `forecasts.weatherSignal`, wires the real `weatherMultiplier`).
- A restock **history-browse page** + the **"dismiss"** action (the `'dismissed'` status exists in the schema union but isn't wired to UI).
- An edit-logging table ("feeds V2 training"); pruning/retention of old snapshots; B-PDF export.
