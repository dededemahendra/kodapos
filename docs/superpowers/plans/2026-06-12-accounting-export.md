# Accounting Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Read-only (a query + a CSV download) — no money-path risk.

**Goal:** A combined, date-sorted accounting ledger (sales / refunds / expenses / other income / purchases) exportable as a bank-statement-style CSV for Jurnal/Xero/QuickBooks.

---

## File Structure
- **Create:** `convex/accounting.ts`, `tests/convex/accounting.test.ts`, `src/routes/_pos/reports/export.tsx`.
- **Modify:** `convex/_generated/api.d.ts`, `src/routes/_pos/reports/route.tsx` (nav tab), `src/routeTree.gen.ts`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — `accounting.ledger` query (TDD)
**Files:** create `convex/accounting.ts`, `tests/convex/accounting.test.ts`; modify `convex/_generated/api.d.ts`.

READ: `convex/reports.ts` (`paidInRange` — how paid orders in range are fetched, the inline `rangeArg`; reuse the SAME `rangeArg` union shape so the page's `useReportRange` works), `convex/lib/time.ts` (`resolveRange`, `tzFor`, `dayKeyFn`), `convex/expenses.ts` + `convex/otherIncome.ts` (`by_cafe_at` queries), `convex/refunds.ts` (`by_cafe_at`, the `amountIDR`/`orderId`/`method` fields), `convex/schema.ts` `purchases` (fields + the cafe/at index name) + `orders` (`paymentMethod`, `totalIDR`, `createdAtClient`, `lines`), `convex/lib/auth.ts`. Reuse the orders/expenses/refunds/other-income test setup from their test files.

- [ ] **Step 1: FAILING tests** (`tests/convex/accounting.test.ts`): seed (in range) a paid sale, an `expenses.record`, an `otherIncome.record`, a refund (`refunds.create`), and a purchase (`purchases.record`). Assert `api.accounting.ledger({range})`:
  - returns 5 entries, one per event, each with the right `type` (`sale`/`expense`/`other_income`/`refund`/`purchase`) and the correct `inflowIDR`/`outflowIDR` (exactly one non-zero); entries sorted by `at` ascending.
  - `summary`: `salesIDR`/`otherIncomeIDR`/`refundsIDR`/`expensesIDR`/`purchasesIDR` match the seeded amounts; `inflowIDR === sales+otherIncome`; `outflowIDR === refunds+expenses+purchases`; `netIDR === inflow − outflow`.
  - an event stamped outside the range is excluded; another cafe's events don't appear (owner-scope).
  Run → confirm FAIL.
- [ ] **Step 2: implement `convex/accounting.ts`** — `ledger({ range })` query, `requireOwnerCafe`; `tz = await tzFor`; `{ startMs, endMs, fromKey, toKey } = resolveRange(tz, range, Date.now())`; `keyOf = dayKeyFn(tz)`. Gather the 5 sources (paid orders via `by_cafe_created` filtered `paymentStatus==='paid'`; `refunds`/`expenses`/`otherIncome` via `by_cafe_at`; `purchases` via its cafe/at index), map each to a normalized entry `{ at, dateKey: keyOf(at), type, ref, description, account, method?, inflowIDR, outflowIDR }`, merge, sort by `at` asc. Build `summary`. Provide a full Convex return validator (`entries: v.array(v.object({...})), summary: v.object({...}), fromKey, toKey`). Use the SAME `rangeArg` union as `reports.ts`.
- [ ] **Step 3: register + tests + commit** — confirm api.d.ts gained `accounting`; `pnpm test tests/convex/accounting.test.ts` + full PASS; `pnpm typecheck` PASS. Commit:
  `git add convex/accounting.ts convex/_generated/api.d.ts tests/convex/accounting.test.ts && git commit -m "feat(reports): accounting ledger query across all money events"`
  > Do NOT run codegen.

---

### Task 2: Frontend — export page + nav
**Files:** create `src/routes/_pos/reports/export.tsx`; modify `src/routes/_pos/reports/route.tsx`; commit `src/routeTree.gen.ts`.

READ: `src/routes/_pos/reports/expenses.tsx` (the report page pattern: `useReportRange`, `DataTable`, `toCSV`/`downloadCSV`, `Empty`, `Spinner`), `src/routes/_pos/reports/profit-loss.tsx` (the summary-card layout), `src/routes/_pos/reports/route.tsx` (the tab bar to extend), `src/components/ui/{data-table,card,badge,button,empty}`, `~/lib/csv`, `~/lib/money`.

- [ ] **Step 1: `export.tsx`** — `createFileRoute('/_pos/reports/export')`; `useReportRange()`; `const data = useQuery(api.accounting.ledger, { range })`. A summary card row (Pemasukan/Pengeluaran/Bersih + the 5 sub-totals via `formatIDR`). A `DataTable` of `data.entries` (Tanggal, Tipe `Badge`, Keterangan, Akun, Metode, Masuk `formatIDR(inflowIDR)`, Keluar `formatIDR(outflowIDR)`) — show newest-first on screen (reverse for display). An "Unduh Buku Besar (CSV)" `Button` → `toCSV(rowsAscending, columns)` with columns `Tanggal,Tipe,Ref,Keterangan,Akun,Metode,Masuk,Keluar` + `downloadCSV('buku-besar-{fromKey}-{toKey}.csv', csv)`. `Empty` (icon `FileSpreadsheet`) when `entries.length === 0`; `Spinner` while `data === undefined`. Type labels via a translated map.
- [ ] **Step 2: nav** — `route.tsx`: add `{ to: '/reports/export', label: <Trans>Ekspor Akuntansi</Trans> }` to the TABS array (end).
- [ ] **Step 3: routeTree** — `pnpm build`; confirm `grep -c "reports/export" src/routeTree.gen.ts` > 0; stage it.
- [ ] **Step 4:** typecheck + test PASS. Commit:
  `git add src/routes/_pos/reports/export.tsx src/routes/_pos/reports/route.tsx src/routeTree.gen.ts && git commit -m "feat(reports): accounting export page + nav"`

---

### Task 3: i18n
New: `Ekspor Akuntansi`, `Buku Besar`, `Unduh Buku Besar (CSV)`, `Pemasukan`, `Pengeluaran`, `Bersih`, `Masuk`, `Keluar`, `Tipe`, `Akun`, `Keterangan`, type labels `Penjualan`/`Pengembalian`/`Pembelian`/`Pendapatan Lain`, `Belum ada transaksi.` (reuse `Tanggal`/`Metode`/`Total`).
- [ ] `pnpm lingui:extract`; fill `en` (`Accounting export`, `Ledger`, `Download ledger (CSV)`, `Inflow`, `Outflow`, `Net`, `In`, `Out`, `Type`, `Account`, `Description`, `Sale`/`Refund`/`Purchase`/`Other income`, `No transactions yet.`) + any other new empties; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 4: Final verification
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; `git status` clean — **routeTree.gen.ts committed**.
- [ ] **Manual sanity:** with a few sales + an expense + a refund in range, the export page shows the summary + preview; "Unduh Buku Besar" downloads a CSV whose rows reconcile (Σ Masuk − Σ Keluar === net); changing the range refilters.

---

## Self-Review
**Spec coverage:** ledger query across 5 sources + summary (T1); export page + summary + preview + CSV + nav (T2); tests per-source + summary + range + scope (T1); i18n (T3). ✓
**Placeholder scan:** test seeding "reuse orders/expenses/refunds/other-income setup"; UI "mirror expenses report + P&L summary". Else spec code.
**Type consistency:** `accounting.ledger({range})` uses the same `rangeArg` as `reports.*` (so `useReportRange`'s `range` fits); `{ entries:[{at,dateKey,type,ref,description,account,method?,inflowIDR,outflowIDR}], summary, fromKey, toKey }` consumed by the page table + CSV + summary card. ✓
