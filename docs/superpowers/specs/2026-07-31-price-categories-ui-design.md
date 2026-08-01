# Price categories: UI

**Date:** 2026-07-31
**Status:** designed, not built
**Depends on:** `2026-07-31-price-categories-design.md` (the engine, built and merged as commits `7131dd1`..`83f3f78`)

## Problem

The pricing engine exists and nothing reaches it. `api.menu.priceCategories.*` and
`api.menu.priceOverrides.*` are callable, and `buildOrder` resolves prices against
a selected category, but no screen creates a category, sets an override, or lets a
cashier choose a tier. The app looks exactly as it did before the engine landed.

## Routes

Two routes, mirroring the existing modifier-group pattern
(`menu/modifiers.tsx` plus `menu/modifiers.$groupId.tsx`):

- `/menu/price-categories` — the manager. List, create, rename, archive.
- `/menu/price-categories/$categoryId` — the price grid for one category.

A fifth tab joins Items, Category, Grup Modifier and Label Barcode in
`src/routes/_pos/menu/route.tsx`.

## Category manager

A table of the cafe's categories with create, rename and archive, following
`category-table.tsx` and `category-form-dialog.tsx`.

With no categories, a shadcn `Empty` with icon, heading and description, per the
existing convention for empty data states. The description says what a price
category is for, because an owner arriving at an empty screen has no other clue.

Archiving asks for confirmation through the existing `confirm-archive.tsx`.

## The price grid

One table covering the whole menu for a single category: each item, its variants
nested beneath it, then modifier options grouped by their modifier group. One
editable price column.

**A blank cell means inherit.** The standard price shows as the input's
placeholder, so the owner can see what they are overriding without leaving the
screen. Typing a value calls `priceOverrides.set`; clearing the cell calls
`priceOverrides.clear`. This is what makes the sparse model legible: the grid
shows at a glance that most rows are untouched.

Rendered flat with a search box rather than paginated. A cafe with 100 items plus
variants and add-ons is a few hundred rows, which a flat table handles. If a cafe
ever outgrows that, pagination can be added without changing the data model.

Every row's write is independent; there is no save button and no draft state. That
matches the underlying mutations, which are per-target upserts.

**Writes fire on blur, not on keystroke.** Typing "45000" would otherwise send five
mutations, four of them for prices nobody meant (4, 45, 450, 4500), each one a real
row write that the next overwrites. Blur also gives a natural undo: a cell edited
by mistake can be corrected before it ever leaves the browser. Enter commits and
moves on, Escape reverts the cell to its stored value.

## Register

`api.menu.items.listForSale` gains an optional `priceCategoryId`. When present the
server returns prices already resolved for that category: item prices, variant
prices, and modifier adjustments. The response shape is otherwise unchanged.

This is the load-bearing decision. Resolving on the server means the cashier's
screen and the charged amount come from the same code path. If the register
resolved prices itself, the two could disagree, and the failure mode is quoting a
customer one number and charging another.

The picker sits above the cart, defaults to Standard, and labels that first option
with `cafes.standardPriceLabel` when set. Changing it re-queries `listForSale`.

### The cart caches prices, and that is the trap

`cart-reducer.ts` stores `unitPriceIDR` on every line (line 18) and computes the
displayed subtotal from it (line 129). So switching tier with items already in the
cart leaves stale prices on screen while `buildOrder` charges the new ones.

The reducer therefore gains a reprice action that recomputes every line's
`unitPriceIDR` from the freshly queried menu, dispatched when the picker changes.
Lines whose item, variant or modifiers no longer resolve are left untouched rather
than silently dropped.

The cart must never be cleared on a tier change. A cashier switching tier
mid-order has a customer standing there, and losing the order is worse than any
pricing bug this feature could have.

The selected `priceCategoryId` is passed to the sale mutation, which already
accepts it.

## Receipt

The printed receipt shows the category name when the order carries one, in
English, consistent with the rule that receipt content is always English with no
emoji and stays out of the i18n catalog. Orders with no category print exactly as
they do today.

## Customer-facing surfaces do not change

The TV menu board, the QR self-order page and the public menu keep showing
standard prices. `convex/public.ts` and `convex/menu/board.ts` are not touched by
this work. This is the decision from the engine spec, restated here because the
natural instinct while adding a `priceCategoryId` argument to one query is to add
it to the neighbouring ones too.

## Copy and i18n

All new interface strings go through lingui in both locales. Run
`pnpm lingui:extract` and fill the English translations, not only
`lingui:compile`, or new strings ship as Indonesian in the English locale.

No em-dash or double hyphen in any user-facing string.

## Testing

- `listForSale` with a `priceCategoryId` returns overridden prices, and without one
  returns exactly today's values. The second case is the regression guard.
- `listForSale` rejects a category belonging to another cafe.
- The cart reducer's reprice action updates every line's `unitPriceIDR` and leaves
  quantities, variants and modifier selections untouched.
- The reprice action leaves a line untouched when its item is missing from the new
  menu data.

The reducer is a pure function and already has tests; these extend them. The
component-level behavior is not unit tested, consistent with the existing
constraint that vitest runs in `edge-runtime` and cannot mount `.tsx`.

## Scope

Two slices, shipped as separate pull requests:

**Slice A, the admin side:** the fifth tab, the category manager, and the price
grid. Safe alone, because nothing consumes the overrides until a cashier can pick
a tier.

**Slice B, the register:** the resolved `listForSale`, the picker, the cart
reprice action, and the receipt line. This is what makes the feature live.

A before B, since the grid is useless without categories to hold prices, and the
picker is useless without prices to pick.

## Risks

- **The grid writes per cell rather than per form**, which is new for this app.
  Blur-triggered writes keep the volume sane, but it means a half-finished edit
  session leaves real rows behind rather than an abandoned draft. That is the
  correct behavior for a sparse override model, and worth knowing before someone
  reports it as a bug.
- **The picker is a judgment call made in front of a customer.** If staff simply
  always leave it on Standard, the whole feature is inert regardless of how well
  it is built. That is the thing to watch after shipping, and the argument for
  the reporting slice deferred from the engine spec.

## Related

- `docs/superpowers/specs/2026-07-31-price-categories-design.md`
- `src/routes/_pos/menu/route.tsx`, `src/components/menu/category-table.tsx`
- `src/components/sale/sale-screen.tsx`, `src/components/sale/cart-reducer.ts`
- `convex/menu/items.ts` (`listForSale`)
