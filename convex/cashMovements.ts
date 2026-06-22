import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireActiveOutlet } from './lib/auth';

function assertIDR(n: number, label: string): number {
  if (!Number.isInteger(n)) throw new Error(`${label} harus berupa angka bulat (rupiah).`);
  if (n <= 0) throw new Error(`${label} harus lebih dari nol.`);
  return n;
}

export const record = mutation({
  args: {
    direction: v.union(v.literal('in'), v.literal('out')),
    amountIDR: v.number(),
    note: v.optional(v.string()),
  },
  returns: v.id('cashMovements'),
  handler: async (ctx, { direction, amountIDR, note }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const shift = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .first();
    if (!shift) throw new Error('Tidak ada shift terbuka.');
    const amount = assertIDR(amountIDR, 'Jumlah kas');
    const trimmed = note?.trim();
    return await ctx.db.insert('cashMovements', {
      cafeId,
      shiftId: shift._id,
      cashierId: shift.cashierId,
      direction,
      amountIDR: amount,
      ...(trimmed ? { note: trimmed } : {}),
      at: Date.now(),
    });
  },
});

export const listForShift = query({
  args: { shiftId: v.id('shifts') },
  returns: v.array(
    v.object({
      _id: v.id('cashMovements'),
      direction: v.union(v.literal('in'), v.literal('out')),
      amountIDR: v.number(),
      note: v.optional(v.string()),
      at: v.number(),
    })
  ),
  handler: async (ctx, { shiftId }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const rows = await ctx.db
      .query('cashMovements')
      .withIndex('by_shift', (q) => q.eq('shiftId', shiftId))
      .collect();
    return rows
      .filter((m) => m.cafeId === cafeId)
      .sort((a, b) => b.at - a.at)
      .map((m) => ({
        _id: m._id,
        direction: m.direction,
        amountIDR: m.amountIDR,
        ...(m.note !== undefined ? { note: m.note } : {}),
        at: m.at,
      }));
  },
});
