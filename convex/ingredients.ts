import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { currentStockQty } from './lib/inventory';

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

const movementRow = v.object({
  id: v.id('inventoryMovements'),
  at: v.number(),
  delta: v.number(),
  reason: v.union(v.literal('sale'), v.literal('adjustment'), v.literal('waste')),
  note: v.optional(v.string()),
  wasteReason: v.optional(
    v.union(
      v.literal('rusak'),
      v.literal('basi'),
      v.literal('tumpah'),
      v.literal('salah_masak'),
      v.literal('lainnya')
    )
  ),
  balanceAfter: v.number(),
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

export const listMovements = query({
  args: { ingredientId: v.id('ingredients') },
  returns: v.object({ rows: v.array(movementRow), truncated: v.boolean() }),
  handler: async (ctx, { ingredientId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, ingredientId, 'Bahan');
    // Oldest→newest so we can accumulate a running balance; the newest row's
    // balance then equals current stock.
    const movements = await ctx.db
      .query('inventoryMovements')
      .withIndex('by_cafe_ingredient_at', (q) =>
        q.eq('cafeId', cafeId).eq('ingredientId', ingredientId)
      )
      .order('asc')
      .collect();
    let balance = 0;
    const withBalance = movements.map((m) => {
      balance += m.delta;
      return {
        id: m._id,
        at: m.at,
        delta: m.delta,
        reason: m.reason,
        ...(m.note ? { note: m.note } : {}),
        ...(m.wasteReason ? { wasteReason: m.wasteReason } : {}),
        balanceAfter: balance,
      };
    });
    const truncated = withBalance.length > 100;
    // Most recent 100, newest first (each keeps its already-correct balance).
    const rows = withBalance.slice(-100).reverse();
    return { rows, truncated };
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
