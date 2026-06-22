import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireActiveOutlet } from './lib/auth';
import { currentStockQty } from './lib/inventory';

const wasteReason = v.union(
  v.literal('rusak'),
  v.literal('basi'),
  v.literal('tumpah'),
  v.literal('salah_masak'),
  v.literal('lainnya')
);

export const record = mutation({
  args: {
    ingredientId: v.id('ingredients'),
    qtyWasted: v.number(),
    wasteReason,
    note: v.optional(v.string()),
  },
  returns: v.id('inventoryMovements'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const ing = await requireOwned(ctx, cafeId, args.ingredientId, 'Bahan');
    if (!Number.isInteger(args.qtyWasted) || args.qtyWasted < 1) {
      throw new Error('Jumlah limbah harus bilangan bulat ≥ 1.');
    }
    const current = await currentStockQty(ctx, cafeId, args.ingredientId);
    if (args.qtyWasted > current) {
      throw new Error('Jumlah limbah melebihi stok saat ini.');
    }
    const note = args.note?.trim();
    return await ctx.db.insert('inventoryMovements', {
      cafeId,
      ingredientId: args.ingredientId,
      delta: -args.qtyWasted,
      reason: 'waste',
      wasteReason: args.wasteReason,
      costPerUnitIDR: ing.lastCostPerUnitIDR,
      ...(note ? { note } : {}),
      at: Date.now(),
    });
  },
});

const wasteRow = v.object({
  id: v.id('inventoryMovements'),
  at: v.number(),
  ingredientName: v.string(),
  unit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
  qtyWasted: v.number(),
  wasteReason,
  note: v.optional(v.string()),
  costPerUnitIDR: v.number(),
  totalCostIDR: v.number(),
});

const DAY_MS = 86_400_000;

export const recent = query({
  args: { days: v.optional(v.number()) },
  returns: v.array(wasteRow),
  handler: async (ctx, { days = 30 }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    // Exclusive lower bound: a 0-day window excludes everything (the cutoff
    // instant itself is not "within the last N days"), and a row recorded in
    // the same millisecond as the query can't leak in.
    const cutoff = Date.now() - days * DAY_MS;
    const movements = await ctx.db
      .query('inventoryMovements')
      .withIndex('by_cafe_reason_at', (q) =>
        q.eq('cafeId', cafeId).eq('reason', 'waste').gt('at', cutoff)
      )
      .order('desc')
      .collect();

    const info = new Map<string, { name: string; unit: 'g' | 'ml' | 'piece' }>();
    const out = [];
    for (const m of movements) {
      let ing = info.get(m.ingredientId);
      if (!ing) {
        const doc = await ctx.db.get(m.ingredientId);
        ing = { name: doc?.name ?? '—', unit: doc?.canonicalUnit ?? 'piece' };
        info.set(m.ingredientId, ing);
      }
      const qtyWasted = -m.delta;
      const costPerUnitIDR = m.costPerUnitIDR ?? 0;
      out.push({
        id: m._id,
        at: m.at,
        ingredientName: ing.name,
        unit: ing.unit,
        qtyWasted,
        wasteReason: m.wasteReason ?? 'lainnya',
        ...(m.note ? { note: m.note } : {}),
        costPerUnitIDR,
        totalCostIDR: Math.round(qtyWasted * costPerUnitIDR),
      });
    }
    return out;
  },
});
