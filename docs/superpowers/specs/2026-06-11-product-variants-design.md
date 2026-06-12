# Product Variants Design Spec

**Date:** 2026-06-11
**Branch:** `feat/product-variants` (off `main`)

## Context

An item has one price today. This slice adds **variants** — e.g. Size S/M/L — each with its
own **absolute** price. When an item has variants, ringing it requires picking one; the line
uses the variant's price and shows its name ("Latte (M)"). Variants are distinct from
modifiers: a modifier *adjusts* the price (+extra shot); a variant *defines* the base price.

Modifiers still stack on top of the chosen variant. **Recipe/COGS:** variants share the
item's recipe (MVP) — per-variant recipes (a Large using more milk) are out of scope, noted.

## Model — new `menuItemVariants` table

Mirror the modifier-group pattern (item children, own module). 
```ts
menuItemVariants: defineTable({
  cafeId: v.id('cafes'),
  menuItemId: v.id('menuItems'),
  name: v.string(),       // "S" / "M" / "L"
  priceIDR: v.number(),   // absolute price for this variant
  position: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
})
  .index('by_item_active', ['menuItemId', 'archived', 'position'])
  .index('by_cafe_item', ['cafeId', 'menuItemId']),
```

### Line model gains a variant (snapshot at sale time)
- `orders.lines` object (`convex/schema.ts`): add `variantId: v.optional(v.id('menuItemVariants'))`
  + `variantName: v.optional(v.string())`.
- `convex/lib/heldOrder.ts` `heldLineValidator`: add the same two optional fields.
- `src/components/sale/cart-reducer.ts` `CartLine`: add `variantId?: Id<'menuItemVariants'>`
  + `variantName?: string`.

## Backend

### CRUD — `convex/menu/variants.ts` (new)
Owner-gated (`requireOwnerCafe`/`requireOwned`); mirror `convex/menu/modifierGroups.ts`:
- `create({ menuItemId, name, priceIDR })` — `requireOwned` the item; validate name 1–24,
  `priceIDR` integer ≥ 0; `position = max+1`; `archived:false`. Returns id.
- `update({ id, name, priceIDR })` — `requireOwned`, validate, patch.
- `archive({ id })` — `requireOwned`, set `archived:true`.
- `listForItem({ menuItemId })` — active variants, by position. (For the editor; `getById`
  also returns them.)

(`convex/menu/variants.ts` is a NEW function module → register in `api.d.ts`.)

### lineInput + buildOrder — `convex/lib/sale.ts`
- `lineInput`: add `variantId: v.optional(v.id('menuItemVariants'))`.
- Per-line loop: after the item validation, resolve the variant:
  ```ts
  const variant = line.variantId ? await ctx.db.get(line.variantId) : null;
  if (line.variantId && (!variant || variant.menuItemId !== item._id || variant.cafeId !== cafeId || variant.archived)) {
    throw new Error('Varian tidak tersedia.');
  }
  ```
  Change the base price: `const basePrice = variant ? variant.priceIDR : item.priceIDR;`
  then `const unitPriceIDR = basePrice + modifierAdjustments;`. Add to the built line:
  `...(variant ? { variantId: variant._id, variantName: variant.name } : {})`. (Recipe is the
  item's recipe regardless of variant.)

> Server is authoritative on the price (it reads `variant.priceIDR`, never a client amount).
> Not requiring a variant server-side keeps existing variant-less items working; the UI
> enforces selection when variants exist.

### Read paths — `convex/menu/items.ts`
- `listForSale` `itemForSale` wrapper: add
  `variants: v.array(v.object({ _id: v.id('menuItemVariants'), name: v.string(), priceIDR: v.number() }))`;
  in the handler, fetch active variants by `by_item_active` (sorted by position) per item.
- `getById` `itemDetail`: add the same `variants` array (+ `position` for the editor); fetch
  in the handler.

## Frontend

### Item admin — variants editor
In the item edit form (`src/components/menu/item-edit-form.tsx`, alongside the modifier-group
section; only for an existing item, like recipes): a **Varian** section listing variant rows
(name `Input` + price `Input`), "+ Tambah varian", and a remove ✕ per row, calling
`api.menu.variants.{create,update,archive}`. Seed from the `getById` `variants`. (Show a hint
that a variant's price replaces the base price.)

### Sale picker — variant selection
- `ItemForSale` (`menu-pane.tsx`) type gains `variants: {_id,name,priceIDR}[]`.
- `sale-screen.tsx` `onItemTap`: open the picker when `row.variants.length > 0 ||
  row.attachedGroups.length > 0` (else add directly as today).
- `modifier-picker-dialog.tsx`: when `item.variants.length > 0`, render a **required
  single-select** "Ukuran/Varian" group at the top (a row of buttons, default the first
  variant). The selected variant's `priceIDR` becomes the **base** the live unit price builds
  on (`base + modifierAdjustments`). The confirmed `ModifierPickResult` gains
  `variantId?`/`variantName?`. Block confirm until a variant is selected (when variants exist).
- `item-card.tsx`: when the item has variants, show `dari {formatIDR(min variant price)}`
  instead of the single price.

### Cart → order → receipt threading
- The picker's `onConfirm` builds a `CartLine` carrying `variantId`/`variantName` +
  `nameSnapshot` (keep `nameSnapshot` = item name; the variant name is separate) +
  `unitPriceIDR` (variant base + modifiers).
- The 4 payment dialogs' create-call line map (`cart.lines.map(...)`): add
  `...(l.variantId ? { variantId: l.variantId } : {})` to each line (server re-prices from the
  variant). Split dialog too.
- **Receipt** (`receipt-preview.tsx`): render the line name as
  `{line.nameSnapshot}{line.variantName ? ` (${line.variantName})` : ''}` (the order line now
  carries `variantName`). The cart line display (`cart-pane.tsx`) shows the same.
- **Held orders:** the hold dialog's line map (`hold-order-dialog.tsx`) adds
  `...(l.variantId ? { variantId, variantName } : {})`; the recall builder
  (`held-orders-dialog.tsx`, and the `/sale?recall=` path) already spreads `...l` so variant
  fields flow back into the `CartLine` — verify both carry them.

## Testing
**`tests/convex/variants.test.ts` (new) + extend orders/sale tests:**
- `variants.create`/`listForItem`/`update`/`archive` round-trip + position ordering +
  owner-scope; validation (name, price).
- `listForSale`/`getById` return an item's active variants.
- **buildOrder pricing:** `createCashSale` with a line carrying `variantId` prices the line at
  the variant's `priceIDR` (+ modifiers), and the order line stores `variantId`/`variantName`;
  a line with no `variantId` uses `item.priceIDR` (back-compat — existing sale tests green).
- Rejects a `variantId` belonging to another item / another cafe / archived.

Frontend (picker variant select, editor, receipt name, held carry) by typecheck + e2e smoke.

## i18n
New BI: `Varian`, `Tambah varian`, `Nama varian`, `Ukuran`/`Pilih varian`, `dari {0}`,
`Varian tidak tersedia.` (server). Extract + fill `en` (`Variant`/`Variants`, `Add variant`,
`Variant name`, `Choose a variant`, `from {0}`, …), compile.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — schema derives; `convex/menu/variants.ts` is a NEW module (register in
  `api.d.ts`; dev watcher does it). No new route → no routeTree change.
- `buildOrder` is the price path — keep the variant logic to base-price selection; existing
  sale/void/held tests must stay green. **Money-adjacent → adversarial review of the diff.**
- Small conventional commits; PR → review → merge commit.

## Out of scope
- Per-variant recipes / COGS (variants share the item recipe); per-variant inventory or
  images; per-variant modifiers; a variant SKU/barcode; default-variant configuration;
  bulk variant templates; reordering variants by drag (position via create order only).
