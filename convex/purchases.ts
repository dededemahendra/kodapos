import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireActiveOutlet } from './lib/auth';

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
    const { cafeId } = await requireActiveOutlet(ctx);
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
    const { cafeId } = await requireActiveOutlet(ctx);
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

const purchaseDetail = v.object({
  id: v.id('purchases'),
  at: v.number(),
  supplierName: v.optional(v.string()),
  totalIDR: v.number(),
  lines: v.array(
    v.object({
      ingredientName: v.string(),
      unit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
      qty: v.number(),
      unitCostIDR: v.number(),
      subtotalIDR: v.number(),
    })
  ),
});

export const get = query({
  args: { id: v.id('purchases') },
  returns: v.union(purchaseDetail, v.null()),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const p = await ctx.db.get(id);
    if (!p || p.cafeId !== cafeId) return null;
    const lines = [];
    for (const line of p.lines) {
      const ing = await ctx.db.get(line.ingredientId);
      lines.push({
        ingredientName: ing?.name ?? '—',
        unit: ing?.canonicalUnit ?? ('piece' as const),
        qty: line.qty,
        unitCostIDR: line.unitCostIDR,
        subtotalIDR: line.qty * line.unitCostIDR,
      });
    }
    return {
      id: p._id,
      at: p.at,
      ...(p.supplierName ? { supplierName: p.supplierName } : {}),
      totalIDR: p.totalIDR,
      lines,
    };
  },
});
