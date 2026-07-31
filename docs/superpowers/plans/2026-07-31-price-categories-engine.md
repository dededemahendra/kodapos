# Price Categories (pricing engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner-named price categories that repriced orders resolve against, applied per order by the cashier.

**Architecture:** Two new tables. `priceCategories` holds owner-named tiers; `priceOverrides` holds one row per thing actually repriced. Existing `priceIDR` / `priceAdjustmentIDR` fields keep their meaning and become the standard price, so there is no migration. All resolution happens in `buildOrder`, which loads a category's overrides in a single indexed query.

**Tech Stack:** Convex (schema, mutations, queries), `convex-test` + vitest.

## Scope of THIS plan

This plan builds the **engine only**: schema, category CRUD, override CRUD, and price resolution in `buildOrder`, all fully tested. It deliberately does **not** build UI. No screen in the app reaches this yet.

That is a real narrowing and it is intentional: the UI spans three surfaces (a category manager, per-item override editing across items/variants/modifiers, and the register picker), and a no-placeholder plan for those is better written against a data layer that already exists and is proven. The UI gets its own plan immediately after this one.

## Global Constraints

- **The client never sends amounts.** The cashier sends a category id; the server resolves every price. This is an existing invariant of `convex/lib/sale.ts` and must not be weakened.
- **No migration.** Existing `menuItems.priceIDR`, `menuItemVariants.priceIDR` and `modifierOptions.priceAdjustmentIDR` keep their current meaning. Nothing is backfilled.
- **"Standard" is not a row** in `priceCategories`. It is the absence of a category.
- **Mutation pattern:** every mutation starts `const { cafeId } = await requireActiveOutlet(ctx);` then `await requireOwned(ctx, cafeId, args.id, '<Label>');` for anything it mutates by id. Declare `args`, `returns`, and `handler`.
- **User-facing error strings are Indonesian**, matching the existing ones in `convex/lib/sale.ts` and `convex/menu/*.ts` (e.g. `Modifier wajib pada grup ${group.name} belum dipilih.`).
- **No em-dash (—) or `--` in user-facing copy.** Code comments may use normal punctuation.
- Verify with `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile` locally before pushing.
- Regenerate Convex types with `./node_modules/.bin/convex codegen` (NOT `npx`, which a shell hook breaks) and commit the tracked `convex/_generated` files.

## File Structure

| File | Responsibility |
|---|---|
| `convex/schema.ts` (modify) | Two new tables plus `standardPriceLabel` on `cafes`. |
| `convex/menu/priceCategories.ts` (create) | Category CRUD: create, update, archive, list. |
| `convex/menu/priceOverrides.ts` (create) | Override upsert, clear, list for a category. |
| `convex/lib/sale.ts` (modify) | `priceCategoryId` arg, override map, resolution, order snapshot. |
| `tests/convex/price-categories.test.ts` (create) | Category CRUD tests. |
| `tests/convex/price-overrides.test.ts` (create) | Override CRUD and integrity tests. |
| `tests/convex/sale-price-categories.test.ts` (create) | Resolution tests, including the no-category regression guard. |

---

### Task 1: Schema and category CRUD

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/menu/priceCategories.ts`
- Test: `tests/convex/price-categories.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `priceCategories` and `priceOverrides`; `api.menu.priceCategories.create({ name }) -> Id<'priceCategories'>`, `.update({ id, name })`, `.archive({ id })`, `.list({}) -> array of category docs`. Tasks 2 and 3 use `priceCategories` ids and the `priceOverrides` table.

- [ ] **Step 1: Add both tables to the schema**

Add to `convex/schema.ts`, near the other menu tables (after `menuItemVariants`):

```ts
  // Owner-named price tiers, e.g. "Turis" or "Member". Deliberately NOT seeded
  // with a default row: "Standard" is the ABSENCE of a category, meaning the
  // prices already on menuItems / menuItemVariants / modifierOptions. A default
  // row would carry an invariant nothing can enforce, that it must never own
  // override rows, because its prices live on the parent records instead.
  priceCategories: defineTable({
    cafeId: v.id('cafes'),
    name: v.string(),
    position: v.number(),
    archived: v.boolean(),
    createdAt: v.number(),
  }).index('by_cafe_and_active', ['cafeId', 'archived', 'position']),

  // Sparse: one row per thing a category actually reprices. No row means the
  // target's own price applies, so adding a category never leaves a menu
  // half-priced and a missing override charges the standard price rather than
  // zero. priceIDR is ABSOLUTE and replaces the target's price, including for
  // modifiers, where it replaces priceAdjustmentIDR.
  priceOverrides: defineTable({
    cafeId: v.id('cafes'),
    priceCategoryId: v.id('priceCategories'),
    targetKind: v.union(v.literal('item'), v.literal('variant'), v.literal('modifier')),
    targetId: v.union(
      v.id('menuItems'),
      v.id('menuItemVariants'),
      v.id('modifierOptions')
    ),
    priceIDR: v.number(),
    createdAt: v.number(),
  })
    .index('by_cafe_and_category', ['cafeId', 'priceCategoryId'])
    .index('by_category_and_kind_and_target', ['priceCategoryId', 'targetKind', 'targetId']),
```

Also add to the existing `cafes` table definition:

```ts
    // Renames the built-in "Standard" tier in the register picker. An owner who
    // thinks of their menu prices as the local prices sets this to "Lokal".
    standardPriceLabel: v.optional(v.string()),
```

**If `targetId` as a union of id types cannot be indexed** by the installed Convex version, stop and report it. The fallback is three optional typed columns (`menuItemId`, `variantId`, `modifierOptionId`) with `targetKind` retained, but do not switch without saying so, because it changes Task 2 and Task 3.

- [ ] **Step 2: Regenerate Convex types**

Run: `./node_modules/.bin/convex codegen`
Expected: succeeds; `convex/_generated/dataModel.d.ts` now knows both tables.

- [ ] **Step 3: Write the failing test**

Create `tests/convex/price-categories.test.ts`:

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

describe('price categories', () => {
  it('starts empty, because Standard is not a row', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    expect(await asOwner.query(api.menu.priceCategories.list, {})).toEqual([]);
  });

  it('creates categories in insertion order', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    await asOwner.mutation(api.menu.priceCategories.create, { name: 'Turis' });
    await asOwner.mutation(api.menu.priceCategories.create, { name: 'Member' });
    const list = await asOwner.query(api.menu.priceCategories.list, {});
    expect(list.map((c) => c.name)).toEqual(['Turis', 'Member']);
    expect(list.map((c) => c.position)).toEqual([0, 1]);
  });

  it('rejects a blank name', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    await expect(
      asOwner.mutation(api.menu.priceCategories.create, { name: '   ' })
    ).rejects.toThrow();
  });

  it('renames a category', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const id = await asOwner.mutation(api.menu.priceCategories.create, { name: 'Turis' });
    await asOwner.mutation(api.menu.priceCategories.update, { id, name: 'Tourist' });
    const list = await asOwner.query(api.menu.priceCategories.list, {});
    expect(list[0]!.name).toBe('Tourist');
  });

  // Archived, never hard deleted, because settled orders reference the name.
  it('archives a category out of the list', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const id = await asOwner.mutation(api.menu.priceCategories.create, { name: 'Turis' });
    await asOwner.mutation(api.menu.priceCategories.archive, { id });
    expect(await asOwner.query(api.menu.priceCategories.list, {})).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm vitest run tests/convex/price-categories.test.ts`
Expected: FAIL, `api.menu.priceCategories` is undefined.

- [ ] **Step 5: Write the implementation**

Create `convex/menu/priceCategories.ts`:

```ts
import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireActiveOutlet, requireOwned } from '../lib/auth';

const categoryDoc = v.object({
  _id: v.id('priceCategories'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  position: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

function assertName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Nama kategori harga wajib diisi.');
  return trimmed;
}

export const create = mutation({
  args: { name: v.string() },
  returns: v.id('priceCategories'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const cleanName = assertName(args.name);
    const existing = await ctx.db
      .query('priceCategories')
      .withIndex('by_cafe_and_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    const position =
      existing.length === 0 ? 0 : Math.max(...existing.map((x) => x.position)) + 1;
    return await ctx.db.insert('priceCategories', {
      cafeId,
      name: cleanName,
      position,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { id: v.id('priceCategories'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, args.id, 'Kategori harga');
    await ctx.db.patch(args.id, { name: assertName(args.name) });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('priceCategories') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, id, 'Kategori harga');
    // Archived rather than deleted: settled orders snapshot the name, and the
    // override rows stay addressable if the owner un-archives later.
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

export const list = query({
  args: {},
  returns: v.array(categoryDoc),
  handler: async (ctx) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    return await ctx.db
      .query('priceCategories')
      .withIndex('by_cafe_and_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
  },
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run tests/convex/price-categories.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Verify nothing else broke**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean, full suite passes.

- [ ] **Step 8: Commit**

```bash
git add convex/schema.ts convex/menu/priceCategories.ts convex/_generated tests/convex/price-categories.test.ts
git commit -m "feat(menu): add owner-named price categories

Standard is deliberately not a row here. It is the absence of a category,
meaning the prices already on menuItems, menuItemVariants and modifierOptions.
A default row would need an invariant nothing can enforce, that it must never
own override rows, since its prices live on the parent records instead.

Categories archive rather than delete, because settled orders snapshot the
name and un-archiving must not orphan the override rows that point at it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Override CRUD and integrity

**Files:**
- Create: `convex/menu/priceOverrides.ts`
- Test: `tests/convex/price-overrides.test.ts`

**Interfaces:**
- Consumes: the `priceCategories` and `priceOverrides` tables from Task 1, and `api.menu.priceCategories.create`.
- Produces: `api.menu.priceOverrides.set({ priceCategoryId, targetKind, targetId, priceIDR }) -> null` (upsert), `.clear({ priceCategoryId, targetKind, targetId }) -> null`, `.listForCategory({ priceCategoryId }) -> array of override docs`. Task 3 reads the `priceOverrides` table directly rather than through these.

- [ ] **Step 1: Write the failing test**

Create `tests/convex/price-overrides.test.ts`:

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
  const tierId = await asOwner.mutation(api.menu.priceCategories.create, { name: 'Turis' });
  return { asOwner, itemId, tierId };
}

describe('price overrides', () => {
  it('sets and lists an override', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, tierId } = await setup(t);
    await asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: tierId,
      targetKind: 'item',
      targetId: itemId,
      priceIDR: 30000,
    });
    const rows = await asOwner.query(api.menu.priceOverrides.listForCategory, {
      priceCategoryId: tierId,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.priceIDR).toBe(30000);
  });

  // Convex has no unique constraint, so the mutation has to enforce this or a
  // second edit silently creates a duplicate and resolution picks one at random.
  it('upserts rather than duplicating on a repeat set', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, tierId } = await setup(t);
    for (const price of [30000, 32000]) {
      await asOwner.mutation(api.menu.priceOverrides.set, {
        priceCategoryId: tierId,
        targetKind: 'item',
        targetId: itemId,
        priceIDR: price,
      });
    }
    const rows = await asOwner.query(api.menu.priceOverrides.listForCategory, {
      priceCategoryId: tierId,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.priceIDR).toBe(32000);
  });

  it('clears an override back to the standard price', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, tierId } = await setup(t);
    await asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: tierId,
      targetKind: 'item',
      targetId: itemId,
      priceIDR: 30000,
    });
    await asOwner.mutation(api.menu.priceOverrides.clear, {
      priceCategoryId: tierId,
      targetKind: 'item',
      targetId: itemId,
    });
    expect(
      await asOwner.query(api.menu.priceOverrides.listForCategory, { priceCategoryId: tierId })
    ).toEqual([]);
  });

  it('rejects a negative or non-integer price', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, tierId } = await setup(t);
    for (const bad of [-1, 1500.5]) {
      await expect(
        asOwner.mutation(api.menu.priceOverrides.set, {
          priceCategoryId: tierId,
          targetKind: 'item',
          targetId: itemId,
          priceIDR: bad,
        })
      ).rejects.toThrow();
    }
  });

  // In a multi-outlet business this is what stops one outlet repricing another
  // outlet's menu.
  it('rejects a target belonging to another cafe', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'a@x.com');
    const b = await setup(t, 'b@x.com');
    await expect(
      a.asOwner.mutation(api.menu.priceOverrides.set, {
        priceCategoryId: a.tierId,
        targetKind: 'item',
        targetId: b.itemId,
        priceIDR: 30000,
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/convex/price-overrides.test.ts`
Expected: FAIL, `api.menu.priceOverrides` is undefined.

- [ ] **Step 3: Write the implementation**

Create `convex/menu/priceOverrides.ts`:

```ts
import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireActiveOutlet, requireOwned } from '../lib/auth';

const targetKindValidator = v.union(
  v.literal('item'),
  v.literal('variant'),
  v.literal('modifier')
);

const targetIdValidator = v.union(
  v.id('menuItems'),
  v.id('menuItemVariants'),
  v.id('modifierOptions')
);

const overrideDoc = v.object({
  _id: v.id('priceOverrides'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  priceCategoryId: v.id('priceCategories'),
  targetKind: targetKindValidator,
  targetId: targetIdValidator,
  priceIDR: v.number(),
  createdAt: v.number(),
});

/** Same shape of check the rest of the money path uses: whole rupiah, not negative. */
function assertPrice(n: number): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('Harga harus bilangan bulat dan tidak boleh negatif.');
  }
  return n;
}

/**
 * The override, its category and its target must all belong to the caller's
 * cafe. Without the target check a crafted id could reprice another outlet's
 * menu inside the same business.
 */
async function assertTargetOwned(
  ctx: Parameters<typeof requireOwned>[0],
  cafeId: string,
  targetKind: 'item' | 'variant' | 'modifier',
  targetId: string
): Promise<void> {
  const label =
    targetKind === 'item' ? 'Menu' : targetKind === 'variant' ? 'Varian' : 'Modifier';
  await requireOwned(ctx, cafeId as never, targetId as never, label);
}

export const set = mutation({
  args: {
    priceCategoryId: v.id('priceCategories'),
    targetKind: targetKindValidator,
    targetId: targetIdValidator,
    priceIDR: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, args.priceCategoryId, 'Kategori harga');
    await assertTargetOwned(ctx, cafeId, args.targetKind, args.targetId);
    const priceIDR = assertPrice(args.priceIDR);

    // Upsert. Convex has no unique constraint, so a repeat set must find and
    // patch rather than insert, or resolution later picks between duplicates.
    const existing = await ctx.db
      .query('priceOverrides')
      .withIndex('by_category_and_kind_and_target', (q) =>
        q
          .eq('priceCategoryId', args.priceCategoryId)
          .eq('targetKind', args.targetKind)
          .eq('targetId', args.targetId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { priceIDR });
    } else {
      await ctx.db.insert('priceOverrides', {
        cafeId,
        priceCategoryId: args.priceCategoryId,
        targetKind: args.targetKind,
        targetId: args.targetId,
        priceIDR,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});

export const clear = mutation({
  args: {
    priceCategoryId: v.id('priceCategories'),
    targetKind: targetKindValidator,
    targetId: targetIdValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, args.priceCategoryId, 'Kategori harga');
    const existing = await ctx.db
      .query('priceOverrides')
      .withIndex('by_category_and_kind_and_target', (q) =>
        q
          .eq('priceCategoryId', args.priceCategoryId)
          .eq('targetKind', args.targetKind)
          .eq('targetId', args.targetId)
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

export const listForCategory = query({
  args: { priceCategoryId: v.id('priceCategories') },
  returns: v.array(overrideDoc),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, args.priceCategoryId, 'Kategori harga');
    return await ctx.db
      .query('priceOverrides')
      .withIndex('by_cafe_and_category', (q) =>
        q.eq('cafeId', cafeId).eq('priceCategoryId', args.priceCategoryId)
      )
      .collect();
  },
});
```

If `requireOwned`'s generic signature rejects the union id in `assertTargetOwned`, replace that helper with an inline `ctx.db.get(targetId)` plus an explicit `doc.cafeId !== cafeId` check throwing the same Indonesian message. Do not weaken the check.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/convex/price-overrides.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Verify nothing else broke**

Run: `pnpm typecheck && pnpm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add convex/menu/priceOverrides.ts tests/convex/price-overrides.test.ts
git commit -m "feat(menu): store per-category price overrides

Sparse by design: a row exists only for something a category actually
reprices, so adding a category never leaves a menu half-priced, and a missing
override charges the standard price rather than zero.

set() upserts because Convex has no unique constraint, and a duplicate pair
would leave resolution picking between two rows. The target's cafe is checked
as well as the category's, which in a multi-outlet business is what stops one
outlet repricing another outlet's menu.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Resolve prices in buildOrder

**Files:**
- Modify: `convex/schema.ts` (the `orders` table)
- Modify: `convex/lib/sale.ts` (`saleArgs` at line 24, and `buildOrder`'s line loop around lines 160 to 215)
- Test: `tests/convex/sale-price-categories.test.ts`

**Interfaces:**
- Consumes: the `priceCategories` and `priceOverrides` tables, from Tasks 1 and 2.
- Produces: `saleArgs.priceCategoryId?: Id<'priceCategories'>`, accepted by every sale mutation that spreads `saleArgs`. Orders gain `priceCategoryId` and `priceCategoryName`.

- [ ] **Step 1: Add the order snapshot fields to the schema**

In `convex/schema.ts`, add to the `orders` table definition:

```ts
    // Snapshot, not just a reference: renaming "Turis" to "Tourist" next month
    // must not change what last month's receipts say. Absent means the standard
    // price was used. The id is kept alongside for reporting joins.
    priceCategoryId: v.optional(v.id('priceCategories')),
    priceCategoryName: v.optional(v.string()),
```

Then run `./node_modules/.bin/convex codegen`.

- [ ] **Step 2: Write the failing test**

Create `tests/convex/sale-price-categories.test.ts`:

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: 'Asia/Jakarta',
    taxRatePct: 0,
    taxEnabled: false,
  });
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, {
    cashierId,
    openingFloatIDR: 100000,
  });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
  const tierId = await asOwner.mutation(api.menu.priceCategories.create, { name: 'Turis' });
  return { asOwner, cashierId, shiftId, categoryId, itemId, tierId };
}

async function sell(
  s: Awaited<ReturnType<typeof setup>>,
  clientId: string,
  lines: Array<Record<string, unknown>>,
  priceCategoryId?: string
) {
  return await s.asOwner.mutation(api.orders.createCashSale, {
    clientId,
    shiftId: s.shiftId,
    cashierId: s.cashierId,
    lines,
    ...(priceCategoryId ? { priceCategoryId } : {}),
  } as never);
}

describe('price category resolution', () => {
  // The regression guard for every existing cafe: no category means today's
  // behavior, byte for byte.
  it('charges the standard price when no category is given', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const res = await sell(s, 'pc-1', [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [] }]);
    expect(res.totalIDR).toBe(18000);
    const order = await t.run(async (ctx) => await ctx.db.get(res.orderId));
    expect(order!.priceCategoryName).toBeUndefined();
  });

  it('charges the override when the category has one', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'item',
      targetId: s.itemId,
      priceIDR: 30000,
    });
    const res = await sell(
      s,
      'pc-2',
      [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [] }],
      s.tierId
    );
    expect(res.totalIDR).toBe(30000);
    const order = await t.run(async (ctx) => await ctx.db.get(res.orderId));
    expect(order!.priceCategoryName).toBe('Turis');
  });

  // The fallback that makes the sparse model safe: an unpriced item is not free.
  it('falls back to the standard price for an item the category does not reprice', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const other = await s.asOwner.mutation(api.menu.items.create, {
      categoryId: s.categoryId,
      name: 'Teh',
      priceIDR: 12000,
    });
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'item',
      targetId: s.itemId,
      priceIDR: 30000,
    });
    const res = await sell(
      s,
      'pc-3',
      [{ menuItemId: other, qty: 1, modifierOptionIds: [] }],
      s.tierId
    );
    expect(res.totalIDR).toBe(12000);
  });

  // A variant's price already REPLACES the item's base price, so an item-level
  // override must not leak into a line that selected a size.
  it('keys a variant line on the variant, never the item override', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const variantId = await s.asOwner.mutation(api.menu.variants.create, {
      menuItemId: s.itemId,
      name: 'L',
      priceIDR: 25000,
    });
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'item',
      targetId: s.itemId,
      priceIDR: 99000,
    });
    // Only the item is overridden, so the variant line keeps the variant price.
    const res = await sell(
      s,
      'pc-4',
      [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [], variantId }],
      s.tierId
    );
    expect(res.totalIDR).toBe(25000);

    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'variant',
      targetId: variantId,
      priceIDR: 40000,
    });
    const res2 = await sell(
      s,
      'pc-5',
      [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [], variantId }],
      s.tierId
    );
    expect(res2.totalIDR).toBe(40000);
  });

  // Add-ons vary by category too. The override REPLACES priceAdjustmentIDR for
  // that option rather than stacking with it.
  it('applies a modifier override on top of the resolved base price', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const groupId = await s.asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Susu',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [{ name: 'Oat', priceAdjustmentIDR: 5000, position: 0 }],
    });
    await s.asOwner.mutation(api.menu.itemGroups.attach, {
      menuItemId: s.itemId,
      modifierGroupId: groupId,
    });
    const group = await s.asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
    const oat = group!.options.find((o) => o.name === 'Oat')!;

    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'item',
      targetId: s.itemId,
      priceIDR: 30000,
    });
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'modifier',
      targetId: oat._id,
      priceIDR: 9000,
    });

    const res = await sell(
      s,
      'pc-7',
      [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [oat._id] }],
      s.tierId
    );
    // 30000 overridden base plus 9000 overridden add-on, not 18000 plus 5000.
    expect(res.totalIDR).toBe(39000);
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
      sell(s, 'pc-6', [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [] }], foreignTier)
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run tests/convex/sale-price-categories.test.ts`
Expected: FAIL, `priceCategoryId` is not an accepted argument.

- [ ] **Step 4: Accept the argument**

In `convex/lib/sale.ts`, add to `saleArgs` (line 24 block):

```ts
  priceCategoryId: v.optional(v.id('priceCategories')),
```

- [ ] **Step 5: Load the override map once**

In `buildOrder`, after `const { cafeId } = await requireActiveOutlet(ctx);` and before the line loop, add:

```ts
  // One indexed query for the whole order. A lookup per line would add up to
  // three reads per line once modifiers are involved.
  const priceOverrides = new Map<string, number>();
  let priceCategoryName: string | undefined;
  if (args.priceCategoryId) {
    const priceCategory = await ctx.db.get(args.priceCategoryId);
    if (!priceCategory || priceCategory.cafeId !== cafeId || priceCategory.archived) {
      throw new Error('Kategori harga tidak ditemukan.');
    }
    priceCategoryName = priceCategory.name;
    const rows = await ctx.db
      .query('priceOverrides')
      .withIndex('by_cafe_and_category', (q) =>
        q.eq('cafeId', cafeId).eq('priceCategoryId', priceCategory._id)
      )
      .collect();
    for (const row of rows) priceOverrides.set(row.targetId as string, row.priceIDR);
  }
```

- [ ] **Step 6: Resolve each line against the map**

In the same file, replace the modifier accumulation (currently `modifierAdjustments += option.priceAdjustmentIDR;` near line 168, and the `priceAdjustmentIDR: option.priceAdjustmentIDR` field in `modifiersSnapshot` near line 166) so both read one resolved value:

```ts
      const adjustment =
        priceOverrides.get(option._id as string) ?? option.priceAdjustmentIDR;
```

Use `adjustment` for both the snapshot field and the `modifierAdjustments` sum.

Then replace line 183:

```ts
    // Keyed on the VARIANT when one is selected. A variant's price already
    // replaces the item's base price, so an item-level override must not leak
    // into a line that picked a size.
    const priceTargetId = (variant ? variant._id : item._id) as string;
    const basePrice =
      priceOverrides.get(priceTargetId) ?? (variant ? variant.priceIDR : item.priceIDR);
```

- [ ] **Step 7: Snapshot the category on the order**

Find the `ctx.db.insert('orders', { ... })` call in `buildOrder` and add:

```ts
      ...(priceCategoryName
        ? { priceCategoryId: args.priceCategoryId, priceCategoryName }
        : {}),
```

Spread conditionally, so an order with no category stores neither field and stays byte-identical to today.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm vitest run tests/convex/sale-price-categories.test.ts tests/convex/sale-core.test.ts`
Expected: PASS. `sale-core.test.ts` must pass unchanged; if it does not, the no-category path was altered and that is a regression, not a test to update.

- [ ] **Step 9: Full verification**

Run: `pnpm typecheck && pnpm test && pnpm lingui:compile`
Expected: all clean, and `git status` shows no unexpected generated-file drift.

- [ ] **Step 10: Commit**

```bash
git add convex/schema.ts convex/lib/sale.ts convex/_generated tests/convex/sale-price-categories.test.ts
git commit -m "feat(sale): resolve line prices through the selected price category

The tier lands in exactly one place, buildOrder, and loads a category's
overrides in a single indexed query rather than a lookup per line. The client
still sends no amounts: it names a category, the server resolves every price,
so a tampered client can request a tier but cannot pick a number.

A variant line keys on the variant id, not the item id. A variant's price
already replaces the item's base price, so an item-level override leaking into
a sized line would silently charge the wrong number.

The order snapshots the category NAME, not just its id, for the same reason
lines already snapshot nameSnapshot: renaming a category must not rewrite what
past receipts say. Orders with no category store neither field and price
exactly as before.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Post-merge notes

Nothing in the app reaches this yet. After this plan lands, the UI plan covers:

1. A price categories manager (create, rename, archive) in menu settings.
2. Per-category price fields on the item, variant and modifier editors, writing through `api.menu.priceOverrides.set` and `.clear`.
3. The register picker, showing `standardPriceLabel` or "Standard" first, then the cafe's categories, and recomputing the cart when it changes.
4. The printed receipt showing `priceCategoryName` when the order carries one, in English, since receipt content stays out of the i18n catalog. The field is written by this plan; nothing renders it yet.
5. Staff switching the tier when accepting a self-order into the register, which recomputes the snapshot at accept time.

`cafes.standardPriceLabel` is added by this plan but not yet written by any mutation; the UI plan adds the settings field that sets it.
