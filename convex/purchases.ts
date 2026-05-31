import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';

const purchaseRow = v.object({
  id: v.id('purchases'),
  at: v.number(),
  supplierName: v.optional(v.string()),
  lineCount: v.number(),
  totalIDR: v.number(),
});

export const recent = query({
  args: { days: v.optional(v.number()) },
  returns: v.array(purchaseRow),
  handler: async (ctx, { days = 30 }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cutoff = Date.now() - days * 86_400_000;
    const purchases = await ctx.db
      .query('purchases')
      .withIndex('by_cafe_at', (q) => q.eq('cafeId', cafeId).gt('at', cutoff))
      .order('desc')
      .collect();
    return purchases.map((p) => ({
      id: p._id,
      at: p.at,
      ...(p.supplierName ? { supplierName: p.supplierName } : {}),
      lineCount: p.lines.length,
      totalIDR: p.totalIDR,
    }));
  },
});

export const record = mutation({
  args: {
    supplierName: v.optional(v.string()),
    lines: v.array(
      v.object({
        ingredientId: v.id('ingredients'),
        qty: v.number(),
        unitCostIDR: v.number(),
      })
    ),
  },
  returns: v.id('purchases'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    if (args.lines.length === 0) {
      throw new Error('Pembelian harus punya minimal satu bahan.');
    }
    for (const line of args.lines) {
      if (!Number.isInteger(line.qty) || line.qty <= 0) {
        throw new Error('Jumlah harus bilangan bulat lebih dari nol.');
      }
      if (!Number.isInteger(line.unitCostIDR) || line.unitCostIDR < 0) {
        throw new Error('Biaya per satuan harus bilangan bulat ≥ 0.');
      }
      const ing = await ctx.db.get(line.ingredientId);
      if (!ing || ing.cafeId !== cafeId || ing.archived) {
        throw new Error('Bahan tidak ditemukan.');
      }
    }
    const totalIDR = args.lines.reduce((sum, l) => sum + l.qty * l.unitCostIDR, 0);
    const now = Date.now();
    const supplierName = args.supplierName?.trim();
    const purchaseId = await ctx.db.insert('purchases', {
      cafeId,
      ...(supplierName ? { supplierName } : {}),
      at: now,
      lines: args.lines,
      totalIDR,
      createdAt: now,
    });
    for (const line of args.lines) {
      await ctx.db.insert('inventoryMovements', {
        cafeId,
        ingredientId: line.ingredientId,
        delta: line.qty,
        reason: 'purchase',
        refType: 'purchase',
        refId: purchaseId as unknown as string,
        at: now,
      });
      await ctx.db.patch(line.ingredientId, { lastCostPerUnitIDR: line.unitCostIDR });
    }
    return purchaseId;
  },
});
