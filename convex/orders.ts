import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireActiveOutlet } from './lib/auth';
import { manualDiscountValidator } from './lib/discount';
import { orderTypeValidator } from './lib/orderType';
import { methodTotals } from './lib/payment';
import { unitRefundIDR } from './lib/refund';
import { buildOrder, reverseSettledSale, saleArgs, saleResult, settleSale } from './lib/sale';
import { rangeArg, resolveRange, tzFor } from './lib/time';

export const createCashSale = mutation({
  args: { ...saleArgs, cashTenderedIDR: v.number() },
  returns: saleResult,
  handler: async (ctx, args) => {
    const res = await buildOrder(ctx, args, { method: 'cash', tenderedIDR: args.cashTenderedIDR });
    await settleSale(ctx, res.orderId);
    return res;
  },
});

export const createQrisStaticSale = mutation({
  args: saleArgs,
  returns: saleResult,
  handler: async (ctx, args) => {
    const res = await buildOrder(ctx, args, { method: 'qris_static' });
    await settleSale(ctx, res.orderId);
    return res;
  },
});

export const createGiftCardSale = mutation({
  args: { ...saleArgs, giftCardCode: v.string() },
  returns: saleResult,
  handler: async (ctx, args) => {
    const res = await buildOrder(ctx, args, {
      method: 'giftcard',
      giftCardCode: args.giftCardCode,
    });
    await settleSale(ctx, res.orderId);
    return res;
  },
});

export const createSplitSale = mutation({
  args: {
    ...saleArgs,
    tenders: v.array(
      v.union(
        v.object({
          method: v.literal('cash'),
          amountIDR: v.number(),
          tenderedIDR: v.number(),
        }),
        v.object({
          method: v.literal('qris_static'),
          amountIDR: v.number(),
        }),
        v.object({
          method: v.literal('giftcard'),
          giftCardCode: v.string(),
          amountIDR: v.number(),
        })
      )
    ),
  },
  returns: saleResult,
  handler: async (ctx, args) => {
    const res = await buildOrder(ctx, args, { method: 'split', tenders: args.tenders });
    await settleSale(ctx, res.orderId);
    return res;
  },
});

export const voidSale = mutation({
  args: {
    orderId: v.id('orders'),
    reason: v.optional(v.string()),
    cashierId: v.optional(v.id('cafeStaff')),
  },
  returns: v.null(),
  handler: async (ctx, { orderId, reason, cashierId }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const order = await ctx.db.get(orderId);
    if (!order || order.cafeId !== cafeId) throw new Error('Pesanan tidak ditemukan.');
    if (cashierId) await requireOwned(ctx, cafeId, cashierId, 'Kasir');
    await reverseSettledSale(ctx, orderId, {
      ...(reason ? { reason } : {}),
      ...(cashierId ? { cashierId } : {}),
    });
    return null;
  },
});

// ─── Read queries ────────────────────────────────────────────────────────────

const orderSummary = v.object({
  _id: v.id('orders'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  shiftId: v.id('shifts'),
  cashierId: v.id('cafeStaff'),
  clientId: v.string(),
  lines: v.array(
    v.object({
      menuItemId: v.id('menuItems'),
      nameSnapshot: v.string(),
      variantId: v.optional(v.id('menuItemVariants')),
      variantName: v.optional(v.string()),
      qty: v.number(),
      unitPriceIDR: v.number(),
      modifiersSnapshot: v.array(
        v.object({
          groupName: v.string(),
          optionName: v.string(),
          priceAdjustmentIDR: v.number(),
        })
      ),
      lineTotalIDR: v.number(),
      recipeSnapshot: v.optional(
        v.array(
          v.object({
            ingredientId: v.id('ingredients'),
            qty: v.number(),
            wastageFactor: v.number(),
          })
        )
      ),
    })
  ),
  subtotalIDR: v.number(),
  taxRatePct: v.number(),
  taxIDR: v.number(),
  discountIDR: v.number(),
  appliedPromo: v.optional(
    v.object({
      promoId: v.id('promotions'),
      name: v.string(),
      type: v.union(v.literal('percent'), v.literal('fixed')),
      value: v.number(),
    })
  ),
  serviceChargeIDR: v.optional(v.number()),
  serviceChargePct: v.optional(v.number()),
  serviceChargeName: v.optional(v.string()),
  manualDiscountIDR: v.optional(v.number()),
  manualDiscount: v.optional(manualDiscountValidator),
  customerId: v.optional(v.id('customers')),
  pointsRedeemed: v.optional(v.number()),
  pointsRedeemedIDR: v.optional(v.number()),
  pointsEarned: v.optional(v.number()),
  totalIDR: v.number(),
  orderType: v.optional(orderTypeValidator),
  tableId: v.optional(v.id('tables')),
  kitchenStatus: v.optional(
    v.union(v.literal('new'), v.literal('ready'), v.literal('done'))
  ),
  paymentMethod: v.union(
    v.literal('cash'),
    v.literal('qris_static'),
    v.literal('qris_dynamic'),
    v.literal('giftcard'),
    v.literal('split')
  ),
  paymentBreakdown: v.optional(
    v.array(
      v.object({
        method: v.union(
          v.literal('cash'),
          v.literal('qris_static'),
          v.literal('qris_dynamic'),
          v.literal('giftcard')
        ),
        amountIDR: v.number(),
      })
    )
  ),
  paymentStatus: v.union(v.literal('pending'), v.literal('paid'), v.literal('void')),
  voidedAt: v.optional(v.number()),
  voidReason: v.optional(v.string()),
  voidedByCashierId: v.optional(v.id('cafeStaff')),
  refundedIDR: v.optional(v.number()),
  createdAtClient: v.number(),
  syncedAt: v.optional(v.number()),
});

const orderDetail = v.object({
  ...orderSummary.fields,
  cashierName: v.string(),
  payments: v.array(
    v.object({
      method: v.union(
        v.literal('cash'),
        v.literal('qris_static'),
        v.literal('qris_dynamic'),
        v.literal('giftcard')
      ),
      amountIDR: v.number(),
      cashTenderedIDR: v.optional(v.number()),
      changeIDR: v.optional(v.number()),
      confirmedAt: v.optional(v.number()),
    })
  ),
});

export const listForShift = query({
  args: { shiftId: v.id('shifts') },
  returns: v.array(orderSummary),
  handler: async (ctx, { shiftId }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, shiftId, 'Shift');
    const rows = await ctx.db
      .query('orders')
      .withIndex('by_shift', (q) => q.eq('shiftId', shiftId))
      .collect();
    return rows
      .filter((o) => o.paymentStatus === 'paid')
      .sort((a, b) => b.createdAtClient - a.createdAtClient);
  },
});

const orderRow = v.object({
  _id: v.id('orders'),
  createdAtClient: v.number(),
  totalIDR: v.number(),
  orderType: v.optional(orderTypeValidator),
  paymentMethod: v.union(
    v.literal('cash'),
    v.literal('qris_static'),
    v.literal('qris_dynamic'),
    v.literal('giftcard'),
    v.literal('split')
  ),
  paymentStatus: v.union(v.literal('pending'), v.literal('paid'), v.literal('void')),
  cashierName: v.string(),
  lineCount: v.number(),
});

export const search = query({
  args: {
    range: rangeArg,
    cashierId: v.optional(v.id('cafeStaff')),
    paymentMethod: v.optional(v.union(v.literal('cash'), v.literal('qris_static'), v.literal('qris_dynamic'), v.literal('giftcard'), v.literal('split'))),
    orderType: v.optional(orderTypeValidator),
    status: v.optional(v.union(v.literal('paid'), v.literal('pending'), v.literal('void'))),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({ page: v.array(orderRow), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, { range, cashierId, paymentMethod, orderType, status, paginationOpts }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const tz = await tzFor(ctx, cafeId);
    const { startMs, endMs } = resolveRange(tz, range, Date.now());
    let q = ctx.db
      .query('orders')
      .withIndex('by_cafe_created', (ix) =>
        ix.eq('cafeId', cafeId).gte('createdAtClient', startMs).lte('createdAtClient', endMs)
      )
      .order('desc');
    if (cashierId) q = q.filter((f) => f.eq(f.field('cashierId'), cashierId));
    if (paymentMethod) q = q.filter((f) => f.eq(f.field('paymentMethod'), paymentMethod));
    if (orderType) q = q.filter((f) => f.eq(f.field('orderType'), orderType));
    if (status) q = q.filter((f) => f.eq(f.field('paymentStatus'), status));
    const result = await q.paginate(paginationOpts);
    const staff = await ctx.db
      .query('cafeStaff')
      .withIndex('by_cafe_active', (ix) => ix.eq('cafeId', cafeId))
      .collect();
    const nameById = new Map(staff.map((s) => [s._id, s.name] as const));
    const page = result.page.map((o) => ({
      _id: o._id,
      createdAtClient: o.createdAtClient,
      totalIDR: o.totalIDR,
      ...(o.orderType !== undefined ? { orderType: o.orderType } : {}),
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      cashierName: nameById.get(o.cashierId) ?? '—',
      lineCount: o.lines.length,
    }));
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

export const getById = query({
  args: { id: v.id('orders') },
  returns: v.union(orderDetail, v.null()),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const order = await ctx.db.get(id);
    if (!order || order.cafeId !== cafeId) return null;
    const cashier = await ctx.db.get(order.cashierId);
    const paymentRows = await ctx.db
      .query('payments')
      .withIndex('by_order', (q) => q.eq('orderId', order._id))
      .collect();
    const payments = paymentRows
      .sort((a, b) => a._creationTime - b._creationTime)
      .map((p) => ({
        method: p.method,
        amountIDR: p.amountIDR,
        ...(p.cashTenderedIDR !== undefined ? { cashTenderedIDR: p.cashTenderedIDR } : {}),
        ...(p.changeIDR !== undefined ? { changeIDR: p.changeIDR } : {}),
        ...(p.confirmedAt !== undefined ? { confirmedAt: p.confirmedAt } : {}),
      }));
    return {
      ...order,
      cashierName: cashier?.name ?? '—',
      payments,
    };
  },
});

// Drives the refund dialog: the cumulative refunded total, the order's tenders
// (the methods you can refund to), and per-line remaining-refundable qty + the
// proportional per-unit refund value.
export const refundInfo = query({
  args: { orderId: v.id('orders') },
  returns: v.object({
    refundedIDR: v.number(),
    fullyRefunded: v.boolean(),
    methods: v.array(
      v.union(
        v.literal('cash'),
        v.literal('qris_static'),
        v.literal('qris_dynamic'),
        v.literal('giftcard')
      )
    ),
    lines: v.array(
      v.object({
        lineIndex: v.number(),
        nameSnapshot: v.string(),
        qty: v.number(),
        refundedQty: v.number(),
        remainingQty: v.number(),
        unitRefundIDR: v.number(),
      })
    ),
  }),
  handler: async (ctx, { orderId }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const order = await requireOwned(ctx, cafeId, orderId, 'Pesanan');

    // Cumulative refunded qty per line, derived from the refunds ledger.
    const prior = await ctx.db
      .query('refunds')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .collect();
    const refundedByIndex: Record<number, number> = {};
    for (const r of prior) {
      for (const l of r.lines) {
        refundedByIndex[l.lineIndex] = (refundedByIndex[l.lineIndex] ?? 0) + l.qty;
      }
    }

    const subtotalIDR = order.lines.reduce((s, l) => s + l.unitPriceIDR * l.qty, 0);
    const refundedIDR = order.refundedIDR ?? 0;
    const lines = order.lines.map((l, lineIndex) => {
      const refundedQty = refundedByIndex[lineIndex] ?? 0;
      return {
        lineIndex,
        nameSnapshot: l.nameSnapshot,
        qty: l.qty,
        refundedQty,
        remainingQty: l.qty - refundedQty,
        unitRefundIDR: unitRefundIDR(l.unitPriceIDR, order.totalIDR, subtotalIDR),
      };
    });

    // Distinct order tenders (refund destinations).
    const methods = [...new Set(methodTotals(order).map((t) => t.method))];

    return {
      refundedIDR,
      fullyRefunded: lines.every((l) => l.remainingQty === 0),
      methods,
      lines,
    };
  },
});
