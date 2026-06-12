# Other Income Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Money-adjacent (feeds P&L net profit) but low-risk ledger.

**Goal:** An `otherIncome` ledger (mirror of `expenses`) + a P&L "Pendapatan lain" line so net profit accounts for non-sales income.

---

## File Structure
- **Create:** `convex/otherIncome.ts`, `tests/convex/other-income.test.ts`, `src/routes/_pos/reports/other-income.tsx`, `src/components/income/income-dialog.tsx`.
- **Modify:** `convex/schema.ts`, `convex/reports.ts` (`profitLoss`), `convex/_generated/api.d.ts`, `src/routes/_pos/reports/profit-loss.tsx`, `src/components/app-shared.tsx`, `src/routeTree.gen.ts`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — otherIncome table + record/list/remove + P&L integration (TDD)
**Files:** create `convex/otherIncome.ts`, `tests/convex/other-income.test.ts`; modify `convex/schema.ts`, `convex/reports.ts`, `convex/_generated/api.d.ts`.

READ: `convex/expenses.ts` (mirror `record`/`list`/`remove` exactly, swapping the `category` enum for a freeform `source` string), `convex/reports.ts` `profitLoss` (the handler to extend), `convex/lib/time.ts` (`rangeArg`/`resolveRange`/`tzFor`), `convex/lib/auth.ts` (`requireOwnerCafe`/`requireOwned`), `tests/convex/expenses.test.ts` (copy the setup + assertions).

- [ ] **Step 1: schema** — add `otherIncome` table (`cafeId`, `source: v.string()`, `amountIDR`, `note?`, `at`) with `by_cafe_at` (`['cafeId','at']`).
- [ ] **Step 2: FAILING tests** (`tests/convex/other-income.test.ts`, mirror expenses tests):
  - `record` → `list` returns it, `totalIDR` correct; rejects `amountIDR` 0 / negative / non-integer (`/nol/i`) and empty/whitespace `source` (`/sumber/i`).
  - `list` range-scoped (an entry stamped outside the window is excluded) + newest-first.
  - `remove` deletes; a foreign cafe's row → throws on `remove`.
  - P&L: seed a paid order (revenue) + an `expenses.record` + an `otherIncome.record`; `reports.profitLoss` returns `otherIncomeIDR` and `netProfitIDR === grossProfitIDR − expensesIDR + otherIncomeIDR`.
  Run → confirm FAIL.
- [ ] **Step 3: implement `convex/otherIncome.ts`** — `record({ source, amountIDR, note? })` (validate amount int>0 `'Jumlah harus lebih dari nol.'`, trimmed source 1–60 `'Sumber pendapatan wajib diisi.'`, insert `at: Date.now()`); `list({ range })` → `{ rows:[{id,at,source,amountIDR,note?}], totalIDR }` over `by_cafe_at` desc in range; `remove({ id })` (`requireOwned(... 'Pendapatan')`). Proper return validators.
- [ ] **Step 4: extend `convex/reports.ts` `profitLoss`** — after the expenses sum, query `otherIncome` over the same `by_cafe_at` `[startMs,endMs]` window, sum → `otherIncomeIDR`; `netProfitIDR = grossProfitIDR − expensesIDR + otherIncomeIDR`; add `otherIncomeIDR: v.number()` to `returns`; recompute `netMarginPct` from the new net.
- [ ] **Step 5: register + tests + commit** — api.d.ts (`otherIncome`); `pnpm test tests/convex/other-income.test.ts` + full PASS; `pnpm typecheck` PASS. Commit:
  `git add convex/otherIncome.ts convex/schema.ts convex/reports.ts convex/_generated/api.d.ts tests/convex/other-income.test.ts && git commit -m "feat(reports): other-income ledger + P&L net-profit line"`
  > Do NOT run codegen.

---

### Task 2: Frontend — other-income page + dialog + nav + P&L line
**Files:** create `src/routes/_pos/reports/other-income.tsx`, `src/components/income/income-dialog.tsx`; modify `src/routes/_pos/reports/profit-loss.tsx`, `src/components/app-shared.tsx`; commit `src/routeTree.gen.ts`.

READ: `src/routes/_pos/reports/expenses.tsx` (mirror the whole page: range, DataTable, CSV, ConfirmDialog, Empty, total), `src/components/expenses/expense-dialog.tsx` (mirror the dialog), `src/routes/_pos/reports/profit-loss.tsx` (the line list + CSV rows + empty check), `src/components/app-shared.tsx` (the "Pengeluaran" reports nav entry).

- [ ] **Step 1: `income-dialog.tsx`** — a `source` `Input`, an `amountIDR` numeric `Input`, an optional `note` `Input`; submit → `api.otherIncome.record`; validate (source non-empty, amount int>0) before submit; toast success/error; reset + close on success. Mirror `expense-dialog.tsx` (drop the category Select).
- [ ] **Step 2: `other-income.tsx`** — `createFileRoute('/_pos/reports/other-income')`; `useReportRange`; `api.otherIncome.list`; "Tambah" button → the dialog; `DataTable` (Tanggal, Sumber, Catatan, Jumlah) + total; CSV via `toCSV`/`downloadCSV`; delete `ConfirmDialog` → `api.otherIncome.remove`; `Empty` (icon `Coins`, "Belum ada pendapatan lain.", desc); `Spinner` while `data === undefined`. Mirror `expenses.tsx`.
- [ ] **Step 3: P&L line** — `profit-loss.tsx`: add a positive "+ Pendapatan lain" row (`+{formatIDR(data.otherIncomeIDR)}`) between "− Pengeluaran" and "= Laba bersih" (both the on-screen `<dl>` and the `lines` array used for CSV); include `otherIncomeIDR` in the no-data empty check (`revenueIDR === 0 && expensesIDR === 0 && otherIncomeIDR === 0`).
- [ ] **Step 4: nav** — `app-shared.tsx`: add `{ ... msg\`Pendapatan Lain\`, path: '/reports/other-income', icon: <Coins />, requires: <same as Pengeluaran> }` near the Expenses report item (import `Coins` from lucide-react).
- [ ] **Step 5: routeTree** — `pnpm build`; confirm `grep -c "other-income\|OtherIncome" src/routeTree.gen.ts` > 0; stage it.
- [ ] **Step 6:** typecheck + test PASS. Commit:
  `git add src/routes/_pos/reports/other-income.tsx src/components/income/income-dialog.tsx src/routes/_pos/reports/profit-loss.tsx src/components/app-shared.tsx src/routeTree.gen.ts && git commit -m "feat(reports): other-income page + dialog + nav + P&L line"`

---

### Task 3: i18n
New: `Pendapatan Lain`, `Sumber`, `Tambah pendapatan`, `Belum ada pendapatan lain.`, `+ Pendapatan lain`, `Catatan`, `Jumlah` (reuse existing where present).
- [ ] `pnpm lingui:extract`; fill `en` (`Other income`, `Source`, `Add income`, `No other income yet.`, `+ Other income`, …) for every new empty entry; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 4: Final verification
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; `git status` clean — **routeTree.gen.ts committed**.
- [ ] **Manual sanity:** add an other-income entry → it lists with the right total; the P&L shows a "+ Pendapatan lain" line and net profit rises by that amount; delete works; CSV includes the line.

---

## Self-Review
**Spec coverage:** table + record/list/remove (T1); P&L `otherIncomeIDR` + net formula (T1); page + dialog + nav (T2); P&L line + CSV (T2); tests ledger + range + scope + P&L net (T1); i18n (T3). ✓
**Placeholder scan:** test seeding "copy from expenses tests"; UI "mirror expenses page/dialog". Else spec code.
**Type consistency:** `otherIncome.record({source,amountIDR,note?})` ↔ dialog submit; `list` `{rows,totalIDR}` ↔ table; `profitLoss` adds `otherIncomeIDR` consumed by the P&L line + CSV + empty check. ✓
