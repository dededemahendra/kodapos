import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
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
