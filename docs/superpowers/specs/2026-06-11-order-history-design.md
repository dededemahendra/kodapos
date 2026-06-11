# Cross-Shift Order History Design Spec

**Date:** 2026-06-11
**Branch:** `feat/order-history` (off `main`)

## Context

`/history` shows only the cashier's **current shift** (paid orders, requires an
open shift) via `orders.listForShift`. There is no way for an owner to browse or
audit orders across shifts/dates, by cashier or payment method, or to see
non-paid (pending/void) orders. This slice adds an **owner-facing order browse**:
a filterable, paginated list of all orders across a date range, with reprint.

## Decisions (from brainstorming)

1. **New owner-facing route** in the Reports area (`/reports/orders`), not a
   change to the cashier's `/history`. No open-shift requirement; owner-gated.
2. **Filters:** date range + cashier + payment method + status. Free-text /
   amount / customer search is deferred (no index; filters cover the need).
3. **Surface all statuses** (paid / pending / void) with badges — unlike
   `/history` which is paid-only.

## Backend

### `convex/lib/time.ts` — export the range validator (DRY)

`reports.ts` defines a local `rangeArg` validator. Export the same validator
from `lib/time.ts` so `orders.search` reuses it:
```ts
export const rangeArg = v.union(
  v.object({ preset: v.union(v.literal('today'), v.literal('yesterday'), v.literal('last7'), v.literal('last30')) }),
  v.object({ from: v.string(), to: v.string() })
);
```
(Optionally refactor `reports.ts` to import it; small and in-scope. Requires
adding `import { v } from 'convex/values';` to `lib/time.ts` if absent.)

### `convex/orders.ts` — `search` query

```ts
export const search = query({
  args: {
    range: rangeArg,
    cashierId: v.optional(v.id('cafeStaff')),
    paymentMethod: v.optional(v.union(v.literal('cash'), v.literal('qris_static'), v.literal('qris_dynamic'))),
    status: v.optional(v.union(v.literal('paid'), v.literal('pending'), v.literal('void'))),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(orderRow),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  // handler:
});
```
Handler:
- `requireOwnerCafe` → cafeId; `tzFor(ctx, cafeId)`; `resolveRange(tz, range, Date.now())` → `{ startMs, endMs }`.
- Build the query: `ctx.db.query('orders').withIndex('by_cafe_created', q => q.eq('cafeId', cafeId).gte('createdAtClient', startMs).lte('createdAtClient', endMs)).order('desc')`, then conditionally chain `.filter()` for each provided optional filter:
  - `cashierId` → `.filter(q => q.eq(q.field('cashierId'), cashierId))`
  - `paymentMethod` → `.filter(q => q.eq(q.field('paymentMethod'), paymentMethod))`
  - `status` → `.filter(q => q.eq(q.field('paymentStatus'), status))`
  then `.paginate(paginationOpts)`.
- Resolve cashier names: load the cafe's `cafeStaff` once into an id→name map; map each order to `orderRow`.

`orderRow` validator:
```ts
const orderRow = v.object({
  _id: v.id('orders'),
  createdAtClient: v.number(),
  totalIDR: v.number(),
  paymentMethod: v.union(v.literal('cash'), v.literal('qris_static'), v.literal('qris_dynamic')),
  paymentStatus: v.union(v.literal('pending'), v.literal('paid'), v.literal('void')),
  cashierName: v.string(),
  lineCount: v.number(),
});
```
Return `{ page: result.page.map(toRow), isDone: result.isDone, continueCursor: result.continueCursor }`.

> Convex `.filter()` before `.paginate()` on an indexed range is supported;
> pagination stays correct (the engine fetches additional rows to fill a page
> when filters exclude some). Filters are independent and all optional.

## Frontend

### `/reports/orders` route (`src/routes/_pos/reports/orders.tsx`, new)

Under the existing `/_pos/reports` route group (owner-gated; the layout provides
the shared range search). Components:
- **Date range:** reuse `useReportRange()` + `<RangePicker />` (already bound to
  the `/_pos/reports` URL search).
- **Filters (local component state, not URL):** `cashierId` `<Select>` (options
  from `useQuery(api.staff.list, {})`, plus "Semua kasir"); `paymentMethod`
  `<Select>` (cash / QRIS statis / QRIS dinamis / "Semua metode"); `status`
  `<Select>` (paid / pending / void / "Semua status"). Each "All" option maps to
  omitting that arg.
- **List:** `usePaginatedQuery(api.orders.search, { range, ...(cashierId ? {cashierId} : {}), ... }, { initialNumItems: 25 })`. Rows show time, cashier, method, total, and a **status `Badge`** (paid = default, pending = secondary/amber, void = destructive). Click a row → `ReceiptPreview` (reprint, via `getById`). `Empty` state when none; "Muat lebih banyak" when `status === 'CanLoadMore'`.
- Add a card/link to `/reports/orders` from the reports index (`src/routes/_pos/reports/index.tsx`).

> The cashier/method/status filters are local state so we don't extend the shared
> reports search schema (`useReportRange` only governs the date range). Changing
> a filter re-runs `usePaginatedQuery` with new args.

## Testing

- **`orders.search`** (convex-test, `tests/convex/order-search.test.ts`):
  - returns orders in the date range, newest-first;
  - **includes non-paid orders** (seed a paid + a void/pending order; both appear
    with no status filter);
  - `status` filter returns only that status; `paymentMethod` filter only that
    method; `cashierId` filter only that cashier's orders;
  - pagination (`isDone`/`continueCursor`) across >pageSize orders;
  - owner-scoped (another cafe's orders excluded);
  - `cashierName` resolved correctly.
- Frontend validated by typecheck + the existing e2e flows; no new unit tests.

## i18n

New Bahasa Indonesia strings (`Riwayat pesanan`, `Semua kasir`, `Semua metode`,
`Semua status`, `Lunas`/`Tertunda`/`Batal` status labels, `Muat lebih banyak`
if not present, etc.); fill the `en` catalog.

## Conventions

- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`.
- Do NOT run `convex codegen` (interactive auth unavailable); `orders` is already
  a registered module, so `orders.search` needs no `api.d.ts` change.
- Small conventional commits; PR → review → merge commit.

## Out of scope

- Free-text / amount / customer search; CSV export; bulk actions; editing/voiding
  an order from this view (read + reprint only). `/history` (cashier current
  shift) is unchanged.
