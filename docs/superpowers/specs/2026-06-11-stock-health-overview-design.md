# Stock Health Overview Design Spec

**Date:** 2026-06-11
**Branch:** `feat/stock-health-overview` (off `main`)

## Context

The inventory stock page (`/inventory`, `src/routes/_pos/inventory/index.tsx`) lists
ingredients in a table with per-row stock, threshold, cost, and a low/active/archived
status badge. The owner can already *filter* to low-stock items (the "Stok rendah"
chip) and the `PageHeader` meta line shows `{all} bahan · {low} stok rendah`. What's
missing is an at-a-glance **health summary** above the table: how many items need
restocking right now, and what the on-hand stock is worth.

This is a focused follow-on to the shipped inventory slices (recipes, adjustments,
history, purchases, restock-suppliers). It adds **two stat tiles** and no new data:
`ingredients.list` already returns everything needed per active ingredient
(`currentStockQty`, `reorderThreshold`, `lastCostPerUnitIDR`, `archived`).

## Decisions (from brainstorming)

1. Two tiles only: **Stok rendah** (count) and **Nilai stok total** (money). No
   third metric, no per-tile click action (the "Stok rendah" filter chip already
   exists) — keep the slice tight.
2. **Frontend-only.** Compute both figures client-side from the already-fetched
   `ingredients` list. No new Convex query, no schema change, no `convex codegen`.
3. Mirror the dashboard stat-tile convention (`DashboardCard` + shadcn `Card`,
   `tabular-nums`, `formatIDR`) — but **static** (no `Delta`/"vs kemarin"; there is
   no historical series for stock value).
4. Valuation basis: `lastCostPerUnitIDR` — a **current-cost** valuation, the same
   cost shown per row. It is not COGS and is explicitly not represented as such.

## Scope of "active"

Both figures are computed over **active (non-archived)** ingredients only — the same
set the existing `counts.all` / `counts.low` already derive. Archived ingredients are
excluded from the count and from the value total. (The page fetches with
`includeArchived: true` to populate the Arsip filter; the summary ignores archived
rows regardless of the active filter chip.)

## Data — no backend changes

`api.ingredients.list` already returns `currentStockQty: number`,
`reorderThreshold: number`, `lastCostPerUnitIDR: number`, and `archived: boolean` per
row. The summary is derived in the page's existing `counts` `useMemo`:

- `low` — already computed (`active.filter(isLow).length`, where
  `isLow(r) = r.currentStockQty < r.reorderThreshold && !r.archived`). Reused as-is.
- `stockValueIDR` — **new:** `active.reduce((sum, r) => sum + r.currentStockQty * r.lastCostPerUnitIDR, 0)`.

`counts` stays `undefined` while `ingredients` is loading (current behavior), so the
summary is hidden until data arrives — no skeleton needed (kept simple; the dashboard
uses skeletons because it fetches its own query, here the parent already gates).

## Frontend

### New component — `src/components/inventory/stock-summary.tsx`

A presentational component, no data fetching:

```tsx
export function StockSummary({
  lowCount,
  stockValueIDR,
}: {
  lowCount: number;
  stockValueIDR: number;
}) { ... }
```

Renders **two `DashboardCard` tiles** in a responsive grid
(`grid grid-cols-1 gap-px sm:grid-cols-2`, matching how the dashboard lays tiles out),
placed directly above the `DataTable`:

- **Tile 1 — Stok rendah:** `CardTitle` "Stok rendah"; value = a **bare `lowCount`**
  number (no trailing unit word — the title supplies the context, matching the
  dashboard stat-tile convention where tiles show bare numbers). When `lowCount > 0`,
  give the value a warning treatment (`text-destructive` + a leading `⚠` `aria-hidden`
  mark, matching the table's existing low-stock marker); when `0`, neutral foreground.
  (An earlier draft showed a trailing `bahan` unit; dropped during build because the
  `bahan` string already maps to the shared `ingredient` translation, which reads
  poorly as an English count unit.)
- **Tile 2 — Nilai stok total:** `CardTitle` "Nilai stok total"; value =
  `formatIDR(stockValueIDR)`.

Use `formatIDR` from `~/lib/money` (the same import the stock page already uses) and
`tabular-nums` on both numeric values. Tiles use `CardHeader`/`CardTitle`/`CardContent`
mirroring `src/components/stats.tsx` but **omit `CardFooter`/`Delta`**.

### Stock page — `src/routes/_pos/inventory/index.tsx`

1. Extend the `counts` `useMemo` return to include
   `stockValueIDR: active.reduce((s, r) => s + r.currentStockQty * r.lastCostPerUnitIDR, 0)`.
2. Render `{counts ? <StockSummary lowCount={counts.low} stockValueIDR={counts.stockValueIDR} /> : null}`
   between the `Toolbar` and the `DataTable`.

No change to columns, filters, dialogs, or the `PageHeader` meta line (it stays as the
compact `{all} bahan · {low} stok rendah`; the tiles are the prominent surface).

## Testing

This is presentational/derived UI with no backend. Coverage:

- **Typecheck** (`pnpm typecheck`) — the component props and the extended `counts`
  shape.
- The valuation math is a one-line reduce over already-tested query output; no Convex
  test is added (the `list` query already returns the fields). If a unit test is cheap,
  a pure helper test for the reduce is optional, **not required** — keep the slice small.
- The existing inventory e2e flow continues to pass (the summary renders above the
  table without altering existing controls).

## i18n

New Bahasa Indonesia strings: `Stok rendah`, `Nilai stok total` (the low-stock tile
shows a bare number, so there is no unit string). Run `pnpm lingui:extract`, fill the
`en` catalog (`Low stock`, `Total stock value`), then `pnpm lingui:compile`. In
practice `Stok rendah` already existed (filter chip / item card → "Low stock"), so the
only genuinely new entry was `Nilai stok total`.

## Conventions

- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`;
  confirm `git status` clean before push.
- Do NOT run `convex codegen` — no new/changed Convex function (frontend-only).
- No new route → no `src/routeTree.gen.ts` change.
- Small conventional commits; PR → review → merge commit.

## Out of scope

- A backend `ingredients.totalStockValue` query (frontend reduce is sufficient at
  typical ingredient counts).
- Making either tile clickable / a deep-link to the filtered view.
- Trend/delta vs a prior period (no historical stock-value series exists).
- COGS or weighted-average costing (uses `lastCostPerUnitIDR` current-cost basis).
- Value breakdown by category or per-ingredient value column.
- Bulk recount, cost-history, CSV export, and additional filters (separate slices).
