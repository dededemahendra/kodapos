# Shift Close-out + Cash Reconciliation Design Spec

**Date:** 2026-06-11
**Branch:** `feat/shift-closeout` (off `main`)
**Predecessor:** Shift history list (PR #36, merged). See
`2026-06-10-shift-history-design.md`.

## Context

Closing a shift currently only records `countedCashIDR`; the reserved
`expectedCashIDR`/`varianceIDR` columns are never computed, and there is no way
to record cash that enters/leaves the drawer mid-shift (deposits, petty-cash
buys). The shift-history list (#36) estimates variance on read as
`counted − (openingFloat + cashSales)` and labels it as such. This slice makes
close-out a **true cash reconciliation**: a `cashMovements` ledger, expected vs
counted computed and **stored** at close, and a full close-out breakdown — and
wires the stored variance back into the history list.

## Decisions (from brainstorming)

1. **Movement model:** direction (`in`/`out`) + amount + optional free-text note.
2. **Append-only ledger:** a mistake is corrected by an opposite movement (audit
   integrity); no edit/delete.
3. **Store at close:** `shifts.close` computes and stores `expectedCashIDR` +
   `varianceIDR`; the history list reads them (falls back to the on-read estimate
   for legacy shifts).
4. **Entry point:** a `CashMovementDialog` launched from the sale screen.

## Data model

**New table `cashMovements`** (mirrors `inventoryMovements` style):
```ts
cashMovements: defineTable({
  cafeId: v.id('cafes'),
  shiftId: v.id('shifts'),
  cashierId: v.id('cafeStaff'),
  direction: v.union(v.literal('in'), v.literal('out')),
  amountIDR: v.number(),
  note: v.optional(v.string()),
  at: v.number(),
}).index('by_shift', ['shiftId']),
```

`shifts` table: no schema change — `expectedCashIDR` / `varianceIDR` (already
`v.optional(v.number())`) get populated by `close`.

Expected-cash formula (cash drawer only; QRIS/card never hit the drawer):
```
expectedCashIDR = openingFloatIDR + cashSalesIDR + cashInIDR − cashOutIDR
varianceIDR     = countedCashIDR − expectedCashIDR
```
where `cashSalesIDR` = Σ `totalIDR` of paid orders with `paymentMethod === 'cash'`
in the shift, and `cashInIDR`/`cashOutIDR` = Σ movement amounts by direction.

## Backend

### `convex/cashMovements.ts` (new)

- **`record`** (mutation, owner-gated): `{ direction, amountIDR, note? }`. Requires
  an **open** shift (`shifts.current`); validates `amountIDR` via the shared
  IDR assert (positive integer); inserts `{ cafeId, shiftId: openShift._id,
  cashierId: openShift.cashierId, direction, amountIDR, note?, at: Date.now() }`.
  Throws `'Tidak ada shift terbuka.'` if none open.
- **`listForShift`** (query, owner-gated): movements for a shift via `by_shift`,
  newest-first. Returns `{ _id, direction, amountIDR, note?, at }[]`.

### `convex/shifts.ts` (modified)

- **`close`** now computes and stores the reconciliation. After validating the
  open shift + counted cash:
  ```ts
  const orders = ctx.db.query('orders').withIndex('by_shift', shiftId).collect();
  const cashSalesIDR = Σ paid orders where paymentMethod === 'cash';
  const movements = ctx.db.query('cashMovements').withIndex('by_shift', shiftId).collect();
  const cashInIDR  = Σ direction==='in';
  const cashOutIDR = Σ direction==='out';
  const expectedCashIDR = shift.openingFloatIDR + cashSalesIDR + cashInIDR − cashOutIDR;
  const varianceIDR = counted − expectedCashIDR;
  patch(shift, { status:'closed', closedAt, countedCashIDR: counted, expectedCashIDR, varianceIDR });
  ```
  Does NOT block on a large variance — records it for owner review.
- **`closeoutSummary`** (new query, owner-gated): for a shift returns the full
  breakdown for the close screen + history detail:
  `{ openingFloatIDR, cashSalesIDR, cashInIDR, cashOutIDR, expectedCashIDR,
  countedCashIDR | null, varianceIDR | null, cashierName }`. Computed from
  orders + movements + stored fields (works for both open and closed shifts;
  for an open shift `counted`/`variance` are null).
- **`listClosed`** (modified `summarizeShift`): prefer the **stored**
  `shift.expectedCashIDR`/`shift.varianceIDR` when present; else fall back to the
  current on-read estimate (`openingFloat + cashSales`, variance from counted).
  Legacy closed shifts (pre-this-slice) have no stored values → on-read; new ones
  → stored (which include movements).

## Frontend

### `CashMovementDialog` (`src/components/shift/cash-movement-dialog.tsx`, new)

Direction toggle (Kas masuk / Kas keluar) + amount input + optional note → calls
`cashMovements.record`. Launched from a **"Kas" button on the sale screen**
(near the shift/cart area). Records as drawer events happen. Shows the current
shift's recent movements (via `listForShift`) inline for confirmation.

### `close.tsx` (modified)

Replace the bare counted-cash form with the full close-out:
- Left: the close-out breakdown via `closeoutSummary` — opening float, cash sales,
  `+ pay-ins`, `− pay-outs`, `= expected`, then the **counted-cash input**, and a
  live **variance** preview (Over/Short) as the cashier types.
- After close: the stored breakdown + variance + the shift's movements, with
  print. Reuse/extend `ShiftSummaryPanel`.

### `ShiftSummaryPanel` (extended)

Add optional rows to the `ShiftSummary` interface + panel: `cashSalesIDR?`,
`cashInIDR?`, `cashOutIDR?` (rendered between Modal awal and Uang seharusnya when
present). Keep existing fields. The history list (#36) is unaffected (it uses its
own summary shape).

## Testing

- **`cashMovements.record`**: inserts with the open shift's id/cashier; rejects
  when no shift open; rejects non-positive/non-integer amount; owner-scoped.
- **`cashMovements.listForShift`**: returns the shift's movements newest-first.
- **`shifts.close`**: `expectedCashIDR` = `openingFloat + cashSales + cashIn −
  cashOut`; `varianceIDR = counted − expected`; both **stored** on the shift;
  QRIS/pending/void orders excluded from `cashSalesIDR`; the no-movements case
  equals `openingFloat + cashSales`.
- **`shifts.closeoutSummary`**: correct breakdown for an open and a closed shift.
- **`shifts.listClosed`**: reads stored `expectedCashIDR`/`varianceIDR` after a
  movement-inclusive close (proves history reflects movements, not the estimate).
- Frontend (`CashMovementDialog`, close.tsx) validated by typecheck + existing
  e2e shift flow; no new unit tests.

## i18n

New Bahasa Indonesia strings via Lingui (`Kas`, `Kas masuk`, `Kas keluar`,
`Catatan (opsional)`, `Penjualan tunai`, `Kas masuk`, `Kas keluar`,
`Uang seharusnya`, `Tidak ada shift terbuka.`, etc.); fill the `en` catalog.
Receipt/print content stays English/off-catalog where applicable.

## Conventions

- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`.
- Convex codegen if a new module's functions are referenced via `api.`/`internal.`
  — `cashMovements` is a NEW module, so add it to `convex/_generated/api.d.ts`
  (import line + `fullApi` entry, alphabetical) since `convex codegen` is
  unavailable; the dev watcher may also do this. Commit the `_generated` change.
- Small conventional commits; PR → review → merge commit.

## Out of scope

- Movement edit/delete (append-only), movement categories/enums (free note only),
  blocking close on large variance, multi-drawer support, cross-shift cash
  reports — all separate/deferred.
