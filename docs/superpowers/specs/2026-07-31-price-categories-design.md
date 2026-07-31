# Price categories

**Date:** 2026-07-31
**Status:** designed, not built
**Slice:** 1 of 2 (this spec: pricing + register. Slice 2: revenue reporting by category.)

## Problem

A cafe needs to charge different prices to different kinds of customer. In Bali
the common case is a local price and a tourist price, but the requirement is not
that pair specifically: the owner wants to name the categories themselves, and
"local" and "foreign" must not be baked into the schema.

Today every price is a single number. `menuItems.priceIDR`,
`menuItemVariants.priceIDR` (absolute, replaces the item's base price for the
line) and `modifierOptions.priceAdjustmentIDR` (stacks on top) are each one
value with no notion of who is buying.

## Decision

**Owner-defined price categories, applied per order by the cashier, implemented
as sparse overrides on top of the existing prices.**

Two new tables. Nothing existing changes shape.

```ts
priceCategories: defineTable({
  cafeId: v.id('cafes'),
  name: v.string(),          // "Lokal", "Turis", "Member", anything
  position: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
}).index('by_cafe_and_active', ['cafeId', 'archived', 'position']),

priceOverrides: defineTable({
  cafeId: v.id('cafes'),
  priceCategoryId: v.id('priceCategories'),
  targetKind: v.union(v.literal('item'), v.literal('variant'), v.literal('modifier')),
  targetId: v.union(
    v.id('menuItems'),
    v.id('menuItemVariants'),
    v.id('modifierOptions'),
  ),
  priceIDR: v.number(),      // absolute, replaces the target's normal price
  createdAt: v.number(),
})
  .index('by_cafe_and_category', ['cafeId', 'priceCategoryId'])
  .index('by_category_and_kind_and_target', ['priceCategoryId', 'targetKind', 'targetId']),
```

`menuItems.priceIDR`, `menuItemVariants.priceIDR` and
`modifierOptions.priceAdjustmentIDR` keep their current meaning and become the
**standard price**. An override row replaces that number for one category. No
row means the standard price applies.

### Why sparse overrides rather than a price per item per category

- **No migration.** Every existing cafe keeps working untouched. There is no
  backfill to run, and no window where a menu is half-priced. Compare the
  alternative, where creating a category leaves every item unpriced until
  someone fills in hundreds of fields.
- **Adding a category is safe by construction.** A new category starts as "same
  prices as standard" and diverges only where the owner says so. Most cafes
  price a handful of items differently, not the whole menu.
- **The failure direction is right.** A missing override charges the standard
  price. The alternative failure is charging zero, or blocking the sale.

### There is no default category row

"Standard" is not a row in `priceCategories`. It is the absence of a category:
the prices already on the item, variant and modifier records. The register
picker shows Standard as a built-in first option followed by the owner's
categories, and an order with no category selected is priced exactly as it is
today.

This matters because a default category stored as a row would need an invariant
nobody can enforce, that it must never own override rows, since its prices live
on the parent records instead. Making it the absence of a row removes the
invariant, removes any lazy-creation step, and means a cafe that never uses the
feature has no rows in either new table.

So that Standard is not stuck with an English label, `cafes` gains an optional
`standardPriceLabel`. An owner who thinks of their menu prices as the local
prices sets it to "Lokal"; unset, the picker reads "Standard". This is what
keeps the feature from hardcoding a local/foreign pair while still letting the
common case read naturally.

### Uniqueness and integrity

Convex has no unique constraints, so the mutations enforce:

- At most one override per `(priceCategoryId, targetKind, targetId)`. Writing an
  existing pair updates it rather than inserting a duplicate.
- The override's `cafeId` matches the target's `cafeId`, and the category's.
  Without this check an override could reach across cafes, which in a
  multi-outlet business means one outlet repricing another's menu.
- `priceIDR` passes the same integer/positive validation as existing prices
  (`assertIDR` in `convex/lib/sale.ts`).

Categories are archived, never hard deleted, because orders reference them.
Archiving a menu item, variant or modifier option leaves its override rows in
place; they are unreachable because resolution always starts from the item, so
cleanup is not required for correctness.

## Price resolution

The tier decision lands in exactly one place: `buildOrder` in
`convex/lib/sale.ts`, around the existing lines

```ts
const basePrice = variant ? variant.priceIDR : item.priceIDR;
const unitPriceIDR = basePrice + modifierAdjustments;
```

`buildOrder` gains an optional `priceCategoryId`. When present it loads **all**
overrides for that category in one indexed query (`by_cafe_and_category`) into a
`Map` keyed by `targetId`, then resolves:

```
basePrice       = override(variantId ?? itemId) ?? (variant ? variant.priceIDR : item.priceIDR)
modifier adjust = override(optionId)            ?? option.priceAdjustmentIDR
```

One query, not a lookup per line. A ten-line order with three modifiers each
would otherwise add thirty reads.

Note the override for a variant is keyed on the **variant** id, not the item id:
a variant's price already replaces the item's base price, so an item-level
override must not leak into a line that selected a variant.

**The client never sends amounts, and that does not change.** The cashier sends
a category id; the server resolves every price. A tampered client cannot buy at
a cheaper tier, only request a different category, which is itself validated to
belong to the cafe.

## Register

The cashier picks a category once per order. Every line in the order uses it.
Changing the selection recomputes all lines, since prices are only ever
server-computed.

When a cafe has no categories, the register shows no picker at all. The feature
is invisible until an owner creates one.

Managing categories and overrides sits behind the same permission that already
gates menu editing. A cashier selects a category; a cashier does not create one
or set its prices.

## Customer-facing surfaces

The TV menu board, the QR self-order page (`/order/$token`) and the public menu
all show **Standard** prices, meaning the prices already on the item records.
For every existing cafe that is exactly today's behavior, and these three
surfaces need no change at all.

Self-order carts are priced at Standard. When staff accept a
self-order into the register they may switch the tier, which recomputes the
snapshot at accept time. This is the one place where the price a customer saw
can differ from the price they pay, and it is staff-initiated and visible on the
register before the sale is settled.

## Order snapshot

Orders store `priceCategoryName` as an optional **string snapshot** next to the
existing per-line price snapshots. Absent means the standard price was used.

A snapshot rather than a reference, for the same reason lines already carry
`nameSnapshot`: renaming "Turis" to "Tourist" next month must not rewrite what
last month's receipts say. An optional `priceCategoryId` is stored alongside it
for reporting joins, but the name is what gets displayed.

The printed receipt shows the category name only when a non-default category was
used, in English, consistent with the existing rule that receipt content is
always English with no emoji and stays out of the i18n catalog.

## Testing

`tests/convex/sale-core.test.ts` already exercises `buildOrder` through
`convexTest` with a `setup()` helper; new cases extend that harness.

Required cases:

- An item with an override, ordered under that category, charges the override.
- An item **without** an override, ordered under that category, charges the
  standard price. This is the fallback that makes the sparse model safe.
- A variant override wins over an item override on the same line, and an item
  override does not leak into a line that selected a variant.
- A modifier override applies and still stacks on the resolved base price.
- Ordering with no category charges exactly what it charges today. This is the
  regression guard for all 116 existing cafes.
- An override whose `cafeId` does not match the target is rejected at write time.
- A category id from another cafe is rejected at order time.

## Out of scope

- **Revenue reporting split by category.** Slice 2, and only worth building once
  real orders carry categories. The order snapshot above is what makes it
  possible later.
- **Percentage-based categories.** Every override is an absolute price. A
  "10% off for members" category is a discount feature, not this one.
- **Scheduled categories** (happy hour by time of day). The model would support
  it, but nothing here activates a category automatically.
- **Per-surface category selection.** Customer-facing surfaces show Standard
  prices, full stop.

## To verify during implementation

`priceOverrides.targetId` is typed as a union of three id types and appears in
an index. Convex ids are strings underneath, so this should index normally, but
it is the one schema choice here that is not already proven elsewhere in this
codebase. Confirm it against the installed Convex version before building on it;
if a union id cannot be indexed, fall back to three nullable typed columns
(`menuItemId`, `variantId`, `modifierOptionId`) with `targetKind` still present
as the discriminator.

## Risk worth stating

The cashier picks the tier in front of the customer, dozens of times a day, and
the choice is a judgment about who the customer appears to be. That is a real
thing to ask of staff, and it is the most likely reason this feature ends up
unused, with everyone defaulting to standard. Slice 2's reporting is what will
show whether that happened, which is an argument for shipping slice 1 and
watching before building more on top of it.

## Related

- `convex/lib/sale.ts` (`buildOrder`, the single resolution point)
- `convex/schema.ts` (`menuItems`, `menuItemVariants`, `modifierOptions`)
- `convex/selfOrders.ts`, `convex/menu/board.ts`, `convex/public.ts` (default-category surfaces)
