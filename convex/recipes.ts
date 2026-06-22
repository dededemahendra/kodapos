import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { requireOwned, requireActiveOutlet } from './lib/auth';

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

const recipeCatalogRow = v.object({
  itemId: v.id('menuItems'),
  name: v.string(),
  priceIDR: v.number(),
  hasRecipe: v.boolean(),
  lineCount: v.number(),
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
    const { cafeId } = await requireActiveOutlet(ctx);
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

export const listForCatalog = query({
  args: {},
  returns: v.array(recipeCatalogRow),
  handler: async (ctx) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    // Non-archived items; per-item recipe + ingredient reads (café-scale,
    // dozens of items). Cost mirrors getForItem.
    const items = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    const out = [];
    for (const item of items) {
      if (item.archived) continue;
      const recipe = await ctx.db
        .query('recipes')
        .withIndex('by_cafe_item', (q) =>
          q.eq('cafeId', cafeId).eq('menuItemId', item._id)
        )
        .unique();
      let lineCount = 0;
      let costPerCupIDR = 0;
      if (recipe) {
        lineCount = recipe.lines.length;
        let cost = 0;
        for (const line of recipe.lines) {
          const ing = await ctx.db.get(line.ingredientId);
          if (!ing || ing.cafeId !== cafeId) continue;
          cost += line.qty * line.wastageFactor * ing.lastCostPerUnitIDR;
        }
        costPerCupIDR = Math.round(cost);
      }
      out.push({
        itemId: item._id,
        name: item.name,
        priceIDR: item.priceIDR,
        hasRecipe: recipe !== null,
        lineCount,
        costPerCupIDR,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
    return out;
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
    const { cafeId } = await requireActiveOutlet(ctx);
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
