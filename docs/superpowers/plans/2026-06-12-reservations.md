# Reservations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Front-of-house CRUD — no money path.

**Goal:** Staff-entered table reservations (who/when/party/table) with a booked→seated→completed/cancelled/no-show lifecycle, plus today's bookings surfaced on the floor view.

---

## File Structure
- **Create:** `convex/reservations.ts`, `tests/convex/reservations.test.ts`, `src/routes/_pos/reservations.tsx`, `src/components/reservations/reservation-form-dialog.tsx`.
- **Modify:** `convex/schema.ts`, `convex/_generated/api.d.ts`, `src/routes/_pos/tables.tsx` (floor chip), `src/components/app-shared.tsx` (nav), `src/routeTree.gen.ts`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — reservations table + CRUD + lifecycle + list/todayByTable (TDD)
**Files:** create `convex/reservations.ts`, `tests/convex/reservations.test.ts`; modify `convex/schema.ts`, `convex/_generated/api.d.ts`.

READ: `convex/tables.ts` (`requireOwnerCafe`/`requireOwned`, `list`, the `tableDoc` shape, `archive` pattern), `convex/customers.ts` (`list`, `customerDoc` — name/phone fields), `convex/lib/time.ts` (`tzFor`, `dayKeyFn`/`resolveRange` — to compute "today" boundaries in the café tz), `convex/lib/auth.ts`; `tests/convex/tables.test.ts` + `tests/convex/customers.test.ts` (setup: owner, a table via `api.tables.create`, a customer via `api.customers.*`).

- [ ] **Step 1: schema** — add the `reservations` table (spec shape) with `by_cafe_at` + `by_cafe_status` indexes.
- [ ] **Step 2: FAILING tests** (`tests/convex/reservations.test.ts`):
  - `create({ customerName, partySize, at })` → a `booked` reservation; `list` returns it; `create` with a `tableId` → `list` row has `tableName`; rejects empty `customerName` (no customer) (`/nama tamu/i`), `partySize` 0/101/non-integer (`/jumlah tamu/i`); a `customerId` with no `customerName` resolves the name from the customer.
  - `setStatus` booked→seated→completed; booked→cancelled; booked→no_show; `list({status})` filters.
  - `update` edits partySize/at/note; `remove` deletes (gone from `list`).
  - `list({from,to})` excludes a reservation stamped outside the window; `todayByTable` returns only today's `booked`/`seated` table-assigned bookings (not cancelled/no-table/other-day).
  - owner-scope: a foreign table/customer/reservation throws.
  Run → confirm FAIL.
- [ ] **Step 3: implement `convex/reservations.ts`** (owner-gated) per the spec:
  - `create`: validate (partySize int 1..100, at finite, durationMin default 90 int 1..600, customerName trimmed non-empty OR resolved from `requireOwned` customer; `requireOwned` table if given); insert `status:'booked'`, `createdAt`.
  - `update`/`setStatus`/`remove`: `requireOwned(ctx, cafeId, id, 'Reservasi')`.
  - `list({from?,to?,status?})`: `by_cafe_at` over `[from ?? startOfToday, to ?? +inf]`; optional status filter; sort `at` asc; enrich each with `tableName` (lookup `tableId`) → `{ rows }`.
  - `todayByTable`: today's `booked`/`seated` reservations with a `tableId` (compute today bounds via `tzFor`), map to `{ tableId, at, customerName, partySize, status }`.
  Proper Convex return validators.
- [ ] **Step 4: register + tests + commit** — api.d.ts (`reservations`); `pnpm test tests/convex/reservations.test.ts` + full PASS; `pnpm typecheck` PASS. Commit:
  `git add convex/reservations.ts convex/schema.ts convex/_generated/api.d.ts tests/convex/reservations.test.ts && git commit -m "feat(reservations): bookings table + CRUD + lifecycle + floor query"`
  > Do NOT run codegen.

---

### Task 2: Frontend — reservations page + form dialog + nav
**Files:** create `src/routes/_pos/reservations.tsx`, `src/components/reservations/reservation-form-dialog.tsx`; modify `src/components/app-shared.tsx`; commit `src/routeTree.gen.ts`.

READ: `src/routes/_pos/suppliers.tsx` or `src/routes/_pos/reports/expenses.tsx` (the page pattern: `PageHeader`, `DataTable`, RowActions, `ConfirmDialog`, `Empty`, `Spinner`), `src/components/reports/range-picker.tsx` (the shadcn Popover+Calendar date pattern to reuse for the date filter + the dialog date field), `src/components/supplier/supplier-form-dialog.tsx` (a create/edit dialog to mirror), `src/components/ui/{select,input,calendar,popover,badge,button,data-table,empty}`, the `StatusBadge` usage, `src/components/app-shared.tsx` (the Tables nav entry to mirror gating).

- [ ] **Step 1: `reservation-form-dialog.tsx`** — props `{ open, onOpenChange, editing?: Reservation | null }`. A customer `Select` from `api.customers.list` (optional; "Tanpa pelanggan" + choosing one prefills name/phone) OR freeform `customerName` + `phone` `Input`; a **date** (Popover+Calendar) + a **time** `Input type="time"` combined into `at` (ms) on submit (construct from the date's Y/M/D + the HH:MM in local time; document the tz assumption — server stores the ms); a `partySize` numeric `Input`; an optional table `Select` from `api.tables.list`; optional `durationMin` + `note`. Submit → `api.reservations.create` (or `update` when `editing`); validate before submit; toast; reset+close.
- [ ] **Step 2: `reservations.tsx`** — `createFileRoute('/_pos/reservations')`. `PageHeader` "Reservasi" + "Buat reservasi" button. A date filter (Popover+Calendar, default today) + a status `Select` (Semua/Dipesan/Duduk/Selesai/Dibatalkan/Tidak datang) → `api.reservations.list({ from, to, status })`. A `DataTable`: Waktu (`at`→`HH:MM`), Tamu (customerName + phone), Jumlah (partySize), Meja (`tableName ?? '—'`), Status (`StatusBadge` booked=muted/seated=info/completed=success/cancelled=danger/no_show=warn), Aksi (Duduk/Selesai/Batalkan/Tidak datang → `setStatus`; Ubah → dialog; Hapus → ConfirmDialog → `remove`). `Empty` (icon `CalendarClock`) + `Spinner`.
- [ ] **Step 3: nav** — `app-shared.tsx`: add `{ title: msg\`Reservasi\`, path: '/reservations', icon: <CalendarClock />, requires: <same as the Meja/Tables entry> }` near Tables (import `CalendarClock`).
- [ ] **Step 4: routeTree** — `pnpm build`; confirm `grep -c "reservations" src/routeTree.gen.ts` > 0; stage it.
- [ ] **Step 5:** typecheck + test PASS. Commit:
  `git add src/routes/_pos/reservations.tsx src/components/reservations/reservation-form-dialog.tsx src/components/app-shared.tsx src/routeTree.gen.ts && git commit -m "feat(reservations): reservations page + form dialog + nav"`

---

### Task 3: Floor view — today's reservation chip on `/tables`
**Files:** modify `src/routes/_pos/tables.tsx`.

READ: `src/routes/_pos/tables.tsx` (the floor card rendering — how each table card is built from `api.tables.floor`), `~/lib/money` (not needed) / the existing chip/badge styling.

- [ ] **Step 1:** add `const todayRes = useQuery(api.reservations.todayByTable, {})`; build a `Map<tableId, {at, customerName, partySize}>` (earliest per table). On each table card with a booking, render a small chip "Reservasi {HH:MM} · {partySize}" (a `Badge`/muted pill) + a subtle ring/highlight. Additive only — don't change the resume/start-order links.
- [ ] **Step 2:** typecheck + test PASS. Commit:
  `git add src/routes/_pos/tables.tsx && git commit -m "feat(tables): surface today's reservation on the floor view"`

---

### Task 4: i18n
New (see spec): `Reservasi`, `Buat reservasi`, `Nama tamu`, `Jumlah tamu`, `Meja`, `Durasi (menit)`, `Catatan`, `Duduk`, `Selesai`, `Batalkan`, `Tidak datang`, status labels `Dipesan`/`Duduk`/`Selesai`/`Dibatalkan`/`Tidak datang`, `Belum ada reservasi.`, `Reservasi {0} · {1}`, `Tanpa pelanggan`, `Semua`.
- [ ] `pnpm lingui:extract`; fill `en` (`Reservations`, `New reservation`, `Guest name`, `Party size`, `Table`, `Duration (min)`, `Note`, `Seat`, `Complete`, `Cancel`, `No-show`, `Booked`/`Seated`/`Completed`/`Cancelled`/`No-show`, `No reservations yet.`, `No customer`, `All`) + any other new empties; watch for collisions (give distinct source text where a word like `Selesai`/`Meja` is already used differently — verify the existing en value fits the reservation context, else use a distinct phrase). `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 5: Final verification
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; `git status` clean — **routeTree.gen.ts committed**.
- [ ] **Manual sanity:** create a reservation (pick a customer + table + date/time) → it lists under the date; mark Duduk → status advances + `/tables` shows the chip; Batalkan removes it from active; an empty day shows the Empty state.

---

## Self-Review
**Spec coverage:** table + CRUD + setStatus + list + todayByTable (T1); page + dialog + nav (T2); floor chip (T3); tests create/validate/status/filter/scope/todayByTable (T1); i18n (T4). ✓
**Placeholder scan:** test seeding "reuse tables/customers setup"; UI "mirror suppliers page + range-picker date + supplier dialog". Else spec code.
**Type consistency:** `reservations.create({tableId?,customerId?,customerName?,phone?,partySize,at,durationMin?,note?})` ↔ dialog; `list` `{rows:[{...,tableName?,status}]}` ↔ table; `setStatus({id,status})` ↔ row actions; `todayByTable` `[{tableId,at,customerName,partySize,status}]` ↔ floor chip. Status union identical across schema/mutations/UI. ✓
