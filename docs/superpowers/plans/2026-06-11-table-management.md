# Table Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** A table floor — define tables, see occupied/empty + running total, tap a table to open/resume its order — built on held orders (a table owns a parked order).

**Architecture:** `tables` table + `convex/tables.ts` (CRUD + `floor` query joining held orders). `heldOrders.tableId` ties a parked order to a table; `hold` enforces one-per-table. A `/tables` floor route (cashier-accessible) recalls an occupied table's order via `/sale?recall=<id>` (reusing held-order recall). Owner-only table CRUD.

---

## File Structure
- **Create:** `convex/tables.ts`, `tests/convex/tables.test.ts`, `src/routes/_pos/tables.tsx`, `src/components/tables/table-manage-dialog.tsx`.
- **Modify:** `convex/schema.ts`, `convex/heldOrders.ts`, `convex/_generated/api.d.ts`, `src/components/sale/hold-order-dialog.tsx`, `src/components/sale/sale-screen.tsx`, `src/routes/_pos/sale/index.tsx`, `src/components/app-shared.tsx`, `src/routeTree.gen.ts`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — tables + floor + heldOrders.tableId (TDD)
**Files:** create `convex/tables.ts`, `tests/convex/tables.test.ts`; modify `convex/schema.ts`, `convex/heldOrders.ts`, `convex/_generated/api.d.ts`.

READ: `convex/suppliers.ts` (CRUD pattern: create/update/archive/list, requireOwnerCafe/requireOwned, name validation, sortOrder); `convex/heldOrders.ts` (the whole module — `hold` looks up the open shift, `listForShift`, the `heldRow` return validator); `convex/cashMovements.ts` (`by_cafe_status` open-shift lookup); `tests/convex/{suppliers,heldOrders}.test.ts` (setup helpers + how heldOrders.hold is called).

- [ ] **Step 1: schema** — `convex/schema.ts`:
  - Add the `tables` table (spec shape) with `by_cafe` index.
  - `heldOrders`: add `tableId: v.optional(v.id('tables'))` + `.index('by_table', ['tableId'])`.
- [ ] **Step 2: FAILING tests — `tests/convex/tables.test.ts`** (copy the heldOrders/suppliers setup: owner, open shift, an item for held lines):
  - `tables.create`/`list`/`update`/`archive` round-trip + ordering + active filter.
  - `tables.floor`: create a table; `heldOrders.hold({ ...lines, tableId })` → `floor` shows that table `occupied:true` with `totalIDR === Σ qty*unitPrice` and right `itemCount`; a second empty table shows `occupied:false`; (optionally) no-open-shift path.
  - `heldOrders.hold` with `tableId` stores it; a SECOND hold to the same table rejects (`/terisi/i`); after `heldOrders.remove`, holding to it succeeds again.
  - owner-scope: foreign table id in `hold`/`update`/`archive` throws.
  Run → confirm FAIL.
- [ ] **Step 3: implement `convex/tables.ts`** — create/update/archive/list mirroring suppliers; `floor` per the spec (resolve open shift via `by_cafe_status`; for each active table, find a `heldOrders` row by `by_table` filtered to the open shift's id; compute totalIDR/itemCount from its lines; `occupied = !!held`).
- [ ] **Step 4: `convex/heldOrders.ts`** — `hold` args gain `tableId: v.optional(v.id('tables'))`; when present `requireOwned` the table + reject if an existing held order has that `tableId` in the open shift (`'Meja sudah terisi.'`); store `...(tableId ? { tableId } : {})`. `listForShift` `heldRow` validator + map gain `tableId: v.optional(v.id('tables'))`.
- [ ] **Step 5: register** — check `git status` for the dev-watcher `api.d.ts` add of `tables`; keep/add it. `pnpm typecheck` PASS.
- [ ] **Step 6: tests + commit** — `pnpm test tests/convex/tables.test.ts` + full `pnpm test` PASS. Commit:
  `git add convex/tables.ts convex/schema.ts convex/heldOrders.ts convex/_generated/api.d.ts tests/convex/tables.test.ts && git commit -m "feat(tables): tables CRUD + floor + held-order tableId (one per table)"`

---

### Task 2: Floor route + table management + nav
**Files:** create `src/routes/_pos/tables.tsx`, `src/components/tables/table-manage-dialog.tsx`; modify `src/components/app-shared.tsx`; commit `src/routeTree.gen.ts`.

READ: `src/routes/_pos/suppliers.tsx` (CRUD page + RequirePermission + DataTable/FormDialog/ConfirmDialog) for the management dialog; `src/lib/permissions.ts` (`usePermissions` → `isOwner`/`can`); `src/components/app-shared.tsx` (nav items shape); a simple grid for the floor.

- [ ] **Step 1: `table-manage-dialog.tsx`** — an owner-only management surface (a Dialog/Sheet) listing `api.tables.list` with add (name input → `create`), rename (`update`), archive (`ConfirmDialog` → `archive`). Mirror supplier-form-dialog conventions + toast.
- [ ] **Step 2: `src/routes/_pos/tables.tsx`** — `createFileRoute('/_pos/tables')`. NOT owner-gated (operational). `const floor = useQuery(api.tables.floor, {})`. Render a responsive grid (`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3`) of table cards:
  - occupied → name + a filled dot + `formatIDR(totalIDR)` + `{itemCount} item`; `<Link to="/sale" search={{ recall: t.heldOrderId }}>` (only when `heldOrderId`).
  - empty → name + "kosong"; `<Link to="/sale" search={{ table: t._id }}>`.
  - `floor === undefined` → Spinner; `floor.length === 0` → `Empty` ("Belum ada meja.").
  - A header with a "Kelola meja" button shown when `usePermissions().isOwner` (or `can('canEditMenu')`) → opens `TableManageDialog`.
- [ ] **Step 3: nav** — `src/components/app-shared.tsx`: add a "Meja" nav item (`{ title: msg\`Meja\`, path: '/tables', icon: <Grid3x3 /> }` — match the real nav item shape; ungated) in a sensible group (near Sale/operational).
- [ ] **Step 4: regenerate route tree** — `pnpm build`; confirm `grep tables src/routeTree.gen.ts` includes `/tables`; stage it.
- [ ] **Step 5: typecheck + test + commit**
  `git add src/routes/_pos/tables.tsx src/components/tables/table-manage-dialog.tsx src/components/app-shared.tsx src/routeTree.gen.ts && git commit -m "feat(tables): floor view + management + nav"`

---

### Task 3: Hold-to-table + recall-via-param wiring
**Files:** modify `src/components/sale/hold-order-dialog.tsx`, `src/components/sale/sale-screen.tsx`, `src/routes/_pos/sale/index.tsx`.

READ: `src/components/sale/hold-order-dialog.tsx` (current props + the hold call), `src/components/sale/sale-screen.tsx` (the `held` query, the recall logic via `HeldOrdersDialog`/`load` dispatch + `genLineKey`, and `dispatch`/`onPaid`), `src/routes/_pos/reports/route.tsx` (a `validateSearch` example).

- [ ] **Step 1: sale route search** — `src/routes/_pos/sale/index.tsx`: add `validateSearch` that parses `{ recall?: string; table?: string }` (optional strings; ignore unknowns). Pass them to `SaleScreen` (via `Route.useSearch()` inside SaleScreen using `getRouteApi('/_pos/sale/')`, or as props from `SaleIndex`).
- [ ] **Step 2: HoldOrderDialog table select** — add an optional table `Select`. Query `api.tables.floor`; options = "Tanpa meja" + tables where `!occupied` (plus `defaultTableId` if provided even if occupied-by-self). Add props `defaultTableId?: Id<'tables'>`. On open, seed the select to `defaultTableId`. Pass `...(selectedTableId ? { tableId: selectedTableId } : {})` to `api.heldOrders.hold`. When a table is selected and the label is blank, default the label to the table's name.
- [ ] **Step 3: sale-screen wiring** —
  - Read `recall`/`table` search params. Keep `const [currentTable, setCurrentTable] = useState<Id<'tables'>|null>(null)`; on mount/param change, if `table` present set `currentTable` to it (cast). Pass `defaultTableId={currentTable ?? undefined}` to `HoldOrderDialog`.
  - Recall effect: when `recall` is set and `held` (the `listForShift` result) contains a row with that `_id`, build the `CartState` (fresh line keys via `genLineKey`, promo, orderType) and `dispatch({ type: 'load', state })`, then `await removeHeld({ id })`, then `navigate({ to: '/sale', search: {}, replace: true })` to clear the param (guard so it runs once). Reuse the existing recall builder from the held-orders picker (extract a small helper if needed). `removeHeld = useMutation(api.heldOrders.remove)`.
  - After a successful pay (`onPaid`) the held order is already gone (recalled) so the table stays free — no extra work.
- [ ] **Step 4: typecheck + test + commit**
  `git add src/components/sale/hold-order-dialog.tsx src/components/sale/sale-screen.tsx src/routes/_pos/sale/index.tsx && git commit -m "feat(tables): hold-to-table + resume a table's order from the floor"`

---

### Task 4: i18n
New: `Meja`, `Kelola meja`, `Tambah meja`, `Nama meja`, `Belum ada meja.`, `Tanpa meja`,
`Meja sudah terisi.`, `kosong`, `Hapus meja?`, `Meja disimpan.`, `Gagal menyimpan meja.` (+ reuse `Tahan`, `Batal`, `Simpan`, `Hapus`, `{0} item`).
- [ ] `pnpm lingui:extract`; fill `en` (`Table`, `Manage tables`, `Add table`, `Table name`, `No tables yet.`, `No table`, `Table is occupied.`, `empty`, `Delete table?`, `Table saved.`, `Could not save the table.`) + any other new empties; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.
- [ ] Watch the `Jumlah`/`{0} item` shared-string collisions (reuse existing en; don't refill).

---

### Task 5: Final verification
- [ ] `pnpm typecheck` → PASS; `pnpm test` → PASS; `pnpm lingui:compile` → en 0 missing; `git status` clean — **confirm `routeTree.gen.ts` committed**.
- [ ] **Manual sanity:** owner adds 3 tables via "Kelola meja"; `/tables` shows them empty; from `/sale` build a cart → "Tahan" → pick Meja 2 → it shows occupied with the total; tapping Meja 2 on the floor resumes the cart in `/sale` and frees the table; a second hold to an occupied table is blocked.

---

## Self-Review
**Spec coverage:** tables CRUD + floor join (T1); heldOrders.tableId + one-per-table + listForShift (T1); floor route + management + nav + routeTree (T2); hold-to-table select + recall-via-param + sale route search (T3); tests for CRUD/floor/occupied/one-per-table/owner-scope (T1); i18n (T4). ✓
**Placeholder scan:** test setup "copy from heldOrders/suppliers tests"; nav item "match real shape". Else concrete.
**Type consistency:** `tables.floor` returns `{ _id, name, heldOrderId?, occupied, totalIDR, itemCount }[]` consumed by the floor route (T2) + the hold dialog's empty-table filter (T3). `heldOrders.hold` `tableId?` matches the dialog's call + the floor's occupancy check. `/sale` search `{ recall?, table? }` validated (T3) + read in sale-screen. New route → routeTree committed. ✓
