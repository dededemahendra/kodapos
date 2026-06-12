# Profit & Loss Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** A read-only Reports → Laba/Rugi tab: revenue − COGS − operating expenses = net profit, over a date range. Composes the existing margin (COGS) + expenses logic.

**Architecture:** A new `reports.profitLoss` query reusing `paidInRange` (revenue + recipe COGS, like `margin`) + the `expenses` table (operating expenses, by category). A `/reports/profit-loss` route renders a statement. No schema change.

---

## File Structure
- **Modify:** `convex/reports.ts` (`profitLoss` query), `src/routes/_pos/reports/route.tsx` (tab), `src/routeTree.gen.ts` (regenerated).
- **Create:** `src/routes/_pos/reports/profit-loss.tsx`.
- **Test:** `tests/convex/reports.test.ts` (additions).
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — `reports.profitLoss` (TDD)
**Files:** modify `convex/reports.ts`; test `tests/convex/reports.test.ts`.

READ: `convex/reports.ts` — the `margin` query (revenue + COGS via ingredient cost map) + the `paidInRange` helper (returns `{ cafeId, tz, fromKey, toKey, paid }`); `convex/lib/time.ts` `resolveRange` (→ `{ startMs, endMs }`); the `expenses` table query in `convex/expenses.ts` (`by_cafe_at` index); the existing `margin` + a `reports`/expenses test for seeding.

- [ ] **Step 1: FAILING tests** (append to `tests/convex/reports.test.ts`):
  - Seed an ingredient (cost 1000) + item (price 10000) + recipe (qty 2, wastage 1 → unit COGS 2000); sell qty 3 (`createCashSale`) → revenue 30000, cogs 6000. Record an expense (`api.expenses.record`, e.g. 10000). `reports.profitLoss({ range })` → `revenueIDR 30000`, `cogsIDR 6000`, `grossProfitIDR 24000`, `expensesIDR 10000`, `netProfitIDR 14000`, `grossMarginPct 80`, `netMarginPct 47` (Math.round(14000/30000*100)=47); `expensesByCategory` has the recorded category.
  - Expenses exceed gross → `netProfitIDR < 0` and `netMarginPct < 0`.
  - A voided order is excluded.
  > Copy the recipe/sale/expense seeding from the margin + expenses tests; use deterministic dates like the other reports tests. Run → confirm FAIL.
- [ ] **Step 2: implement `profitLoss`** in `convex/reports.ts` — the exact code from the design spec (after `margin`). Reuse `paidInRange` (destructure `cafeId, tz, fromKey, toKey, paid`); ingredient cost map via `by_cafe_active`; COGS per line from `recipeSnapshot`; expenses via `resolveRange` + `by_cafe_at`; gross/net + the two pcts (0 when revenue 0; netMarginPct can be negative).
- [ ] **Step 3: tests + typecheck + commit**
  `pnpm test tests/convex/reports.test.ts` + full `pnpm test` PASS; `pnpm typecheck` PASS. Commit:
  `git add convex/reports.ts tests/convex/reports.test.ts && git commit -m "feat(reports): profit & loss query (revenue − COGS − expenses)"`
  > Do NOT run codegen.

---

### Task 2: Frontend — P&L statement page + tab
**Files:** create `src/routes/_pos/reports/profit-loss.tsx`; modify `src/routes/_pos/reports/route.tsx`; commit `src/routeTree.gen.ts`.

READ: `src/routes/_pos/reports/margin.tsx` + `expenses.tsx` (useReportRange, totals header, `~/lib/csv` `toCSV`/`downloadCSV`, Empty/Spinner, Badge); `src/components/expenses/expense-categories.tsx` (`EXPENSE_CATEGORY_OPTIONS`); `~/lib/money` (`formatIDR`); `src/routes/_pos/reports/route.tsx` (TABS).

- [ ] **Step 1: `profit-loss.tsx`** — `createFileRoute('/_pos/reports/profit-loss')`; `useReportRange()` → `{ range }`; `useQuery(api.reports.profitLoss, { range })`. Render a **statement** (a card / vertical rows, NOT a DataTable):
  - rows: `Pendapatan` revenueIDR; `− HPP` cogsIDR; `= Laba kotor` grossProfitIDR (bold) + a `{grossMarginPct}%` `Badge`; `− Pengeluaran` expensesIDR with the per-category breakdown indented (map `expensesByCategory`, label via `EXPENSE_CATEGORY_OPTIONS`, `−formatIDR`); `= Laba bersih` netProfitIDR (bold/larger) + a `{netMarginPct}%` Badge tinted destructive when `netProfitIDR < 0` else success/primary.
  - `data === undefined` → `Spinner`; if `data.revenueIDR === 0 && data.expensesIDR === 0` → `Empty` (icon `Scale`/`TrendingUp`, title "Belum ada data pada rentang ini.", desc "Coba ubah rentang tanggal di atas.").
  - A "Unduh CSV" button (the 5 statement lines) via `toCSV`/`downloadCSV` — match the expenses.tsx usage shape.
  - Footnote `<p className="text-muted-foreground text-xs">`: `<Trans>HPP memakai biaya bahan terkini; pengeluaran di luar inventaris.</Trans>`.
  Use `formatIDR` + `tabular-nums` for all amounts.
- [ ] **Step 2: tab** — add `{ to: '/reports/profit-loss', label: <Trans>Laba/Rugi</Trans> }` to `TABS` in `reports/route.tsx` after the margin entry.
- [ ] **Step 3: routeTree** — `pnpm build`; confirm `grep "PosReportsProfitLossRoute\|reports/profit-loss" src/routeTree.gen.ts`; stage it.
- [ ] **Step 4:** `pnpm typecheck` + `pnpm test` PASS. Commit:
  `git add src/routes/_pos/reports/profit-loss.tsx src/routes/_pos/reports/route.tsx src/routeTree.gen.ts && git commit -m "feat(reports): profit & loss statement tab"`

---

### Task 3: i18n
New: `Laba/Rugi`, `Pendapatan`, `HPP`, `Laba kotor`, `Pengeluaran`, `Laba bersih`, `HPP memakai biaya bahan terkini; pengeluaran di luar inventaris.` (+ reuse `Belum ada data pada rentang ini.`, `Coba ubah rentang tanggal di atas.`, `Unduh CSV`, `Margin %`, category labels).
- [ ] `pnpm lingui:extract`; fill `en` (`Profit/Loss`, `Revenue`, `COGS`, `Gross profit`, `Expenses`, `Net profit`, `COGS uses current ingredient cost; expenses exclude inventory.`) + any other new empties; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 4: Final verification
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; `git status` clean — **routeTree.gen.ts committed**.
- [ ] **Manual sanity:** `/reports` shows a "Laba/Rugi" tab; it reads Pendapatan − HPP = Laba kotor (with %), − Pengeluaran (by category) = Laba bersih (with %, red when negative) for the picked range; CSV downloads; matches the margin + expenses tabs' totals for the same range.

---

## Self-Review
**Spec coverage:** profitLoss query — revenue + recipe COGS + expenses + gross/net + pcts (T1); statement page + category breakdown + CSV + footnote + tab + routeTree (T2); tests for the math + negative net + void-excluded (T1); i18n (T3). ✓
**Placeholder scan:** test seeding "copy from margin/expenses tests". Else spec code.
**Type consistency:** `profitLoss` returns `{ revenueIDR, cogsIDR, grossProfitIDR, expensesIDR, expensesByCategory:[{category,amountIDR}], netProfitIDR, grossMarginPct, netMarginPct, fromKey, toKey }` consumed exactly by the statement page; `expensesByCategory.category` union matches `EXPENSE_CATEGORY_OPTIONS`. Reuses `paidInRange`/`resolveRange`/`by_cafe_active`/`by_cafe_at` as in margin/expenses. ✓
