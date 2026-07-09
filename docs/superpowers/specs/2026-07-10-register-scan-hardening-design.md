# Register barcode-scan hardening (Slice 1) — design

**Status:** approved (brainstorm), pending spec review

**Context:** Barcode scanning already exists in kodapos. Products (`menuItems`)
carry an optional `barcode` with a `by_cafe_barcode` index; the register has an
auto-focusing scan bar (`src/components/sale/menu-pane.tsx`) that resolves a
scanned code by a **client-side linear match** over the in-memory `listForSale`
array (`src/components/sale/sale-screen.tsx` `onScan`), then adds the product to
the cart. Product create/edit exposes a barcode field with per-cafe uniqueness
and auto-generate; there is label printing and CSV import.

This slice hardens that existing loop. A separate Slice 2 (inventory/ingredient
barcodes: scan-to-receive / stock-take / PO lines) will be brainstormed
afterward and is **out of scope here**.

## Goals

1. **Reliable resolution:** a scan for a real, sellable product that is not in
   the in-memory set still resolves, via a backend lookup fallback.
2. **Variant-level barcodes:** each `menuItemVariant` can have its own barcode
   that scans directly to that variant line.
3. **Clear feedback:** an unmistakable hit/miss signal (sound + visual) suited
   to a busy register.

## Non-goals (deferred)

- Ingredient/inventory barcodes and any purchasing/stock-take scanning (Slice 2).
- A persistent per-user "scan sound" setting (we ship an in-session mute default
  ON; persistence is a fast-follow).
- Changing label printing or CSV import (they already handle item barcodes;
  variant barcodes in labels/CSV are a possible fast-follow, not this slice).

## Architecture — resolution strategy (Approach A)

The register resolves a scanned code **in-memory first, backend fallback second**:

1. **In-memory match** against the loaded `listForSale` rows — now including each
   row's variants, not just the parent `item.barcode`. Zero latency for the
   common case; preserves the rapid-fire scanning rhythm.
2. **Backend fallback** on an in-memory miss: `await getByBarcode({ barcode })`
   (uses the `by_cafe_barcode` indexes). Resolves items/variants that were not in
   the loaded set (e.g. large catalogs).
3. **Miss** (both fail): existing "Barcode tidak ditemukan." path, now with the
   miss feedback below.

Rejected alternatives: **B** (backend query on every scan) adds a round-trip to
every scan and drags rapid scanning; **C** (preload a full barcode→id map) goes
stale mid-session and does not scale to very large catalogs.

## Data model

### `menuItemVariants` (`convex/schema.ts`)

- Add `barcode: v.optional(v.string())`.
- Add index `by_cafe_barcode` on `['cafeId','barcode']`.
- `cafeId` is **already** on the table (with a `by_cafe_item` index), so barcode
  lookup and uniqueness are single-index, per-cafe, and symmetric with
  `menuItems`. **No denormalization or backfill migration is needed** (a
  simplification vs. the original brainstorm assumption).

### Uniqueness invariant

A scanned code must resolve to **exactly one** target, so a barcode is unique
across **both** `menuItems.barcode` and `menuItemVariants.barcode` within a cafe.

## Backend (`convex/menu/items.ts`)

- **Extend `assertBarcodeUnique`** to check both `menuItems` and
  `menuItemVariants` (via their `by_cafe_barcode` indexes), excluding archived
  rows and the row being edited. Same Indonesian error style
  ("Barcode sudah dipakai ..."). Reused by both item and variant write paths.
- **New query `getByBarcode`:**
  - `args: { barcode: v.string() }`
  - Resolution order: `menuItems.by_cafe_barcode` → `menuItemVariants.by_cafe_barcode`.
  - `returns` a tagged union:
    `{ kind: 'item', itemId }` | `{ kind: 'variant', itemId, variantId }` | `null`.
  - Active / non-archived only (matches what is sellable). Tenancy via
    `requireActiveOutlet(ctx)`; the barcode is looked up within that `cafeId`.
- **Variant writes** (variant create/update mutations) accept an optional
  `barcode`, validated through `assertBarcodeUnique`, and set `cafeId` on create.
- **Auto-generate for a variant:** reuse the existing `genBarcode()`; add an
  assign action mirroring the item-level `assignBarcode` for variants.

## Register scan flow (`src/components/sale/sale-screen.tsx`, `menu-pane.tsx`)

`onScan(code)`:
1. In-memory: find a loaded row whose `item.barcode === code`, else a row with a
   variant whose `barcode === code`.
2. On miss, `await getByBarcode({ barcode: code })`; map the result to the loaded
   row (or fetch the item row as needed).
3. Dispatch by resolved kind:
   - **item** → `onItemTap(row)` (unchanged: adds directly, or opens the picker
     if the item has variants/modifiers).
   - **variant** → add *that specific variant* line directly, **unless** the
     parent item has modifier groups that require a choice — then open
     `ModifierPickerDialog` pre-selected to that variant (so required modifiers
     are never skipped).
   - **null** → miss feedback.

## Feedback

- **Hit:** short Web Audio beep (~880 Hz, ~60 ms) + brief green flash on the scan
  input; cart line adds as today.
- **Miss:** distinct lower buzz (~220 Hz) + red flash + the existing toast.
- Sound uses the Web Audio API (no audio asset). Gated behind an in-session mute
  state that defaults **ON**; persistent setting deferred.

## Variant management UI (`src/components/menu/item-edit-form.tsx`)

- In the existing Variants panel, add a per-variant barcode `Input`
  (`inputMode="numeric"`, `maxLength={64}`) with an auto-generate affordance,
  mirroring the item-level barcode field. Copy in Indonesian source + English,
  no em-dash, shadcn primitives.

## Testing

- **Backend (`tests/convex/`):**
  - `getByBarcode` resolves an item barcode → `{ kind: 'item', itemId }`.
  - `getByBarcode` resolves a variant barcode → `{ kind: 'variant', itemId, variantId }`.
  - Unknown code → `null`.
  - **Cross-tenant isolation:** a second cafe's barcode never resolves for the
    first cafe.
  - `assertBarcodeUnique` rejects a code already used by an **item** in the cafe,
    and one already used by a **variant** in the cafe (and allows re-saving the
    same row).
- **Register:** variant-with-required-modifiers opens the picker pre-selected;
  variant-without-modifiers adds directly (covered where testable). Beep/flash
  are manual acceptance.

## CI gates

`pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; run `pnpm lingui:extract`
and fill `en` translations for new UI strings. Run
`./node_modules/.bin/convex codegen` after adding Convex functions and commit the
tracked `convex/_generated` files. Commit `src/routeTree.gen.ts` only if routes
change (none expected here).

## Deferred fast-follows

- Variant barcodes in label printing and CSV import.
- Persistent per-user scan-sound setting.
- Slice 2: inventory/ingredient barcodes (scan-to-receive, stock-take, PO lines).
