# Reservations Design Spec

**Date:** 2026-06-12
**Branch:** `feat/reservations` (off `main`)

## Context

kodapos manages a table floor (`tables` + `/tables`) and a customer book (`customers`), but has
no way to take a **booking** ahead of time. This slice adds table **reservations**: an owner/host
records who's coming, when, party size, and (optionally) which table; works the list through its
lifecycle (booked → seated → completed, or cancelled / no-show); and sees today's bookings
surfaced on the floor view.

Front-of-house CRUD — no money path. Off the payment/stock/loyalty surface.

## Model — new `reservations` table

```ts
reservations: defineTable({
  cafeId: v.id('cafes'),
  tableId: v.optional(v.id('tables')),       // optional — book without assigning a table
  customerId: v.optional(v.id('customers')),  // optional link to the customer book
  customerName: v.string(),                   // snapshot / freeform name
  phone: v.optional(v.string()),
  partySize: v.number(),
  at: v.number(),                             // reservation datetime (ms, in the café tz)
  durationMin: v.number(),                    // default 90
  status: v.union(
    v.literal('booked'), v.literal('seated'),
    v.literal('completed'), v.literal('cancelled'), v.literal('no_show')
  ),
  note: v.optional(v.string()),
  createdAt: v.number(),
})
  .index('by_cafe_at', ['cafeId', 'at'])
  .index('by_cafe_status', ['cafeId', 'status']),
```

`tableId`/`customerId` are optional so a walk-in booking with just a name + time is valid. The
booking carries a `customerName` snapshot regardless (so a deleted/unlinked customer still shows).

## Backend — `convex/reservations.ts` (new, owner-gated)

- **`create({ tableId?, customerId?, customerName?, phone?, partySize, at, durationMin?, note? })`**:
  `requireOwnerCafe`; `requireOwned` the table + customer if given; resolve `customerName` from the
  customer if `customerId` and no explicit name, else require a non-empty trimmed `customerName`
  (`'Nama tamu wajib diisi.'`); `partySize` integer 1..100 (`'Jumlah tamu tidak valid.'`); `at` a
  finite number; `durationMin` default 90 (int 1..600). Insert `status:'booked'`. Returns the id.
- **`update({ id, ...editable })`**: `requireOwned`; patch the same validated fields (not status).
- **`setStatus({ id, status })`**: `requireOwned`; set the lifecycle status. (Cancel / no-show /
  seat / complete are all this one mutation.)
- **`remove({ id })`**: `requireOwned`; delete (hard delete for a mistaken entry; cancel is the
  soft path via `setStatus`).
- **`list({ from?, to?, status? })`**: reservations over a `by_cafe_at` window (default: today
  onward, e.g. `at >= startOfToday`), optionally filtered by `status`; sorted by `at` ascending;
  each enriched with `tableName?` (from the table) + the effective display name. Returns
  `{ rows: [{ id, at, customerName, phone?, partySize, tableId?, tableName?, status, durationMin,
  note? }] }`.
- **`todayByTable({})`**: today's active (`booked`/`seated`) reservations that have a `tableId`,
  keyed for the floor view → `[{ tableId, at, customerName, partySize, status }]` (earliest per
  table is enough for the chip). For surfacing on `/tables`.

Time: use `tzFor(ctx, cafeId)` + the `lib/time` day helpers to compute "today" boundaries in the
café timezone (mirror how reports resolve a day).

## Frontend

### Route — `src/routes/_pos/reservations.tsx` (new)
`createFileRoute('/_pos/reservations')`. A `PageHeader` "Reservasi" + a "Buat reservasi" button.
A date filter (default today; a shadcn date Popover+Calendar like `reports/range-picker.tsx`) and
an optional status filter. `api.reservations.list` → a list grouped by day / a `DataTable`:
time (`at` → `HH:MM`), customer (+ phone), party size, table (`tableName ?? '—'`), a status
`StatusBadge`, and row actions (Seated / Selesai / Batalkan / Tidak datang via
`api.reservations.setStatus`; Ubah → the dialog; Hapus → ConfirmDialog → `remove`). `Empty`
(icon `CalendarClock`) when none; `Spinner` while loading.

### Dialog — `src/components/reservations/reservation-form-dialog.tsx` (new)
Create/edit. Fields: a **customer** `Select`/search from `api.customers.list` (optional — choosing
one fills name+phone) OR a freeform `customerName` + `phone` `Input`; a **date** (shadcn
Popover+Calendar) + a **time** `Input type="time"` (combined into a single `at` ms in the café tz
on submit); a **party size** numeric `Input`; an optional **table** `Select` from
`api.tables.list`; an optional **duration** + **note**. Submit → `create`/`update`; validate;
toast; reset+close.

### Floor view — `src/routes/_pos/tables.tsx`
Query `api.reservations.todayByTable`; on each table card that has a today booking, render a small
chip "Reservasi {HH:MM} · {partySize}" (and a subtle highlight). Purely additive — doesn't change
the existing resume/start-order behavior.

### Nav — `src/components/app-shared.tsx`
Add a **"Reservasi"** entry (icon `CalendarClock`/`CalendarCheck`) near the Tables/operational
items, with the same gating the Tables item uses.

## Testing
**`tests/convex/reservations.test.ts`** (new; reuse the tables/customers test setup):
- `create` → `booked` reservation; `list` returns it (enriched `tableName` when a table is set);
  rejects empty `customerName` (with no customer), `partySize` 0 / >100 / non-integer; resolves
  `customerName` from a linked `customerId`.
- `setStatus` transitions (booked→seated→completed; booked→cancelled; booked→no_show); reflected
  in `list`'s status filter.
- `update` edits fields; `remove` deletes.
- `list` range/status filtering (a reservation outside the window / of another status excluded);
  `todayByTable` returns only today's active table-assigned bookings.
- owner-scope: a foreign table/customer/reservation throws.

Frontend (form, date+time → `at`, status actions, floor chip) by typecheck + smoke.

## i18n
New BI: `Reservasi`, `Buat reservasi`, `Nama tamu`, `Jumlah tamu`, `Meja`, `Durasi (menit)`,
`Catatan`, `Duduk` (seated), `Selesai`, `Batalkan`, `Tidak datang`, status labels
`Dipesan`/`Duduk`/`Selesai`/`Dibatalkan`/`Tidak datang`, `Belum ada reservasi.`, server-thrown
`'Nama tamu wajib diisi.'`/`'Jumlah tamu tidak valid.'` (off-catalog). Extract + fill `en`
(`Reservations`, `New reservation`, `Guest name`, `Party size`, `Table`, `Duration (min)`,
`Note`, `Seat`, `Complete`, `Cancel`, `No-show`, `Booked`/`Seated`/`Completed`/`Cancelled`/
`No-show`, `No reservations yet.`), compile.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — `reservations` is a NEW module (register in `api.d.ts`; dev watcher does it —
  commit). **New route** → commit `routeTree.gen.ts`.
- shadcn primitives: the date uses Popover+Calendar (per the project convention), not a native date
  input. Small conventional commits; PR → review → merge commit.

## Out of scope
- Online/customer-facing self-booking (this is staff-entered); SMS/WhatsApp confirmation
  reminders; double-booking / capacity conflict detection (a table can hold two bookings — the
  host manages it); recurring reservations; deposits/prepayment; converting a reservation directly
  into an open order/held order (the floor chip is informational this slice); calendar/timeline
  visualization (a dated list).
