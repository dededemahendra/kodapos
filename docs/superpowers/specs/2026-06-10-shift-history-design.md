# Shift History List Design Spec

**Date:** 2026-06-10
**Branch:** `feat/shift-history` (off `main`)

## Context

The POS already supports opening/closing one shift at a time (`convex/shifts.ts`:
`open` / `close` / `current`). But the `/shifts` route is a `ComingSoon` stub —
owners cannot review **past** shifts. Order history (`/history`) is current-shift
only. This slice turns `/shifts` into a real **shift history**: a list of closed
shifts, each with its cashier, time range, sales totals, counted cash, and a
computed cash **variance**, with drill-in to that shift's orders.

It is self-contained: per-shift totals/variance are computed **on read** from
each shift's orders, so it does NOT depend on the deferred shift close-out /
reconciliation slice (which would store those aggregates at close time).

## Scope (one slice of the broader Cashier/History/Shift work)

In scope: read-only review of closed shifts + drill-in to their orders.
Out of scope (separate slices): cash pay-in/pay-out tracking, close-time
reconciliation writes, cross-shift order search/filter, cashier handoff.

## Data model

No schema changes. The `shifts` table already has `cafeId`, `cashierId`,
`openedAt`, `closedAt?`, `openingFloatIDR`, `countedCashIDR?`, `status`, and the
`by_cafe_status` index (`['cafeId','status']`). `expectedCashIDR`/`varianceIDR`
columns exist but stay unused here (we compute on read). Orders carry
`shiftId`, `paymentStatus`, `paymentMethod`, `totalIDR`; the `orders.by_shift`
index exists.

## Backend

### `shifts.listClosed` (query, owner-gated)

Mirrors the reports/`current` auth pattern (`requireOwnerCafe`). Paginated,
newest-first.

```ts
import { paginationOptsValidator } from 'convex/server';

export const listClosed = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(shiftSummary),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const result = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'closed'))
      .order('desc')
      .paginate(paginationOpts);
    const page = await Promise.all(result.page.map((s) => summarizeShift(ctx, s)));
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});
```

`summarizeShift(ctx, shift)` — aggregate the shift's **paid** orders
(`orders.by_shift`, filter `paymentStatus === 'paid'`):

```ts
// returns shiftSummary:
{
  _id, openedAt, closedAt,
  cashierName,                         // ctx.db.get(cashierId)?.name ?? '—'
  openingFloatIDR,
  countedCashIDR: number | null,       // shift.countedCashIDR ?? null
  ordersCount,                         // # paid orders
  salesTotalIDR,                       // Σ paid order.totalIDR
  cashSalesIDR,                        // Σ where paymentMethod === 'cash'
  qrisSalesIDR,                        // Σ where method in (qris_static, qris_dynamic)
  expectedCashIDR,                     // openingFloatIDR + cashSalesIDR
  varianceIDR: number | null,          // countedCashIDR != null ? countedCashIDR - expectedCashIDR : null
}
```

`shiftSummary` is a `v.object({...})` validator with the fields above
(`countedCashIDR`/`varianceIDR` as `v.union(v.number(), v.null())`).

> **Cost note:** aggregation reads each listed shift's orders. Pagination bounds
> it (default ~20/page); a POS has few shifts/day. When the reconciliation slice
> later stores totals on the shift at close, `summarizeShift` collapses to
> reading stored fields. Acceptable for this slice.

> **Variance meaning:** with no pay-in/pay-out tracking yet, `expectedCashIDR =
> openingFloat + cash sales`. The UI labels it as such so it isn't mistaken for a
> fuller reconciliation.

### Drill-in

Reuse the existing `orders.listForShift({ shiftId })` (owner-gated, paid-only,
returns `orderSummary[]`) + the existing `ReceiptPreview`. No new order query.

## Frontend

### `/shifts` route (`src/routes/_pos/shifts.tsx`)

Replace the `ComingSoon` stub with the shift-history list:
- Header "Riwayat Shift".
- If a shift is currently open (`shifts.current`), show it pinned at top as an
  "in-progress" row (cashier + openedAt + "Sedang berjalan"; no close/variance).
- Closed shifts via `useQuery(api.shifts.listClosed, { paginationOpts })`,
  rendered as a list/table: cashier · `openedAt → closedAt` (+ duration) ·
  orders count · sales total · counted cash · **variance** (green "Lebih" /
  red "Kurang" / muted "—" when counted absent). Use shadcn list/table primitives
  consistent with the reports pages.
- `Empty` component (per project convention) when there are no closed shifts.
- "Muat lebih banyak" load-more driven by `continueCursor`/`isDone`
  (`usePaginatedQuery` from `convex/react`).
- Owner-oriented review screen; reachable where reports live in the nav.

### Shift detail (drill-in)

Selecting a shift shows that shift's orders. To avoid duplicating the order-row
rendering in `history.tsx`, extract the order-list + `ReceiptPreview` wiring into
a shared component `src/components/shift/shift-order-list.tsx` that takes a
`shiftId` and renders the paid orders (via `orders.listForShift`) with click →
receipt. `history.tsx` (current shift) and the shift-detail view both use it.
Detail is shown in-page (selected-shift state) or a nested view; keep it simple
with selected-shift state on the `/shifts` page + a back affordance.

## Testing

- **`shifts.listClosed`** (convex-test, `tests/convex/shifts.test.ts` or new
  `shift-history.test.ts`):
  - aggregates a closed shift's paid orders → correct `ordersCount`,
    `salesTotalIDR`, `cashSalesIDR`, `qrisSalesIDR`;
  - `expectedCashIDR = openingFloat + cashSales`; `varianceIDR = counted −
    expected`; `varianceIDR === null` when `countedCashIDR` is absent;
  - **pending/void orders excluded** from all sales aggregates;
  - only `closed` shifts returned, newest-first; open shift excluded;
  - owner-scoped (another cafe's shifts not returned);
  - pagination: `isDone`/`continueCursor` behave (seed >pageSize shifts).
- Drill-in relies on existing `orders.listForShift` coverage; the extracted
  `shift-order-list` component has no unit test (frontend), validated by typecheck
  + the existing e2e shift flow.

## i18n

New Bahasa Indonesia strings via Lingui (`Riwayat Shift`, `Sedang berjalan`,
`Selisih`, `Lebih`, `Kurang`, `Kas dihitung`, `Belum ada shift`, `Muat lebih
banyak`, `Durasi`, etc.); fill the `en` catalog. Receipt content stays
English/off-catalog.

## Conventions

- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`.
- Do NOT run `convex codegen` (interactive auth unavailable); the dev watcher /
  manual `api.d.ts` registration keeps types in sync. `shifts` is already a
  registered module, so the new `listClosed` export needs no api.d.ts change for
  typecheck.
- Small conventional commits; PR → review → merge commit.

## Out of scope

- Close-time reconciliation writes (`expectedCashIDR`/`varianceIDR` columns),
  cash pay-in/pay-out, cross-shift order search/filter, cashier handoff,
  exporting/emailing shift reports — all separate slices.
