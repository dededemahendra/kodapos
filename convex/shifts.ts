import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { cashCollectedIDR, methodTotals } from './lib/payment';
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

async function shiftCashBreakdown(ctx: QueryCtx | MutationCtx, shift: Doc<'shifts'>) {
  const orders = await ctx.db
    .query('orders')
    .withIndex('by_shift', (q) => q.eq('shiftId', shift._id))
    .collect();
  const cashSalesIDR = orders
    .filter((o) => o.paymentStatus === 'paid')
    .reduce((s, o) => s + cashCollectedIDR(o), 0);
  const movements = await ctx.db
    .query('cashMovements')
    .withIndex('by_shift', (q) => q.eq('shiftId', shift._id))
    .collect();
  let cashInIDR = 0;
  let cashOutIDR = 0;
  for (const m of movements) {
    if (m.direction === 'in') cashInIDR += m.amountIDR;
    else cashOutIDR += m.amountIDR;
  }
  const expectedCashIDR = shift.openingFloatIDR + cashSalesIDR + cashInIDR - cashOutIDR;
  return { cashSalesIDR, cashInIDR, cashOutIDR, expectedCashIDR };
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
    const { expectedCashIDR } = await shiftCashBreakdown(ctx, shift);
    await ctx.db.patch(id, {
      status: 'closed',
      closedAt: Date.now(),
      countedCashIDR: counted,
      expectedCashIDR,
      varianceIDR: counted - expectedCashIDR,
    });
    return null;
  },
});

export const closeoutSummary = query({
  args: { shiftId: v.id('shifts') },
  returns: v.object({
    cashierName: v.string(),
    openingFloatIDR: v.number(),
    cashSalesIDR: v.number(),
    cashInIDR: v.number(),
    cashOutIDR: v.number(),
    expectedCashIDR: v.number(),
    countedCashIDR: v.union(v.number(), v.null()),
    varianceIDR: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, { shiftId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const shift = await requireOwned(ctx, cafeId, shiftId, 'Shift');
    const { cashSalesIDR, cashInIDR, cashOutIDR, expectedCashIDR } = await shiftCashBreakdown(
      ctx,
      shift
    );
    const cashier = await ctx.db.get(shift.cashierId);
    const countedCashIDR = shift.countedCashIDR ?? null;
    return {
      cashierName: cashier?.name ?? '—',
      openingFloatIDR: shift.openingFloatIDR,
      cashSalesIDR,
      cashInIDR,
      cashOutIDR,
      expectedCashIDR,
      countedCashIDR,
      varianceIDR: countedCashIDR !== null ? countedCashIDR - expectedCashIDR : null,
    };
  },
});

const shiftSummary = v.object({
  _id: v.id('shifts'),
  openedAt: v.number(),
  closedAt: v.number(),
  cashierName: v.string(),
  openingFloatIDR: v.number(),
  countedCashIDR: v.union(v.number(), v.null()),
  ordersCount: v.number(),
  salesTotalIDR: v.number(),
  cashSalesIDR: v.number(),
  qrisSalesIDR: v.number(),
  expectedCashIDR: v.number(),
  varianceIDR: v.union(v.number(), v.null()),
});

async function summarizeShift(ctx: QueryCtx, shift: Doc<'shifts'>) {
  const orders = await ctx.db
    .query('orders')
    .withIndex('by_shift', (q) => q.eq('shiftId', shift._id))
    .collect();
  const paid = orders.filter((o) => o.paymentStatus === 'paid');
  let salesTotalIDR = 0;
  let cashSalesIDR = 0;
  let qrisSalesIDR = 0;
  for (const o of paid) {
    salesTotalIDR += o.totalIDR;
    cashSalesIDR += cashCollectedIDR(o);
    // QRIS only — NOT "everything non-cash". Gift-card tenders are a separate
    // method and must not be mislabeled as QRIS in the shift summary (they stay
    // in salesTotalIDR but neither the cash nor the QRIS bucket).
    qrisSalesIDR += methodTotals(o)
      .filter((t) => t.method === 'qris_static' || t.method === 'qris_dynamic')
      .reduce((s, t) => s + t.amountIDR, 0);
  }
  const cashier = await ctx.db.get(shift.cashierId);
  const countedCashIDR = shift.countedCashIDR ?? null;
  const expectedCashIDR = shift.expectedCashIDR ?? shift.openingFloatIDR + cashSalesIDR;
  return {
    _id: shift._id,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt ?? shift.openedAt,
    cashierName: cashier?.name ?? '—',
    openingFloatIDR: shift.openingFloatIDR,
    countedCashIDR,
    ordersCount: paid.length,
    salesTotalIDR,
    cashSalesIDR,
    qrisSalesIDR,
    expectedCashIDR,
    varianceIDR:
      shift.varianceIDR ?? (countedCashIDR !== null ? countedCashIDR - expectedCashIDR : null),
  };
}

export const listClosed = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(shiftSummary),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const result = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'closed'))
      .order('desc')
      .paginate(paginationOpts);
    const page = await Promise.all(result.page.map((s) => summarizeShift(ctx, s)));
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});
