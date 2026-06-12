# Profit & Loss Report Design Spec

**Date:** 2026-06-11
**Branch:** `feat/profit-loss` (off `main`)

## Context

The app already computes per-item revenue + recipe COGS (the margin report, `reports.margin`)
and operating expenses (`expenses.list`). This slice composes them into one **Profit & Loss**
statement over a date range:

```
Pendapatan (revenue)        = Σ paid order totals
− HPP / COGS                = Σ recipe ingredient cost of sold items
= Laba kotor (gross profit)
− Pengeluaran (operating expenses, by category)
= Laba bersih (net profit)
```

Read-only reporting — a new `reports.profitLoss` query + a `/reports/profit-loss` tab. No
schema change, no money-path contact.

## COGS basis (state it in the UI)

COGS is **recipe-based at current ingredient cost** — the same basis the margin report uses
(`line.qty × Σ(recipeLine.qty × wastageFactor × ingredient.lastCostPerUnitIDR)`). It's a
managerial estimate, not strict accounting: it does **not** double-count inventory purchases
(operating expenses here are the **non-inventory** expenses table — rent/utilities/supplies/
salary/other), and items without a recipe contribute 0 COGS. A one-line UI footnote says so.

## Backend — `convex/reports.ts` `profitLoss`

A new query alongside `margin`/`payments`, reusing `paidInRange` + `resolveRange`:
```ts
export const profitLoss = query({
  args: { range: rangeArg },
  returns: v.object({
    revenueIDR: v.number(),
    cogsIDR: v.number(),
    grossProfitIDR: v.number(),
    expensesIDR: v.number(),
    expensesByCategory: v.array(v.object({
      category: v.union(v.literal('rent'), v.literal('utilities'), v.literal('supplies'), v.literal('salary'), v.literal('other')),
      amountIDR: v.number(),
    })),
    netProfitIDR: v.number(),
    grossMarginPct: v.number(), // 0..100, 0 when revenue is 0
    netMarginPct: v.number(),   // can be negative
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { range }) => {
    const { cafeId, tz, fromKey, toKey, paid } = await paidInRange(ctx, range);
    // Revenue + recipe COGS (mirror the margin computation).
    const ingredients = await ctx.db.query('ingredients')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId)).collect();
    const cost = new Map(ingredients.map((i) => [i._id, i.lastCostPerUnitIDR]));
    let revenueIDR = 0, cogsIDR = 0;
    for (const o of paid) {
      revenueIDR += o.totalIDR;
      for (const l of o.lines) {
        const unitCogs = (l.recipeSnapshot ?? []).reduce(
          (s, rl) => s + rl.qty * rl.wastageFactor * (cost.get(rl.ingredientId) ?? 0), 0);
        cogsIDR += l.qty * unitCogs;
      }
    }
    // Operating expenses in the same range (the non-inventory expenses table).
    const { startMs, endMs } = resolveRange(tz, range, Date.now());
    const expenses = await ctx.db.query('expenses')
      .withIndex('by_cafe_at', (q) => q.eq('cafeId', cafeId).gte('at', startMs).lte('at', endMs))
      .collect();
    const byCat = new Map<string, number>();
    let expensesIDR = 0;
    for (const e of expenses) { expensesIDR += e.amountIDR; byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amountIDR); }
    const grossProfitIDR = revenueIDR - cogsIDR;
    const netProfitIDR = grossProfitIDR - expensesIDR;
    return {
      revenueIDR, cogsIDR, grossProfitIDR, expensesIDR,
      expensesByCategory: [...byCat.entries()].map(([category, amountIDR]) => ({ category: category as 'rent'|'utilities'|'supplies'|'salary'|'other', amountIDR })),
      netProfitIDR,
      grossMarginPct: revenueIDR === 0 ? 0 : Math.round((grossProfitIDR / revenueIDR) * 100),
      netMarginPct: revenueIDR === 0 ? 0 : Math.round((netProfitIDR / revenueIDR) * 100),
      fromKey, toKey,
    };
  },
});
```
> Confirm `paidInRange` returns `tz` (it does); if `cafeId`/`tz` aren't both destructurable,
> read them as it actually exposes. `by_cafe_active`/`by_cafe_at` index names match the
> margin/expenses queries. New export in the registered `reports` module → no api.d.ts change.

## Frontend — `src/routes/_pos/reports/profit-loss.tsx` (new route)

Inherits the `canViewReports` gate + `RangePicker` from the reports layout. `useReportRange()`
→ `{ range }`; `useQuery(api.reports.profitLoss, { range })`. Render a **statement** (not a
table):
- A vertical list of rows, each `label … rightaligned amount` (`formatIDR`, `tabular-nums`):
  - **Pendapatan** `revenueIDR`
  - **− HPP** `cogsIDR` (a minus tint)
  - **= Laba kotor** `grossProfitIDR` (bold) + a small `grossMarginPct%` badge
  - **− Pengeluaran** `expensesIDR` — with the per-category breakdown indented beneath
    (reuse `EXPENSE_CATEGORY_OPTIONS` labels), each `category … −amount`
  - **= Laba bersih** `netProfitIDR` (bold, larger) + a `netMarginPct%` badge; tint
    **destructive** when negative, **success/primary** when positive.
- Loading → `Spinner`; an all-zero range still renders the statement (zeros) — no Empty needed,
  but if `revenueIDR === 0 && expensesIDR === 0` show an `Empty` ("Belum ada data pada rentang
  ini." + a date-range hint) instead.
- A footnote: "HPP memakai biaya bahan terkini; pengeluaran di luar inventaris." (COGS uses
  current ingredient cost; expenses exclude inventory.)
- CSV export (the 5 statement lines) via `~/lib/csv` `toCSV`/`downloadCSV` (match the
  expenses/margin usage).

### Tab — `src/routes/_pos/reports/route.tsx`
Add `{ to: '/reports/profit-loss', label: <Trans>Laba/Rugi</Trans> }` to `TABS` (after
`/reports/margin`, grouping the financial reports).

> **New route** → commit the regenerated `src/routeTree.gen.ts`.

## Testing
**`tests/convex/reports.test.ts`** (extend; mirror the margin + expenses test seeding):
- Seed ingredient cost + item + recipe; sell qty N (revenue + cogs known); record an expense;
  `profitLoss` over the range → `revenueIDR`, `cogsIDR`, `grossProfitIDR = rev − cogs`,
  `expensesIDR`, `expensesByCategory`, `netProfitIDR = gross − expenses`, and the two margin
  pcts. Use concrete numbers (e.g. rev 30000, cogs 6000 → gross 24000; expense 10000 → net
  14000; grossMarginPct 80, netMarginPct 47).
- Net profit goes **negative** when expenses exceed gross (assert `netProfitIDR < 0`,
  `netMarginPct < 0`).
- A voided order is excluded (paidInRange filters paid).

Frontend (statement, CSV, footnote) by typecheck + reports e2e smoke.

## i18n
New BI: `Laba/Rugi`, `Pendapatan`, `HPP`, `Laba kotor`, `Pengeluaran`, `Laba bersih`,
`HPP memakai biaya bahan terkini; pengeluaran di luar inventaris.` (+ reuse `Margin %`/`Total`/
report range strings). Run `pnpm lingui:extract`, fill `en` (`Profit/Loss`, `Revenue`, `COGS`,
`Gross profit`, `Expenses`, `Net profit`, …), compile.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — `profitLoss` is a new export in the registered `reports` module.
- **New route** → commit `routeTree.gen.ts`.
- Small conventional commits; PR → review → merge commit.

## Out of scope
- Strict/inventory-valued COGS (uses recipe × current cost); including inventory purchases or
  waste as separate P&L lines; tax/PB1 as an expense line; period-over-period comparison;
  per-category profit; scheduled/emailed statements; a balance sheet or cash-flow statement.
