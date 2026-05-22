import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { requireActiveCashier } from './lib/staff';

const shiftWithCashier = v.object({
  _id: v.id('shifts'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  cashierId: v.id('cafeStaff'),
  cashierName: v.string(),
  openedAt: v.number(),
  closedAt: v.optional(v.number()),
  openingFloatIDR: v.number(),
  expectedCashIDR: v.optional(v.number()),
  countedCashIDR: v.optional(v.number()),
  varianceIDR: v.optional(v.number()),
  status: v.union(v.literal('open'), v.literal('closed')),
});

function assertIDR(n: number, label: string): number {
  if (!Number.isInteger(n)) throw new Error(`${label} harus berupa angka bulat (rupiah).`);
  if (n < 0) throw new Error(`${label} tidak boleh negatif.`);
  return n;
}

export const current = query({
  args: {},
  returns: v.union(shiftWithCashier, v.null()),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const open = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .unique();
    if (!open) return null;
    const cashier = await ctx.db.get(open.cashierId);
    return { ...open, cashierName: cashier?.name ?? '—' };
  },
});

export const open = mutation({
  args: { cashierId: v.id('cafeStaff'), openingFloatIDR: v.number() },
  returns: v.id('shifts'),
  handler: async (ctx, { cashierId, openingFloatIDR }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cashier = await requireActiveCashier(ctx, cafeId, cashierId);
    const floatIDR = assertIDR(openingFloatIDR, 'Modal awal');
    const existingOpen = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .unique();
    if (existingOpen) {
      const existingCashier = await ctx.db.get(existingOpen.cashierId);
      const name = existingCashier?.name ?? '—';
      throw new Error(`Shift sudah dibuka oleh ${name}. Tutup dulu sebelum buka baru.`);
    }
    return await ctx.db.insert('shifts', {
      cafeId,
      cashierId: cashier._id,
      openedAt: Date.now(),
      openingFloatIDR: floatIDR,
      status: 'open',
    });
  },
});

export const close = mutation({
  args: { id: v.id('shifts'), countedCashIDR: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, countedCashIDR }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const shift = await requireOwned(ctx, cafeId, id, 'Shift');
    if (shift.status !== 'open') {
      throw new Error('Shift sudah ditutup.');
    }
    const counted = assertIDR(countedCashIDR, 'Uang terhitung');
    await ctx.db.patch(id, {
      status: 'closed',
      closedAt: Date.now(),
      countedCashIDR: counted,
    });
    return null;
  },
});
