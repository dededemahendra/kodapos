# Price Categories (Slice B: register) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a cashier apply a price category to an order, with every price on screen and on the bill resolved by the server.

**Architecture:** `listForSale` takes an optional `priceCategoryId` and returns prices already resolved for it, so the register displays exactly what `buildOrder` will charge. The cart caches `unitPriceIDR` per line, so the reducer gains a reprice action dispatched when the tier changes. The tier resets to Standard after every completed sale.

**Tech Stack:** Convex queries, a pure reducer, React (shadcn Select), lingui, `convex-test` + vitest.

## Global Constraints

- **The client never computes prices.** It names a category; the server resolves. If the register resolved prices itself the two could disagree, which means quoting a customer one number and charging another. This is the reason the whole feature is shaped this way.
- **The tier applies to ONE order.** It resets to Standard after each completed sale. A tier that persists across orders silently overcharges the next customer, and a mode nobody can see is a mode everyone forgets.
- **Never clear the cart on a tier change.** A cashier switching tier has a customer standing in front of them. Losing the order is worse than any pricing bug this feature could cause.
- **Customer-facing surfaces do not change.** `convex/menu/board.ts` and `convex/public.ts` keep showing standard prices. Do not add a category argument to them.
- All new interface strings go through lingui in BOTH locales. Run `pnpm lingui:extract` and FILL IN the English translations, not only `lingui:compile`.
- No em-dash (—) or double hyphen in any user-facing string.
- Receipt content is always English, no emoji, and stays out of the i18n catalog.
- Verify with `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile` before pushing.

## File Structure

| File | Responsibility |
|---|---|
| `convex/menu/items.ts` (modify, `listForSale` at line 548) | Optional `priceCategoryId`, resolved prices out. |
| `tests/convex/sale-price-categories.test.ts` (modify) | Tests for the above. |
| `src/components/sale/cart-reducer.ts` (modify) | `reprice` action. |
| `tests/lib/cart-reducer.test.ts` or existing reducer test (modify/create) | Tests for `reprice`. |
| `src/components/sale/sale-screen.tsx` (modify) | Picker, indicator, reset after sale, pass the id to the mutation. |
| `src/lib/receipt-print.ts` (modify) | Print the category name when present. |

---

### Task 1: Resolve listForSale for a category

**Files:**
- Modify: `convex/menu/items.ts` (`listForSale`, line 548)
- Test: `tests/convex/sale-price-categories.test.ts`

**Interfaces:**
- Consumes: table `priceOverrides`, index `by_cafe_and_category` on `['cafeId','priceCategoryId']`; table `priceCategories`.
- Produces: `api.menu.items.listForSale({ priceCategoryId? })`. The return SHAPE is unchanged; only the numbers differ. Task 3 calls it with the selected tier.

- [ ] **Step 1: Write the failing test**

Append to `tests/convex/sale-price-categories.test.ts`, inside a new `describe`:

```ts
describe('listForSale price resolution', () => {
  it('returns standard prices when no category is given', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const rows = await s.asOwner.query(api.menu.items.listForSale, {});
    const row = rows.find((r) => r.item._id === s.itemId)!;
    expect(row.item.priceIDR).toBe(18000);
  });

  it('returns the override price for the selected category', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'item',
      targetId: s.itemId,
      priceIDR: 30000,
    });
    const rows = await s.asOwner.query(api.menu.items.listForSale, {
      priceCategoryId: s.tierId,
    });
    const row = rows.find((r) => r.item._id === s.itemId)!;
    expect(row.item.priceIDR).toBe(30000);
  });

  // The register must show exactly what buildOrder will charge. If these two
  // ever disagree the cashier quotes one number and the till takes another.
  it('agrees with what buildOrder charges for the same category', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'item',
      targetId: s.itemId,
      priceIDR: 30000,
    });
    const rows = await s.asOwner.query(api.menu.items.listForSale, {
      priceCategoryId: s.tierId,
    });
    const displayed = rows.find((r) => r.item._id === s.itemId)!.item.priceIDR;
    const res = await sell(
      s,
      'lfs-1',
      [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [] }],
      s.tierId
    );
    expect(res.totalIDR).toBe(displayed);
  });

  it('resolves variant prices too', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const variantId = await s.asOwner.mutation(api.menu.variants.create, {
      menuItemId: s.itemId,
      name: 'L',
      priceIDR: 25000,
    });
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'variant',
      targetId: variantId,
      priceIDR: 40000,
    });
    const rows = await s.asOwner.query(api.menu.items.listForSale, {
      priceCategoryId: s.tierId,
    });
    const row = rows.find((r) => r.item._id === s.itemId)!;
    expect(row.variants.find((v) => v._id === variantId)!.priceIDR).toBe(40000);
  });

  it('rejects a category from another cafe', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const otherUser = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Other', email: 'b@x.com' });
    });
    const asOther = t.withIdentity({ subject: `${otherUser}|test_session` });
    await asOther.mutation(api.cafes.createForOwner, { name: 'Warung B' });
    const foreignTier = await asOther.mutation(api.menu.priceCategories.create, {
      name: 'Turis',
    });
    await expect(
      s.asOwner.query(api.menu.items.listForSale, { priceCategoryId: foreignTier })
    ).rejects.toThrow();
  });
});
```

The existing `setup()` and `sell()` helpers in that file already provide `itemId`, `tierId` and a cash-sale helper. Reuse them; do not write new ones.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/convex/sale-price-categories.test.ts`
Expected: FAIL, `priceCategoryId` is not a valid argument for `listForSale`.

- [ ] **Step 3: Implement**

In `convex/menu/items.ts`, change `listForSale`'s args and resolve inside the loop:

```ts
export const listForSale = query({
  args: { priceCategoryId: v.optional(v.id('priceCategories')) },
  returns: v.array(itemForSale),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);

    // Same shape as buildOrder's resolution, and deliberately so: the register
    // must display exactly what the till will charge. One indexed query for the
    // whole menu, then O(1) lookups.
    const overrides = new Map<string, number>();
    if (args.priceCategoryId) {
      const category = await ctx.db.get(args.priceCategoryId);
      if (!category || category.cafeId !== cafeId || category.archived) {
        throw new Error('Kategori harga tidak ditemukan.');
      }
      const rows = await ctx.db
        .query('priceOverrides')
        .withIndex('by_cafe_and_category', (q) =>
          q.eq('cafeId', cafeId).eq('priceCategoryId', category._id)
        )
        .collect();
      for (const row of rows) overrides.set(row.targetId as string, row.priceIDR);
    }

    const items = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    const active = items.filter((i) => i.isActive).sort((a, b) => a.position - b.position);
    const result = [];
    for (const item of active) {
      const attachedGroups = await resolveAttachedGroups(ctx, item._id);
      const variants = (await resolveActiveVariants(ctx, item._id)).map((vr) => ({
        _id: vr._id,
        name: vr.name,
        priceIDR: overrides.get(vr._id) ?? vr.priceIDR,
        ...(vr.barcode ? { barcode: vr.barcode } : {}),
      }));
      const { lowStockIngredientNames } = await itemRecipeStatus(ctx, cafeId, item._id);
      result.push({
        item: { ...item, priceIDR: overrides.get(item._id) ?? item.priceIDR },
        attachedGroups: attachedGroups.map((g) => ({
          ...g,
          options: g.options.map((o) => ({
            ...o,
            priceAdjustmentIDR: overrides.get(o._id) ?? o.priceAdjustmentIDR,
          })),
        })),
        variants,
        lowStockIngredientNames,
        imageUrl: await imageUrlFor(ctx, item.imageStorageId),
      });
    }
    return result;
  },
});
```

**Read `resolveAttachedGroups` before writing the `attachedGroups` mapping.** The shape above assumes each group has an `options` array whose entries carry `_id` and `priceAdjustmentIDR`. If it differs, map the real shape rather than changing the helper.

- [ ] **Step 4: Run tests, verify, commit**

Run: `pnpm vitest run tests/convex/sale-price-categories.test.ts && pnpm typecheck && pnpm test`

```bash
git add convex/menu/items.ts tests/convex/sale-price-categories.test.ts
git commit -m "feat(sale): resolve listForSale prices for a price category

The register has to display exactly what buildOrder will charge. Resolving on
the client would let the two drift, and the failure mode is quoting a customer
one number and taking another at the till, which is worse than having no
tiered pricing at all.

Same shape as buildOrder's resolution: one indexed query for the whole menu,
then constant-time lookups per item, variant and add-on. The return shape is
unchanged, so every existing caller is unaffected.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Reprice the cart

**Files:**
- Modify: `src/components/sale/cart-reducer.ts`
- Test: `tests/lib/cart-reducer.test.ts` (create if absent; check for an existing reducer test first and extend it)

**Interfaces:**
- Consumes: `CartLine` (`lineKey`, `menuItemId`, `variantId?`, `qty`, `unitPriceIDR`, `modifierOptionIds`, `modifierLabels[].priceAdjustmentIDR`).
- Produces: a new action `{ type: 'reprice'; prices: RepriceMap }` where `RepriceMap = { items: Record<string, number>; variants: Record<string, number>; modifiers: Record<string, number> }`. Task 3 builds that map from the re-queried menu and dispatches it.

The reducer is a pure function and IS unit tested here, unlike the components. This is the one part of Slice B with real assertions, so it carries the weight.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { cartReducer, initialCart, type CartState } from '../../src/components/sale/cart-reducer';

function stateWith(lines: CartState['lines']): CartState {
  return { ...initialCart, lines };
}

const baseLine = {
  lineKey: 'k1',
  menuItemId: 'item1' as never,
  nameSnapshot: 'Espresso',
  qty: 2,
  unitPriceIDR: 18000,
  modifierOptionIds: [] as never[],
  modifierLabels: [],
};

describe('cartReducer reprice', () => {
  it('repdates an item line to the new price', () => {
    const next = cartReducer(stateWith([baseLine]), {
      type: 'reprice',
      prices: { items: { item1: 30000 }, variants: {}, modifiers: {} },
    });
    expect(next.lines[0]!.unitPriceIDR).toBe(30000);
    // Quantity and identity must survive: repricing is not re-adding.
    expect(next.lines[0]!.qty).toBe(2);
    expect(next.lines[0]!.lineKey).toBe('k1');
  });

  it('prices a variant line from the variant, never the item', () => {
    const line = { ...baseLine, variantId: 'var1' as never, unitPriceIDR: 25000 };
    const next = cartReducer(stateWith([line]), {
      type: 'reprice',
      prices: { items: { item1: 99000 }, variants: { var1: 40000 }, modifiers: {} },
    });
    expect(next.lines[0]!.unitPriceIDR).toBe(40000);
  });

  it('adds resolved modifier adjustments on top of the base', () => {
    const line = {
      ...baseLine,
      modifierOptionIds: ['opt1'] as never[],
      modifierLabels: [{ groupName: 'Susu', optionName: 'Oat', priceAdjustmentIDR: 5000 }],
      unitPriceIDR: 23000,
    };
    const next = cartReducer(stateWith([line]), {
      type: 'reprice',
      prices: { items: { item1: 30000 }, variants: {}, modifiers: { opt1: 9000 } },
    });
    expect(next.lines[0]!.unitPriceIDR).toBe(39000);
    expect(next.lines[0]!.modifierLabels[0]!.priceAdjustmentIDR).toBe(9000);
  });

  // A line whose item is missing from the new data is left ALONE rather than
  // zeroed or dropped. Dropping it loses a customer's order silently.
  it('leaves a line untouched when its item is not in the new prices', () => {
    const next = cartReducer(stateWith([baseLine]), {
      type: 'reprice',
      prices: { items: {}, variants: {}, modifiers: {} },
    });
    expect(next.lines[0]!.unitPriceIDR).toBe(18000);
    expect(next.lines).toHaveLength(1);
  });

  it('does not touch promo, discount or order type', () => {
    const state = { ...stateWith([baseLine]), manualDiscount: { type: 'fixed' as const, value: 5000 } };
    const next = cartReducer(state, {
      type: 'reprice',
      prices: { items: { item1: 30000 }, variants: {}, modifiers: {} },
    });
    expect(next.manualDiscount).toEqual({ type: 'fixed', value: 5000 });
  });
});
```

Fix the typo `repdates` to `updates` when you write it.

- [ ] **Step 2: Run to verify it fails, then implement**

Add to the action union in `cart-reducer.ts`:

```ts
export type RepriceMap = {
  items: Record<string, number>;
  variants: Record<string, number>;
  modifiers: Record<string, number>;
};
```

and `| { type: 'reprice'; prices: RepriceMap }`, then the case:

```ts
    case 'reprice': {
      // The cart caches unitPriceIDR per line, so a tier change would otherwise
      // leave stale prices on screen while the server charges the new ones.
      // A line whose target is missing from the new data keeps its current
      // price: dropping or zeroing it would lose part of a live order.
      return {
        ...state,
        lines: state.lines.map((line) => {
          const base = line.variantId
            ? action.prices.variants[line.variantId]
            : action.prices.items[line.menuItemId];
          if (base === undefined) return line;
          const modifierLabels = line.modifierLabels.map((m, i) => {
            const optionId = line.modifierOptionIds[i];
            const resolved = optionId ? action.prices.modifiers[optionId] : undefined;
            return resolved === undefined ? m : { ...m, priceAdjustmentIDR: resolved };
          });
          const adjustments = modifierLabels.reduce((s, m) => s + m.priceAdjustmentIDR, 0);
          return { ...line, unitPriceIDR: base + adjustments, modifierLabels };
        }),
      };
    }
```

**Check that `modifierOptionIds[i]` really corresponds to `modifierLabels[i]`** before relying on the index pairing. If the two arrays are not positionally aligned, match by option name or restructure, and say what you found. Getting this wrong misprices add-ons silently.

- [ ] **Step 3: Verify and commit**

Run: `pnpm vitest run tests/lib/cart-reducer.test.ts && pnpm typecheck && pnpm test`

```bash
git add src/components/sale/cart-reducer.ts tests/lib/cart-reducer.test.ts
git commit -m "feat(sale): reprice cart lines when the price category changes

The cart caches unitPriceIDR per line and computes the displayed subtotal from
it, so switching tier mid order would show the old prices while the server
charges the new ones.

A line whose item, variant or add-on is missing from the new menu data keeps
its current price rather than being zeroed or dropped. A cashier switching tier
has a customer standing there, and losing part of the order is worse than any
pricing bug this could cause.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The register picker

**Files:**
- Modify: `src/components/sale/sale-screen.tsx` (query at line 69, reducer at line 77, `clearCart` at line 109)

**Interfaces:**
- Consumes: `api.menu.priceCategories.list`, the new `listForSale` arg from Task 1, and the `reprice` action from Task 2.
- Produces: nothing downstream. Task 4 reads `priceCategoryName` off the order, which the server already writes.

- [ ] **Step 1: Add the picker and wire the query**

In `sale-screen.tsx`:

- Add `const [priceCategoryId, setPriceCategoryId] = useState<Id<'priceCategories'> | null>(null);`
- Add `const priceCategories = useQuery(api.menu.priceCategories.list, {});`
- Change line 69 to `useQuery(api.menu.items.listForSale, priceCategoryId ? { priceCategoryId } : {})`
- **Render the picker only when `priceCategories` is non-empty.** A cafe that has never created one must see no new control at all.
- The first option is Standard, labelled from `cafes.standardPriceLabel` when set, falling back to a translated "Standar". Read how the cafe profile is already queried in this file rather than adding a new query.

- [ ] **Step 2: Reprice on change**

When the picker changes, set the state. Then, in an effect keyed on the queried menu data and `priceCategoryId`, build the `RepriceMap` from the current `items` result and dispatch `{ type: 'reprice', prices }`.

Build it from the same query result the tiles render from, so screen and cart cannot disagree:

```ts
const prices: RepriceMap = { items: {}, variants: {}, modifiers: {} };
for (const row of items ?? []) {
  prices.items[row.item._id] = row.item.priceIDR;
  for (const v of row.variants) prices.variants[v._id] = v.priceIDR;
  for (const g of row.attachedGroups) {
    for (const o of g.options) prices.modifiers[o._id] = o.priceAdjustmentIDR;
  }
}
```

Do NOT clear the cart on tier change.

- [ ] **Step 3: Make the active tier impossible to miss**

When `priceCategoryId` is not null, render a persistent, visually distinct band near the cart naming the active tier. Not a subtle dropdown state: a cashier who forgets which tier is active overcharges the next customer, and that is the main operational risk in this feature.

- [ ] **Step 4: Pass the tier to the sale, and reset after**

Include `priceCategoryId` in the sale mutation arguments (`saleArgs` already accepts it).

Then reset it to `null` wherever the completed sale clears the cart (line 109 dispatches `clearCart`). **The tier applies to one order only.** Add a comment saying so, because "make it sticky, it is annoying to re-pick" is an obvious future change request and the answer is that stickiness silently overcharges regulars.

- [ ] **Step 5: Extract, verify, manual acceptance, commit**

Run `pnpm lingui:extract`, fill the English translations, `pnpm lingui:compile`, then `pnpm typecheck && pnpm test`.

Manual acceptance, and report honestly if you cannot run a browser:
- With no categories, the register looks exactly as before.
- With a category, picking it changes every tile price and every cart line at once.
- Adding items, switching tier, and completing the sale charges the tier's prices.
- After the sale, the picker is back on Standard.

```bash
git add src/components/sale/sale-screen.tsx src/locales
git commit -m "feat(sale): let the cashier apply a price category to an order

Prices come from listForSale resolved for the selected tier, so the tiles, the
cart and the till all read from one resolution. The picker is hidden entirely
when a cafe has no categories.

The tier resets to Standard after every completed sale. Making it sticky would
be less annoying and would silently charge the next customer the previous
customer's tier, which is the failure this feature is most likely to produce in
a real cafe.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Print the tier on the receipt

**Files:**
- Modify: `src/lib/receipt-print.ts`
- Test: the existing receipt test if there is one; otherwise extend `tests/lib/` coverage for this module.

**Interfaces:**
- Consumes: `priceCategoryName` on the order, already written by `buildOrder`.

- [ ] **Step 1: Write the failing test**

Assert that a receipt for an order carrying `priceCategoryName: 'Turis'` includes that name, and that an order without one produces byte-identical output to today. The second assertion is the regression guard: most receipts have no category and must not change at all.

Read the module first and match its existing test style; do not invent a new harness.

- [ ] **Step 2: Implement**

Print the category name on its own line when present. **English only, no emoji**, consistent with the existing rule that receipt content stays out of the i18n catalog. Orders with no category print exactly as before.

- [ ] **Step 3: Verify and commit**

Run: `pnpm vitest run` for the receipt test, then `pnpm typecheck && pnpm test`.

```bash
git add src/lib/receipt-print.ts tests/lib
git commit -m "feat(receipt): print the price category when an order carries one

A customer charged a non standard price can see which one on the bill, which is
the only place the tier is visible to them. Orders with no category print
exactly as before.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## After this plan

The feature is live end to end. Remaining, both deferred deliberately:

- **Revenue reporting split by category**, which is what will show whether staff actually use the tiers or leave everything on Standard. The order snapshot already makes it possible.
- **The menu board and QR page** keep showing standard prices. The empty-state copy warns owners to make Standard their highest price so a guest never reads one number and pays another.
