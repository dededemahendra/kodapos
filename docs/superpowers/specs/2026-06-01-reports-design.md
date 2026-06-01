# Reports module (V1 module 4.4) — Design

**Date:** 2026-06-01
**Status:** Approved design, ready for implementation plan
**Branch:** `feat/reports` (off `main`)
**Depends on:** POS Core (orders/payments, merged), Shifts & Staff (cashier names, merged), the Dashboard (`convex/dashboard.ts` + chart components, merged), the catalog UI kit (PageHeader, DataTable, Empty, etc.).

## Context

The V1 design (`2026-05-14-kodapos-v1-design.md` §4.4) calls for owner reports. The live **Dashboard** already covers the "today" glance — KPIs (today vs yesterday), a daily-revenue chart, payment-method split, recent orders, low-stock, activity. **Reports** is the complementary *historical, date-range* layer. The route stubs (`reports/{index,sales,products,payments,cashiers}` + `route.tsx`) reflect a by-dimension split, which this spec adopts (diverging from the doc's original `today`/`range` framing — the Dashboard already owns "today").

The `orders` table has a `by_cafe_created` index on `['cafeId', 'createdAtClient']`; the Dashboard already range-scans it with `.gte('createdAtClient', windowStart)`. Reports reuse the same index with a `.gte(start).lte(end)` window. Convex queries are reactive, so a "today" range updates live for free.

Decisions from brainstorming: all four dimension reports + an overview, driven by a **shared range picker**; **CSV export only** (client-side, no PDF this slice); range state in **URL search params**; **all timezone math server-side**; **revenue = `totalIDR`**, **paid orders only**.

## Goal

Let an owner pick a date range (today / yesterday / last 7 days / last 30 days / custom) and see, for that range: an overview of KPIs, daily sales, top/bottom products, the payment-method split, and per-cashier totals — each exportable to CSV. No new backend dependencies.

## Routing & layout

- `reports/route.tsx` becomes the **layout**: a `PageHeader` (title "Laporan"), the shared **range picker**, a sub-nav (Ringkasan · Penjualan · Produk · Pembayaran · Kasir), and `<Outlet/>`.
- Children: `index.tsx` → **Overview**; `sales.tsx`, `products.tsx`, `payments.tsx`, `cashiers.tsx`.

## Date-range model (URL search params)

- Range lives in the URL search on the layout route via TanStack Router `validateSearch`:
  - `?preset=today|yesterday|last7|last30` (default `today`), or
  - `?from=YYYY-MM-DD&to=YYYY-MM-DD` for a custom range (inclusive local-date keys).
- Benefits: persists as the user switches report tabs, shareable, refresh-safe.
- A `useReportRange()` hook (`src/components/reports/use-report-range.ts`) reads/writes the search params and produces the query args. **No timezone math on the client** — it passes the preset or the two date strings to the backend, which resolves them to tz-correct UTC-ms boundaries in the cafe's timezone.
- The range picker (`src/components/reports/range-picker.tsx`): preset buttons + a custom from/to date input; writes to the URL.

## Shared time helpers — `convex/lib/time.ts`

Extract the timezone/day helpers currently private in `convex/dashboard.ts` — `tzOffsetMs`, `startOfLocalDay`, `dayKeyFn`, `utcOfDayKey`, `DAY_MS`, and `tzFor` — into a new `convex/lib/time.ts`, and import them back into `dashboard.ts` (no behavior change; the existing dashboard tests must stay green). Add:

```ts
// Resolves report range args to tz-correct boundaries + a display label.
export type RangeArgs =
  | { preset: 'today' | 'yesterday' | 'last7' | 'last30' }
  | { from: string; to: string }; // inclusive local YYYY-MM-DD keys

export function resolveRange(
  tz: string,
  args: RangeArgs,
  nowMs: number,
): { startMs: number; endMs: number; fromKey: string; toKey: string };
```

`resolveRange` returns `startMs` = local-midnight of the first day and `endMs` = local-midnight of the day **after** the last day minus 1 ms (so the window is inclusive of the full final local day). Custom ranges are validated: `from <= to` and span ≤ 366 days (else throw `Rentang tanggal tidak valid.`).

## Backend — `convex/reports.ts`

Each export is a reactive `query` taking the `RangeArgs` (as a Convex validator union), resolving the range via `resolveRange(tz, args, Date.now())`, scanning orders once:

```ts
const rows = await ctx.db
  .query('orders')
  .withIndex('by_cafe_created', (q) =>
    q.eq('cafeId', cafeId).gte('createdAtClient', startMs).lte('createdAtClient', endMs))
  .collect();
const paid = rows.filter((o) => o.paymentStatus === 'paid');
```

Queries (each returns its aggregation plus the resolved range label info `{ fromKey, toKey }`):

1. **`overview`** → `{ revenueIDR: Σ totalIDR, orders: count, aovIDR: round(revenue/orders) (0 if none), itemsSold: Σ line qty, fromKey, toKey }`.
2. **`salesDaily`** → `{ days: Array<{ day: string; revenueIDR: number; orders: number }>, … }` — one bucket per local day across the whole range (zero-filled for days with no sales), keyed via `dayKeyFn(tz)`.
3. **`products`** → `{ items: Array<{ name: string; qty: number; revenueIDR: number }> }` aggregated from `order.lines` (`nameSnapshot` → Σ qty, Σ `lineTotalIDR`), sorted by revenue desc. (Page shows top & bottom slices.)
4. **`payments`** → `{ methods: Array<{ method: 'cash'|'qris_static'|'qris_dynamic'; count: number; amountIDR: number }>, totalIDR: number }` — caller derives %.
5. **`cashiers`** → `{ rows: Array<{ cashierId, name: string, orders: number, revenueIDR: number }> }`, resolving `cashierId` → `cafeStaff.name` (one lookup per distinct cashier, memoized in a Map, mirroring `dashboard.recentOrders`).

All queries use `requireOwnerCafe` for tenancy (cafe-scoped by construction).

## Report pages (UI)

Each page reads the range via `useReportRange()`, calls its query, and renders a summary row + a chart or `DataTable`, with shadcn `Empty` when there are no paid orders in range, and an **"Unduh CSV"** button.

- **Overview** (`index.tsx`): KPI cards — revenue, transactions, AOV, items sold — for the range.
- **Sales** (`sales.tsx`): daily bar/line chart (reuse the dashboard chart component if it fits) + a daily table (day, orders, revenue).
- **Products** (`products.tsx`): sortable `DataTable` (name, qty, revenue); top sellers by default with a toggle/section for bottom sellers.
- **Payments** (`payments.tsx`): table of method → count, amount, % of total.
- **Cashiers** (`cashiers.tsx`): table of cashier → orders, revenue.

## CSV export — `src/lib/csv.ts`

Pure `toCSV(rows: Record<string, string | number>[], columns: { key: string; header: string }[]): string` — emits a header row + data rows, escaping any field containing `"`, `,`, or newline per RFC 4180 (wrap in quotes, double internal quotes). A small `downloadCSV(filename, csv)` helper creates a `Blob` and triggers a client-side download. Each report builds its rows from already-loaded query data. `toCSV` is unit-tested; receipts/printing are unaffected and CSV content is data (no i18n).

## Data semantics

- **Paid only** (`paymentStatus === 'paid'`).
- **Revenue = `totalIDR`** (collected amount, post-discount/SC/tax). Overview metrics: revenue, transaction count, AOV, items sold.
- **Day buckets** keyed by the cafe's local date; range boundaries cover full local days inclusively.
- Empty range → zeros / empty arrays (pages show `Empty`).

## i18n

New Indonesian source strings (labels, sub-nav, preset names, column headers, "Unduh CSV", the invalid-range error stays a raw server throw). After implementation: `pnpm lingui:extract`, fill `en`, `pnpm lingui:compile`. CSV cell content is data, not translated.

## Testing

- **Pure**: `toCSV` (escaping commas/quotes/newlines, column order, empty rows); `resolveRange` (each preset → correct boundaries; custom from/to; inclusive end-of-day; `from > to` and >366-day span rejected; tz correctness for Asia/Jakarta).
- **Convex** (`tests/convex/reports.test.ts`): seed orders across multiple local days, items, cashiers, and payment methods → assert `overview` (revenue/orders/AOV/items), `salesDaily` (per-day buckets incl. zero-filled gaps), `products` (qty + revenue from lines, sort order), `payments` (split + total), `cashiers` (per-cashier name + totals); paid-only filtering; empty range → zeros; tenant isolation (cafe B sees none of cafe A's orders). Plus a regression check that the extracted helpers keep `dashboard` tests green.
- **Playwright** (auth-gated, extend an admin spec): record a couple of sales, open `/reports`, switch presets and confirm numbers update, and assert one "Unduh CSV" download.
- Gate: `pnpm typecheck && pnpm test && pnpm lingui:compile`; `convex codegen` → commit drift.

## Affected / new files (anticipated)

**Modified**
- `convex/dashboard.ts` (import helpers from `convex/lib/time.ts`).
- `src/routes/_pos/reports/route.tsx` (layout), `index.tsx`, `sales.tsx`, `products.tsx`, `payments.tsx`, `cashiers.tsx` (replace stubs).
- Lingui catalogs.

**New**
- `convex/lib/time.ts` (+ test), `convex/reports.ts` (+ `tests/convex/reports.test.ts`).
- `src/components/reports/use-report-range.ts`, `range-picker.tsx`, and per-report page components if pages grow large.
- `src/lib/csv.ts` (+ `src/lib/csv.test.ts`).
- A Playwright addition.

## Out of scope (V1 §4.4)

Cohort analysis, customer lifetime value, hourly heatmaps, weather-correlated trends, supplier spend, P&L, **PDF export**, voids/refunds reporting, and an inventory-snapshot report (current stock / days-of-cover / below-reorder already live on the Dashboard's low-stock widget).
