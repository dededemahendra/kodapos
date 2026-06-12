# Expense Tracking Design Spec

**Date:** 2026-06-11
**Branch:** `feat/expense-tracking` (off `main`)

## Context

The POS tracks revenue (orders) and inventory cost (purchases/waste) but has no place to
record **non-inventory operating expenses** — rent, utilities, supplies, salary, other.
Owners need these to understand real profitability. This slice adds a simple expense
ledger: record an expense (category + amount + optional note + date), and view/total them
over a date range under a new **Reports → Pengeluaran** tab.

Entirely **off the sale/checkout/order/inventory path** — a standalone `expenses` table
with no foreign keys into orders or inventory. Lowest-risk way to add a professional-POS
finance feature.

## Data model — new `expenses` table

Shared category validator in **`convex/lib/expense.ts`** (new, dependency-free):
```ts
import { v } from 'convex/values';
export const EXPENSE_CATEGORIES = ['rent', 'utilities', 'supplies', 'salary', 'other'] as const;
export const expenseCategoryValidator = v.union(
  v.literal('rent'),
  v.literal('utilities'),
  v.literal('supplies'),
  v.literal('salary'),
  v.literal('other')
);
```

Schema (`convex/schema.ts`):
```ts
expenses: defineTable({
  cafeId: v.id('cafes'),
  category: expenseCategoryValidator,
  amountIDR: v.number(),
  note: v.optional(v.string()),
  at: v.number(),
}).index('by_cafe_at', ['cafeId', 'at']),
```

## Backend — `convex/expenses.ts` (new)

All owner-gated via `requireOwnerCafe`. Mirrors `waste.ts` + the reports range pattern
(`tzFor` + `resolveRange`, like `paidInRange` in `convex/reports.ts`).

- **`record({ category, amountIDR, note? })`** (mutation): validate
  `Number.isInteger(amountIDR) && amountIDR > 0` (`'Jumlah harus lebih dari nol.'`); insert
  `{ cafeId, category, amountIDR, ...(note?.trim() ? { note } : {}), at: Date.now() }`.
  Returns the new id.
- **`list({ range })`** (query, `range: rangeArg`): resolve `tz = tzFor(ctx, cafeId)` +
  `{ startMs, endMs } = resolveRange(tz, range, Date.now())`; query `expenses` by
  `by_cafe_at` `gte(startMs).lte(endMs)`, newest-first; return
  `{ rows: [{ id, at, category, amountIDR, note? }], totalIDR, byCategory: [{ category, amountIDR }] }`
  (`totalIDR` = sum; `byCategory` = per-category sums for the present categories, summary).
- **`remove({ id })`** (mutation): `requireOwned(ctx, cafeId, id, 'Pengeluaran')`, delete.

`convex/expenses.ts` is a NEW function module → register in `convex/_generated/api.d.ts`
(+ `convex/lib/expense.ts`); the dev watcher usually does it — commit it. No codegen.

## Frontend

### Category labels — `src/components/expenses/expense-categories.tsx` (new)
Mirror the `ORDER_TYPE_OPTIONS` pattern:
```tsx
import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';
export type ExpenseCategory = 'rent' | 'utilities' | 'supplies' | 'salary' | 'other';
export const EXPENSE_CATEGORY_OPTIONS: { value: ExpenseCategory; label: ReactNode }[] = [
  { value: 'rent', label: <Trans>Sewa</Trans> },
  { value: 'utilities', label: <Trans>Utilitas</Trans> },
  { value: 'supplies', label: <Trans>Perlengkapan</Trans> },
  { value: 'salary', label: <Trans>Gaji</Trans> },
  { value: 'other', label: <Trans>Lainnya</Trans> },
];
```

### Record dialog — `src/components/expenses/expense-dialog.tsx` (new)
Mirror `StockAdjustDialog`: a category `Select` (from `EXPENSE_CATEGORY_OPTIONS`), an
amount `Input` (`type=number min=1 step=1`), an optional note `Input`. On submit call
`api.expenses.record`, toast, close. Validation errors surfaced inline + toast.

### Report tab — `src/routes/_pos/reports/expenses.tsx` (new route)
- Inherits the `canViewReports` gate + the `RangePicker` from `reports/route.tsx`'s layout.
- Uses `useReportRange()` → `{ range }`, `useQuery(api.expenses.list, { range })`.
- A header line with the range total (`formatIDR(data.totalIDR)`) + a **"Catat
  pengeluaran"** button opening the dialog.
- A small **by-category summary** (chips/row: each present category + its total).
- A `DataTable` (or list): date, category `Badge` (label from `EXPENSE_CATEGORY_OPTIONS`),
  amount (`tabular-nums`), note, and a row delete action (`remove`, with a confirm).
- Loading → `Spinner`; empty → shadcn `Empty` ("Belum ada pengeluaran pada rentang ini.").
- **CSV export** (bonus): a "Unduh CSV" button reusing `~/lib/csv` `toCSV`/`downloadCSV`
  (date, category, amount, note) — the payments/sales reports already use these helpers.

### Reports nav tab — `src/routes/_pos/reports/route.tsx`
Add `{ to: '/reports/expenses', label: <Trans>Pengeluaran</Trans> }` to the `TABS` array
(after `/reports/orders`).

> **New route** → `src/routeTree.gen.ts` is regenerated and TRACKED; it MUST be committed
> (local typecheck passes off the working tree, but CI fails if it's uncommitted).

## Testing

**`tests/convex/expenses.test.ts`** (new; mirror `tests/convex/waste.test.ts` setup):
- `record` inserts an expense; `list` (with a `{ preset: 'today' }` range) returns it with
  the right category/amount; `totalIDR` and `byCategory` sum correctly across a few rows.
- `record` rejects a non-positive / non-integer amount.
- `list` excludes expenses outside the range.
- `remove` deletes; `remove` is owner-scoped (foreign id throws).

Frontend (dialog, table, summary, CSV) validated by typecheck + the existing report e2e
smoke (if any) / manual.

## i18n

New Bahasa Indonesia strings: `Pengeluaran`, `Sewa`, `Utilitas`, `Perlengkapan`, `Gaji`,
`Lainnya`, `Catat pengeluaran`, `Kategori`, `Jumlah`, `Catatan (opsional)`,
`Belum ada pengeluaran pada rentang ini.`, `Pengeluaran dicatat.`,
`Gagal mencatat pengeluaran.`, `Hapus pengeluaran?`, `Unduh CSV`, `Total`. Run
`pnpm lingui:extract`, fill `en`, `pnpm lingui:compile`. (Several like `Catatan (opsional)`,
`Hapus`, `Unduh CSV`, `Total` may already exist — extract reports what's new.)

## Conventions

- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`;
  `git status` clean.
- Do NOT run `convex codegen`. Register the new `expenses` + `lib/expense` modules in
  `convex/_generated/api.d.ts` (dev watcher usually does — commit it). Schema derives
  automatically.
- **New route** → commit the regenerated `src/routeTree.gen.ts`.
- Small conventional commits; PR → review → merge commit.

## Out of scope

- Recurring/scheduled expenses, attachments/receipts-photo, vendor linkage.
- A P&L report combining revenue − COGS − expenses (a later reporting slice; this just
  records + totals expenses).
- Editing an expense in place (delete + re-add).
- Per-expense approval workflow or cashier attribution.
- Budgets / alerts.
