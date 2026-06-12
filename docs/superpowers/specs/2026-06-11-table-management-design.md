# Table Management Design Spec

**Date:** 2026-06-11
**Branch:** `feat/table-management` (off `main`)

## Context

The POS supports dine-in orders (order types) and parked/held orders, but has no notion of
**tables**. This slice adds a table floor: define tables, see which are occupied at a glance
with their running total, and tap a table to open or resume its order. It **builds directly
on held orders** — a table simply *owns a parked order* — so it reuses the held-orders
machinery rather than introducing a parallel system.

## Model — a table owns a held order

- New `tables` table (admin-managed: name + sort order + archive).
- `heldOrders` gains optional `tableId`. A "table order" is a held order tagged with a
  `tableId` in the open shift. A table is **occupied** iff it has such a held order.
- **One active order per table** (the `hold` mutation rejects tagging a table that already has
  a held order in the open shift).
- **Resume = the existing held-order recall**: tapping an occupied table loads its held order
  into the sale cart and removes it from the table (frees it), exactly as the "Ditahan" picker
  does today. After editing, the cashier re-holds to the table (or pays). *(MVP limitation: a
  table reads as free while its order is being edited in the cart — consistent with held-order
  recall semantics; a persistent-while-editing model is a later refinement, noted.)*

## Data model — `convex/schema.ts`
```ts
tables: defineTable({
  cafeId: v.id('cafes'),
  name: v.string(),
  sortOrder: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
}).index('by_cafe', ['cafeId']),
```
`heldOrders`: add `tableId: v.optional(v.id('tables'))` + an index `by_table` on `['tableId']`.

## Backend — `convex/tables.ts` (new)
Owner-gated CRUD (mirror `convex/suppliers.ts`):
- `create({ name })` — trims/validates name (1–40 chars), `sortOrder = max+1`, returns id.
- `update({ id, name })` — `requireOwned`, patch.
- `archive({ id })` — `requireOwned`, set `archived: true`.
- `list({ includeArchived? })` — cafe's tables, active first, by `sortOrder` then name.
- **`floor({})`** — the operational view: active tables each enriched with their current held
  order in the OPEN shift:
  ```ts
  returns: v.array(v.object({
    _id: v.id('tables'), name: v.string(),
    heldOrderId: v.optional(v.id('heldOrders')),
    occupied: v.boolean(), totalIDR: v.number(), itemCount: v.number(),
  }))
  ```
  Resolve the open shift (`shifts.by_cafe_status` open); for each active table, find a
  `heldOrders` row with that `tableId` + `shiftId === openShift._id`; compute
  `totalIDR = Σ line.qty × line.unitPriceIDR` (the held cart's subtotal — a running estimate,
  not the final taxed total; label it as such in the UI), `itemCount = Σ qty`. No open shift →
  all tables show empty.

### `convex/heldOrders.ts` changes
- `hold` args gain `tableId: v.optional(v.id('tables'))`. When present: `requireOwned` the
  table; reject if a held order already exists for that `(tableId, openShift)` pair
  (`'Meja sudah terisi.'`); store `tableId`.
- `listForShift` returns `tableId` (optional) per row (so the picker can show the table).

(`convex/tables.ts` is a NEW module → register in `api.d.ts`; dev watcher usually does it.)

## Frontend

### Floor view — `src/routes/_pos/tables.tsx` (new route)
Operational (cashier-accessible, like `/sale` — NOT owner-gated). A responsive grid of table
cards from `api.tables.floor`:
- Occupied → card shows the name, a filled dot, `formatIDR(totalIDR)`, `{itemCount} item`;
  tapping it navigates to `/sale?recall=<heldOrderId>` (resume).
- Empty → "kosong"; tapping navigates to `/sale?table=<tableId>` (start an order for it — the
  hold dialog will default to that table).
- Loading → Spinner; no tables → `Empty` ("Belum ada meja.") with a hint to add one.
- A **"Kelola meja"** button shown only to owners (`usePermissions().isOwner` or
  `can('canEditMenu')`) opens the management UI.

### Table management — `src/components/tables/table-manage-dialog.tsx` (new)
A sheet/dialog (owner-only) listing tables with add/rename/archive (mirror the supplier form
pattern: a small `TableFormDialog` + `ConfirmDialog` for archive). Uses
`api.tables.{create,update,archive,list}`.

### Hold dialog — `src/components/sale/hold-order-dialog.tsx`
Add an optional **table `Select`** ("Tanpa meja" + the empty tables from `api.tables.floor`
filtered to `!occupied`, plus the currently-targeted table). When the sale screen has a
`table` context (from `/sale?table=`), default the select to it. Pass `tableId` to
`api.heldOrders.hold`. (When holding to a table, default the label to the table name.)

### Sale screen — `src/components/sale/sale-screen.tsx` + the `/sale` route
- Add `validateSearch` to `src/routes/_pos/sale/index.tsx` to parse
  `{ recall?: v.string(); table?: v.string() }` (TanStack `validateSearch`), passing them to
  `SaleScreen` (via `Route.useSearch()` or props).
- On `recall=<heldOrderId>`: once the `held` list (already queried via
  `api.heldOrders.listForShift`) is loaded, if it contains that id, recall it (the existing
  `load` dispatch with fresh line keys) + `remove({ id })`, then clear the search param
  (`navigate({ search: {} , replace: true })`) so a refresh doesn't re-trigger.
- On `table=<tableId>`: hold the id in state as the "current table"; pass it to
  `HoldOrderDialog` so a subsequent "Tahan" defaults to that table. Clear after use.

### Nav — `src/components/app-shared.tsx`
Add a **"Meja"** entry (a `LayoutGrid`/`Grid3x3` icon) to the sidebar, ungated (operational).

> **New route** (`/tables`) → commit the regenerated `src/routeTree.gen.ts`.

## Testing
**`tests/convex/tables.test.ts`** (new; mirror suppliers/heldOrders test setup):
- `create`/`list`/`update`/`archive` round-trip; `list` ordering + active filter.
- `floor`: a table with a held order (via `heldOrders.hold` with `tableId`) shows
  `occupied: true` + correct `totalIDR`/`itemCount`; an empty table shows `occupied: false`;
  no open shift → all empty.
- `heldOrders.hold` with `tableId` stores it and **rejects a second hold to the same table**
  (`'Meja sudah terisi.'`); after `remove`, the table is free again.
- Owner-scope on all (foreign table id throws).

Frontend (floor grid, recall-via-param, hold table select, management) by typecheck + e2e
smoke.

## i18n
New BI strings: `Meja`, `Kelola meja`, `Tambah meja`, `Nama meja`, `Belum ada meja.`,
`Tanpa meja`, `Meja sudah terisi.`, `kosong`, `Hapus meja?`, `Meja disimpan.` etc. Extract +
fill `en` (`Table`/`Tables`, `Manage tables`, `Add table`, `Table name`, `No tables yet.`,
`No table`, `Table is occupied.`, `empty`, …), compile.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — schema derives; `tables` is a new module (register in `api.d.ts`, dev
  watcher does it — commit). **New route** → commit `routeTree.gen.ts`.
- Small conventional commits; PR → review → merge commit.

## Out of scope
- Persistent table order while editing (recall frees the table — MVP); table merge/transfer;
  seat/cover counts; a drag-and-drop floor layout (just a grid + sortOrder); table-level
  service/min-charge; reservations; assigning a table at payment (assignment is via hold).
