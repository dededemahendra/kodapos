# Kitchen Display System (KDS) Design Spec

**Date:** 2026-06-11
**Branch:** `feat/kds` (off `main`)

## Context

Orders now carry an order type (dine-in/takeaway/pickup) and can be tied to tables. This
slice adds a **kitchen display** — a live board of order tickets the barista/kitchen works
through (new → ready → done) — so staff know what to make and for whom. Convex queries are
reactive, so the board **auto-updates** as orders are rung and tickets advance, with no
polling.

Scope: **order-level** tickets (the whole order advances together). Per-item prep status is
a later refinement (noted). To show the table on a ticket (per the design), this slice also
**tags sold orders with their table** — currently only *held* orders carry `tableId`.

## Ticket lifecycle

A ticket = a **paid** order with a `kitchenStatus` of `new` or `ready`:
- An order becomes a ticket (`kitchenStatus: 'new'`) **when it settles to paid** (in
  `settleSale`) — so food is only queued once paid (correct for async QRIS too).
- Kitchen taps **"Siap"** → `ready` (made, awaiting pickup/serve).
- Kitchen taps **"Selesai"** → `done` (cleared from the board).
- The board shows `new` + `ready` only. A **voided** order drops off automatically (the
  query filters `paymentStatus === 'paid'`).

## Data model — `convex/schema.ts` (orders)
Two optional fields (legacy-tolerant):
```ts
tableId: v.optional(v.id('tables')),
kitchenStatus: v.optional(v.union(v.literal('new'), v.literal('ready'), v.literal('done'))),
```
Index for the board: `.index('by_cafe_kitchen', ['cafeId', 'kitchenStatus'])` on `orders`
(so the tickets query can scan new/ready without a full table scan).

## Backend

### Tag sold orders with the table — `convex/lib/sale.ts`
- `saleArgs`: add `tableId: v.optional(v.id('tables'))` (mirrors how `orderType` was added).
- `buildOrder`: when present, `requireOwned` the table; store `...(args.tableId ? { tableId } : {})`
  on the order insert.

### Kitchen status set on settle — `convex/lib/sale.ts` `settleSale`
In the `paymentStatus !== 'pending'` guarded body (runs once), when patching the order to
`paid`, also set `kitchenStatus: 'new'`:
`await ctx.db.patch(orderId, { paymentStatus: 'paid', kitchenStatus: 'new' });`
(Legacy/already-paid orders are untouched — they have no `kitchenStatus` and simply never
appear on the board, which is correct.)

### `convex/kitchen.ts` (new)
- **`tickets({})`** (query, owner-gated): the cafe's `paid` orders with `kitchenStatus` in
  `{new, ready}` for the **open shift** (resolve via `shifts.by_cafe_status`; no open shift →
  `[]`), oldest-first (FIFO). Each ticket:
  ```ts
  { _id, orderType, kitchenStatus: 'new' | 'ready', createdAtClient,
    tableName: v.optional(v.string()),
    lines: v.array(v.object({ nameSnapshot: v.string(), qty: v.number(),
      modifiers: v.array(v.string()) })) }
  ```
  Resolve `tableName` from `order.tableId` (a one-pass `tables` name map); `modifiers` =
  `line.modifiersSnapshot.map(m => `${m.groupName}: ${m.optionName}`)`. Query via the
  `by_cafe_kitchen` index for `new` and `ready` (two narrow reads or a filtered scan), then
  filter to the open shift + sort by `createdAtClient` asc.
- **`advance({ orderId, status })`** (mutation, owner-gated): `requireOwned` the order; set
  `kitchenStatus` to the given `'ready' | 'done'`. (Only forward transitions are exposed by
  the UI; the mutation just sets the value.)

(`convex/kitchen.ts` is a NEW module → register in `api.d.ts`; dev watcher usually does it.)

### Read validators — `convex/orders.ts`
Add `tableId: v.optional(v.id('tables'))` + `kitchenStatus: v.optional(...)` to `orderSummary`
(so `getById`/history echo them; harmless). No filter changes needed.

## Frontend

### Thread the table onto sold orders — `sale-screen.tsx` + payment dialogs
- `sale-screen` already derives a `currentTable` from `/sale?table=<id>`. **Also set
  `currentTable` from a recalled table order**: in the recall effect (table-management slice),
  when the recalled held order has a `tableId`, set `currentTable` to it (so paying re-tags
  the table). `listForShift` already returns `tableId`.
- The 4 create calls (cash / qris_static / qris_dynamic / split dialogs) already spread
  `orderType`/`promoId`/`manualDiscount`; add `...(currentTable ? { tableId: currentTable } : {})`.
  Pass `currentTable` into each dialog (a new optional prop) like the cart is passed.
  (After `onPaid`, clear `currentTable`.)

### KDS route — `src/routes/_pos/kitchen.tsx` (new)
Operational (cashier/kitchen-accessible, NOT owner-gated — like `/sale`). `const tickets =
useQuery(api.kitchen.tickets, {})` (reactive → live board). A responsive grid of ticket cards:
- Header: table name (or the order-type label) + elapsed time (from `createdAtClient`, a
  `mm:ss`/`m menit` since rung) + a `new`/`ready` color accent (new = default, ready = a muted
  "siap" tint).
- Body: each line `qty× name` with its modifiers indented.
- Actions: when `new` → a **"Siap"** button (`advance({ status: 'ready' })`); when `ready` →
  a **"Selesai"** button (`advance({ status: 'done' })`).
- `tickets === undefined` → Spinner; `[]` → `Empty` ("Tidak ada pesanan di dapur.").
- Order: `new` tickets first (oldest-first), then `ready`.

### Nav — `src/components/app-shared.tsx`
Add a **"Dapur"** (Kitchen) entry (a `ChefHat`/`Soup` lucide icon, ungated, operational
group).

> **New route** (`/kitchen`) → commit the regenerated `src/routeTree.gen.ts`.

## Testing
**`tests/convex/kitchen.test.ts`** (new; mirror orders/tables test setup):
- After `createCashSale` (settles), `kitchen.tickets` returns 1 ticket with `kitchenStatus:'new'`,
  the right lines, and `tableName` when the sale carried a `tableId` (create with `tableId`).
- `advance({ status:'ready' })` moves it to `ready` (still on the board); `advance({ status:'done' })`
  drops it off (tickets no longer returns it).
- A voided order is not a ticket (`voidSale` → not returned).
- Tickets are FIFO (oldest `createdAtClient` first); only the open shift's tickets; owner-scope.
- `createCashSale` with a `tableId` stores it on the order (back-compat: omitted → no field;
  existing sale tests stay green).

Frontend (board grid, advance buttons, live update) by typecheck + e2e smoke.

## i18n
New BI: `Dapur`, `Siap`, `Selesai`, `Tidak ada pesanan di dapur.`, `menit` / elapsed label,
`Pesanan dapur` (+ reuse order-type labels, `Meja`, `{0} item`). Extract + fill `en`
(`Kitchen`, `Ready`, `Done`, `No kitchen orders.`, `min`, …), compile.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — schema derives; `kitchen` is a new module (register in `api.d.ts`).
  **New route** → commit `routeTree.gen.ts`.
- `settleSale` is the money/settlement path — keep the change minimal (one extra field in the
  existing patch); the existing sale + void tests must stay green.
- Small conventional commits; PR → review → merge commit.

## Out of scope
- Per-item prep/bump status; multiple kitchen stations/routing; course/firing timing.
- A "recall a done ticket" / kitchen history view (order history already exists).
- Auto-print kitchen chits; sound/notification on new tickets.
- Prep-time analytics; SLA coloring beyond new-vs-ready.
