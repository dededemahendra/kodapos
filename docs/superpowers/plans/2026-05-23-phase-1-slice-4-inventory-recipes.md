# Phase 1 · Slice 4 — Inventory + Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn kodapos into "tracks ingredient consumption as you sell" — owner builds per-item recipes, cash sales auto-deduct inventory via event-sourced movements, the inventory page shows current stock + low-stock highlights, the sale screen warns when an item's ingredients are running low.

**Architecture:** Three new Convex tables (`ingredients`, `recipes`, `inventoryMovements`). Stock is **derived** (`Σ movements.delta`), not stored. `orders.createCashSale` gains a third write phase that writes one `inventoryMovements` row per (line × recipe ingredient) in the same atomic mutation. `orders.lines[].recipeSnapshot` finally lands (was deferred in Slice 3). The recipe editor is appended inline to the existing menu item edit page; the `/inventory` page is a new top-level entry under `_pos`.

**Tech Stack:** Convex (schema + mutations + reactive queries) · TanStack Start + TanStack Router · convex-test + vitest · vitest (cost helper unit tests) · Playwright (auth-gated E2E) · shadcn/ui Dialog + Field + Combobox-style picker.

**Spec:** `docs/superpowers/specs/2026-05-23-phase-1-slice-4-inventory-recipes-design.md`

**Branch:** create a new branch off `main` named `phase-1-slice-4-inventory-recipes`.

---

## File map

**New (server):**
- `convex/ingredients.ts` — `list / get / upsert / archive / adjustStock`
- `convex/recipes.ts` — `getForItem / upsert`
- `convex/lib/inventory.ts` — shared `currentStockQty` + `costPerCupIDR` helpers
- `tests/convex/ingredients.test.ts`
- `tests/convex/recipes.test.ts`
- `src/lib/inventory.test.ts` — unit specs for `costPerCupIDR` (the cost helper has a pure-JS form usable from the client too)
- Modified: `convex/schema.ts` — add 3 tables + optional `recipeSnapshot` on `orders.lines`
- Modified: `convex/orders.ts` — recipeSnapshot + inventory deduction in `createCashSale`
- Modified: `convex/menu/items.ts` — `lowStockIngredientNames` in `listForSale`
- Modified: `tests/convex/orders.test.ts` — 6 new specs covering inventory deduction
- Modified: `tests/convex/menu/items.test.ts` — 4 new specs covering `lowStockIngredientNames`

**New (client):**
- `src/components/inventory/ingredient-form.tsx`
- `src/components/inventory/stock-adjust-dialog.tsx`
- `src/components/inventory/ingredient-picker.tsx`
- `src/components/inventory/recipe-editor.tsx`
- `src/lib/inventory.ts` — pure `costPerCupIDR` helper (re-used by `<RecipeEditor>` for live preview)
- `src/routes/_pos/inventory/route.tsx`
- `src/routes/_pos/inventory/index.tsx`
- Modified: `src/components/pos-nav.tsx` — add `/inventory` link
- Modified: `src/components/sale/item-card.tsx` — low-stock warning
- Modified: `src/components/sale/menu-pane.tsx` — pass `lowStockIngredientNames` to ItemCard
- Modified: `src/components/sale/sale-screen.tsx` — types from extended `listForSale`
- Modified: `src/routes/_pos/menu/items.$itemId.tsx` — render `<RecipeEditor>` below `<ItemEditForm>`
- New: `tests/e2e/inventory.spec.ts` — auth-gated happy path

---

## Pre-flight

- [ ] **Branch from main.**

Run:
```bash
git checkout main
git pull
git checkout -b phase-1-slice-4-inventory-recipes
```
Expected: on a fresh branch tracking nothing yet.

---

## Task 1: Schema — add `ingredients`, `recipes`, `inventoryMovements` + optional `recipeSnapshot`

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Append the three new tables to `convex/schema.ts`** before the closing brace of `defineSchema({ ... })`.

```ts
  ingredients: defineTable({
    cafeId: v.id('cafes'),
    name: v.string(),
    canonicalUnit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
    reorderThreshold: v.number(),
    lastCostPerUnitIDR: v.number(),
    archived: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_cafe_active', ['cafeId', 'archived'])
    .index('by_cafe_name', ['cafeId', 'name']),

  recipes: defineTable({
    cafeId: v.id('cafes'),
    menuItemId: v.id('menuItems'),
    lines: v.array(
      v.object({
        ingredientId: v.id('ingredients'),
        qty: v.number(),
        wastageFactor: v.number(),
      })
    ),
    updatedAt: v.number(),
  }).index('by_cafe_item', ['cafeId', 'menuItemId']),

  inventoryMovements: defineTable({
    cafeId: v.id('cafes'),
    ingredientId: v.id('ingredients'),
    delta: v.number(),
    reason: v.union(
      v.literal('sale'),
      v.literal('adjustment'),
      v.literal('waste')
    ),
    refType: v.optional(v.string()),
    refId: v.optional(v.string()),
    note: v.optional(v.string()),
    at: v.number(),
  })
    .index('by_cafe_ingredient', ['cafeId', 'ingredientId'])
    .index('by_cafe_ingredient_at', ['cafeId', 'ingredientId', 'at']),
```

- [ ] **Step 2: Add `recipeSnapshot` as an OPTIONAL field on each line of `orders.lines`.**

Find the existing `orders: defineTable({ ... lines: v.array(v.object({ ... })) ... })` block. Inside the per-line object validator, after `lineTotalIDR: v.number(),` add:

```ts
        recipeSnapshot: v.optional(
          v.array(
            v.object({
              ingredientId: v.id('ingredients'),
              qty: v.number(),
              wastageFactor: v.number(),
            })
          )
        ),
```

Why optional: historical Slice 3 orders don't have this field. Going forward, every `createCashSale` writes it (often as `[]` for items without a recipe).

- [ ] **Step 3: Push schema + codegen.**

Run: `pnpm exec convex dev --once`
Expected: "Convex functions ready!" with no errors. New tables + index reports appear in stdout.

- [ ] **Step 4: Typecheck.**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add convex/schema.ts
git commit -m "feat(slice-4): schema — ingredients + recipes + inventoryMovements + recipeSnapshot"
```

---

## Task 2: Shared helpers — `currentStockQty` + `costPerCupIDR`

These live in two places: `convex/lib/inventory.ts` (server-side stock derivation) and `src/lib/inventory.ts` (pure cost helper usable from React for the live preview).

**Files:**
- Create: `convex/lib/inventory.ts`
- Create: `src/lib/inventory.ts`
- Create: `src/lib/inventory.test.ts`

- [ ] **Step 1: Create `src/lib/inventory.ts`** (pure helper, no Convex deps).

```ts
import type { Id } from 'convex/_generated/dataModel';

export type RecipeLineForCost = {
  ingredientId: Id<'ingredients'>;
  qty: number;
  wastageFactor: number;
};

export type IngredientCostInfo = {
  _id: Id<'ingredients'>;
  lastCostPerUnitIDR: number;
};

/**
 * Pure cost-per-cup calculation. Σ (qty * wastage * lastCostPerUnit), rounded
 * to integer rupiah. Returns 0 if any referenced ingredient is missing from
 * the lookup (e.g. ingredient archived; live editor hasn't refetched yet).
 */
export function costPerCupIDR(
  lines: RecipeLineForCost[],
  ingredientsById: Map<Id<'ingredients'>, IngredientCostInfo>
): number {
  let sum = 0;
  for (const line of lines) {
    const ing = ingredientsById.get(line.ingredientId);
    if (!ing) continue;
    sum += line.qty * line.wastageFactor * ing.lastCostPerUnitIDR;
  }
  return Math.round(sum);
}
```

- [ ] **Step 2: Create `src/lib/inventory.test.ts`** with 4 unit specs.

```ts
import { describe, expect, it } from 'vitest';
import type { Id } from 'convex/_generated/dataModel';
import { costPerCupIDR, type IngredientCostInfo } from './inventory';

const susuId = 'ing-susu' as unknown as Id<'ingredients'>;
const espressoBeanId = 'ing-bean' as unknown as Id<'ingredients'>;

function ingMap(arr: IngredientCostInfo[]): Map<Id<'ingredients'>, IngredientCostInfo> {
  return new Map(arr.map((i) => [i._id, i]));
}

describe('costPerCupIDR', () => {
  it('computes 200ml × 1.0 × Rp 25/ml = Rp 5.000', () => {
    const m = ingMap([{ _id: susuId, lastCostPerUnitIDR: 25 }]);
    expect(
      costPerCupIDR([{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }], m)
    ).toBe(5000);
  });

  it('returns 0 for empty lines', () => {
    expect(costPerCupIDR([], new Map())).toBe(0);
  });

  it('applies wastageFactor: 200ml × 1.5 × Rp 25 = Rp 7.500', () => {
    const m = ingMap([{ _id: susuId, lastCostPerUnitIDR: 25 }]);
    expect(
      costPerCupIDR([{ ingredientId: susuId, qty: 200, wastageFactor: 1.5 }], m)
    ).toBe(7500);
  });

  it('handles a zero-cost ingredient without NaN', () => {
    const m = ingMap([
      { _id: susuId, lastCostPerUnitIDR: 25 },
      { _id: espressoBeanId, lastCostPerUnitIDR: 0 },
    ]);
    const result = costPerCupIDR(
      [
        { ingredientId: susuId, qty: 200, wastageFactor: 1.0 },
        { ingredientId: espressoBeanId, qty: 18, wastageFactor: 1.0 },
      ],
      m
    );
    expect(result).toBe(5000);
    expect(Number.isFinite(result)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the unit tests.**

Run: `pnpm test src/lib/inventory.test.ts`
Expected: PASS (4 specs).

- [ ] **Step 4: Create `convex/lib/inventory.ts`** — server-side stock derivation.

```ts
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

/**
 * Sum all inventoryMovements for a (cafe, ingredient) pair. Current stock
 * is event-sourced: never a stored counter.
 *
 * Counter-cafe scale (<500 movements per ingredient per month) makes this
 * cheap enough to call from list queries. V2 would cache or snapshot.
 */
export async function currentStockQty(
  ctx: QueryCtx | MutationCtx,
  cafeId: Id<'cafes'>,
  ingredientId: Id<'ingredients'>
): Promise<number> {
  const movements = await ctx.db
    .query('inventoryMovements')
    .withIndex('by_cafe_ingredient', (q) =>
      q.eq('cafeId', cafeId).eq('ingredientId', ingredientId)
    )
    .collect();
  return movements.reduce((sum, m) => sum + m.delta, 0);
}
```

- [ ] **Step 5: Typecheck + commit.**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add convex/lib/inventory.ts src/lib/inventory.ts src/lib/inventory.test.ts
git commit -m "feat(slice-4): shared inventory helpers — currentStockQty + costPerCupIDR"
```

---

## Task 3: `convex/ingredients.ts` — CRUD + adjust stock

**Files:**
- Create: `convex/ingredients.ts`
- Create: `tests/convex/ingredients.test.ts`

- [ ] **Step 1: Create the test file** with a setup helper + initial happy-path spec.

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

describe('ingredients.upsert', () => {
  it('creates a new ingredient with valid fields', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    expect(id).toBeTruthy();
    const list = await asOwner.query(api.ingredients.list, {});
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Susu');
    expect(list[0]?.canonicalUnit).toBe('ml');
    expect(list[0]?.reorderThreshold).toBe(500);
    expect(list[0]?.lastCostPerUnitIDR).toBe(25);
    expect(list[0]?.currentStockQty).toBe(0);
    expect(list[0]?.archived).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify it fails.**

Run: `pnpm test tests/convex/ingredients.test.ts`
Expected: FAIL — `api.ingredients.upsert` not defined.

- [ ] **Step 3: Create `convex/ingredients.ts`** with the full surface.

```ts
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { currentStockQty } from './lib/inventory';
import { requireOwned, requireOwnerCafe } from './lib/auth';

const ingredientDoc = v.object({
  _id: v.id('ingredients'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  canonicalUnit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
  reorderThreshold: v.number(),
  lastCostPerUnitIDR: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

const ingredientWithStock = v.object({
  ...ingredientDoc.fields,
  currentStockQty: v.number(),
});

function assertIngredient(
  name: string,
  reorderThreshold: number,
  lastCostPerUnitIDR: number
): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama bahan wajib diisi.');
  if (trimmed.length > 60) throw new Error('Nama bahan maksimal 60 karakter.');
  if (!Number.isInteger(reorderThreshold) || reorderThreshold < 0) {
    throw new Error('Ambang isi ulang harus bilangan bulat ≥ 0.');
  }
  if (!Number.isInteger(lastCostPerUnitIDR) || lastCostPerUnitIDR < 0) {
    throw new Error('Biaya per satuan harus bilangan bulat ≥ 0.');
  }
  return trimmed;
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(ingredientWithStock),
  handler: async (ctx, { includeArchived = false }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('ingredients')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    const filtered = rows.filter((r) => includeArchived || !r.archived);
    const enriched = await Promise.all(
      filtered.map(async (r) => ({
        ...r,
        currentStockQty: await currentStockQty(ctx, cafeId, r._id),
      }))
    );
    return enriched.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
  },
});

export const get = query({
  args: { id: v.id('ingredients') },
  returns: v.union(ingredientWithStock, v.null()),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.cafeId !== cafeId) return null;
    return { ...row, currentStockQty: await currentStockQty(ctx, cafeId, row._id) };
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id('ingredients')),
    name: v.string(),
    canonicalUnit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
    reorderThreshold: v.number(),
    lastCostPerUnitIDR: v.number(),
  },
  returns: v.id('ingredients'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cleanName = assertIngredient(
      args.name,
      args.reorderThreshold,
      args.lastCostPerUnitIDR
    );

    // Duplicate-name guard, case-insensitive, scoped to the cafe.
    const sameName = await ctx.db
      .query('ingredients')
      .withIndex('by_cafe_name', (q) => q.eq('cafeId', cafeId))
      .collect();
    const lower = cleanName.toLowerCase();
    const conflict = sameName.find(
      (r) => r.name.toLowerCase() === lower && r._id !== args.id
    );
    if (conflict) throw new Error('Bahan dengan nama yang sama sudah ada.');

    if (args.id) {
      await requireOwned(ctx, cafeId, args.id, 'Bahan');
      await ctx.db.patch(args.id, {
        name: cleanName,
        canonicalUnit: args.canonicalUnit,
        reorderThreshold: args.reorderThreshold,
        lastCostPerUnitIDR: args.lastCostPerUnitIDR,
      });
      return args.id;
    }

    return await ctx.db.insert('ingredients', {
      cafeId,
      name: cleanName,
      canonicalUnit: args.canonicalUnit,
      reorderThreshold: args.reorderThreshold,
      lastCostPerUnitIDR: args.lastCostPerUnitIDR,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const archive = mutation({
  args: { id: v.id('ingredients') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Bahan');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

export const adjustStock = mutation({
  args: {
    ingredientId: v.id('ingredients'),
    newQty: v.number(),
    reasonLabel: v.string(),
    note: v.optional(v.string()),
  },
  returns: v.union(v.id('inventoryMovements'), v.null()),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, args.ingredientId, 'Bahan');
    if (!Number.isInteger(args.newQty) || args.newQty < 0) {
      throw new Error('Stok harus berupa angka bulat ≥ 0.');
    }
    const current = await currentStockQty(ctx, cafeId, args.ingredientId);
    const delta = args.newQty - current;
    if (delta === 0) return null;
    const noteText = args.note?.trim()
      ? `${args.reasonLabel} — ${args.note.trim()}`
      : args.reasonLabel;
    return await ctx.db.insert('inventoryMovements', {
      cafeId,
      ingredientId: args.ingredientId,
      delta,
      reason: 'adjustment',
      note: noteText,
      at: Date.now(),
    });
  },
});
```

- [ ] **Step 4: Codegen + run the happy-path test.**

Run: `pnpm exec convex dev --once && pnpm test tests/convex/ingredients.test.ts`
Expected: PASS (1 spec).

- [ ] **Step 5: Append the rest of the specs to the test file.**

Append inside the file (NEW describe blocks):

```ts
describe('ingredients.upsert validation', () => {
  it('rejects empty name', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.ingredients.upsert, {
        name: '   ',
        canonicalUnit: 'ml',
        reorderThreshold: 500,
        lastCostPerUnitIDR: 25,
      })
    ).rejects.toThrow(/wajib diisi/i);
  });

  it('rejects > 60 chars', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.ingredients.upsert, {
        name: 'x'.repeat(61),
        canonicalUnit: 'ml',
        reorderThreshold: 500,
        lastCostPerUnitIDR: 25,
      })
    ).rejects.toThrow(/maksimal/i);
  });

  it('rejects duplicate name in same cafe (case-insensitive)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    await expect(
      asOwner.mutation(api.ingredients.upsert, {
        name: 'susu',
        canonicalUnit: 'ml',
        reorderThreshold: 100,
        lastCostPerUnitIDR: 30,
      })
    ).rejects.toThrow(/sudah ada/i);
  });

  it('allows the same name across different cafes', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    await ownerA.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    const idB = await ownerB.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    expect(idB).toBeTruthy();
  });
});

describe('ingredients.list / archive', () => {
  it('excludes archived by default; includes when requested', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    await asOwner.mutation(api.ingredients.archive, { id });
    const active = await asOwner.query(api.ingredients.list, {});
    expect(active).toHaveLength(0);
    const all = await asOwner.query(api.ingredients.list, { includeArchived: true });
    expect(all).toHaveLength(1);
    expect(all[0]?.archived).toBe(true);
  });
});

describe('ingredients.adjustStock', () => {
  it('writes a movement with delta = newQty - currentStock + the note', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    const movementId = await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: id,
      newQty: 1000,
      reasonLabel: 'Pengiriman masuk',
      note: 'PT Sumber Susu',
    });
    expect(movementId).toBeTruthy();
    const after = await asOwner.query(api.ingredients.list, {});
    expect(after[0]?.currentStockQty).toBe(1000);
    const movement = await t.run(async (ctx) =>
      await ctx.db.get(movementId!)
    );
    expect(movement?.delta).toBe(1000);
    expect(movement?.reason).toBe('adjustment');
    expect(movement?.note).toBe('Pengiriman masuk — PT Sumber Susu');
  });

  it('is a no-op when newQty equals currentStock', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    const result = await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: id,
      newQty: 0,
      reasonLabel: 'Koreksi',
    });
    expect(result).toBeNull();
  });

  it('rejects fractional / negative newQty', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    await expect(
      asOwner.mutation(api.ingredients.adjustStock, {
        ingredientId: id,
        newQty: 100.5,
        reasonLabel: 'Koreksi',
      })
    ).rejects.toThrow(/bulat/i);
    await expect(
      asOwner.mutation(api.ingredients.adjustStock, {
        ingredientId: id,
        newQty: -1,
        reasonLabel: 'Koreksi',
      })
    ).rejects.toThrow(/bulat/i);
  });
});
```

- [ ] **Step 6: Run the full test file.**

Run: `pnpm test tests/convex/ingredients.test.ts`
Expected: PASS (9 specs).

- [ ] **Step 7: Typecheck + commit.**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add convex/ingredients.ts tests/convex/ingredients.test.ts
git commit -m "feat(slice-4): ingredients — list/get/upsert/archive/adjustStock + 9 specs"
```

---

## Task 4: `convex/recipes.ts` — getForItem + upsert

**Files:**
- Create: `convex/recipes.ts`
- Create: `tests/convex/recipes.test.ts`

- [ ] **Step 1: Create the test file** with setup + happy-path.

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
  const susuId = await asOwner.mutation(api.ingredients.upsert, {
    name: 'Susu',
    canonicalUnit: 'ml',
    reorderThreshold: 500,
    lastCostPerUnitIDR: 25,
  });
  return { asOwner, categoryId, itemId, susuId };
}

describe('recipes.upsert / getForItem', () => {
  it('creates a recipe; getForItem returns lines with ingredient data + cost-per-cup', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, susuId } = await setup(t);
    const recipeId = await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
    });
    expect(recipeId).toBeTruthy();
    const recipe = await asOwner.query(api.recipes.getForItem, { menuItemId: itemId });
    expect(recipe).not.toBeNull();
    expect(recipe?.lines).toHaveLength(1);
    expect(recipe?.lines[0]?.ingredient.name).toBe('Susu');
    expect(recipe?.lines[0]?.qty).toBe(200);
    expect(recipe?.lines[0]?.wastageFactor).toBe(1.0);
    // 200 × 1.0 × 25 = 5000
    expect(recipe?.costPerCupIDR).toBe(5000);
  });
});
```

- [ ] **Step 2: Run — verify it fails.**

Run: `pnpm test tests/convex/recipes.test.ts`
Expected: FAIL — `api.recipes.upsert` not defined.

- [ ] **Step 3: Create `convex/recipes.ts`.**

```ts
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';

const ingredientDoc = v.object({
  _id: v.id('ingredients'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  canonicalUnit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
  reorderThreshold: v.number(),
  lastCostPerUnitIDR: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

const recipeLineWithIngredient = v.object({
  ingredient: ingredientDoc,
  qty: v.number(),
  wastageFactor: v.number(),
});

const recipeDetail = v.object({
  recipeId: v.id('recipes'),
  lines: v.array(recipeLineWithIngredient),
  costPerCupIDR: v.number(),
});

function assertRecipeLine(qty: number, wastageFactor: number): void {
  if (qty <= 0) throw new Error('Jumlah harus lebih besar dari nol.');
  if (wastageFactor < 1.0 || wastageFactor > 5.0) {
    throw new Error('Faktor wastage harus antara 1.0 dan 5.0.');
  }
}

export const getForItem = query({
  args: { menuItemId: v.id('menuItems') },
  returns: v.union(recipeDetail, v.null()),
  handler: async (ctx, { menuItemId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const item = await ctx.db.get(menuItemId);
    if (!item || item.cafeId !== cafeId) return null;
    const recipe = await ctx.db
      .query('recipes')
      .withIndex('by_cafe_item', (q) =>
        q.eq('cafeId', cafeId).eq('menuItemId', menuItemId)
      )
      .unique();
    if (!recipe) return null;
    const lines: Array<{
      ingredient: Doc<'ingredients'>;
      qty: number;
      wastageFactor: number;
    }> = [];
    let cost = 0;
    for (const line of recipe.lines) {
      const ing = await ctx.db.get(line.ingredientId);
      if (!ing || ing.cafeId !== cafeId) continue;
      lines.push({ ingredient: ing, qty: line.qty, wastageFactor: line.wastageFactor });
      cost += line.qty * line.wastageFactor * ing.lastCostPerUnitIDR;
    }
    return { recipeId: recipe._id, lines, costPerCupIDR: Math.round(cost) };
  },
});

export const upsert = mutation({
  args: {
    menuItemId: v.id('menuItems'),
    lines: v.array(
      v.object({
        ingredientId: v.id('ingredients'),
        qty: v.number(),
        wastageFactor: v.number(),
      })
    ),
  },
  returns: v.union(v.id('recipes'), v.null()),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, args.menuItemId, 'Item');

    // Validate each line up-front.
    for (const line of args.lines) {
      assertRecipeLine(line.qty, line.wastageFactor);
      const ing = await ctx.db.get(line.ingredientId);
      if (!ing || ing.cafeId !== cafeId || ing.archived) {
        throw new Error('Bahan tidak ditemukan.');
      }
    }

    const existing = await ctx.db
      .query('recipes')
      .withIndex('by_cafe_item', (q) =>
        q.eq('cafeId', cafeId).eq('menuItemId', args.menuItemId)
      )
      .unique();

    // Empty lines = clean opt-out.
    if (args.lines.length === 0) {
      if (existing) await ctx.db.delete(existing._id);
      return null;
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        lines: args.lines,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert('recipes', {
      cafeId,
      menuItemId: args.menuItemId,
      lines: args.lines,
      updatedAt: Date.now(),
    });
  },
});
```

- [ ] **Step 4: Codegen + run happy-path.**

Run: `pnpm exec convex dev --once && pnpm test tests/convex/recipes.test.ts`
Expected: PASS (1 spec).

- [ ] **Step 5: Append the remaining 5 specs.**

```ts
  it('upsert patches an existing recipe on second call', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, susuId } = await setup(t);
    const beanId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Biji kopi',
      canonicalUnit: 'g',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 100,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [
        { ingredientId: susuId, qty: 200, wastageFactor: 1.0 },
        { ingredientId: beanId, qty: 18, wastageFactor: 1.0 },
      ],
    });
    const recipe = await asOwner.query(api.recipes.getForItem, { menuItemId: itemId });
    expect(recipe?.lines).toHaveLength(2);
    // 200×25 + 18×100 = 5000 + 1800 = 6800
    expect(recipe?.costPerCupIDR).toBe(6800);
  });

  it('upsert with lines: [] deletes the recipe row', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, susuId } = await setup(t);
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
    });
    expect(await asOwner.query(api.recipes.getForItem, { menuItemId: itemId })).not.toBeNull();
    const result = await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [],
    });
    expect(result).toBeNull();
    expect(await asOwner.query(api.recipes.getForItem, { menuItemId: itemId })).toBeNull();
  });

  it('rejects qty <= 0', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, susuId } = await setup(t);
    await expect(
      asOwner.mutation(api.recipes.upsert, {
        menuItemId: itemId,
        lines: [{ ingredientId: susuId, qty: 0, wastageFactor: 1.0 }],
      })
    ).rejects.toThrow(/lebih besar dari nol/i);
  });

  it('rejects wastageFactor outside [1.0, 5.0]', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, susuId } = await setup(t);
    await expect(
      asOwner.mutation(api.recipes.upsert, {
        menuItemId: itemId,
        lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 0.5 }],
      })
    ).rejects.toThrow(/antara 1\.0/i);
    await expect(
      asOwner.mutation(api.recipes.upsert, {
        menuItemId: itemId,
        lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 6.0 }],
      })
    ).rejects.toThrow(/antara 1\.0/i);
  });

  it('rejects archived ingredient', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, susuId } = await setup(t);
    await asOwner.mutation(api.ingredients.archive, { id: susuId });
    await expect(
      asOwner.mutation(api.recipes.upsert, {
        menuItemId: itemId,
        lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
      })
    ).rejects.toThrow(/tidak ditemukan/i);
  });
});
```

- [ ] **Step 6: Run full file.**

Run: `pnpm test tests/convex/recipes.test.ts`
Expected: PASS (6 specs).

- [ ] **Step 7: Typecheck + commit.**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add convex/recipes.ts tests/convex/recipes.test.ts
git commit -m "feat(slice-4): recipes — getForItem + upsert (delete on empty) + 6 specs"
```

---

## Task 5: Extend `orders.createCashSale` to write inventory deductions

**Files:**
- Modify: `convex/orders.ts`
- Modify: `tests/convex/orders.test.ts`

The existing handler will gain two changes:
1. Inside the per-line loop, after computing `unitPriceIDR` + `modifiersSnapshot`, look up the line's recipe and build a `recipeSnapshot`. Skip archived ingredients silently.
2. After inserting the order + payment, write one `inventoryMovements` row per (line × recipeSnapshot entry).

- [ ] **Step 1: Modify `convex/orders.ts`** — inside the `for (const line of args.lines)` loop, AFTER the existing modifier-resolution block, add the recipe snapshot computation. Locate the line that pushes into `builtLines.push({ ... })` and update it.

Find the existing code that ends the per-line block (it pushes into `builtLines`):

```ts
      const unitPriceIDR = item.priceIDR + modifierAdjustments;
      const lineTotalIDR = line.qty * unitPriceIDR;
      builtLines.push({
        menuItemId: item._id,
        nameSnapshot: item.name,
        qty: line.qty,
        unitPriceIDR,
        modifiersSnapshot,
        lineTotalIDR,
      });
```

Replace with:

```ts
      const unitPriceIDR = item.priceIDR + modifierAdjustments;
      const lineTotalIDR = line.qty * unitPriceIDR;

      // Look up the recipe (if any) and build recipeSnapshot. Archived
      // ingredients are silently skipped — the owner intentionally
      // opted them out; the line still sells.
      const recipe = await ctx.db
        .query('recipes')
        .withIndex('by_cafe_item', (q) =>
          q.eq('cafeId', cafeId).eq('menuItemId', item._id)
        )
        .unique();
      const recipeSnapshot: Array<{
        ingredientId: Id<'ingredients'>;
        qty: number;
        wastageFactor: number;
      }> = [];
      if (recipe) {
        for (const recipeLine of recipe.lines) {
          const ing = await ctx.db.get(recipeLine.ingredientId);
          if (!ing || ing.cafeId !== cafeId || ing.archived) continue;
          recipeSnapshot.push({
            ingredientId: recipeLine.ingredientId,
            qty: recipeLine.qty,
            wastageFactor: recipeLine.wastageFactor,
          });
        }
      }

      builtLines.push({
        menuItemId: item._id,
        nameSnapshot: item.name,
        qty: line.qty,
        unitPriceIDR,
        modifiersSnapshot,
        lineTotalIDR,
        recipeSnapshot,
      });
```

Add the `Id` import at the top if not already there:

```ts
import type { Doc, Id } from './_generated/dataModel';
```

- [ ] **Step 2: Inside the same handler, after inserting orders + payments rows, write inventory movements.** Find where the `payments` row is inserted:

```ts
    const changeIDR = tendered - totalIDR;
    await ctx.db.insert('payments', {
      cafeId,
      orderId,
      method: 'cash',
      amountIDR: totalIDR,
      cashTenderedIDR: tendered,
      changeIDR,
      confirmedAt: now,
    });

    return { orderId, totalIDR, changeIDR };
```

Insert the movements write between `payments` and `return`:

```ts
    const changeIDR = tendered - totalIDR;
    await ctx.db.insert('payments', {
      cafeId,
      orderId,
      method: 'cash',
      amountIDR: totalIDR,
      cashTenderedIDR: tendered,
      changeIDR,
      confirmedAt: now,
    });

    // Inventory deduction: one inventoryMovements row per (line × ingredient).
    // Atomic with the order + payment because this all runs in one mutation.
    for (const builtLine of builtLines) {
      for (const recipeLine of builtLine.recipeSnapshot ?? []) {
        const consumed = builtLine.qty * recipeLine.qty * recipeLine.wastageFactor;
        await ctx.db.insert('inventoryMovements', {
          cafeId,
          ingredientId: recipeLine.ingredientId,
          delta: -consumed,
          reason: 'sale',
          refType: 'order',
          refId: orderId as unknown as string,
          at: now,
        });
      }
    }

    return { orderId, totalIDR, changeIDR };
```

- [ ] **Step 3: Codegen + run existing tests to confirm no regression.**

Run: `pnpm exec convex dev --once && pnpm test tests/convex/orders.test.ts`
Expected: ALL 23 existing specs still pass. (Test file unchanged so far.)

- [ ] **Step 4: Append the 6 new specs to `tests/convex/orders.test.ts`** in a new describe block.

The existing `setup(t, opts)` helper already gives us `cafeId / shiftId / cashierId / itemId`. We extend per test to add ingredients + recipes.

```ts
describe('orders.createCashSale — inventory deduction', () => {
  it('writes one inventoryMovements row per recipe ingredient', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    const beanId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Biji',
      canonicalUnit: 'g',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 100,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [
        { ingredientId: susuId, qty: 200, wastageFactor: 1.0 },
        { ingredientId: beanId, qty: 18, wastageFactor: 1.0 },
      ],
    });

    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'inv-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });

    const movements = await t.run(async (ctx) =>
      await ctx.db
        .query('inventoryMovements')
        .withIndex('by_cafe_ingredient', (q) => q.eq('cafeId', cafeId).eq('ingredientId', susuId))
        .collect()
    );
    expect(movements).toHaveLength(1);
    expect(movements[0]?.delta).toBe(-200);
    expect(movements[0]?.reason).toBe('sale');
    expect(movements[0]?.refType).toBe('order');
    expect(movements[0]?.refId).toBe(result.orderId);

    const beanMovements = await t.run(async (ctx) =>
      await ctx.db
        .query('inventoryMovements')
        .withIndex('by_cafe_ingredient', (q) => q.eq('cafeId', cafeId).eq('ingredientId', beanId))
        .collect()
    );
    expect(beanMovements).toHaveLength(1);
    expect(beanMovements[0]?.delta).toBe(-18);
  });

  it('multiplies by line qty: order line qty 3 with 200ml recipe → -600ml', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
    });
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'inv-3x',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      cashTenderedIDR: 100000,
      createdAtClient: 1700000000000,
    });
    const movements = await t.run(async (ctx) =>
      await ctx.db
        .query('inventoryMovements')
        .withIndex('by_cafe_ingredient', (q) => q.eq('cafeId', cafeId).eq('ingredientId', susuId))
        .collect()
    );
    expect(movements[0]?.delta).toBe(-600);
  });

  it('snapshots recipe at sale time; later recipe edits do not mutate the order', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
    });
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'snap-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 999, wastageFactor: 1.0 }],
    });
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.lines?.[0]?.recipeSnapshot?.[0]?.qty).toBe(200);
  });

  it('item without a recipe writes zero movements and recipeSnapshot is empty', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t);
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'no-recipe',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.lines?.[0]?.recipeSnapshot).toEqual([]);
    const movements = await t.run(async (ctx) =>
      await ctx.db
        .query('inventoryMovements')
        .withIndex('by_cafe_ingredient_at', (q) => q.eq('cafeId', cafeId))
        .collect()
    );
    expect(movements).toHaveLength(0);
  });

  it('skips archived ingredients silently; other lines still deduct', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    const beanId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Biji',
      canonicalUnit: 'g',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 100,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [
        { ingredientId: susuId, qty: 200, wastageFactor: 1.0 },
        { ingredientId: beanId, qty: 18, wastageFactor: 1.0 },
      ],
    });
    // Archive susu AFTER the recipe was built.
    await asOwner.mutation(api.ingredients.archive, { id: susuId });
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'skip-archived',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    const susuMovements = await t.run(async (ctx) =>
      await ctx.db
        .query('inventoryMovements')
        .withIndex('by_cafe_ingredient', (q) => q.eq('cafeId', cafeId).eq('ingredientId', susuId))
        .collect()
    );
    expect(susuMovements).toHaveLength(0);
    const beanMovements = await t.run(async (ctx) =>
      await ctx.db
        .query('inventoryMovements')
        .withIndex('by_cafe_ingredient', (q) => q.eq('cafeId', cafeId).eq('ingredientId', beanId))
        .collect()
    );
    expect(beanMovements[0]?.delta).toBe(-18);
    // recipeSnapshot only has the non-archived line.
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.lines?.[0]?.recipeSnapshot).toHaveLength(1);
  });

  it('idempotent: duplicate clientId does not re-write movements', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
    });
    const args = {
      clientId: 'idemp-inv',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    };
    await asOwner.mutation(api.orders.createCashSale, args);
    await asOwner.mutation(api.orders.createCashSale, args);
    const movements = await t.run(async (ctx) =>
      await ctx.db
        .query('inventoryMovements')
        .withIndex('by_cafe_ingredient', (q) => q.eq('cafeId', cafeId).eq('ingredientId', susuId))
        .collect()
    );
    expect(movements).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Run.**

Run: `pnpm test tests/convex/orders.test.ts`
Expected: 23 prior + 6 new = 29 specs PASS.

- [ ] **Step 6: Typecheck + commit.**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add convex/orders.ts tests/convex/orders.test.ts
git commit -m "feat(slice-4): createCashSale writes recipeSnapshot + inventory deductions"
```

---

## Task 6: Extend `menu.items.listForSale` with `lowStockIngredientNames`

**Files:**
- Modify: `convex/menu/items.ts`
- Modify: `tests/convex/menu/items.test.ts`

- [ ] **Step 1: Update the `itemForSale` return validator** in `convex/menu/items.ts` to include the new field.

Find the existing `itemForSale` validator near the end of the file:

```ts
const itemForSale = v.object({
  item: menuItemDoc,
  attachedGroups: v.array(groupWithOptionsForSale),
});
```

Replace with:

```ts
const itemForSale = v.object({
  item: menuItemDoc,
  attachedGroups: v.array(groupWithOptionsForSale),
  lowStockIngredientNames: v.array(v.string()),
});
```

- [ ] **Step 2: Update the `listForSale` handler** in the same file. Find the handler. After the existing `for (const item of active)` block that builds `result.push({ item, attachedGroups })`, replace it with a version that also computes low-stock ingredient names per item.

Replace:

```ts
    for (const item of active) {
      const attachedGroups = await resolveAttachedGroups(ctx, item._id);
      result.push({ item, attachedGroups });
    }
    return result;
```

With:

```ts
    for (const item of active) {
      const attachedGroups = await resolveAttachedGroups(ctx, item._id);

      // Load this item's recipe (if any) and resolve low-stock ingredients.
      const recipe = await ctx.db
        .query('recipes')
        .withIndex('by_cafe_item', (q) =>
          q.eq('cafeId', cafeId).eq('menuItemId', item._id)
        )
        .unique();
      const lowStockIngredientNames: string[] = [];
      if (recipe) {
        for (const recipeLine of recipe.lines) {
          const ing = await ctx.db.get(recipeLine.ingredientId);
          if (!ing || ing.cafeId !== cafeId || ing.archived) continue;
          const movements = await ctx.db
            .query('inventoryMovements')
            .withIndex('by_cafe_ingredient', (q) =>
              q.eq('cafeId', cafeId).eq('ingredientId', ing._id)
            )
            .collect();
          const stock = movements.reduce((sum, m) => sum + m.delta, 0);
          if (stock < ing.reorderThreshold) {
            lowStockIngredientNames.push(ing.name);
          }
        }
      }

      result.push({ item, attachedGroups, lowStockIngredientNames });
    }
    return result;
```

- [ ] **Step 3: Codegen + check existing tests still pass.**

Run: `pnpm exec convex dev --once && pnpm test tests/convex/menu/items.test.ts`
Expected: existing tests pass (the listForSale tests will need updates because the return shape changed — see next step).

If existing `listForSale` tests fail because of the new field, that's expected. Patch them inline as part of the same task (they only need to assert the new field is present or empty).

- [ ] **Step 4: Append 4 new specs to `tests/convex/menu/items.test.ts`** in a new describe block inside the file.

Find a suitable spot (after the existing `describe('menu.items.listForSale', …)` block) and append:

```ts
describe('menu.items.listForSale — low-stock ingredients', () => {
  async function setupShop(t: ReturnType<typeof convexTest>) {
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
    });
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
    const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    const itemId = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Espresso',
      priceIDR: 18000,
    });
    return { asOwner, categoryId, itemId };
  }

  it('returns empty lowStockIngredientNames when all ingredients above threshold', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId } = await setupShop(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
    });
    await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: susuId,
      newQty: 1000,
      reasonLabel: 'Pengiriman masuk',
    });
    const rows = await asOwner.query(api.menu.items.listForSale, {});
    expect(rows[0]?.lowStockIngredientNames).toEqual([]);
  });

  it('flags one low ingredient name', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId } = await setupShop(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
    });
    // Stock 100 < threshold 500.
    await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId: susuId,
      newQty: 100,
      reasonLabel: 'Stok opname',
    });
    const rows = await asOwner.query(api.menu.items.listForSale, {});
    expect(rows[0]?.lowStockIngredientNames).toEqual(['Susu']);
  });

  it('flags multiple low ingredients', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId } = await setupShop(t);
    const susuId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 25,
    });
    const beanId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Biji',
      canonicalUnit: 'g',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 100,
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [
        { ingredientId: susuId, qty: 200, wastageFactor: 1.0 },
        { ingredientId: beanId, qty: 18, wastageFactor: 1.0 },
      ],
    });
    // Both below threshold (default 0 stock < 500).
    const rows = await asOwner.query(api.menu.items.listForSale, {});
    expect(rows[0]?.lowStockIngredientNames).toHaveLength(2);
    expect(rows[0]?.lowStockIngredientNames).toContain('Susu');
    expect(rows[0]?.lowStockIngredientNames).toContain('Biji');
  });

  it('returns empty lowStockIngredientNames for items without a recipe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupShop(t);
    const rows = await asOwner.query(api.menu.items.listForSale, {});
    expect(rows[0]?.lowStockIngredientNames).toEqual([]);
  });
});
```

- [ ] **Step 5: Run.**

Run: `pnpm test tests/convex/menu/items.test.ts`
Expected: all menu items specs PASS (existing + 4 new).

- [ ] **Step 6: Typecheck + commit.**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add convex/menu/items.ts tests/convex/menu/items.test.ts
git commit -m "feat(slice-4): listForSale returns lowStockIngredientNames per item"
```

---

## Task 7: PosNav — add "Inventaris" link

**Files:**
- Modify: `src/components/pos-nav.tsx`

- [ ] **Step 1: Add the inventory link to the `LINKS` array** in `src/components/pos-nav.tsx`.

Find:

```ts
const LINKS = [
  { to: '/sale', label: 'Kasir' },
  { to: '/history', label: 'Riwayat' },
  { to: '/menu', label: 'Menu' },
  { to: '/settings/profile', label: 'Pengaturan' },
] as const;
```

Replace with:

```ts
const LINKS = [
  { to: '/sale', label: 'Kasir' },
  { to: '/history', label: 'Riwayat' },
  { to: '/menu', label: 'Menu' },
  { to: '/inventory', label: 'Inventaris' },
  { to: '/settings/profile', label: 'Pengaturan' },
] as const;
```

- [ ] **Step 2: Typecheck.** (Note: this will FAIL because `/inventory` route doesn't exist yet — see Task 8. That's expected; the typecheck will pass after Task 8 lands.)

If `pnpm typecheck` complains about the unknown route, defer the typecheck pass to Task 8. Don't commit yet.

- [ ] **Step 3: Defer commit to after Task 8.** Mark this task done in TodoWrite but bundle the commit with Task 8.

---

## Task 8: `/inventory` route shell + ingredient list page

**Files:**
- Create: `src/routes/_pos/inventory/route.tsx`
- Create: `src/routes/_pos/inventory/index.tsx`

- [ ] **Step 1: Create the route wrapper.**

```tsx
// src/routes/_pos/inventory/route.tsx
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { PinGate } from '~/components/staff/pin-gate';

export const Route = createFileRoute('/_pos/inventory')({
  component: InventoryLayout,
});

function InventoryLayout() {
  return (
    <PinGate>
      <Outlet />
    </PinGate>
  );
}
```

- [ ] **Step 2: Create the index page.**

```tsx
// src/routes/_pos/inventory/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { IngredientForm } from '~/components/inventory/ingredient-form';
import { StockAdjustDialog } from '~/components/inventory/stock-adjust-dialog';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/inventory/')({
  component: InventoryIndex,
});

type Filter = 'all' | 'low' | 'archived';

function InventoryIndex() {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<Id<'ingredients'> | null>(null);
  const [adjustId, setAdjustId] = useState<Id<'ingredients'> | null>(null);

  const ingredients = useQuery(api.ingredients.list, {
    includeArchived: filter === 'archived',
  });

  const visible = useMemo(() => {
    if (!ingredients) return [];
    let rows = ingredients;
    if (filter === 'low') {
      rows = rows.filter((r) => r.currentStockQty < r.reorderThreshold && !r.archived);
    } else if (filter === 'archived') {
      rows = rows.filter((r) => r.archived);
    } else {
      rows = rows.filter((r) => !r.archived);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    }
    return rows;
  }, [ingredients, filter, search]);

  const isLoading = ingredients === undefined;

  return (
    <main className="max-w-5xl mx-auto p-6">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Inventaris</h1>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          + Tambah Bahan
        </Button>
      </header>

      <div className="flex items-center gap-2 mb-3">
        <Input
          placeholder="Cari bahan…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          Semua
        </FilterChip>
        <FilterChip active={filter === 'low'} onClick={() => setFilter('low')}>
          Stok rendah
        </FilterChip>
        <FilterChip active={filter === 'archived'} onClick={() => setFilter('archived')}>
          Arsip
        </FilterChip>
      </div>

      {isLoading ? (
        <div className="flex gap-2 text-fg-muted items-center">
          <Spinner />
          <span>Memuat…</span>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-fg-muted">
          {filter === 'low'
            ? 'Tidak ada bahan dengan stok rendah.'
            : filter === 'archived'
              ? 'Tidak ada bahan diarsipkan.'
              : 'Belum ada bahan. Tambah bahan pertama untuk mulai melacak stok.'}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-fg-muted border-b border-border">
              <th className="py-2 px-2">Nama</th>
              <th className="py-2 px-2 w-32 text-right">Stok</th>
              <th className="py-2 px-2 w-24 text-right">Ambang</th>
              <th className="py-2 px-2 w-32 text-right">Biaya / satuan</th>
              <th className="py-2 px-2 w-32">Status</th>
              <th className="py-2 px-2 w-32" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const low = row.currentStockQty < row.reorderThreshold && !row.archived;
              return (
                <tr
                  key={row._id}
                  className={`border-b border-border/50 hover:bg-surface ${low ? 'bg-amber-50' : ''}`}
                >
                  <td className="py-2 px-2">
                    {low ? <span className="mr-1">⚠</span> : null}
                    {row.name}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {row.currentStockQty} {row.canonicalUnit}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {row.reorderThreshold} {row.canonicalUnit}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {formatIDR(row.lastCostPerUnitIDR)}
                  </td>
                  <td className="py-2 px-2 text-xs">
                    {row.archived ? (
                      <span className="text-fg-muted">● Arsip</span>
                    ) : low ? (
                      <span className="text-amber-700">● Rendah</span>
                    ) : (
                      <span className="text-brand-600">● Aktif</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAdjustId(row._id)}
                    >
                      Catat Stok
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditId(row._id)}
                    >
                      Ubah
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <IngredientForm
        open={createOpen || editId !== null}
        ingredientId={editId}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditId(null);
          }
        }}
      />
      <StockAdjustDialog
        open={adjustId !== null}
        ingredientId={adjustId}
        onOpenChange={(open) => {
          if (!open) setAdjustId(null);
        }}
      />
    </main>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-sm px-3 py-1.5 rounded-md ${
        active
          ? 'bg-brand-50 text-brand-700 font-medium'
          : 'text-fg-muted hover:bg-surface hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}
```

> Note: this references `<IngredientForm>` and `<StockAdjustDialog>` which are created in Tasks 9 and 10. Typecheck will fail at this point. Bundle Tasks 8–10 commits together OR write stub files first.

- [ ] **Step 3: To unblock typecheck, write minimal stubs for the two missing components.**

`src/components/inventory/ingredient-form.tsx`:

```tsx
import type { Id } from 'convex/_generated/dataModel';

export function IngredientForm(_props: {
  open: boolean;
  ingredientId: Id<'ingredients'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  return null;
}
```

`src/components/inventory/stock-adjust-dialog.tsx`:

```tsx
import type { Id } from 'convex/_generated/dataModel';

export function StockAdjustDialog(_props: {
  open: boolean;
  ingredientId: Id<'ingredients'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  return null;
}
```

These stubs make the inventory page typecheck. Tasks 9 and 10 replace them.

- [ ] **Step 4: Regenerate route tree.**

Run: `pnpm exec convex dev --once` to ensure the API types are fresh, then start `pnpm dev` briefly to let TanStack Start regenerate `src/routeTree.gen.ts`. Kill the dev server.

- [ ] **Step 5: Typecheck.**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit Tasks 7 + 8 together.**

```bash
git add src/components/pos-nav.tsx src/routes/_pos/inventory \
        src/components/inventory/ingredient-form.tsx \
        src/components/inventory/stock-adjust-dialog.tsx \
        src/routeTree.gen.ts
git commit -m "feat(slice-4): /inventory route shell + nav link + component stubs"
```

---

## Task 9: `<IngredientForm>` — create/edit dialog

**Files:**
- Modify: `src/components/inventory/ingredient-form.tsx` (replace the stub)

- [ ] **Step 1: Replace the stub with the real component.**

```tsx
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useEffect, useState } from 'react';
import { ConfirmArchive } from '~/components/menu/confirm-archive';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';

type CanonicalUnit = 'g' | 'ml' | 'piece';

const UNIT_LABELS: Record<CanonicalUnit, string> = {
  g: 'Gram (g)',
  ml: 'Mililiter (ml)',
  piece: 'Buah (pcs)',
};

export function IngredientForm({
  open,
  ingredientId,
  onOpenChange,
}: {
  open: boolean;
  ingredientId: Id<'ingredients'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = ingredientId !== null;
  const existing = useQuery(
    api.ingredients.get,
    isEdit && ingredientId ? { id: ingredientId } : 'skip'
  );
  const upsert = useMutation(api.ingredients.upsert);
  const archive = useMutation(api.ingredients.archive);

  const [name, setName] = useState('');
  const [unit, setUnit] = useState<CanonicalUnit>('ml');
  const [reorderThreshold, setReorderThreshold] = useState<string>('0');
  const [lastCostPerUnitIDR, setLastCostPerUnitIDR] = useState<string>('0');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && existing) {
      setName(existing.name);
      setUnit(existing.canonicalUnit);
      setReorderThreshold(String(existing.reorderThreshold));
      setLastCostPerUnitIDR(String(existing.lastCostPerUnitIDR));
    } else if (open && !isEdit) {
      setName('');
      setUnit('ml');
      setReorderThreshold('0');
      setLastCostPerUnitIDR('0');
    }
    setError(null);
  }, [open, isEdit, existing]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await upsert({
        id: ingredientId ?? undefined,
        name,
        canonicalUnit: unit,
        reorderThreshold: Number.parseInt(reorderThreshold, 10) || 0,
        lastCostPerUnitIDR: Number.parseInt(lastCostPerUnitIDR, 10) || 0,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan bahan.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Ubah bahan' : 'Tambah bahan'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ing-name">Nama</FieldLabel>
              <Input
                id="ing-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ing-unit">Satuan</FieldLabel>
              <Select value={unit} onValueChange={(v) => setUnit(v as CanonicalUnit)}>
                <SelectTrigger id="ing-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['g', 'ml', 'piece'] as CanonicalUnit[]).map((u) => (
                    <SelectItem key={u} value={u}>
                      {UNIT_LABELS[u]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="ing-threshold">Ambang isi ulang</FieldLabel>
              <Input
                id="ing-threshold"
                type="number"
                min="0"
                step="1"
                value={reorderThreshold}
                onChange={(e) => setReorderThreshold(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ing-cost">Biaya per satuan (Rp)</FieldLabel>
              <Input
                id="ing-cost"
                type="number"
                min="0"
                step="1"
                value={lastCostPerUnitIDR}
                onChange={(e) => setLastCostPerUnitIDR(e.target.value)}
                required
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            {isEdit && ingredientId ? (
              <ConfirmArchive
                noun="bahan"
                name={existing?.name ?? ''}
                trigger={
                  <Button type="button" variant="ghost" className="text-fg-muted mr-auto">
                    Arsipkan
                  </Button>
                }
                onConfirm={async () => {
                  await archive({ id: ingredientId });
                  onOpenChange(false);
                }}
              />
            ) : null}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck.**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add src/components/inventory/ingredient-form.tsx
git commit -m "feat(slice-4): IngredientForm — create/edit + archive"
```

---

## Task 10: `<StockAdjustDialog>` — Catat Stok modal

**Files:**
- Modify: `src/components/inventory/stock-adjust-dialog.tsx` (replace the stub)

- [ ] **Step 1: Replace the stub.**

```tsx
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';

const REASONS = [
  'Pengiriman masuk',
  'Stok opname',
  'Limbah',
  'Koreksi',
] as const;

export function StockAdjustDialog({
  open,
  ingredientId,
  onOpenChange,
}: {
  open: boolean;
  ingredientId: Id<'ingredients'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const ingredient = useQuery(
    api.ingredients.get,
    ingredientId ? { id: ingredientId } : 'skip'
  );
  const adjustStock = useMutation(api.ingredients.adjustStock);

  const [newQty, setNewQty] = useState('');
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && ingredient) {
      setNewQty(String(ingredient.currentStockQty));
      setReason(REASONS[0]);
      setNote('');
      setError(null);
    }
  }, [open, ingredient]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ingredientId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await adjustStock({
        ingredientId,
        newQty: Number.parseInt(newQty, 10) || 0,
        reasonLabel: reason,
        note: note.trim() ? note.trim() : undefined,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mencatat stok.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!ingredient && open) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <p className="text-fg-muted">Memuat…</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catat stok: {ingredient?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <div className="rounded-md bg-surface px-3 py-2 text-sm">
              Stok saat ini:{' '}
              <span className="font-semibold tabular-nums">
                {ingredient?.currentStockQty} {ingredient?.canonicalUnit}
              </span>
            </div>
            <Field>
              <FieldLabel htmlFor="adj-qty">Stok baru ({ingredient?.canonicalUnit})</FieldLabel>
              <Input
                id="adj-qty"
                type="number"
                min="0"
                step="1"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="adj-reason">Alasan</FieldLabel>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="adj-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="adj-note">Catatan (opsional)</FieldLabel>
              <Input
                id="adj-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck + commit.**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add src/components/inventory/stock-adjust-dialog.tsx
git commit -m "feat(slice-4): StockAdjustDialog — Catat Stok modal"
```

---

## Task 11: `<IngredientPicker>` — combobox over ingredients

**Files:**
- Create: `src/components/inventory/ingredient-picker.tsx`

- [ ] **Step 1: Create the picker.**

```tsx
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { useMemo, useRef, useState } from 'react';
import { Input } from '~/components/ui/input';

export function IngredientPicker({
  value,
  onChange,
  onRequestCreate,
}: {
  value: Id<'ingredients'> | null;
  onChange: (id: Id<'ingredients'>) => void;
  onRequestCreate?: (initialName: string) => void;
}) {
  const ingredients = useQuery(api.ingredients.list, {});
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = useMemo(() => {
    if (!ingredients || !value) return null;
    return ingredients.find((i) => i._id === value) ?? null;
  }, [ingredients, value]);

  const matches = useMemo(() => {
    if (!ingredients) return [];
    const q = search.toLowerCase();
    return (q ? ingredients.filter((i) => i.name.toLowerCase().includes(q)) : ingredients).slice(
      0,
      8
    );
  }, [ingredients, search]);

  const showList = focused && (search.length > 0 || !value);

  return (
    <div className="relative">
      <Input
        value={search || (selected?.name ?? '')}
        placeholder="Pilih bahan…"
        onChange={(e) => {
          setSearch(e.target.value);
        }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        onBlur={() => {
          // Delay so onMouseDown of a list item still fires.
          blurTimer.current = setTimeout(() => setFocused(false), 150);
        }}
      />
      {showList ? (
        <ul className="absolute z-10 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-bg shadow-md">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-fg-muted">Tidak ada bahan cocok.</li>
          ) : (
            matches.map((ing) => (
              <li key={ing._id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface"
                  onMouseDown={() => {
                    onChange(ing._id);
                    setSearch('');
                    setFocused(false);
                  }}
                >
                  {ing.name}{' '}
                  <span className="text-fg-muted text-xs">
                    ({ing.currentStockQty} {ing.canonicalUnit})
                  </span>
                </button>
              </li>
            ))
          )}
          {onRequestCreate && search.trim() ? (
            <li className="border-t border-border">
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-brand-700 hover:bg-surface"
                onMouseDown={() => {
                  onRequestCreate(search.trim());
                  setSearch('');
                  setFocused(false);
                }}
              >
                + Buat bahan baru: "{search.trim()}"
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck.**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add src/components/inventory/ingredient-picker.tsx
git commit -m "feat(slice-4): IngredientPicker — combobox with create-new affordance"
```

---

## Task 12: `<RecipeEditor>` — inline on menu item edit page

**Files:**
- Create: `src/components/inventory/recipe-editor.tsx`
- Modify: `src/routes/_pos/menu/items.$itemId.tsx`

- [ ] **Step 1: Create `src/components/inventory/recipe-editor.tsx`.**

```tsx
import { api } from 'convex/_generated/api';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import { IngredientPicker } from '~/components/inventory/ingredient-picker';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { costPerCupIDR } from '~/lib/inventory';
import { formatIDR } from '~/lib/money';

type DraftLine = {
  key: string;
  ingredientId: Id<'ingredients'> | null;
  qty: string;
  wastageFactor: string;
};

function makeKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function RecipeEditor({ menuItemId }: { menuItemId: Id<'menuItems'> }) {
  const recipe = useQuery(api.recipes.getForItem, { menuItemId });
  const ingredients = useQuery(api.ingredients.list, {});
  const upsert = useMutation(api.recipes.upsert);

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (recipe && recipe.lines.length > 0) {
      setLines(
        recipe.lines.map((l) => ({
          key: makeKey(),
          ingredientId: l.ingredient._id,
          qty: String(l.qty),
          wastageFactor: String(l.wastageFactor),
        }))
      );
    } else {
      setLines([]);
    }
  }, [recipe]);

  const ingredientsById = useMemo(() => {
    const map = new Map<Id<'ingredients'>, Doc<'ingredients'>>();
    for (const ing of ingredients ?? []) {
      map.set(ing._id, ing);
    }
    return map;
  }, [ingredients]);

  const costPreview = useMemo(() => {
    const validLines = lines
      .filter((l) => l.ingredientId !== null)
      .map((l) => ({
        ingredientId: l.ingredientId as Id<'ingredients'>,
        qty: Number.parseFloat(l.qty) || 0,
        wastageFactor: Number.parseFloat(l.wastageFactor) || 1.0,
      }));
    return costPerCupIDR(validLines, ingredientsById);
  }, [lines, ingredientsById]);

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: makeKey(), ingredientId: null, qty: '0', wastageFactor: '1.0' },
    ]);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function patchLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function save() {
    setSubmitting(true);
    setError(null);
    setSavedAt(null);
    try {
      const payload = lines
        .filter((l) => l.ingredientId !== null)
        .map((l) => ({
          ingredientId: l.ingredientId as Id<'ingredients'>,
          qty: Number.parseFloat(l.qty) || 0,
          wastageFactor: Number.parseFloat(l.wastageFactor) || 1.0,
        }));
      await upsert({ menuItemId, lines: payload });
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan resep.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-10 pt-6 border-t border-border">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-bold">Resep</h2>
        <span className="text-sm text-fg-muted">
          ≈ <span className="font-semibold tabular-nums">{formatIDR(costPreview)}</span> / porsi
        </span>
      </div>

      {recipe === undefined || ingredients === undefined ? (
        <p className="text-fg-muted">Memuat…</p>
      ) : (
        <>
          {lines.length === 0 ? (
            <p className="text-fg-muted text-sm mb-3">
              Belum ada resep. Item tetap bisa dijual, tapi stok bahan tidak berkurang otomatis.
            </p>
          ) : (
            <FieldGroup>
              {lines.map((line) => (
                <div key={line.key} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field>
                      <FieldLabel>Bahan</FieldLabel>
                      <IngredientPicker
                        value={line.ingredientId}
                        onChange={(id) => patchLine(line.key, { ingredientId: id })}
                      />
                    </Field>
                  </div>
                  <div className="w-28">
                    <Field>
                      <FieldLabel>Jumlah</FieldLabel>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.qty}
                        onChange={(e) => patchLine(line.key, { qty: e.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="w-24">
                    <Field>
                      <FieldLabel>Wastage</FieldLabel>
                      <Input
                        type="number"
                        min="1"
                        max="5"
                        step="0.1"
                        value={line.wastageFactor}
                        onChange={(e) =>
                          patchLine(line.key, { wastageFactor: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLine(line.key)}
                    className="mb-1"
                    aria-label="Hapus baris"
                  >
                    ×
                  </Button>
                </div>
              ))}
            </FieldGroup>
          )}

          <div className="flex items-center gap-2 mt-4">
            <Button type="button" variant="outline" onClick={addLine}>
              + Tambah bahan
            </Button>
            <div className="ml-auto flex items-center gap-3">
              {savedAt ? <span className="text-xs text-brand-700">Tersimpan.</span> : null}
              <Button type="button" onClick={save} disabled={submitting}>
                {submitting && <Spinner data-icon="inline-start" />}
                {submitting ? 'Menyimpan…' : 'Simpan resep'}
              </Button>
            </div>
          </div>
          {error && <FieldError>{error}</FieldError>}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Wire `<RecipeEditor>` into the menu item edit page** by patching `src/routes/_pos/menu/items.$itemId.tsx`.

Add the import at the top:

```tsx
import { RecipeEditor } from '~/components/inventory/recipe-editor';
```

Then inside the existing JSX, after `<ItemEditForm … />`, add (only when not `isNew`):

```tsx
        {!isNew ? <RecipeEditor menuItemId={itemId as Id<'menuItems'>} /> : null}
```

The new item flow doesn't get a recipe editor until after first save (the recipe needs a valid `menuItemId`). After saving a new item, the route navigates to `/menu` (existing behavior), then the owner can click the item to come back and add a recipe.

- [ ] **Step 3: Typecheck + commit.**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add src/components/inventory/recipe-editor.tsx src/routes/_pos/menu/items.$itemId.tsx
git commit -m "feat(slice-4): RecipeEditor inline on item edit + live cost preview"
```

---

## Task 13: `<ItemCard>` low-stock warning

**Files:**
- Modify: `src/components/sale/item-card.tsx`
- Modify: `src/components/sale/menu-pane.tsx`

- [ ] **Step 1: Patch `<ItemCard>`** to accept and render the warning.

Replace the entire current `src/components/sale/item-card.tsx`:

```tsx
import type { Doc } from 'convex/_generated/dataModel';
import { formatIDR } from '~/lib/money';

export function ItemCard({
  item,
  hasModifiers,
  lowStockIngredientNames,
  onTap,
}: {
  item: Doc<'menuItems'>;
  hasModifiers: boolean;
  lowStockIngredientNames: string[];
  onTap: () => void;
}) {
  const isLow = lowStockIngredientNames.length > 0;
  return (
    <button
      type="button"
      onClick={onTap}
      title={isLow ? `Stok rendah: ${lowStockIngredientNames.join(', ')}` : undefined}
      className={`text-left rounded-md border p-3 hover:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
        isLow ? 'border-amber-400 bg-amber-50/30' : 'border-border bg-bg'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="font-medium leading-tight">{item.name}</div>
        {isLow ? <span aria-label="Stok rendah">⚠</span> : null}
      </div>
      <div className="text-sm text-fg-muted mt-1">{formatIDR(item.priceIDR)}</div>
      {hasModifiers ? (
        <div className="mt-2 inline-block text-[10px] uppercase tracking-wide text-brand-700 bg-brand-50 rounded px-1.5 py-0.5">
          Pilihan
        </div>
      ) : null}
    </button>
  );
}
```

- [ ] **Step 2: Patch `<MenuPane>`** to pass through the new prop.

In `src/components/sale/menu-pane.tsx`, find:

```tsx
            {visible.map((row) => (
              <ItemCard
                key={row.item._id}
                item={row.item}
                hasModifiers={row.attachedGroups.length > 0}
                onTap={() => onItemTap(row)}
              />
            ))}
```

Replace with:

```tsx
            {visible.map((row) => (
              <ItemCard
                key={row.item._id}
                item={row.item}
                hasModifiers={row.attachedGroups.length > 0}
                lowStockIngredientNames={row.lowStockIngredientNames}
                onTap={() => onItemTap(row)}
              />
            ))}
```

Also update the exported `ItemForSale` type in the same file to add the field:

```ts
export type ItemForSale = {
  item: Doc<'menuItems'>;
  attachedGroups: Array<{
    group: Doc<'modifierGroups'>;
    options: Doc<'modifierOptions'>[];
    position: number;
  }>;
  lowStockIngredientNames: string[];      // NEW
};
```

- [ ] **Step 3: Typecheck.**

Run: `pnpm typecheck`
Expected: PASS — `listForSale` already returns the new field; `<SaleScreen>` consumes the same `ItemForSale` type.

- [ ] **Step 4: Commit.**

```bash
git add src/components/sale/item-card.tsx src/components/sale/menu-pane.tsx
git commit -m "feat(slice-4): ItemCard low-stock warning + tooltip"
```

---

## Task 14: Auth-gated E2E happy path

**Files:**
- Create: `tests/e2e/inventory.spec.ts`

- [ ] **Step 1: Create the spec.**

```ts
import { expect, test } from '@playwright/test';
import { gotoHydrated, waitForUrlHydrated } from './_helpers';

test.describe('inventory + recipes (auth-gated)', () => {
  test.skip(!process.env.RUN_AUTH_E2E, 'set RUN_AUTH_E2E=1 to run');
  test.setTimeout(180_000);

  test('signup → add ingredient → add recipe → open shift → cash sale → stock decreased', async ({ page }) => {
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    // 1. Signup
    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Owner');
    await page.getByLabel('Nama kafe').fill('Kopi E2E S4');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    // 2. Onboarding/profile
    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByLabel('Persentase PPN').fill('11');
    await page.getByRole('button', { name: /Lanjut/ }).click();

    // 3. Onboarding/menu — add category + item
    await waitForUrlHydrated(page, /\/onboarding\/menu$/);
    await page.getByRole('button', { name: /Mulai dengan kategori/ }).click();
    await waitForUrlHydrated(page, /\/menu\/categories$/);
    await page.getByLabel('Nama kategori baru').fill('Kopi');
    await page.getByRole('button', { name: /\+ Tambah/ }).click();
    await page.getByRole('link', { name: 'Items' }).click();
    await page.getByRole('link', { name: /\+ Item/ }).click();
    await page.getByLabel('Nama').fill('Espresso');
    await page.getByLabel('Kategori').selectOption({ label: 'Kopi' });
    await page.getByLabel('Harga (Rp)').fill('18000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // 4. Onboarding/cashier
    await page.goto('/onboarding/cashier');
    await waitForUrlHydrated(page, /\/onboarding\/cashier$/);
    await page.getByRole('button', { name: /Atur PIN/ }).click();
    for (const digit of '1234') {
      await page.keyboard.type(digit);
    }
    await expect(page.getByRole('button', { name: /Ganti PIN/ })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /Selesai/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // 5. /inventory: add Susu
    await page.goto('/inventory');
    await waitForUrlHydrated(page, /\/inventory$/);
    await page.getByRole('button', { name: /\+ Tambah Bahan/ }).click();
    await page.getByLabel('Nama').fill('Susu');
    // Unit select - shadcn Select. Click trigger then pick the option.
    await page.getByLabel('Satuan').click();
    await page.getByRole('option', { name: /Mililiter/ }).click();
    await page.getByLabel('Ambang isi ulang').fill('500');
    await page.getByLabel('Biaya per satuan').fill('25');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Susu/)).toBeVisible();

    // 6. /menu - find the Espresso item link and click into recipe editor
    await page.getByRole('link', { name: /Menu/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);
    await page.getByRole('link', { name: /Espresso/ }).click();
    await expect(page).toHaveURL(/\/menu\/items\/[^/]+$/);

    // 7. Add recipe line
    await page.getByRole('button', { name: /\+ Tambah bahan/ }).click();
    // Click the new picker and choose Susu
    await page.getByPlaceholder('Pilih bahan…').click();
    await page.getByRole('button', { name: /^Susu/ }).click();
    await page.getByLabel('Jumlah').fill('200');
    await expect(page.getByText(/Rp 5\.000/).first()).toBeVisible();
    await page.getByRole('button', { name: /Simpan resep/ }).click();
    await expect(page.getByText(/Tersimpan/).first()).toBeVisible();

    // 8. Pin gate + open shift
    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/pin$/);
    await page.getByRole('button', { name: /E2E Owner/ }).click();
    for (const digit of '1234') {
      await page.keyboard.type(digit);
    }
    await waitForUrlHydrated(page, /\/shift\/open$/);
    await page.getByLabel('Modal awal').fill('100000');
    await page.getByRole('button', { name: /Buka Shift/ }).click();
    await waitForUrlHydrated(page, /\/shift\/close$/);

    // 9. Sale
    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/sale$/);
    await page.getByRole('button', { name: /Espresso/ }).click();
    await page.getByRole('button', { name: /^Bayar$/ }).click();
    await page.getByRole('button', { name: /^100k$/ }).click();
    await page.getByRole('button', { name: /Konfirmasi/ }).click();
    await expect(page.getByText(/Rp 19\.980/).first()).toBeVisible();
    await page.getByRole('button', { name: /Selesai/ }).click();

    // 10. /inventory — Susu stock now -200 (started at 0)
    await page.goto('/inventory');
    await waitForUrlHydrated(page, /\/inventory$/);
    await expect(page.getByText(/-200 ml/)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the E2E suite.**

Run: `RUN_AUTH_E2E=1 pnpm test:e2e tests/e2e/inventory.spec.ts`
Expected: PASS.

If selectors fail (label text mismatch, button accessible name differs), adjust the selectors to match what's rendered. Do not change feature behavior.

- [ ] **Step 3: Run full quality gate.**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: ALL PASS. (`pnpm lint` may OOM under Biome — skip if so.)

- [ ] **Step 4: Commit.**

```bash
git add tests/e2e/inventory.spec.ts
git commit -m "test(e2e): inventory happy path — ingredient + recipe + sale + deduction"
```

---

## After all tasks

Self-review against the spec:

**Spec coverage:**

- ✅ `ingredients` table + CRUD — Tasks 1, 3
- ✅ `recipes` table + per-item upsert — Tasks 1, 4
- ✅ `inventoryMovements` event-sourced table — Tasks 1, 2 (helper)
- ✅ `recipeSnapshot` on orders.lines — Tasks 1, 5
- ✅ Auto-deduct on cash sale — Task 5
- ✅ Manual stock adjustment — Tasks 3, 10
- ✅ Cost-per-cup live preview — Tasks 2, 12
- ✅ Wastage factor — Tasks 1, 4, 12
- ✅ Low-stock per-item warning on /sale — Tasks 6, 13
- ✅ /inventory page — Tasks 7, 8
- ✅ Recipe editor inline on item edit — Task 12
- ✅ Tenant isolation across all functions — covered by `requireOwnerCafe` + `requireOwned` in every handler
- ✅ Idempotency of inventory deduction — Task 5
- ✅ E2E happy path — Task 14

After all tasks complete:

- Use `superpowers:finishing-a-development-branch` to do the final review + open the PR against `main`.
