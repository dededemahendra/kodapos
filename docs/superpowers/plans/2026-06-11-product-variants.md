# Product Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Money-adjacent (line pricing) — TDD + adversarial review.

**Goal:** Items can have variants (e.g. S/M/L) with absolute prices; ringing requires picking one; the line uses the variant price + name. Variants share the item recipe.

**Architecture:** New `menuItemVariants` table + `convex/menu/variants.ts` CRUD; `buildOrder` prices a line from `variant.priceIDR` (authoritative) when a `variantId` is passed; the picker gains a required variant selector; variant snapshot (`variantId`/`variantName`) threads pick → cart → order → receipt and through held orders.

---

## File Structure
- **Create:** `convex/menu/variants.ts`, `tests/convex/variants.test.ts`.
- **Modify:** `convex/schema.ts`, `convex/lib/sale.ts`, `convex/lib/heldOrder.ts`, `convex/menu/items.ts`, `convex/_generated/api.d.ts`, `src/components/sale/cart-reducer.ts`, `menu-pane.tsx`, `modifier-picker-dialog.tsx`, `sale-screen.tsx`, `item-card.tsx`, `receipt-preview.tsx`, `cart-pane.tsx`, `hold-order-dialog.tsx`, `held-orders-dialog.tsx`, the 4 payment dialogs, `src/components/menu/item-edit-form.tsx`, `tests/convex/orders.test.ts`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — variants table + CRUD + buildOrder pricing (TDD)
**Files:** create `convex/menu/variants.ts`, `tests/convex/variants.test.ts`; modify `convex/schema.ts`, `convex/lib/sale.ts`, `convex/lib/heldOrder.ts`, `convex/menu/items.ts`, `convex/_generated/api.d.ts`.

READ: `convex/menu/modifierGroups.ts` (CRUD pattern + owner-gating); `convex/lib/sale.ts` (`lineInput` ~11, the per-line loop ~88–172, `unitPriceIDR = item.priceIDR + modifierAdjustments` ~155, the `builtLines.push`); `convex/menu/items.ts` (`itemForSale` + `listForSale` handler's `resolveAttachedGroups`; `itemDetail` + `getById`); `convex/schema.ts` (`orders.lines`, the modifier tables); `convex/lib/heldOrder.ts`; the createCashSale tests in `tests/convex/orders.test.ts` + modifierGroups tests.

- [ ] **Step 1: schema** — add the `menuItemVariants` table (spec shape, `by_item_active` + `by_cafe_item` indexes). `orders.lines` object: add `variantId: v.optional(v.id('menuItemVariants'))` + `variantName: v.optional(v.string())`. `convex/lib/heldOrder.ts` `heldLineValidator`: add the same two optional fields.
- [ ] **Step 2: FAILING tests — `tests/convex/variants.test.ts`** (copy modifierGroups/orders setup): variants create/listForItem/update/archive round-trip + position order + owner-scope + validation; `listForSale`/`getById` return active variants for an item; `createCashSale` with a line `{ menuItemId, qty, modifierOptionIds:[], variantId }` prices the line at the variant's priceIDR and the stored order line has `variantId`/`variantName`; a line without `variantId` uses item.priceIDR; reject a foreign/other-item/archived variantId. Run → confirm FAIL.
- [ ] **Step 3: `convex/menu/variants.ts`** — `create`/`update`/`archive`/`listForItem` mirroring modifierGroups (owner-gated, `requireOwned` the item/variant, name 1–24, priceIDR int ≥0, position=max+1).
- [ ] **Step 4: buildOrder** — `convex/lib/sale.ts`: `lineInput` add `variantId: v.optional(v.id('menuItemVariants'))`. In the per-line loop, after item validation, resolve+validate the variant (spec code: belongs to item + cafe + not archived else `throw 'Varian tidak tersedia.'`); `const basePrice = variant ? variant.priceIDR : item.priceIDR;`; use `basePrice + modifierAdjustments`; add `...(variant ? { variantId: variant._id, variantName: variant.name } : {})` to the pushed line.
- [ ] **Step 5: read paths** — `convex/menu/items.ts`: add `variants` to `itemForSale` + `itemDetail` validators; fetch active variants (by `by_item_active`, sorted) in `listForSale` + `getById`.
- [ ] **Step 6: register + tests + commit** — check api.d.ts for `menu/variants`; `pnpm test tests/convex/variants.test.ts` + full `pnpm test` PASS (existing sale tests green — no variantId ⇒ item price); `pnpm typecheck` PASS. Commit:
  `git add convex/menu/variants.ts convex/schema.ts convex/lib/sale.ts convex/lib/heldOrder.ts convex/menu/items.ts convex/_generated/api.d.ts tests/convex/variants.test.ts && git commit -m "feat(menu): item variants table + CRUD + variant-priced sale lines"`

---

### Task 2: Item admin — variants editor
**Files:** modify `src/components/menu/item-edit-form.tsx` (+ the item detail route if it passes `variants`).

READ: `src/components/menu/item-edit-form.tsx` (the modifier-group section + how `getById` data is passed in; the recipe/modifier editors); `src/routes/_pos/menu/items.$itemId.tsx`.

- [ ] **Step 1:** Add a **Varian** section (only for an existing item) listing variant rows (name `Input` + price `Input`) from the `getById` `variants`, with "+ Tambah varian" (`api.menu.variants.create`), inline edit (`update`), remove ✕ (`archive`). Mirror the modifier-group section's conventions + toast. Pass `variants` into the form from the route's `getById` query.
- [ ] **Step 2:** `pnpm typecheck` + `pnpm test` PASS. Commit:
  `git add src/components/menu/item-edit-form.tsx src/routes/_pos/menu/items.$itemId.tsx && git commit -m "feat(menu): variants editor on the item form"`

---

### Task 3: Sale picker — variant selection
**Files:** modify `src/components/sale/cart-reducer.ts`, `menu-pane.tsx`, `modifier-picker-dialog.tsx`, `sale-screen.tsx`, `item-card.tsx`.

READ: `modifier-picker-dialog.tsx` (the `ModifierPickResult` type + the live `unitPriceIDR` calc + `submit()`), `sale-screen.tsx` `onItemTap`, `menu-pane.tsx` `ItemForSale` type, `item-card.tsx`.

- [ ] **Step 1:** `cart-reducer.ts` `CartLine`: add `variantId?: Id<'menuItemVariants'>` + `variantName?: string`. `menu-pane.tsx` `ItemForSale`: add `variants: {_id,name,priceIDR}[]`.
- [ ] **Step 2:** `sale-screen.tsx` `onItemTap`: open the picker when `row.variants.length > 0 || row.attachedGroups.length > 0`. (Direct-add path unchanged for plain items.) When building a line directly (no picker) leave variant fields absent.
- [ ] **Step 3:** `modifier-picker-dialog.tsx`: `ModifierPickResult` gains `variantId?`/`variantName?`. When `item.variants.length > 0`, render a required single-select variant group at the top (buttons; default the first variant); the selected variant's `priceIDR` is the base in the live `unitPriceIDR` (`base + modifierAdjustments`). Block confirm until a variant is selected. `submit()` includes `...(selectedVariant ? { variantId, variantName } : {})`. The dialog's `onConfirm` consumer (sale-screen) builds the CartLine with these.
- [ ] **Step 4:** `item-card.tsx`: when `item.variants.length > 0`, show `dari {formatIDR(min variant price)}` (compute min) instead of the single price.
- [ ] **Step 5:** In `sale-screen.tsx`, the `onConfirm` that builds the addLine: carry `...(pick.variantId ? { variantId: pick.variantId, variantName: pick.variantName } : {})` into the CartLine; set `unitPriceIDR = pick.unitPriceIDR`.
- [ ] **Step 6:** `pnpm typecheck` + `pnpm test` PASS. Commit:
  `git add src/components/sale/cart-reducer.ts src/components/sale/menu-pane.tsx src/components/sale/modifier-picker-dialog.tsx src/components/sale/sale-screen.tsx src/components/sale/item-card.tsx && git commit -m "feat(sale): pick a variant in the item picker"`

---

### Task 4: Thread variant → order/receipt + held orders
**Files:** modify the 4 payment dialogs (`cash`/`qris-static`/`qris-dynamic`/`split`), `receipt-preview.tsx`, `cart-pane.tsx`, `hold-order-dialog.tsx`, `held-orders-dialog.tsx`.

- [ ] **Step 1: create-call line map** — in each of the 4 dialogs, the `cart.lines.map(l => ({ menuItemId, qty, modifierOptionIds }))` gains `...(l.variantId ? { variantId: l.variantId } : {})`.
- [ ] **Step 2: receipt + cart display** — `receipt-preview.tsx`: render the line label as `{line.nameSnapshot}{line.variantName ? ` (${line.variantName})` : ''}` (the order line carries `variantName`). `cart-pane.tsx`: same for the cart line display (CartLine has `variantName`).
- [ ] **Step 3: held carry** — `hold-order-dialog.tsx`: the held-line map adds `...(l.variantId ? { variantId: l.variantId, variantName: l.variantName } : {})`. `held-orders-dialog.tsx` (+ the `/sale?recall=` builder in sale-screen): confirm the line rebuild spreads `...l` (or explicitly carries `variantId`/`variantName`) so a recalled variant line keeps its variant. Add the fields explicitly if the builder lists fields.
- [ ] **Step 4:** `pnpm typecheck` + `pnpm test` PASS. Commit:
  `git add src/components/sale/cash-payment-dialog.tsx src/components/sale/qris-static-payment-dialog.tsx src/components/sale/qris-dynamic-payment-dialog.tsx src/components/sale/split-payment-dialog.tsx src/components/sale/receipt-preview.tsx src/components/sale/cart-pane.tsx src/components/sale/hold-order-dialog.tsx src/components/sale/held-orders-dialog.tsx && git commit -m "feat(sale): carry variant through checkout, receipt, and held orders"`

---

### Task 5: i18n
New: `Varian`, `Tambah varian`, `Nama varian`, `Pilih varian`/`Ukuran`, `dari {0}` (+ reuse `Hapus`, `Simpan`).
- [ ] `pnpm lingui:extract`; fill `en` (`Variant`, `Add variant`, `Variant name`, `Choose a variant`, `from {0}`) + any other new empties; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 6: Final verification + adversarial review
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; `git status` clean.
- [ ] Dispatch a code-reviewer on `git diff main...HEAD`: variant price is server-authoritative (reads `variant.priceIDR`, never a client amount); variant must belong to the item + cafe + not archived; a missing/foreign variantId is rejected; variant-less lines unchanged (item price); recipe still the item's; variantName snapshot flows to the order line + receipt + held recall; lineTotal = qty × (variantPrice + modifiers).
- [ ] **Manual sanity:** add S/M/L variants to an item; on `/sale` it shows "dari Rp …" and tapping opens the picker with a required size; pick M → cart shows "Latte (M)" at the M price (+ any modifiers); pay → receipt shows "(M)"; hold + recall keeps the variant; a plain item still rings directly at its price.

---

## Self-Review
**Spec coverage:** table + CRUD (T1); line/held/cart variant fields (T1/T3); buildOrder variant pricing authoritative + validation (T1); listForSale/getById variants (T1); editor (T2); picker variant select + onItemTap + item-card (T3); create-call + receipt + cart + held threading (T4); tests pricing/validate/CRUD/back-compat (T1); i18n (T5); adversarial review (T6). ✓
**Placeholder scan:** test seeding "copy from modifierGroups/orders tests"; editor "mirror modifier-group section". Else concrete via spec/explore.
**Type consistency:** `menuItemVariants` shape identical in schema + variants.ts + the `variants` arrays on `itemForSale`/`itemDetail` + `ItemForSale`/`ModifierPickResult`. `lineInput.variantId` matches the dialogs' create-call line + the picker's CartLine. order/held/cart line all carry `variantId?`/`variantName?`. buildOrder prices from `variant.priceIDR`. ✓
