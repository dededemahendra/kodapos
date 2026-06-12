# Purchase Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Inventory-cost path → TDD + adversarial review.

**Goal:** Create a PO to a supplier → receive (full/partial) → stock + cost update. Mirrors `purchases.record` receive mechanics; ad-hoc purchases stay.

---

## File Structure
- **Create:** `convex/purchaseOrders.ts`, `tests/convex/purchase-orders.test.ts`, `src/routes/_pos/inventory/purchase-orders.tsx`, `src/components/inventory/purchase-order-form-dialog.tsx`, `src/components/inventory/purchase-order-detail.tsx`.
- **Modify:** `convex/schema.ts`, `convex/_generated/api.d.ts`, `src/components/app-shared.tsx`, `src/routeTree.gen.ts`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — purchaseOrders table + create/receive/cancel/list/get (TDD)
**Files:** create `convex/purchaseOrders.ts`, `tests/convex/purchase-orders.test.ts`; modify `convex/schema.ts`, `convex/_generated/api.d.ts`.

READ: `convex/purchases.ts` `record` (the receive mechanics: per-line `inventoryMovements` insert `reason:'purchase'` + `patch(ingredient,{lastCostPerUnitIDR})`, line validation), `convex/suppliers.ts` + `convex/ingredients.ts` (`requireOwned`, name/unit), `convex/lib/inventory.ts` `currentStockQty`; `tests/convex/purchases.test.ts` + `ingredients.test.ts` (setup: owner + ingredient + supplier).

- [ ] **Step 1: schema** — add the `purchaseOrders` table (spec shape) with `by_cafe_status` + `by_cafe_created` indexes.
- [ ] **Step 2: FAILING tests** (`tests/convex/purchase-orders.test.ts`, mirror purchases/ingredients setup):
  - `create` → `open` PO, lines `receivedQty 0`; `get`/`list` return it; reject empty lines / non-positive orderedQty / archived ingredient / foreign supplier.
  - receive PART of a line → line `receivedQty` bumped, status `'partial'`, `currentStockQty` up by received qty (a `purchase` movement), ingredient `lastCostPerUnitIDR` = PO line cost.
  - receive ALL lines fully → status `'received'`; a further `receive` rejects (`/selesai/i`).
  - over-receipt (`receivedQty+qty > orderedQty`) rejects (`/melebihi/i`); nothing applied.
  - `cancel` an open/partial PO → `'cancelled'`; a `'received'` PO can't be cancelled; cancel does NOT change `currentStockQty`.
  - owner-scope: foreign PO/supplier/ingredient throws.
  Run → confirm FAIL.
- [ ] **Step 3: implement `convex/purchaseOrders.ts`** (owner-gated) — `create`/`receive`/`cancel`/`list`/`get` per the spec.
  - `create`: validate lines (orderedQty int>0, unitCostIDR int≥0, ingredient in cafe + not archived); `requireOwned` supplier if `supplierId`; snapshot `supplierName`; insert `status:'open'`, lines `receivedQty:0`.
  - `receive`: `requireOwned` PO; reject `status` received/cancelled; for each `{ingredientId, qty}` find the line, validate `qty` int>0 and `receivedQty+qty ≤ orderedQty`; bump `receivedQty`; insert `inventoryMovements` (`reason:'purchase'`, `delta:qty`, `refType:'purchaseOrder'`, `refId: id`); patch ingredient `lastCostPerUnitIDR = line.unitCostIDR`. After all: derive status (all full → received, any received → partial, else open); patch `{ lines, status }`.
  - `cancel`: reject received/cancelled; set `'cancelled'`.
  - `list`: newest-first summaries (orderedTotal/receivedTotal/lineCount/status). `get`: lines + ingredient name/unit + remainingQty.
  Provide proper Convex return validators.
- [ ] **Step 4: register + tests + commit** — api.d.ts (`purchaseOrders`); `pnpm test tests/convex/purchase-orders.test.ts` + full PASS; `pnpm typecheck` PASS. Commit:
  `git add convex/purchaseOrders.ts convex/schema.ts convex/_generated/api.d.ts tests/convex/purchase-orders.test.ts && git commit -m "feat(inventory): purchase orders — create/receive/cancel + stock+cost on receipt"`
  > Do NOT run codegen.

---

### Task 2: Frontend — PO list page + create dialog + nav
**Files:** create `src/routes/_pos/inventory/purchase-orders.tsx`, `src/components/inventory/purchase-order-form-dialog.tsx`; modify `src/components/app-shared.tsx`; commit `src/routeTree.gen.ts`.

READ: `src/routes/_pos/inventory/purchases.tsx` (the inventory page pattern + RequirePermission canEditMenu + the record form with a line editor + supplier/ingredient pickers — REUSE these patterns), `src/components/inventory/ingredient-picker.tsx` (if used), `src/components/ui/{data-table,empty,select,input,badge,button}`, `app-shared.tsx` nav.

- [ ] **Step 1: `purchase-order-form-dialog.tsx`** — a create dialog: supplier `Select` (`api.suppliers.list`, optional/"Tanpa pemasok") + a line editor (rows: ingredient `Select` from `api.ingredients.list`, ordered-qty `Input`, unit-cost `Input`; "+ Tambah baris"; remove ✕) + a live ordered total; submit → `api.purchaseOrders.create`. Mirror the purchases record form.
- [ ] **Step 2: `purchase-orders.tsx`** — `createFileRoute('/_pos/inventory/purchase-orders')`, wrapped in `<RequirePermission perm="canEditMenu">`. `PageHeader` "Pesanan Beli" + a "Buat PO" button (opens the form). `api.purchaseOrders.list` → a DataTable/list (supplier, status `StatusBadge` open/partial/received/cancelled, dipesan total, diterima total, date) → row opens the detail (Task 3 component; for now wire a `selectedId` state + render the detail). Empty → `Empty` (icon `ClipboardList`, title "Belum ada pesanan beli.", desc). Loading → Spinner.
- [ ] **Step 3: nav** — add `{ title: msg\`Pesanan Beli\`, path: '/inventory/purchase-orders', icon: <ClipboardList />, requires: 'canEditMenu' }` to `app-shared.tsx` near the inventory/suppliers items.
- [ ] **Step 4: routeTree** — `pnpm build`; confirm `grep "PurchaseOrders" src/routeTree.gen.ts`; stage it.
- [ ] **Step 5:** typecheck + test PASS. Commit:
  `git add src/routes/_pos/inventory/purchase-orders.tsx src/components/inventory/purchase-order-form-dialog.tsx src/components/app-shared.tsx src/routeTree.gen.ts && git commit -m "feat(inventory): purchase orders list + create + nav"`

---

### Task 3: Frontend — PO detail + receive + cancel
**Files:** create `src/components/inventory/purchase-order-detail.tsx`; wire it into `purchase-orders.tsx`.

READ: `api.purchaseOrders.get`/`receive`/`cancel`; `src/components/ui/{sheet or dialog, input, button, confirm-dialog}`; `~/lib/money`.

- [ ] **Step 1: `purchase-order-detail.tsx`** — props `{ id: Id<'purchaseOrders'> | null, onOpenChange }`. `api.purchaseOrders.get` → header (supplier, status badge, ordered/received totals) + lines (ingredient · dipesan {orderedQty} · diterima {receivedQty} · sisa {remainingQty} · {formatIDR unitCost}). Actions (when not received/cancelled):
  - **Terima**: a per-line qty editor pre-filled to `remainingQty` (Input, ≤ remaining, ≥0); submit → `api.purchaseOrders.receive({ id, lines: rows.filter(qty>0).map(...) })`; disable while submitting; toast.
  - **Batalkan**: `ConfirmDialog` → `api.purchaseOrders.cancel`; shown only when status is open/partial.
  Loading → Spinner.
- [ ] **Step 2: wire** into `purchase-orders.tsx` (the `selectedId` from Step-2 list rows opens `<PurchaseOrderDetail id={selectedId} onOpenChange={...} />`). The list is reactive → status/totals refresh after receive/cancel.
- [ ] **Step 3:** typecheck + test PASS. Commit:
  `git add src/components/inventory/purchase-order-detail.tsx src/routes/_pos/inventory/purchase-orders.tsx && git commit -m "feat(inventory): purchase order detail + receive + cancel"`

---

### Task 4: i18n
New: `Pesanan Beli`, `Buat PO`, `Terima`, `Dipesan`, `Diterima`, `Sisa`, `Batalkan PO?`, `Belum ada pesanan beli.`, `Tanpa pemasok`, `Tambah baris`, status labels `Terbuka`/`Sebagian`/`Diterima`/`Dibatalkan` (+ reuse `Pemasok`/`Bahan`/`Total`/`Batal`/`Simpan`/`Hapus`).
- [ ] `pnpm lingui:extract`; fill `en` (`Purchase orders`, `New PO`, `Receive`, `Ordered`, `Received`, `Remaining`, `Cancel PO?`, `No purchase orders yet.`, `No supplier`, `Add row`, `Open`/`Partial`/`Received`/`Cancelled`) + any others; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 5: Final verification + adversarial review
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; `git status` clean — **routeTree.gen.ts committed**.
- [ ] code-reviewer on `git diff main...HEAD`: receive caps at `orderedQty` (no over-receipt); each receive inserts exactly one purchase movement per received line + updates cost correctly; status derivation (open/partial/received) is correct after partial + full receives; a received/cancelled PO rejects further receive; cancel does NOT reverse stock; double-receive of the same physical qty is the user's discrete action (no idempotency bug — but the over-cap guard bounds it); owner-scope on PO/supplier/ingredient; `currentStockQty` increments match received qty.
- [ ] **Manual sanity:** create a PO (supplier + 2 ingredient lines); receive part of one line → status Sebagian, stock up by that qty, cost updated; receive the rest of all lines → status Diterima, no further receive; cancel an open PO → Dibatalkan (stock unchanged).

---

## Self-Review
**Spec coverage:** table + create/receive(stock+cost, status derive)/cancel/list/get (T1); list+create+nav (T2); detail+receive+cancel (T3); tests create/partial/full/over-cap/cancel/scope (T1); i18n (T4); review (T5). ✓
**Placeholder scan:** test seeding "copy from purchases/ingredients tests"; UI "mirror purchases form". Else spec code.
**Type consistency:** `purchaseOrders.receive({ id, lines:[{ingredientId,qty}] })` matches the detail's submit; `create({ supplierId?, lines:[{ingredientId,orderedQty,unitCostIDR}], note? })` matches the form; `get` returns lines + remainingQty consumed by the detail; `list` summaries consumed by the table. Receive mirrors `purchases.record` (movement + cost). ✓
