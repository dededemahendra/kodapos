# Item Margin Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A read-only Reports → Margin tab: per-item units sold, revenue, COGS (from recipe × current ingredient cost), gross margin, and margin % over a date range.

**Architecture:** A new `reports.margin` query reusing `paidInRange`, aggregating per item with COGS from each line's `recipeSnapshot` × a current ingredient-cost map. A `/reports/margin` route mirrors `products.tsx` and inherits the `canViewReports` gate. No schema change, no mutation, off the sale path.

**Tech Stack:** Convex (query), React + shadcn (DataTable/Badge/Empty), Lingui, convex-test/Vitest.

---

## File Structure
- **Modify:** `convex/reports.ts` (`margin` query), `src/routes/_pos/reports/route.tsx` (tab), `src/routeTree.gen.ts` (regenerated).
- **Create:** `src/routes/_pos/reports/margin.tsx`.
- **Test:** `tests/convex/reports.test.ts` (additions).
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — `reports.margin` query (TDD)

**Files:** modify `convex/reports.ts`; test `tests/convex/reports.test.ts`.

READ first: `convex/reports.ts` `products` query + the `paidInRange` helper (returns
`{ cafeId, tz, fromKey, toKey, paid }`); `convex/recipes.ts` lines ~63–104 (the
`qty × wastageFactor × lastCostPerUnitIDR` cost formula); `convex/ingredients.ts` `list`
(the `by_cafe_active` index); the existing `products` test in `tests/convex/reports.test.ts`
(seeding: item + recipe + ingredient + `createCashSale`).

- [ ] **Step 1: Write FAILING tests** (append to `tests/convex/reports.test.ts`)
```ts
describe('reports.margin', () => {
  it('computes per-item revenue, COGS, and margin', async () => {
    // seed: ingredient with lastCostPerUnitIDR = 1000, stock; item priceIDR = 10000;
    // recipe: 1 line, qty 2, wastage 1 → unit COGS = 2*1*1000 = 2000.
    // sell qty 3 via createCashSale → revenue = 30000 (3 * lineTotal 10000), cogs = 3*2000 = 6000.
    const data = await asOwner.query(api.reports.margin, { range: { preset: 'today' } });
    const row = data.items.find((i) => i.name === '<item name>');
    expect(row?.qty).toBe(3);
    expect(row?.revenueIDR).toBe(30000);
    expect(row?.cogsIDR).toBe(6000);
    expect(row?.marginIDR).toBe(24000);
    expect(row?.marginPct).toBe(80);
    expect(data.totalMarginIDR).toBe(24000);
  });

  it('treats an item with no recipe as full margin (0 COGS)', async () => {
    // item with no recipe; sell it; cogsIDR 0, marginPct 100.
  });
});
```
> Copy the EXACT seeding (ingredient `upsert`, recipe `upsert`, `createCashSale` arg shape,
> the item name/price) from the existing `products`/recipe tests. Use the real recipe API
> (`api.recipes.upsert` with `{ menuItemId, lines: [{ ingredientId, qty, wastageFactor }] }`).

Run `pnpm test tests/convex/reports.test.ts` → FAIL (`margin` undefined).

- [ ] **Step 2: Implement `margin`** in `convex/reports.ts` — the exact code in the design
spec (`docs/superpowers/specs/2026-06-11-margin-report-design.md`, "Backend" section).
Place it after `products`. Reuses `paidInRange` (destructure `cafeId` too), builds the
ingredient cost map via the `by_cafe_active` index, aggregates by `nameSnapshot`, computes
`marginPct` (0 when revenue 0), sorts by `marginIDR` desc, returns the `items` + totals +
`fromKey`/`toKey`.

- [ ] **Step 3: Tests + typecheck + commit**
`pnpm test tests/convex/reports.test.ts` → PASS. `pnpm typecheck` → PASS.
```bash
git add convex/reports.ts tests/convex/reports.test.ts
git commit -m "feat(reports): per-item margin query (revenue vs recipe COGS)"
```
> Do NOT run `convex codegen` (new export in a registered module).

---

### Task 2: Frontend — margin report page + tab

**Files:** create `src/routes/_pos/reports/margin.tsx`; modify `src/routes/_pos/reports/route.tsx`; commit regenerated `src/routeTree.gen.ts`.

READ `src/routes/_pos/reports/products.tsx` (the closest mirror: `useReportRange`, DataTable
columns, `~/lib/csv` `toCSV`/`downloadCSV` real signatures, Empty/Spinner) and the just-built
`src/routes/_pos/reports/expenses.tsx` (for the `toCSV(rows, columns)` object-shape usage and
the total-header pattern).

- [ ] **Step 1: `src/routes/_pos/reports/margin.tsx`**
A report page:
- `export const Route = createFileRoute('/_pos/reports/margin')({ component: MarginReport });`
- `const { range } = useReportRange(); const data = useQuery(api.reports.margin, { range });`
- Header row: `Pendapatan` total, `Biaya` total, `Margin` total (`formatIDR`, `tabular-nums`)
  + a "Unduh CSV" button (disabled when no rows).
- `DataTable` columns: `Item` (name), `Terjual` (qty), `Pendapatan` (revenueIDR), `Biaya`
  (cogsIDR), `Margin` (marginIDR), `Margin %` (a `Badge`; `variant="destructive"` when
  `marginPct < 0`, else `secondary`, showing `${marginPct}%`). `initialSort` by margin desc
  (the query already sorts; the table can default to revenue or margin — set
  `initialSort=[{ id: 'marginIDR', desc: true }]`). Provide `emptyState` (DataTable requires
  it — pass the `Empty` element or `null` and handle empty separately, matching expenses.tsx).
- CSV: `toCSV(rows, columns)` where `rows` are objects `{ name, qty, revenueIDR, cogsIDR, marginIDR, marginPct }` and `columns` are `{ key, header }[]` — copy the exact `toCSV` shape used in `expenses.tsx`. `downloadCSV('margin.csv', csv)`.
- Loading (`data === undefined`) → `Spinner`; `data.items.length === 0` → `Empty`
  ("Belum ada penjualan pada rentang ini.").
- A footnote `<p className="text-muted-foreground text-xs">`:
  `<Trans>Margin memakai biaya bahan terkini.</Trans>`.

> Match the REAL `DataTable`/`Empty`/`Badge`/`toCSV`/`downloadCSV` APIs (the expenses slice
> already established them: `DataTable` needs `emptyState`; `Badge` has no `muted`; `toCSV`
> is `(rows, columns)`). Verify before finalizing.

- [ ] **Step 2: tab** — add to `TABS` in `src/routes/_pos/reports/route.tsx` after the
products entry: `{ to: '/reports/margin', label: <Trans>Margin</Trans> },`

- [ ] **Step 3: regenerate route tree** — run `pnpm build` (the TanStack vite plugin
regenerates `src/routeTree.gen.ts`); confirm it contains `reports/margin`. Stage it.

- [ ] **Step 4: typecheck + test + commit**
`pnpm typecheck` → PASS (proves routeTree regenerated). `pnpm test` → PASS.
```bash
git add src/routes/_pos/reports/margin.tsx src/routes/_pos/reports/route.tsx src/routeTree.gen.ts
git commit -m "feat(reports): margin report tab (per-item profitability + CSV)"
```

---

### Task 3: i18n
New strings: `Margin`, `Terjual`, `Pendapatan`, `Biaya`, `Margin memakai biaya bahan terkini.`,
`Belum ada penjualan pada rentang ini.` (+ reuse `Item`, `Unduh CSV`, `Total`, `Margin %`).

- [ ] **Step 1:** `pnpm lingui:extract`.
- [ ] **Step 2:** Fill `en` for new empties:

| id | en |
|---|---|
| `Margin` | `Margin` |
| `Terjual` | `Sold` |
| `Pendapatan` | `Revenue` |
| `Biaya` | `Cost` |
| `Margin %` | `Margin %` |
| `Margin memakai biaya bahan terkini.` | `Margin uses current ingredient cost.` |
| `Belum ada penjualan pada rentang ini.` | `No sales in this range.` |

(Leave already-filled entries untouched. Fill ANY other new empty `en` surfaced.)

- [ ] **Step 3:** `pnpm lingui:compile` → `en` 0 missing.
- [ ] **Step 4:** `git add src/locales && git commit -m "i18n(reports): margin report strings + en fill"`

---

### Task 4: Final verification
- [ ] `pnpm typecheck` → PASS
- [ ] `pnpm test` → PASS (all suites)
- [ ] `pnpm lingui:compile` → `en` 0 missing
- [ ] `git status` → clean — **confirm `src/routeTree.gen.ts` committed**.
- [ ] **Manual sanity:** `/reports` shows a "Margin" tab (canViewReports); it lists items
  with revenue/COGS/margin/margin% for the range + totals; an item with no recipe shows 100%
  margin; CSV downloads; sale flow untouched.

---

## Self-Review
**Spec coverage:** `margin` query with COGS from recipeSnapshot × current cost, totals,
sort, no-recipe→0 COGS (T1); report page + totals + CSV + footnote (T2); tab + routeTree
(T2); tests for margin math + no-recipe (T1); i18n (T3). ✓
**Placeholder scan:** none — query code in the spec; test seeding says "copy real recipe/sale
calls". Frontend says "match the real DataTable/Badge/toCSV APIs the expenses slice
established".
**Type consistency:** `reports.margin` returns `{ items:[{name,qty,revenueIDR,cogsIDR,marginIDR,marginPct}], total*, fromKey, toKey }` (T1) consumed exactly in the page (T2). Range via `useReportRange` + `rangeArg`. Gated by the reports-layout `canViewReports`. ✓
