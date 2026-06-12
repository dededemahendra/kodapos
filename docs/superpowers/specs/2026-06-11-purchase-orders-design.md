# Purchase Orders Design Spec

**Date:** 2026-06-11
**Branch:** `feat/purchase-orders` (off `main`)

## Context

Today stock is added via ad-hoc `purchases` (record a delivery → stock + cost update,
immediately). This slice adds **purchase orders**: create a PO to a supplier *before* goods
arrive, then **receive** it (full or partial) — each receipt does the same stock + cost update
as a direct purchase. Ad-hoc purchases stay for quick walk-in entry; POs are for planned
ordering with a receiving workflow.

Inventory-cost (money-adjacent) → built TDD-first with an adversarial review of the receive
path.

## Model — new `purchaseOrders` table
```ts
purchaseOrders: defineTable({
  cafeId: v.id('cafes'),
  supplierId: v.optional(v.id('suppliers')),
  supplierName: v.optional(v.string()),   // snapshot for display
  status: v.union(v.literal('open'), v.literal('partial'), v.literal('received'), v.literal('cancelled')),
  lines: v.array(v.object({
    ingredientId: v.id('ingredients'),
    orderedQty: v.number(),
    receivedQty: v.number(),               // accumulates on receive (starts 0)
    unitCostIDR: v.number(),
  })),
  note: v.optional(v.string()),
  createdAt: v.number(),
})
  .index('by_cafe_status', ['cafeId', 'status'])
  .index('by_cafe_created', ['cafeId', 'createdAt']),
```
A PO references a supplier (optional) and snapshots its name. Receipt progress lives in each
line's `receivedQty`; the header `status` is derived on every receive.

## Backend — `convex/purchaseOrders.ts` (new, owner-gated)
- **`create({ supplierId?, lines: [{ ingredientId, orderedQty, unitCostIDR }], note? })`**:
  reject empty lines; per line validate `orderedQty` integer > 0, `unitCostIDR` integer ≥ 0,
  ingredient belongs to the cafe + not archived; resolve `supplierName` from `supplierId`
  (`requireOwned` the supplier if given); insert with `status:'open'`, each line `receivedQty:0`.
  Returns id.
- **`receive({ id, lines: [{ ingredientId, qty }] })`** (the money path): `requireOwned` the PO;
  reject if `status` is `'received'` or `'cancelled'` (`'PO sudah selesai/dibatalkan.'`). For
  each receipt: find the PO line by `ingredientId` (reject unknown); `qty` integer > 0; reject
  if `receivedQty + qty > orderedQty` (`'Melebihi jumlah dipesan.'`). Apply: bump the line's
  `receivedQty`; insert an `inventoryMovements` row (`reason:'purchase'`, `delta: qty`,
  `refType:'purchaseOrder'`, `refId: poId`); patch the ingredient's `lastCostPerUnitIDR` to that
  line's `unitCostIDR` (mirrors `purchases.record`). After applying all: recompute `status` —
  **all** lines `receivedQty === orderedQty` → `'received'`; **any** `receivedQty > 0` →
  `'partial'`; else `'open'` — and patch `{ lines, status }`. Returns null.
- **`cancel({ id })`**: `requireOwned`; reject if `status === 'received'` (already fulfilled) or
  already `'cancelled'`; set `'cancelled'`. **Does NOT reverse already-received stock** —
  received goods are real movements; cancel only stops future receipt. (Documented.)
- **`list({ status? })`**: POs newest-first (`by_cafe_created` desc), each →
  `{ _id, supplierName?, status, lineCount, orderedTotalIDR, receivedTotalIDR, createdAt }`
  (`orderedTotalIDR = Σ orderedQty×unitCostIDR`, `receivedTotalIDR = Σ receivedQty×unitCostIDR`).
- **`get({ id })`**: the PO with each line enriched with the ingredient name + unit + a
  `remainingQty = orderedQty − receivedQty`.

> **Idempotency:** each `receive` call is a discrete physical receipt — it always applies (no
> client clientId). The `receivedQty ≤ orderedQty` cap prevents over-receipt; the UI disables
> the submit while in-flight to avoid accidental double-submit. (Noted for the review.)

(`convex/purchaseOrders.ts` is a NEW module → register in `api.d.ts`.)

## Frontend

### Route — `src/routes/_pos/inventory/purchase-orders.tsx` (new, `canEditMenu`)
Mirror the inventory pages (`/inventory/purchases`). A `PageHeader` ("Pesanan Beli") + a "Buat
PO" button. A list/`DataTable` of POs (`api.purchaseOrders.list`): supplier, status `StatusBadge`
(open/partial/received/cancelled), ordered total, received total, date; row → open the detail.
Empty → shadcn `Empty` (icon + title + desc).

### Create PO — `src/components/inventory/purchase-order-form-dialog.tsx` (new)
Mirror the purchases record form: a supplier `Select` (from `api.suppliers.list`, optional) +
a **line editor** — rows of (ingredient `Select` from `api.ingredients.list`, ordered-qty
`Input`, unit-cost `Input`), "+ Tambah baris", remove ✕; a live ordered total. Submit →
`api.purchaseOrders.create`. (Reuse the ingredient/supplier picker patterns from the existing
purchases form.)

### PO detail + receive — `src/components/inventory/purchase-order-detail.tsx` (new)
A sheet/dialog from a row: header (supplier, status, totals) + the lines (ingredient,
ordered / received / remaining, unit cost). Actions:
- **Terima (receive):** a form pre-filled with each line's `remainingQty` (editable, ≤ remaining,
  ≥ 0); submit → `api.purchaseOrders.receive({ id, lines: [{ ingredientId, qty }] })` (only the
  lines with qty > 0). Disable submit while in-flight. On success the stock/cost update is live
  and the status badge advances.
- **Batalkan (cancel):** a `ConfirmDialog` → `api.purchaseOrders.cancel` (shown only when not
  received/cancelled).

### Nav — `src/components/app-shared.tsx`
Add a **"Pesanan Beli"** entry (a `ClipboardList`/`PackageCheck` icon, `requires:'canEditMenu'`)
near the inventory/suppliers items.

> **New route** → commit the regenerated `src/routeTree.gen.ts`.

## Testing
**`tests/convex/purchase-orders.test.ts`** (new; mirror the purchases + ingredients test setup):
- `create` inserts an `open` PO (lines `receivedQty 0`); `list`/`get` return it; rejects empty
  lines / non-positive qty / archived ingredient / foreign supplier.
- **Receive (partial):** receive part of a line → line `receivedQty` bumped, status `'partial'`,
  an `inventoryMovements` `purchase` row added (`currentStockQty` up by the received qty), the
  ingredient's `lastCostPerUnitIDR` updated to the PO line cost.
- **Receive (full):** receive all lines fully → status `'received'`; a further `receive` is
  rejected.
- **Over-receipt rejected:** `receivedQty + qty > orderedQty` throws; nothing applied.
- **Cancel:** an `open`/`partial` PO → `'cancelled'`; a `'received'` PO cannot be cancelled;
  cancel does NOT change stock.
- Owner-scope: a foreign PO/supplier/ingredient id throws.

Frontend (list, create form, receive flow) by typecheck + smoke.

## i18n
New BI: `Pesanan Beli`, `Buat PO`, `Terima`, `Dipesan`, `Diterima`, `Sisa`, `Batalkan PO?`,
`Melebihi jumlah dipesan.` (server), status labels `Terbuka`/`Sebagian`/`Diterima`/`Dibatalkan`,
`Belum ada pesanan beli.`, etc. Extract + fill `en` (`Purchase orders`, `New PO`, `Receive`,
`Ordered`, `Received`, `Remaining`, `Cancel PO?`, `Open`/`Partial`/`Received`/`Cancelled`, …),
compile.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — `purchaseOrders` is a NEW module (register in `api.d.ts`; dev watcher
  does it — commit). **New route** → commit `routeTree.gen.ts`.
- Inventory-cost path → adversarial review (receive over-cap, double-receive, status
  derivation, cost update, cancel-doesn't-reverse).
- Small conventional commits; PR → review → merge commit.

## Out of scope
- Editing a PO after creation (cancel + recreate); reversing/returning received goods;
  invoice/payment matching; auto-generating a PO from restock suggestions (the restock feature
  stays separate); landed cost / freight allocation; per-line received-cost override at receipt
  (uses the PO line's agreed cost); multi-warehouse receiving.
