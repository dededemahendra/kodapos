import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
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
    const { cafeId } = await requireOwnerCafe(ctx);
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
