# Ingredient barcodes + stock-take scanning (Slice 2) — design

**Status:** approved (brainstorm), pending spec review

**Context:** kodapos already has menu-item/variant barcodes and register scanning
(Slice 1, PR #155). Slice 2 extends barcodes to the **inventory** side:
ingredients gain a barcode, and the **stock-take** flow lets staff scan an
ingredient to jump to and count its row. `ingredients` currently has no
barcode/SKU field; stock is event-sourced via `inventoryMovements` (no stored
counter); the stock-take dialog (`src/components/inventory/stock-take-dialog.tsx`)
renders every active ingredient as a row with a count input.

This is the first of several possible inventory scanning surfaces. Receiving
(PO receive / direct purchases), the shared `IngredientPicker`, and PO-line
building are explicitly **deferred** to later slices.

## Base-branch dependency

Slice 2 reuses `src/lib/scan-feedback.ts`, which currently exists only on the
unmerged Slice 1 branch (`feat/register-scan-hardening`, PR #155). Therefore:

- **Merge PR #155 to `main` first**, then branch Slice 2 (`feat/ingredient-barcodes`)
  off `main`. This keeps the two PRs independent and reviewable, and lets the
  shared `ScanBar` extraction (below) refactor the already-merged register code
  cleanly. (Requires the user's merge approval on #155.)

## Goals

1. Ingredients can carry a barcode (typically the manufacturer EAN/UPC), set by
   scanning or typing it into the ingredient form.
2. During a stock-take, scanning an ingredient focuses its count row (and tallies
   piece-unit ingredients), with clear hit/miss feedback.

## Non-goals (deferred)

- Generate + label printing for ingredient barcodes (unlike menu items — here we
  capture existing manufacturer codes, not mint new ones).
- Scanning in receiving (PO receive sheet, direct purchases), the shared
  `IngredientPicker`, and PO-line building.
- Cross-namespace uniqueness between ingredient and menu-item barcodes.

## Data model

### `ingredients` (`convex/schema.ts`)

- Add `barcode: v.optional(v.string())`.
- Add index `by_cafe_barcode` on `['cafeId','barcode']`.
- Mirrors `menuItems` (schema lines ~165/169).

### Uniqueness invariant

An ingredient barcode is unique **among ingredients within one cafe**. It is a
separate namespace from menu-item barcodes: ingredients are scanned only in the
inventory context and menu items only at the register, and a manufacturer EAN
could legitimately appear on both a retail item and a stock ingredient. So NO
cross-namespace check.

## Backend (`convex/ingredients.ts`)

- `assertIngredientBarcodeUnique(ctx, cafeId, barcode, currentId?)` — queries
  `ingredients.by_cafe_barcode`, rejects if a non-archived ingredient other than
  `currentId` owns the code. Indonesian error ("Barcode sudah dipakai bahan
  lain."). Called from the `upsert` write path when a barcode is provided.
- New query `getByBarcode({ barcode }) -> { ingredientId } | null` — active,
  non-archived, tenant-scoped via `requireActiveOutlet`; looks up within the
  cafe via `by_cafe_barcode`. Trims; empty/whitespace returns null.
- `upsert` (`convex/ingredients.ts:129`) gains an optional `barcode` arg;
  validated for uniqueness; stored via conditional spread (never explicit
  `undefined`), and cleared with `barcode: bc || undefined` on patch.

## Setting ingredient barcodes (`src/components/inventory/ingredient-form.tsx`)

- Add a `barcode` `<Input inputMode="numeric" maxLength={64}>` field. The user
  scans or types the manufacturer code. Wired through the existing `upsert`
  mutation. Copy: Indonesian source + English, no em-dash, shadcn primitives.
- No generate button, no label printing in this slice (capture-only).

## Shared `ScanBar` component

The register's scan input is currently inlined in
`src/components/sale/menu-pane.tsx` (a `<form>` + numeric `<Input>` + hit/miss
border flash). To avoid duplicating it for stock-take:

- **Extract `src/components/scan/scan-bar.tsx`** — an auto-focusing numeric scan
  input that: trims + submits a code via an `onScan(code)` prop, clears and
  refocuses after submit, and shows a green/miss border flash driven by a
  `flash: 'hit' | 'miss' | null` prop. It does NOT own beep or resolution — the
  caller wires `scan-feedback.ts` and the resolve logic (so the component stays
  presentation-only and reusable).
- **Refactor `menu-pane.tsx`** to consume `ScanBar` (behavior unchanged; this is
  a tidy-up that removes the inline duplication). Its existing `scanFlash` prop
  maps to `ScanBar`'s `flash`.

## Stock-take scan wiring (`src/components/inventory/stock-take-dialog.tsx`)

- Render `ScanBar` at the top of the dialog.
- On scan `code`:
  1. In-memory: find the loaded ingredient row whose `barcode === code`.
  2. Fallback: `await convex.query(api.ingredients.getByBarcode, { barcode: code })`,
     wrapped in try/catch → miss path on error (so a thrown query still signals).
  3. On hit: scroll that ingredient's count row into view and focus its count
     input; if `canonicalUnit === 'piece'`, increment its counted qty by 1.
     `scanBeep('hit')` + green flash.
  4. On miss (unresolved / archived / unknown): `scanBeep('miss')` + red flash +
     toast "Barcode tidak ditemukan.".
- Row focus uses a ref map keyed by `ingredientId` (the dialog already renders
  all rows, so every active ingredient is present).

## Testing

- **Backend (`tests/convex/ingredients.test.ts`):**
  - `getByBarcode` resolves an active ingredient → `{ ingredientId }`; unknown →
    null; archived ingredient → null.
  - Cross-tenant isolation: a second cafe's ingredient barcode never resolves.
  - `upsert` rejects a barcode already used by another ingredient in the cafe;
    allows re-saving the same ingredient with its own barcode.
- **Stock-take interaction** (focus row + piece-tally + feedback): manual
  acceptance (integration-level UI, like Slice 1's register).
- **`ScanBar` refactor:** the register's existing tests + typecheck must stay
  green (behavior unchanged).

## CI gates

`pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; run `pnpm lingui:extract`
and fill `en` translations for new UI strings (no em-dash). Run
`./node_modules/.bin/convex codegen` after adding Convex functions and commit the
tracked `convex/_generated` files. No route changes expected (no
`routeTree.gen.ts` edit).

## Deferred fast-follows

- Generate + label printing for ingredient barcodes.
- Scanning in receiving (PO receive, direct purchases), the shared
  `IngredientPicker`, and PO-line building — each reuses `ScanBar` +
  `getByBarcode`.
- Optional cross-namespace uniqueness if a unified scan surface ever needs it.
