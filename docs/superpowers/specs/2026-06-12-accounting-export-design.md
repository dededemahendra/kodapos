# Accounting Export Design Spec

**Date:** 2026-06-12
**Branch:** `feat/accounting-export` (off `main`)

## Context

kodapos has the financial events an accountant needs — sales, refunds, expenses, other income,
purchases — but they live in separate tables/pages, each with its own CSV. There's no single
**dated ledger** an owner can hand to a bookkeeper or import into Jurnal / Xero / QuickBooks.
This slice adds a combined, date-sorted **accounting ledger** export: every money-in / money-out
event across the cafe in one range, as a bank-statement-style CSV.

Read-only (a query + a client CSV download) — no mutations, no money-path risk.

## Model

No new tables. A new query aggregates existing ledgers into a normalized transaction list.

## Backend — `convex/accounting.ts` (new, owner-gated)

**`ledger({ range })`** query (uses the shared `rangeArg`/`resolveRange`/`tzFor`/`dayKeyFn` from
`lib/time`) → `{ entries, summary, fromKey, toKey }`.

Each **entry**: `{ at, dateKey, type, ref, description, account, method?, inflowIDR, outflowIDR }`
where exactly one of inflow/outflow is non-zero (bank-statement style — universally importable).
Sources, each scoped to `[startMs, endMs]` by its own timestamp, then merged + sorted by `at` asc:

- **Sales** — paid orders (`orders.by_cafe_created`, `paymentStatus === 'paid'`,
  `createdAtClient` in range): `inflowIDR = totalIDR`, `type: 'sale'`, `account: 'Penjualan'`,
  `method = paymentMethod`, `ref` = short order id, `description` = `'{n} item'`.
- **Refunds** — `refunds.by_cafe_at`: `outflowIDR = amountIDR`, `type: 'refund'`,
  `account: 'Pengembalian'`, `method`, `ref` = short order id.
- **Expenses** — `expenses.by_cafe_at`: `outflowIDR = amountIDR`, `type: 'expense'`,
  `account: 'Pengeluaran'`, `description` = the category, `method` n/a.
- **Other income** — `otherIncome.by_cafe_at`: `inflowIDR = amountIDR`, `type: 'other_income'`,
  `account: 'Pendapatan Lain'`, `description` = source.
- **Purchases** — the ad-hoc `purchases` table in range (use the cafe/`at` index — read the
  schema for the exact index name): `outflowIDR = totalIDR`, `type: 'purchase'`,
  `account: 'Pembelian'`, `description` = `supplierName ?? '—'`.

**summary**: `{ salesIDR, otherIncomeIDR, refundsIDR, expensesIDR, purchasesIDR, inflowIDR,
outflowIDR, netIDR }` where `inflowIDR = sales + otherIncome`, `outflowIDR = refunds + expenses +
purchases`, `netIDR = inflow − outflow`.

> Note: this is a **cash-flow ledger** (money-in/out events), not a double-entry journal or an
> accrual P&L (the `/reports/profit-loss` page covers accrual P&L). PO receipts are inventory
> movements, not cash events, so they are NOT included — only the ad-hoc `purchases` table, which
> records actual spend. (Documented.)

## Frontend

### Route — `src/routes/_pos/reports/export.tsx` (new, owner/report-gated)
`createFileRoute('/_pos/reports/export')`. `useReportRange()` → `api.accounting.ledger`. Renders:
- A **summary** card row: Pemasukan (inflow), Pengeluaran (outflow), Bersih (net), with the
  per-type sub-totals (sales / other income / refunds / expenses / purchases).
- A **preview** `DataTable` of the entries (Tanggal, Tipe badge, Keterangan, Akun, Metode, Masuk,
  Keluar) — newest first for on-screen reading.
- An **"Unduh Buku Besar (CSV)"** button → `toCSV(entries, columns)` + `downloadCSV(
  'buku-besar-{from}-{to}.csv', …)`. CSV columns: `Tanggal, Tipe, Ref, Keterangan, Akun, Metode,
  Masuk, Keluar` (entries in `at`-ascending order for the file). Type/labels are the translated
  strings.
- `Empty` (icon `BookOpen`/`FileSpreadsheet`) when no entries; `Spinner` while loading.

### Nav — reports tab bar (`src/routes/_pos/reports/route.tsx`)
Add an **"Ekspor Akuntansi"** tab (matching the sibling reports tabs — text label) at the end.

## Testing
**`tests/convex/accounting.test.ts`** (new; reuse the orders/expenses/refunds/other-income test
setup): seed a paid sale, an expense, an other-income entry, a refund, and a purchase in range →
`accounting.ledger` returns one entry per event with correct `type`/`inflowIDR`/`outflowIDR`,
sorted by `at`; `summary` totals and `netIDR` match the hand-computed values; an event stamped
outside the range is excluded; owner-scope (another cafe's events don't appear).

Frontend (summary, preview, CSV) by typecheck + smoke.

## i18n
New BI: `Ekspor Akuntansi`, `Buku Besar`, `Unduh Buku Besar (CSV)`, `Pemasukan`, `Pengeluaran`,
`Bersih`, `Masuk`, `Keluar`, `Tipe`, `Akun`, `Penjualan`/`Pengembalian`/`Pembelian`/`Pendapatan
Lain` (type labels), `Belum ada transaksi.`. Extract + fill `en` (`Accounting export`, `Ledger`,
`Download ledger (CSV)`, `Inflow`, `Outflow`, `Net`, `In`, `Out`, `Type`, `Account`, `Sale`/
`Refund`/`Purchase`/`Other income`, `No transactions yet.`), compile. CSV header strings use the
translated labels.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — `accounting` is a NEW module (register in `api.d.ts`; dev watcher does it —
  commit). **New route** → commit `routeTree.gen.ts`.
- Small conventional commits; PR → review → merge commit.

## Out of scope
- A double-entry journal (debit/credit per account) / a configurable chart of accounts.
- Direct API push to Jurnal/Xero/QuickBooks (CSV download only).
- PO-receipt or inventory-movement rows; payroll; tax-line breakdown; XLSX/PDF (CSV only); a
  per-payment-method split of a single split order (one row per order at `totalIDR`).
