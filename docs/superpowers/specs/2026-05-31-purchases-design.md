# Catalog UI Kit — Purchases (Sub-project 4)

**Date:** 2026-05-31
**Status:** Approved design, ready for implementation plan
**Branch (suggested):** `feat/purchases` (off `main`)
**Depends on:** Catalog UI kit (PageHeader, Toolbar, DataTable, StatusBadge, Sheet, Empty, toast — merged), the existing `IngredientPicker`, and the inventory movement model.

## Context

The Inventaris section has Stok / Penyesuaian / Limbah (all built) and **Pembelian** (`/inventory/purchases`), still a `ComingSoon` stub. There is no purchase/supplier concept yet. Stock changes are recorded in `inventoryMovements` (`reason` ∈ `sale | adjustment | waste`, signed `delta`, optional `refType`/`refId` — orders use `refType: 'order'`). Ingredient cost is `ingredients.lastCostPerUnitIDR` (per canonical unit g/ml/piece), used for recipe HPP.

This slice lets an owner record incoming deliveries: a purchase with a supplier and multiple ingredient lines, which **adds stock** and **updates each ingredient's last cost**.

## Goal

Record a multi-line delivery in one entry; recording it bumps each ingredient's stock (a `purchase` stock-in movement) and overwrites its `lastCostPerUnitIDR` so recipe costing tracks the latest purchase price. Show a purchases log with a per-purchase detail view.

## Decisions (from brainstorming)

- **Purchase shape:** multi-line — one purchase = supplier + multiple `{ ingredient, qty, unitCostIDR }` lines.
- **Supplier:** free-text optional name (no suppliers entity).
- **Date:** `at = now` at record time (no separate date field).
- **Units:** the ingredient's **canonical unit** throughout (qty in canonical units, `unitCostIDR` per canonical unit) — consistent with `adjustStock`, stock, and `lastCostPerUnitIDR`.
- **Cost update:** recording a purchase **overwrites each line ingredient's `lastCostPerUnitIDR`** with that line's `unitCostIDR`.
- **Movement reason:** add a new `'purchase'` literal to `inventoryMovements.reason` (distinct from `adjustment`).
- **Log is append-only:** no edit/void/delete.

## Schema

1. **New `purchases` table** in `convex/schema.ts`:
```
purchases: defineTable({
  cafeId: v.id('cafes'),
  supplierName: v.optional(v.string()),
  at: v.number(),
  lines: v.array(
    v.object({
      ingredientId: v.id('ingredients'),
      qty: v.number(),
      unitCostIDR: v.number(),
    })
  ),
  totalIDR: v.number(),
  createdAt: v.number(),
}).index('by_cafe_at', ['cafeId', 'at']),
```
2. **Add `'purchase'` to `inventoryMovements.reason`** union. This ripples to:
   - `ingredients.listMovements`' `movementRow` validator → add `v.literal('purchase')` to its `reason` union.
   - The movement-history sheet → `movementTypeVariant('purchase')` returns `'success'`; sheet renders label "Pembelian".
   - `recentAdjustments` (filters `'adjustment'`) and `waste.recent` (filters `'waste'`) are unaffected — purchases never appear there.
   - `convex/lib/inventory.ts` `MovementReason` / any reason typing (if present) updated.

Run `./node_modules/.bin/convex codegen` and commit the `_generated` drift.

## Pure helper — `purchaseTotalIDR`

`src/lib/purchase.ts`: `purchaseTotalIDR(lines: { qty: number; unitCostIDR: number }[]): number` = `lines.reduce((s, l) => s + l.qty * l.unitCostIDR, 0)`. `qty` and `unitCostIDR` are integers (see validation), so the product and sum are integer rupiah — no rounding. Unit-tested. Reused for both the form's live total and the backend `totalIDR`.

## Backend (`convex/purchases.ts`)

- **`record({ supplierName?, lines })`** mutation:
  - `requireOwnerCafe`. Validate: `lines.length >= 1`; each `qty` a **positive integer** (`Number.isInteger(qty) && qty > 0`, matching `adjustStock`'s integer-stock convention); each `unitCostIDR` a **non-negative integer** (`Number.isInteger(unitCostIDR) && unitCostIDR >= 0`); each `ingredientId` owned (cafe-scoped) and non-archived (else throw "Bahan tidak ditemukan."). Throw clear Indonesian messages on invalid qty/cost.
  - Insert the purchase doc: `totalIDR` via the same sum as `purchaseTotalIDR`, `at = Date.now()`, `createdAt = Date.now()`.
  - Per line: insert `inventoryMovements` `{ cafeId, ingredientId, delta: +qty, reason: 'purchase', refType: 'purchase', refId: purchaseId, at: Date.now() }`, and `ctx.db.patch(ingredientId, { lastCostPerUnitIDR: unitCostIDR })`.
  - Returns `purchaseId`.
- **`recent({ days? })`** query (default 30): purchases via `by_cafe_at`, newest-first; each `{ id, at, supplierName?, lineCount, totalIDR }`. Cafe-scoped.
- **`get({ id })`** query: one purchase, cafe-scoped (return `null` if not owned); resolves lines to `{ ingredientName, unit, qty, unitCostIDR, subtotalIDR }` + `supplierName?`, `at`, `totalIDR`. For the detail sheet.

## Components

| Unit | File | Responsibility |
|---|---|---|
| `purchases` table + `'purchase'` reason | `convex/schema.ts` | Persist purchases; distinguish purchase movements. |
| `record` / `recent` / `get` | `convex/purchases.ts` | Record a delivery; list; detail. |
| `purchaseTotalIDR` | `src/lib/purchase.ts` + `.test.ts` | Pure total. |
| movement reason update | `convex/ingredients.ts` (listMovements validator), `src/lib/inventory-movement.ts`, `src/components/inventory/movement-history-sheet.tsx` | Surface `purchase` movements as "Pembelian". |
| Purchases page | `src/routes/_pos/inventory/purchases.tsx` (replace stub) | PageHeader + DataTable + record + detail sheets. |
| `PurchaseForm` | `src/components/inventory/purchase-form.tsx` | Multi-line record form (supplier + line editor + total). |
| `PurchaseDetailSheet` | inline in the page or a small component | Read-only line breakdown via `get`. |

### Purchases page details

- **PageHeader:** title "Pembelian"; meta "{n} pembelian · 30 hari"; action "+ Catat Pembelian" (opens `PurchaseForm`).
- **DataTable** (`PurchaseRow = { id, at, supplierName?, lineCount, totalIDR }`):
  - **Tanggal** — `formatDate(..., 'day-month')`; a button that opens the detail Sheet for this purchase. Sortable by `at`, `initialSort` desc.
  - **Pemasok** — `supplierName ?? '—'`.
  - **Item** — `lineCount`, tabular-nums.
  - **Total** — `formatIDR(totalIDR)`, tabular-nums. Sortable.
  - No actions column (append-only).
- **Empty state** via shadcn `Empty` (icon e.g. `Truck`/`PackagePlus`; "Belum ada pembelian." + hint).
- **Detail Sheet:** opened by `viewId` state → `get(viewId)`; title "Pembelian — {supplier or date}"; a small table of lines (Bahan · Qty {unit} · Biaya/satuan · Subtotal) + grand total; sr-only description.

### PurchaseForm details (`src/components/inventory/purchase-form.tsx`)

- Controlled `{ open, onOpenChange }`; rendered in a `Sheet` (wide) or `Dialog`.
- Fields: supplier name (`Input`, optional); a dynamic list of **draft lines**, each `{ key, ingredientId|null, qty, unitCostIDR }` rendered with `IngredientPicker` + a qty `Input` (labeled with the picked ingredient's canonical unit) + a unit-cost `Input`; a remove-line button; "+ Tambah bahan" to add a line; a live grand total via `purchaseTotalIDR`.
- Submit: filter to complete lines (ingredient + qty>0), call `purchases.record({ supplierName?, lines })`, `toast.success('Pembelian dicatat.')`, close; `try/catch` → `toast.error` + inline `FieldError`. Disable submit while pending or when no valid line.
- Mirrors the `RecipeEditor`/`StockAdjustDialog` patterns (draft-line state with stable keys; canonical-unit display).

## i18n

New strings via Lingui. After implementation: `pnpm lingui:extract`, fill `en`, `pnpm lingui:compile`. New strings include: "Pembelian", "Catat Pembelian", "{n} pembelian · 30 hari", "Pemasok", "Item", "Total", "Subtotal", "Biaya/satuan", "Tambah bahan", "Pembelian dicatat.", "Gagal mencatat pembelian.", "Belum ada pembelian.", "Pembelian — ", and the movement label "Pembelian" (history sheet). Receipt content unaffected.

## Testing

- **Convex tests** (`tests/convex/purchases.test.ts`):
  - `record` inserts the purchase with correct `totalIDR`; writes one `reason:'purchase'` movement per line so `currentStockQty` rises by each `qty`; updates each ingredient's `lastCostPerUnitIDR` to the line `unitCostIDR`.
  - Validation: empty lines / `qty <= 0` / negative `unitCostIDR` / foreign or archived ingredient → throws.
  - `recent` newest-first with `lineCount`/`totalIDR`; `get` resolves line ingredient names + subtotals; both cafe-scoped (tenant isolation).
  - A movement written by `record` appears in `ingredients.listMovements` as a `purchase` row (and NOT in `recentAdjustments`).
- **Pure test** (`src/lib/purchase.test.ts`): `purchaseTotalIDR` (multi-line sum; empty → 0; rounding).
- **Playwright** (extend an inventory spec, auth-gated): record a 2-line purchase (supplier + two ingredients) → it appears in the log with the correct total → open the detail sheet showing both lines → the ingredient's stock on the Stock page reflects the added qty.
- Gate: `pnpm typecheck && pnpm test && pnpm lingui:compile`. `convex codegen` → commit `_generated` drift (schema change).

## Affected / new files (anticipated)

**Modified**
- `convex/schema.ts` (purchases table + `'purchase'` reason), `convex/_generated/*`.
- `convex/ingredients.ts` (`listMovements` `movementRow` reason union).
- `src/lib/inventory-movement.ts` (`MovementReason` + `movementTypeVariant('purchase')`).
- `src/components/inventory/movement-history-sheet.tsx` (render "Pembelian" type).
- `src/routes/_pos/inventory/purchases.tsx` (replace stub).
- `tests/convex/*`, an e2e spec, Lingui catalogs.

**New**
- `convex/purchases.ts`; `src/lib/purchase.ts` + `.test.ts`; `src/components/inventory/purchase-form.tsx`.

## Out of scope

- Editing / voiding / deleting purchases (append-only log).
- A suppliers entity / supplier management.
- Purchase-unit → canonical-unit conversion (canonical units only; the owner enters in the ingredient's tracked unit).
- Payment / accounts-payable tracking.
- Promotions (sub-project 5); the "archived views read-only" follow-up.
