import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireActiveOutlet } from './lib/auth';
import { heldLineValidator, heldPromoValidator } from './lib/heldOrder';
import { orderTypeValidator } from './lib/orderType';

export const hold = mutation({
  args: {
    cashierId: v.id('cafeStaff'),
    label: v.string(),
    orderType: orderTypeValidator,
    lines: v.array(heldLineValidator),
    promo: v.optional(heldPromoValidator),
    tableId: v.optional(v.id('tables')),
  },
  returns: v.id('heldOrders'),
  handler: async (ctx, { cashierId, label, orderType, lines, promo, tableId }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    if (lines.length === 0) throw new Error('Keranjang kosong.');
    await requireOwned(ctx, cafeId, cashierId, 'Kasir');
    const shift = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .first();
    if (!shift) throw new Error('Tidak ada shift terbuka.');
    if (tableId) {
      await requireOwned(ctx, cafeId, tableId, 'Meja');
      const existing = await ctx.db
        .query('heldOrders')
        .withIndex('by_table', (q) => q.eq('tableId', tableId))
        .filter((q) => q.eq(q.field('shiftId'), shift._id))
        .first();
      if (existing) throw new Error('Meja sudah terisi.');
    }
    return await ctx.db.insert('heldOrders', {
      cafeId,
      shiftId: shift._id,
      cashierId,
      label: label.trim(),
      orderType,
      lines,
      ...(promo ? { promo } : {}),
      ...(tableId ? { tableId } : {}),
      createdAt: Date.now(),
    });
  },
});

const heldRow = v.object({
  _id: v.id('heldOrders'),
  label: v.string(),
  orderType: orderTypeValidator,
  lines: v.array(heldLineValidator),
  promo: v.optional(heldPromoValidator),
  tableId: v.optional(v.id('tables')),
  createdAt: v.number(),
});

export const listForShift = query({
  args: { shiftId: v.id('shifts') },
  returns: v.array(heldRow),
  handler: async (ctx, { shiftId }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const rows = await ctx.db
      .query('heldOrders')
      .withIndex('by_shift', (q) => q.eq('shiftId', shiftId))
      .collect();
    return rows
      .filter((r) => r.cafeId === cafeId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        _id: r._id,
        label: r.label,
        orderType: r.orderType,
        lines: r.lines,
        ...(r.promo ? { promo: r.promo } : {}),
        ...(r.tableId ? { tableId: r.tableId } : {}),
        createdAt: r.createdAt,
      }));
  },
});

export const remove = mutation({
  args: { id: v.id('heldOrders') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, id, 'Pesanan ditahan');
    await ctx.db.delete(id);
    return null;
  },
});
