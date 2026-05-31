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

describe('recipes.listForCatalog', () => {
  it('returns each non-archived item with recipe status + cost-per-cup', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId, susuId } = await setup(t);
    // Item with a recipe: 200 ml × 1.0 × Rp 25 = Rp 5.000.
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
    });
    const rows = await asOwner.query(api.recipes.listForCatalog, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Espresso');
    expect(rows[0]?.priceIDR).toBe(18000);
    expect(rows[0]?.hasRecipe).toBe(true);
    expect(rows[0]?.lineCount).toBe(1);
    expect(rows[0]?.costPerCupIDR).toBe(5000);
  });

  it('reports items without a recipe as hasRecipe=false, cost 0', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const rows = await asOwner.query(api.recipes.listForCatalog, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hasRecipe).toBe(false);
    expect(rows[0]?.lineCount).toBe(0);
    expect(rows[0]?.costPerCupIDR).toBe(0);
  });

  it('excludes archived items', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId } = await setup(t);
    await asOwner.mutation(api.menu.items.archive, { id: itemId });
    expect(await asOwner.query(api.recipes.listForCatalog, {})).toHaveLength(0);
  });

  it("does not return another cafe's items", async () => {
    const t = convexTest(schema, modules);
    await setup(t); // owner A (o@x.com) with an item
    const otherUserId = await t.run(async (ctx) =>
      ctx.db.insert('users', { name: 'B', email: 'b@x.com' })
    );
    const ownerB = t.withIdentity({ subject: `${otherUserId}|test_session` });
    await ownerB.mutation(api.cafes.createForOwner, { name: 'Cafe B' });
    expect(await ownerB.query(api.recipes.listForCatalog, {})).toHaveLength(0);
  });
});
