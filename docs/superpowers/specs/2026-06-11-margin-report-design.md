# Item Margin Report Design Spec

**Date:** 2026-06-11
**Branch:** `feat/margin-report` (off `main`)

## Context

The Products report shows units sold + revenue per item, but not **profitability**. The
recipe system already captures per-item ingredient cost (COGS). This slice adds a
read-only **Reports → Margin** tab showing, per item over a date range: units sold,
revenue, COGS, gross margin (revenue − COGS), and margin %.

Purely **read-only reporting** — a new `reports.margin` query + a report page. No schema
change, no mutation, no contact with the sale/checkout path.

## COGS basis

Per the existing recipe-cost formula (`convex/recipes.ts`:
`cost += line.qty * line.wastageFactor * ingredient.lastCostPerUnitIDR`), a sold line's
COGS is:
```
lineCOGS = lineQty × Σ_over_recipeSnapshot( recipeLine.qty × recipeLine.wastageFactor × ingredientCost )
```
where `ingredientCost` is the ingredient's **current** `lastCostPerUnitIDR`. The order
line's `recipeSnapshot` (frozen recipe: `{ ingredientId, qty, wastageFactor }`) does not
store cost, so we use current ingredient cost — a current-cost margin, the same basis the
stock-value tile and restock use. Stated in the UI footnote. Items with **no recipe**
(empty/absent `recipeSnapshot`) contribute 0 COGS → they show as full-margin (revenue with
unknown cost); flagged in the spec, acceptable.

## Backend — `convex/reports.ts` `margin` query

A new export alongside `products`, reusing `paidInRange`:
```ts
export const margin = query({
  args: { range: rangeArg },
  returns: v.object({
    items: v.array(v.object({
      name: v.string(),
      qty: v.number(),
      revenueIDR: v.number(),
      cogsIDR: v.number(),
      marginIDR: v.number(),
      marginPct: v.number(), // 0..100, 0 when revenue is 0
    })),
    totalRevenueIDR: v.number(),
    totalCogsIDR: v.number(),
    totalMarginIDR: v.number(),
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { range }) => {
    const { cafeId, fromKey, toKey, paid } = await paidInRange(ctx, range);
    // current ingredient cost map
    const ingredients = await ctx.db
      .query('ingredients')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    const cost = new Map(ingredients.map((i) => [i._id, i.lastCostPerUnitIDR]));
    const byName = new Map<string, { qty: number; revenueIDR: number; cogsIDR: number }>();
    for (const o of paid) {
      for (const l of o.lines) {
        const unitCogs = (l.recipeSnapshot ?? []).reduce(
          (s, rl) => s + rl.qty * rl.wastageFactor * (cost.get(rl.ingredientId) ?? 0), 0);
        const cur = byName.get(l.nameSnapshot) ?? { qty: 0, revenueIDR: 0, cogsIDR: 0 };
        cur.qty += l.qty;
        cur.revenueIDR += l.lineTotalIDR;
        cur.cogsIDR += l.qty * unitCogs;
        byName.set(l.nameSnapshot, cur);
      }
    }
    const items = Array.from(byName, ([name, a]) => {
      const marginIDR = a.revenueIDR - a.cogsIDR;
      return {
        name, qty: a.qty, revenueIDR: a.revenueIDR, cogsIDR: a.cogsIDR, marginIDR,
        marginPct: a.revenueIDR === 0 ? 0 : Math.round((marginIDR / a.revenueIDR) * 100),
      };
    }).sort((x, y) => y.marginIDR - x.marginIDR || y.revenueIDR - x.revenueIDR
      || x.name.localeCompare(y.name, 'id-ID'));
    const totalRevenueIDR = items.reduce((s, i) => s + i.revenueIDR, 0);
    const totalCogsIDR = items.reduce((s, i) => s + i.cogsIDR, 0);
    return { items, totalRevenueIDR, totalCogsIDR, totalMarginIDR: totalRevenueIDR - totalCogsIDR, fromKey, toKey };
  },
});
```
> `paidInRange` currently returns `{ cafeId, tz, fromKey, toKey, paid }` — `cafeId` is
> available. Confirm the `by_cafe_active` index name on `ingredients` (used by
> `ingredients.list`); if different, use the actual index.

`margin` is a new export in the already-registered `reports` module → no `api.d.ts` change,
no codegen.

## Frontend — `src/routes/_pos/reports/margin.tsx` (new route)

Mirror `src/routes/_pos/reports/products.tsx` (inherits `canViewReports` + `RangePicker`
from the reports layout):
- `useReportRange()` → `{ range }`; `useQuery(api.reports.margin, { range })`.
- A small header: total revenue, total COGS, total margin (`formatIDR`).
- A `DataTable`: columns Item, Terjual (qty), Pendapatan (revenue), Biaya (COGS), Margin,
  Margin % (a `Badge`, tinted by sign — e.g. destructive when marginPct < 0). Sorted by
  margin desc.
- CSV export via `~/lib/csv` (`toCSV`/`downloadCSV`) — match the real signatures used in
  `products.tsx`/`payments.tsx`.
- Loading → `Spinner`; empty → `Empty` ("Belum ada penjualan pada rentang ini.").
- A footnote: "Margin memakai biaya bahan terkini." (COGS uses current ingredient cost.)

### Reports nav tab — `src/routes/_pos/reports/route.tsx`
Add `{ to: '/reports/margin', label: <Trans>Margin</Trans> }` to `TABS` (after
`/reports/products`, near the other item-level reports).

> **New route** → commit the regenerated `src/routeTree.gen.ts`.

## Testing

**`tests/convex/reports.test.ts`** (extend; mirror the existing `products` test setup —
seed item + recipe + ingredient cost, sell via `createCashSale`):
- A sold item with a recipe → `margin` returns the item with `revenueIDR` = line revenue,
  `cogsIDR` = qty × Σ(recipeQty × wastage × ingredientCost), `marginIDR` = revenue − cogs,
  `marginPct` correct; totals sum across items.
- An item with **no recipe** → `cogsIDR` 0, `marginPct` 100.
- A voided order is excluded (paidInRange filters paid) — sanity (if cheap).

Frontend (table, totals, CSV) validated by typecheck + the existing reports e2e smoke.

## i18n

New Bahasa Indonesia strings: `Margin`, `Terjual`, `Pendapatan`, `Biaya`,
`Margin memakai biaya bahan terkini.`, `Belum ada penjualan pada rentang ini.` (+ reuse
`Item`, `Unduh CSV`, `Total`). Run `pnpm lingui:extract`, fill `en` (`Margin`, `Sold`,
`Revenue`, `Cost`, `Margin uses current ingredient cost.`, `No sales in this range.`), then
`pnpm lingui:compile`.

## Conventions

- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`;
  `git status` clean.
- Do NOT run `convex codegen` — `margin` is a new export in the registered `reports`
  module; no schema change.
- **New route** → commit the regenerated `src/routeTree.gen.ts`.
- Small conventional commits; PR → review → merge commit.

## Out of scope

- Historical/weighted-average COGS (uses current ingredient cost).
- Full P&L (revenue − COGS − operating expenses); this is item-level gross margin only.
- Modifier-level cost attribution (modifiers add to revenue via `lineTotalIDR` but have no
  recipe/cost — they inflate margin slightly; noted, not modeled).
- Labor/overhead allocation.
