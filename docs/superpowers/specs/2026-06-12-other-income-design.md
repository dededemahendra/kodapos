# Other Income Design Spec

**Date:** 2026-06-12
**Branch:** `feat/other-income` (off `main`)

## Context

kodapos tracks operating **expenses** (`expenses` table + `/reports/expenses`) and folds
them into the P&L, but has no counterpart for **non-sales income** — money that isn't a
menu sale: space rental, equipment resale, supplier rebates, grants, interest. As a result
the P&L's "Laba bersih" (net profit) is incomplete: it stops at `gross profit − expenses`
and can't account for other income. This slice adds an `otherIncome` ledger that mirrors the
expenses ledger and feeds a new line into the P&L statement.

Money-adjacent (it changes net profit) but low-risk: it's an append/delete ledger with no
stock or payment side effects.

## Model — new `otherIncome` table

```ts
otherIncome: defineTable({
  cafeId: v.id('cafes'),
  source: v.string(),          // freeform, e.g. "Sewa tempat", "Penjualan alat"
  amountIDR: v.number(),
  note: v.optional(v.string()),
  at: v.number(),
}).index('by_cafe_at', ['cafeId', 'at']),
```

Mirrors `expenses` exactly except the fixed `category` enum is replaced by a freeform
`source` string (income sources vary too much for a useful fixed enum; YAGNI on a taxonomy).
The `by_cafe_at` index drives the dated range queries.

## Backend — `convex/otherIncome.ts` (new, owner-gated)

Mirror `convex/expenses.ts`:
- **`record({ source, amountIDR, note? })`**: `requireOwnerCafe`; validate `amountIDR`
  integer > 0 (`'Jumlah harus lebih dari nol.'`) and trimmed `source` length 1–60
  (`'Sumber pendapatan wajib diisi.'`); insert `{ cafeId, source, amountIDR, note?, at: Date.now() }`.
  Returns the id.
- **`list({ range })`** (uses the shared `rangeArg`/`resolveRange`/`tzFor` from `lib/time`,
  like `expenses.list`): rows newest-first over `by_cafe_at` in range → `{ rows: [{ id, at,
  source, amountIDR, note? }], totalIDR }`.
- **`remove({ id })`**: `requireOwnerCafe` + `requireOwned(... 'Pendapatan')`; delete.

## P&L integration — `convex/reports.ts` `profitLoss`

Add other income to the existing handler:
- After summing `expenses` in range, query `otherIncome` over the same `by_cafe_at` window
  and sum → `otherIncomeIDR`.
- `netProfitIDR = grossProfitIDR − expensesIDR + otherIncomeIDR`.
- Add `otherIncomeIDR: v.number()` to the `returns` validator.
- `netMarginPct` recomputed from the new `netProfitIDR` (unchanged formula).

## Frontend

### Route — `src/routes/_pos/reports/other-income.tsx` (new)
Mirror `src/routes/_pos/reports/expenses.tsx`: `useReportRange()`; `api.otherIncome.list`;
a `PageHeader`/toolbar with a "Tambah" button → an income dialog; a `DataTable`
(Tanggal, Sumber, Catatan, Jumlah) with a total; CSV export (`toCSV`/`downloadCSV`); a
delete `ConfirmDialog`; shadcn `Empty` (icon `Coins`, title "Belum ada pendapatan lain.",
desc) when empty; `Spinner` while loading.

### Dialog — `src/components/income/income-dialog.tsx` (new)
Mirror `expense-dialog.tsx`: a `source` `Input`, an `amountIDR` numeric `Input`, an optional
`note` `Input`; submit → `api.otherIncome.record`; validate before submit; toast; reset+close.

### P&L page — `src/routes/_pos/reports/profit-loss.tsx`
Add a "+ Pendapatan lain" line (positive, `+{formatIDR(otherIncomeIDR)}`) between the
"− Pengeluaran" row and the "= Laba bersih" row, and include it in the CSV rows. Gate the
"no data" empty check to also consider `otherIncomeIDR` (so a period with only other income
still renders).

### Nav — `src/components/app-shared.tsx`
Add a **"Pendapatan Lain"** entry (icon `Coins`, `requires` matching the existing
"Pengeluaran"/reports gating) near the Expenses report item.

## Testing
**`tests/convex/other-income.test.ts`** (new; mirror `tests/convex/expenses.test.ts`):
- `record` inserts; `list` returns it with the correct `totalIDR`; rejects amount ≤ 0 /
  non-integer / empty source.
- `list` is range-scoped (an entry outside the window is excluded) and newest-first.
- `remove` deletes; owner-scope — a foreign cafe's row throws on `remove`.
- **P&L:** with revenue + an expense + an other-income entry, `reports.profitLoss` returns
  `otherIncomeIDR` and `netProfitIDR === grossProfit − expenses + otherIncome`.

Frontend (list, add dialog, P&L line) by typecheck + smoke.

## i18n
New BI: `Pendapatan Lain`, `Sumber`, `Tambah pendapatan`, `Belum ada pendapatan lain.`,
`Sumber pendapatan wajib diisi.` (server-thrown, off-catalog), `+ Pendapatan lain`. Extract +
fill `en` (`Other income`, `Source`, `Add income`, `No other income yet.`, …), compile.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — `otherIncome` is a NEW module (register in `api.d.ts`; dev watcher
  does it — commit). **New route** → commit `routeTree.gen.ts`.
- Small conventional commits; PR → review → merge commit.

## Out of scope
- A fixed income-source taxonomy / per-source breakdown in the P&L (single total line).
- Editing an entry (delete + re-add); recurring income; linking income to a customer/invoice;
  tax treatment of other income (the existing tax-rate setting, if any, stays as-is).
