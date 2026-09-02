import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { type MutationCtx, mutation, query } from './_generated/server';
import { requireActiveOutlet, requireOwned } from './lib/auth';
import { manualDiscountValidator } from './lib/discount';
import { currentStockQty } from './lib/inventory';
import { orderTypeValidator } from './lib/orderType';
import { methodTotals } from './lib/payment';
import { unitRefundIDR } from './lib/refund';
import { type ReplayArgs, replayArgs } from './lib/replay';
import {
  assertIDR,
  buildOrder,
  reverseSettledSale,
  type SaleArgs,
  saleArgs,
  saleResult,
  settleSale,
} from './lib/sale';
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

// ─── Offline replay ──────────────────────────────────────────────────────────

/**
 * Drop the snapshot-only fields so the payload fits `SaleArgs`. The money the
 * till charged travels separately, as the `replay` argument to `buildOrder`.
 */
function toSaleArgs(args: ReplayArgs): SaleArgs {
  return {
    clientId: args.clientId,
    shiftId: args.shiftId,
    cashierId: args.cashierId,
    lines: args.lines.map((l) => ({
      menuItemId: l.menuItemId,
      qty: l.qty,
      modifierOptionIds: l.modifierOptionIds,
      ...(l.variantId ? { variantId: l.variantId } : {}),
    })),
    ...(args.promoId ? { promoId: args.promoId } : {}),
    createdAtClient: args.createdAtClient,
    ...(args.orderType ? { orderType: args.orderType } : {}),
    ...(args.priceCategoryId ? { priceCategoryId: args.priceCategoryId } : {}),
  };
}

/**
 * The audit trail for a replayed sale: one row per way the recorded sale differs
 * from what current server state would have produced. The sale itself always
 * posts — the cash is already in the drawer — so these rows are the owner's
 * record of what drifted, not a rejection.
 */
async function recordReconciliations(
  ctx: MutationCtx,
  args: ReplayArgs,
  orderId: Id<'orders'>
): Promise<void> {
  const { cafeId } = await requireActiveOutlet(ctx);
  const now = Date.now();
  const insert = (
    kind:
      | 'price_drift'
      | 'item_unavailable'
      | 'promo_archived'
      | 'modifier_rule_changed'
      | 'payment_method_disabled'
      | 'shift_closed'
      | 'cashier_archived'
      | 'price_category_archived'
      | 'negative_stock',
    extra: { rungIDR?: number; currentIDR?: number; detail?: string }
  ) =>
    ctx.db.insert('saleReconciliations', {
      cafeId,
      orderId,
      clientId: args.clientId,
      kind,
      ...extra,
      createdAt: now,
    });

  // Price-category overrides, resolved once — same lookup buildOrder does, so
  // "what it would cost now" is computed the way a live sale would compute it.
  const priceOverrides = new Map<string, number>();
  const priceCategoryId = args.priceCategoryId;
  if (priceCategoryId) {
    const rows = await ctx.db
      .query('priceOverrides')
      .withIndex('by_cafe_and_category', (q) =>
        q.eq('cafeId', cafeId).eq('priceCategoryId', priceCategoryId)
      )
      .collect();
    for (const row of rows) priceOverrides.set(row.targetId as string, row.priceIDR);
  }

  for (const line of args.lines) {
    const item = await ctx.db.get(line.menuItemId);
    if (!item || item.cafeId !== cafeId) continue; // buildOrder already rejected these
    if (item.archived || !item.isActive || item.soldOut) {
      await insert('item_unavailable', { detail: line.nameSnapshot });
    }

    const variant = line.variantId ? await ctx.db.get(line.variantId) : null;
    if (variant?.archived) {
      await insert('item_unavailable', {
        detail: `${line.nameSnapshot}: varian ${variant.name}`,
      });
    }

    // Loaded before the option pass so a selected option's group can be checked
    // against what is still attached to the item.
    const attachments = await ctx.db
      .query('menuItemModifierGroups')
      .withIndex('by_item', (q) => q.eq('menuItemId', item._id))
      .collect();
    const attachedGroupIds = new Set(attachments.map((a) => a.modifierGroupId));

    // One pass over the line's options: it feeds the current price, the
    // per-group selection counts the min/max check below needs, and the two
    // silent-relaxation checks (archived option, detached group).
    const priceTargetId = (variant ? variant._id : item._id) as string;
    let currentUnitIDR =
      priceOverrides.get(priceTargetId) ?? (variant ? variant.priceIDR : item.priceIDR);
    const countByGroup = new Map<string, number>();
    // Two options from the same detached group are one fact about the order, so
    // report each group at most once per line.
    const reportedDetached = new Set<string>();
    for (const optionId of line.modifierOptionIds) {
      const option = await ctx.db.get(optionId);
      if (!option || option.cafeId !== cafeId) continue;
      currentUnitIDR += priceOverrides.get(option._id as string) ?? option.priceAdjustmentIDR;
      countByGroup.set(option.groupId, (countByGroup.get(option.groupId) ?? 0) + 1);
      if (option.archived) {
        await insert('item_unavailable', {
          detail: `${line.nameSnapshot}: modifier ${option.name}`,
        });
      }
      if (!attachedGroupIds.has(option.groupId) && !reportedDetached.has(option.groupId)) {
        reportedDetached.add(option.groupId);
        const group = await ctx.db.get(option.groupId);
        await insert('modifier_rule_changed', {
          detail: `${line.nameSnapshot}: grup ${group?.name ?? option.name} tidak lagi terpasang`,
        });
      }
    }

    // Line-level, not per-unit: an owner reconciling the drawer needs the cash
    // impact of the whole line, which on a qty-3 line is three times the unit gap.
    const currentIDR = currentUnitIDR * line.qty;
    if (currentIDR !== line.lineTotalIDR) {
      await insert('price_drift', {
        rungIDR: line.lineTotalIDR,
        currentIDR,
        detail: line.nameSnapshot,
      });
    }

    // Mirrors buildOrder's min/max loop, which the replay path skips.
    for (const attachment of attachments) {
      const group = await ctx.db.get(attachment.modifierGroupId);
      if (!group || group.archived) continue;
      const count = countByGroup.get(group._id) ?? 0;
      if (count < group.minSelect || count > group.maxSelect) {
        await insert('modifier_rule_changed', {
          detail: `${line.nameSnapshot}: aturan grup ${group.name}`,
        });
      }
    }
  }

  if (args.promoId) {
    const promo = await ctx.db.get(args.promoId);
    if (promo && promo.cafeId === cafeId && promo.archived) {
      await insert('promo_archived', { detail: promo.name });
    }
  }

  // The sale was rung as cash; if cash has since been switched off, buildOrder
  // let it through anyway and the owner gets told here.
  const settings = await ctx.db
    .query('cafeSettings')
    .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
    .first();
  if (settings?.payment?.methods?.cash === false) {
    await insert('payment_method_disabled', { detail: 'Tunai' });
  }

  // The ordinary replay case, and the one whose cash impact is otherwise
  // invisible: the shift was counted and closed before this sale arrived, so its
  // expected-cash figure does not include this drawer money.
  const shift = await ctx.db.get(args.shiftId);
  if (shift && shift.cafeId === cafeId && shift.status !== 'open') {
    await insert('shift_closed', { detail: 'Shift sudah ditutup saat penjualan masuk' });
  }

  const cashier = await ctx.db.get(args.cashierId);
  if (cashier && cashier.cafeId === cafeId && cashier.archived) {
    await insert('cashier_archived', { detail: cashier.name });
  }

  if (priceCategoryId) {
    const priceCategory = await ctx.db.get(priceCategoryId);
    if (priceCategory && priceCategory.cafeId === cafeId && priceCategory.archived) {
      await insert('price_category_archived', { detail: priceCategory.name });
    }
  }

  // Negative stock. `settleSale` (already run by the time this is called) posts
  // the inventory deduction unconditionally and by design: the drink was handed
  // over during the outage, so the consumption is a fact whether or not the
  // books had the stock for it. What is NOT acceptable is that fact being
  // silent — the owner has to know which ingredient the replay drove below
  // zero, or the first they hear of it is a stock take that will not balance.
  //
  // Read from the committed order, not `args`: `buildOrder` is what resolves
  // each line's `recipeSnapshot`, and that snapshot is exactly what was
  // deducted.
  const order = await ctx.db.get(orderId);
  const ingredientIds = new Set<Id<'ingredients'>>();
  for (const line of order?.lines ?? []) {
    for (const recipeLine of line.recipeSnapshot ?? []) ingredientIds.add(recipeLine.ingredientId);
  }
  for (const ingredientId of ingredientIds) {
    const qty = await currentStockQty(ctx, cafeId, ingredientId);
    if (qty >= 0) continue;
    const ingredient = await ctx.db.get(ingredientId);
    if (!ingredient || ingredient.cafeId !== cafeId) continue;
    // Rounded: stock is a float (qty x wastageFactor), and a detail line
    // reading "-2.0000000000000004 g" helps nobody.
    const shortfall = Math.round(qty * 100) / 100;
    await insert('negative_stock', {
      detail: `${ingredient.name}: sisa ${shortfall} ${ingredient.canonicalUnit}`,
    });
  }
}

/**
 * Posts a cash sale that was rung while the till had no network, exactly as it
 * was rung. Separate from `createCashSale` on purpose: the online path must keep
 * every validation it has today, so the relaxations live behind this mutation's
 * `replay` argument and nowhere else.
 */
export const createReplayedCashSale = mutation({
  args: replayArgs,
  returns: saleResult,
  handler: async (ctx, args) => {
    // The till's arithmetic is trusted; its bytes are not. Without this, an
    // offline `20000 * 0.11` persists as taxIDR 2200.0000000000003, and a
    // negative totalIDR passes the funds check and pays out change.
    assertIDR(args.discountIDR, 'Diskon');
    assertIDR(args.serviceChargeIDR, 'Biaya layanan');
    assertIDR(args.taxIDR, 'Pajak');
    assertIDR(args.totalIDR, 'Total');
    assertIDR(args.cashTenderedIDR, 'Uang yang diterima');
    for (const line of args.lines) {
      assertIDR(line.unitPriceIDR, 'Harga satuan');
      assertIDR(line.lineTotalIDR, 'Total baris');
      if (line.lineTotalIDR !== line.qty * line.unitPriceIDR) {
        throw new Error('Total baris tidak cocok dengan jumlah dikali harga satuan.');
      }
    }
    // Internal consistency, checked against the payload's OWN numbers so
    // "record it as rung" still holds. Without it a ten-item cart can persist
    // with totalIDR 0, settle as paid, and contribute nothing to expected cash.
    const subtotalIDR = args.lines.reduce((sum, l) => sum + l.lineTotalIDR, 0);
    const expectedTotalIDR = subtotalIDR - args.discountIDR + args.serviceChargeIDR + args.taxIDR;
    if (args.totalIDR !== expectedTotalIDR) {
      throw new Error('Total pesanan tidak cocok dengan rinciannya.');
    }

    const { cafeId } = await requireActiveOutlet(ctx);
    // buildOrder short-circuits a repeated clientId to the committed order. Look
    // first so a retry after a timeout does not append a second set of
    // reconciliation rows for a sale that already posted.
    const already = await ctx.db
      .query('orders')
      .withIndex('by_cafe_clientId', (q) => q.eq('cafeId', cafeId).eq('clientId', args.clientId))
      .unique();

    const res = await buildOrder(
      ctx,
      toSaleArgs(args),
      { method: 'cash', tenderedIDR: args.cashTenderedIDR },
      {
        lines: args.lines,
        discountIDR: args.discountIDR,
        serviceChargeIDR: args.serviceChargeIDR,
        taxIDR: args.taxIDR,
        totalIDR: args.totalIDR,
      }
    );
    if (!already) {
      await settleSale(ctx, res.orderId);
      await recordReconciliations(ctx, args, res.orderId);
    }
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
      scope: v.optional(v.union(v.literal('order'), v.literal('item'), v.literal('category'))),
      targetItemIds: v.optional(v.array(v.id('menuItems'))),
      targetCategoryIds: v.optional(v.array(v.id('categories'))),
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
  kitchenStatus: v.optional(v.union(v.literal('new'), v.literal('ready'), v.literal('done'))),
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
  priceCategoryId: v.optional(v.id('priceCategories')),
  priceCategoryName: v.optional(v.string()),
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
    paymentMethod: v.optional(
      v.union(
        v.literal('cash'),
        v.literal('qris_static'),
        v.literal('qris_dynamic'),
        v.literal('giftcard'),
        v.literal('split')
      )
    ),
    orderType: v.optional(orderTypeValidator),
    status: v.optional(v.union(v.literal('paid'), v.literal('pending'), v.literal('void'))),
    /**
     * The 4-character receipt code the cashier reads off a printed receipt.
     * An online receipt's code is the last four characters of the order
     * `_id`; an offline one's is the last four of its `clientId` (see
     * `offlineReceiptNumber` in `src/lib/offline/receipt-number.ts`, and
     * `ReceiptPreview`, which prints the same `_id` suffix online). Matched
     * case-insensitively against either. A non-empty query that is NOT
     * exactly 4 characters matches nothing (rather than silently returning
     * the unfiltered page) — receipt codes are always 4 characters, so a
     * mistyped 3- or 5-character search should read as "no results", not as
     * "search ignored".
     */
    q: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({ page: v.array(orderRow), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (
    ctx,
    { range, cashierId, paymentMethod, orderType, status, q, paginationOpts }
  ) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const tz = await tzFor(ctx, cafeId);
    const { startMs, endMs } = resolveRange(tz, range, Date.now());
    let ordersQuery = ctx.db
      .query('orders')
      .withIndex('by_cafe_created', (ix) =>
        ix.eq('cafeId', cafeId).gte('createdAtClient', startMs).lte('createdAtClient', endMs)
      )
      .order('desc');
    if (cashierId) ordersQuery = ordersQuery.filter((f) => f.eq(f.field('cashierId'), cashierId));
    if (paymentMethod) {
      ordersQuery = ordersQuery.filter((f) => f.eq(f.field('paymentMethod'), paymentMethod));
    }
    if (orderType) ordersQuery = ordersQuery.filter((f) => f.eq(f.field('orderType'), orderType));
    if (status) ordersQuery = ordersQuery.filter((f) => f.eq(f.field('paymentStatus'), status));
    const result = await ordersQuery.paginate(paginationOpts);
    const staff = await ctx.db
      .query('cafeStaff')
      .withIndex('by_cafe_active', (ix) => ix.eq('cafeId', cafeId))
      .collect();
    const nameById = new Map(staff.map((s) => [s._id, s.name] as const));
    // A receipt code isn't a stored field — it's derived from `_id`/`clientId`
    // — so it can't be pushed into the index `.filter()` above; it narrows
    // the already-fetched page instead.
    const code = q?.trim().toUpperCase();
    const matchesCode = (o: (typeof result.page)[number]) =>
      o._id.slice(-4).toUpperCase() === code || o.clientId.slice(-4).toUpperCase() === code;
    const matched = !code ? result.page : code.length === 4 ? result.page.filter(matchesCode) : [];
    const page = matched.map((o) => ({
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
