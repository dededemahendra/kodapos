import { type Infer, v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { requireOwned, requireOwnerCafe } from './auth';
import { manualDiscountValidator } from './discount';
import { DEFAULT_LOYALTY, earnMultiplierFor, pointsEarned, redemptionIDR } from './loyalty';
import { orderTypeValidator } from './orderType';
import { computeOrderTotals, DEFAULT_SERVICE_CHARGE_NAME, promoDiscountIDR } from './pricing';
import { requireActiveCashier } from './staff';

export const lineInput = v.object({
  menuItemId: v.id('menuItems'),
  qty: v.number(),
  modifierOptionIds: v.array(v.id('modifierOptions')),
  variantId: v.optional(v.id('menuItemVariants')),
});

export const saleArgs = {
  clientId: v.string(),
  shiftId: v.id('shifts'),
  cashierId: v.id('cafeStaff'),
  lines: v.array(lineInput),
  promoId: v.optional(v.id('promotions')),
  manualDiscount: v.optional(manualDiscountValidator),
  customerId: v.optional(v.id('customers')),
  redeemPoints: v.optional(v.number()),
  createdAtClient: v.optional(v.number()),
  orderType: v.optional(orderTypeValidator),
  tableId: v.optional(v.id('tables')),
};

export const saleResult = v.object({
  orderId: v.id('orders'),
  totalIDR: v.number(),
  changeIDR: v.number(),
});

const saleArgsValidator = v.object(saleArgs);
export type SaleArgs = Infer<typeof saleArgsValidator>;

export type PaymentInput =
  | { method: 'cash'; tenderedIDR: number }
  | { method: 'qris_static' }
  | { method: 'qris_dynamic' }
  | {
      method: 'split';
      tenders: Array<
        | { method: 'cash'; amountIDR: number; tenderedIDR: number }
        | { method: 'qris_static'; amountIDR: number }
      >;
    };

function assertIDR(n: number, label: string): number {
  if (!Number.isInteger(n)) throw new Error(`${label} harus berupa angka bulat (rupiah).`);
  if (n < 0) throw new Error(`${label} tidak boleh negatif.`);
  return n;
}

/**
 * Shared checkout core for every payment method. Validates the cart, recomputes
 * promo + loyalty + totals authoritatively, and inserts the order + payment. The
 * order is always inserted `pending` and the payment WITHOUT confirmedAt; the
 * inventory + loyalty side effects and the paid transition live in `settleSale`.
 * The only per-method differences are the funds check, the order's paymentMethod,
 * and the payment row's tendered/change + provider fields.
 */
export async function buildOrder(
  ctx: MutationCtx,
  args: SaleArgs,
  payment: PaymentInput
): Promise<{ orderId: Id<'orders'>; totalIDR: number; changeIDR: number }> {
  const { cafeId } = await requireOwnerCafe(ctx);

  // Idempotency check FIRST — an existing order bypasses all further validation
  // (including the payment-method guard) because the order is already committed.
  const existing = await ctx.db
    .query('orders')
    .withIndex('by_cafe_clientId', (q) => q.eq('cafeId', cafeId).eq('clientId', args.clientId))
    .unique();
  if (existing) {
    // A split order has N payment rows; sum each row's change (cash legs only
    // carry it). Collect (not unique) so a split replay doesn't throw.
    const existingPayments = await ctx.db
      .query('payments')
      .withIndex('by_order', (q) => q.eq('orderId', existing._id))
      .collect();
    return {
      orderId: existing._id,
      totalIDR: existing.totalIDR,
      changeIDR: existingPayments.reduce((s, p) => s + (p.changeIDR ?? 0), 0),
    };
  }

  if (args.lines.length < 1) throw new Error('Keranjang kosong.');

  const shift = await requireOwned(ctx, cafeId, args.shiftId, 'Shift');
  if (shift.status !== 'open') throw new Error('Shift sudah ditutup.');

  await requireActiveCashier(ctx, cafeId, args.cashierId);

  // Tag the sold order with its table (dine-in). Validate ownership up-front so a
  // foreign/unknown tableId is rejected before any side effects.
  if (args.tableId) await requireOwned(ctx, cafeId, args.tableId, 'Meja');

  const builtLines: Doc<'orders'>['lines'] = [];
  for (const line of args.lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 99) {
      throw new Error('Jumlah item tidak valid.');
    }
    const item = await ctx.db.get(line.menuItemId);
    if (!item || item.cafeId !== cafeId || item.archived || !item.isActive) {
      const name = item?.name ? ` ${item.name}` : '';
      throw new Error(`Item${name} tidak tersedia.`);
    }

    // Resolve the variant (server-authoritative price). A variant-less line keeps
    // today's behavior exactly (item.priceIDR). The variant must belong to this
    // item + cafe and not be archived.
    const variant = line.variantId ? await ctx.db.get(line.variantId) : null;
    if (
      line.variantId &&
      (!variant ||
        variant.menuItemId !== item._id ||
        variant.cafeId !== cafeId ||
        variant.archived)
    ) {
      throw new Error('Varian tidak tersedia.');
    }

    const modifiersSnapshot: Doc<'orders'>['lines'][number]['modifiersSnapshot'] = [];
    let modifierAdjustments = 0;

    const attachments = await ctx.db
      .query('menuItemModifierGroups')
      .withIndex('by_item', (q) => q.eq('menuItemId', item._id))
      .collect();
    const attachedGroupIds = new Set(attachments.map((a) => a.modifierGroupId));

    const countByGroup = new Map<string, number>();
    for (const optionId of line.modifierOptionIds) {
      const option = await ctx.db.get(optionId);
      if (!option || option.cafeId !== cafeId || option.archived) {
        throw new Error('Modifier tidak tersedia.');
      }
      const group = await ctx.db.get(option.groupId);
      if (!group || !attachedGroupIds.has(group._id)) {
        throw new Error('Modifier tidak tersedia.');
      }
      countByGroup.set(group._id, (countByGroup.get(group._id) ?? 0) + 1);
      modifiersSnapshot.push({
        groupName: group.name,
        optionName: option.name,
        priceAdjustmentIDR: option.priceAdjustmentIDR,
      });
      modifierAdjustments += option.priceAdjustmentIDR;
    }

    for (const attachment of attachments) {
      const group = await ctx.db.get(attachment.modifierGroupId);
      if (!group || group.archived) continue;
      const count = countByGroup.get(group._id) ?? 0;
      if (count < group.minSelect) {
        throw new Error(`Modifier wajib pada grup ${group.name} belum dipilih.`);
      }
      if (count > group.maxSelect) {
        throw new Error(`Pilihan modifier melebihi batas pada grup ${group.name}.`);
      }
    }

    const basePrice = variant ? variant.priceIDR : item.priceIDR;
    const unitPriceIDR = basePrice + modifierAdjustments;
    const lineTotalIDR = line.qty * unitPriceIDR;

    const recipe = await ctx.db
      .query('recipes')
      .withIndex('by_cafe_item', (q) => q.eq('cafeId', cafeId).eq('menuItemId', item._id))
      .unique();
    const recipeSnapshot: Array<{
      ingredientId: Id<'ingredients'>;
      qty: number;
      wastageFactor: number;
    }> = [];
    if (recipe) {
      for (const recipeLine of recipe.lines) {
        const ing = await ctx.db.get(recipeLine.ingredientId);
        if (!ing || ing.cafeId !== cafeId || ing.archived) continue;
        recipeSnapshot.push({
          ingredientId: recipeLine.ingredientId,
          qty: recipeLine.qty,
          wastageFactor: recipeLine.wastageFactor,
        });
      }
    }

    builtLines.push({
      menuItemId: item._id,
      nameSnapshot: item.name,
      qty: line.qty,
      unitPriceIDR,
      modifiersSnapshot,
      lineTotalIDR,
      ...(variant ? { variantId: variant._id, variantName: variant.name } : {}),
      recipeSnapshot,
    });
  }

  const subtotalIDR = builtLines.reduce((sum, l) => sum + l.lineTotalIDR, 0);

  // Promo: re-fetch + recompute authoritatively (never trust a client amount).
  let discountIDR = 0;
  let appliedPromo: Doc<'orders'>['appliedPromo'];
  if (args.promoId) {
    const promo = await requireOwned(ctx, cafeId, args.promoId, 'Promo');
    if (promo.archived) throw new Error('Promo tidak tersedia.');
    discountIDR = promoDiscountIDR(promo.type, promo.value, subtotalIDR);
    appliedPromo = {
      promoId: promo._id,
      name: promo.name,
      type: promo.type,
      value: promo.value,
    };
  }

  // Ad-hoc manager discount: applied to the post-promo remainder and folded into
  // discountIDR (with manualDiscountIDR stored separately for receipt attribution).
  // Sits AFTER the promo block and BEFORE loyalty redemption, so redemption applies
  // to the post-manual remainder. Reuses promoDiscountIDR's [0, base] clamp.
  let manualDiscountIDR = 0;
  let manualDiscount: { type: 'percent' | 'fixed'; value: number } | undefined;
  if (args.manualDiscount) {
    const { type, value } = args.manualDiscount;
    if (!Number.isInteger(value) || value < 0) throw new Error('Diskon tidak valid.');
    if (type === 'percent' && value > 100) throw new Error('Diskon persen maksimal 100.');
    const base = subtotalIDR - discountIDR; // post-promo remainder
    manualDiscountIDR = promoDiscountIDR(type, value, base);
    discountIDR += manualDiscountIDR;
    manualDiscount = { type, value };
  }

  if ((args.redeemPoints ?? 0) > 0 && !args.customerId) {
    throw new Error('Penukaran poin memerlukan pelanggan.');
  }

  // Single cafeSettings read for the whole checkout path.
  const settings = await ctx.db
    .query('cafeSettings')
    .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
    .first();

  // method-availability guards (cash/qris_static keep the settings.methods gate;
  // qris_dynamic is gated by the connected integration in the action, not here).
  // A split is gated by the methods its tenders actually use.
  const methods = settings?.payment?.methods;
  const usesCash =
    payment.method === 'cash' ||
    (payment.method === 'split' && payment.tenders.some((t) => t.method === 'cash'));
  const usesQrisStatic =
    payment.method === 'qris_static' ||
    (payment.method === 'split' && payment.tenders.some((t) => t.method === 'qris_static'));
  if (usesCash && methods?.cash === false) {
    throw new Error('Metode tunai tidak aktif.');
  }
  if (usesQrisStatic) {
    if (methods?.qrisStatic === false) {
      throw new Error('Metode QRIS statis tidak aktif.');
    }
    // A static-QRIS sale is meaningless without a QR for the customer to scan;
    // the checkout UI hides the button until one is uploaded, so enforce the
    // same precondition server-side for direct/replayed calls.
    if (!settings?.payment?.qrisImageStorageId) {
      throw new Error('QRIS statis belum dikonfigurasi.');
    }
  }

  // Loyalty: resolve customer + program config, then fold any point redemption
  // into discountIDR (promo first, points off the remainder) BEFORE totals.
  let customer: Doc<'customers'> | null = null;
  let loyaltyCfg = DEFAULT_LOYALTY;
  let pointsRedeemed = 0;
  let pointsRedeemedIDR = 0;
  if (args.customerId) {
    const c = await requireOwned(ctx, cafeId, args.customerId, 'Pelanggan');
    if (c.archived) throw new Error('Pelanggan sudah diarsipkan.');
    customer = c;
    loyaltyCfg = { ...DEFAULT_LOYALTY, ...(settings?.loyalty ?? {}) };

    const redeem = args.redeemPoints ?? 0;
    if (redeem > 0) {
      if (!loyaltyCfg.enabled) throw new Error('Program loyalitas tidak aktif.');
      if (!Number.isInteger(redeem) || redeem % loyaltyCfg.redeemBlockPoints !== 0) {
        throw new Error('Poin harus kelipatan blok penukaran.');
      }
      if (redeem > customer.pointsBalance) throw new Error('Poin tidak mencukupi.');
      const afterPromo = subtotalIDR - discountIDR;
      const redeemIDR = redemptionIDR(redeem, loyaltyCfg);
      if (redeemIDR > afterPromo) throw new Error('Penukaran poin melebihi total.');
      pointsRedeemed = redeem;
      pointsRedeemedIDR = redeemIDR;
      discountIDR += redeemIDR;
    }
  }

  const cafe = await ctx.db.get(cafeId);
  const taxEnabled = cafe?.taxEnabled === true;
  const taxRatePct = taxEnabled ? (cafe?.taxRatePct ?? 0) : 0;

  const pay = settings?.payment;
  const scEnabled = pay?.serviceChargeEnabled === true;
  const scPct = scEnabled ? (pay?.serviceChargePct ?? 0) : 0;
  const scName = pay?.serviceChargeName ?? DEFAULT_SERVICE_CHARGE_NAME;

  const { serviceChargeIDR, taxIDR, totalIDR } = computeOrderTotals({
    subtotalIDR,
    discountIDR,
    serviceChargeEnabled: scEnabled,
    serviceChargePct: scPct,
    taxEnabled,
    taxRatePct,
  });

  // Resolve the per-method breakdown + total change for the order. Single-method
  // orders produce one breakdown entry [{ method, totalIDR }]; a split validates
  // its tenders and produces N entries summing to totalIDR. `orderMethod` is the
  // headline paymentMethod stored on the order ('split' for a multi-tender order).
  type Tender =
    | { method: 'cash'; amountIDR: number; tenderedIDR: number }
    | { method: 'qris_static'; amountIDR: number };
  type BreakdownEntry = { method: 'cash' | 'qris_static' | 'qris_dynamic'; amountIDR: number };

  let changeIDR = 0;
  let orderMethod: 'cash' | 'qris_static' | 'qris_dynamic' | 'split';
  let paymentBreakdown: BreakdownEntry[];
  let splitTenders: Tender[] | null = null;

  if (payment.method === 'split') {
    const tenders = payment.tenders;
    if (tenders.length < 2) throw new Error('Pembayaran terbagi memerlukan minimal dua tender.');
    let sum = 0;
    for (const tender of tenders) {
      // Validator already restricts method to cash/qris_static; re-check defensively.
      if (tender.method !== 'cash' && tender.method !== 'qris_static') {
        throw new Error('Metode tender tidak didukung pada pembayaran terbagi.');
      }
      assertIDR(tender.amountIDR, 'Jumlah tender');
      if (tender.amountIDR <= 0) throw new Error('Jumlah tender harus lebih dari nol.');
      if (tender.method === 'cash') {
        const tendered = assertIDR(tender.tenderedIDR, 'Uang yang diterima');
        if (tendered < tender.amountIDR) {
          throw new Error('Uang yang diterima kurang dari jumlah tender.');
        }
        changeIDR += tendered - tender.amountIDR;
      }
      sum += tender.amountIDR;
    }
    if (sum !== totalIDR) throw new Error('Total tender tidak sama dengan total pesanan.');
    orderMethod = 'split';
    paymentBreakdown = tenders.map((tender) => ({ method: tender.method, amountIDR: tender.amountIDR }));
    splitTenders = tenders;
  } else {
    // method-specific: funds check + change only for cash.
    if (payment.method === 'cash') {
      const tendered = assertIDR(payment.tenderedIDR, 'Uang yang diterima');
      if (tendered < totalIDR) {
        throw new Error('Uang yang diterima kurang dari total.');
      }
      changeIDR = tendered - totalIDR;
    }
    orderMethod = payment.method;
    paymentBreakdown = [{ method: payment.method, amountIDR: totalIDR }];
  }

  const earnBase = subtotalIDR - discountIDR;
  const earned = customer
    ? Math.floor(pointsEarned(earnBase, loyaltyCfg) * earnMultiplierFor(customer.totalSpentIDR, loyaltyCfg.tiers))
    : 0;

  const now = Date.now();
  const orderId = await ctx.db.insert('orders', {
    cafeId,
    shiftId: shift._id,
    cashierId: args.cashierId,
    clientId: args.clientId,
    lines: builtLines,
    subtotalIDR,
    taxRatePct,
    taxIDR,
    discountIDR,
    ...(appliedPromo ? { appliedPromo } : {}),
    ...(manualDiscountIDR > 0 ? { manualDiscountIDR } : {}),
    ...(manualDiscount ? { manualDiscount } : {}),
    serviceChargeIDR,
    serviceChargePct: scPct,
    serviceChargeName: scName,
    ...(customer ? { customerId: customer._id, pointsEarned: earned } : {}),
    ...(pointsRedeemed > 0 ? { pointsRedeemed, pointsRedeemedIDR } : {}),
    totalIDR,
    orderType: args.orderType ?? 'dine_in',
    ...(args.tableId ? { tableId: args.tableId } : {}),
    paymentMethod: orderMethod,
    paymentBreakdown,
    paymentStatus: 'pending',
    createdAtClient: args.createdAtClient ?? now,
    syncedAt: now,
  });

  // Payment rows (order-first so they reference orderId). A split inserts one row
  // per tender; a single-method order inserts one row. cash records tendered/change;
  // qris_dynamic records only the pending marker here (providerRef/expiresAt are
  // patched later by patchCharge); qris_static records neither. No confirmedAt
  // until settleSale runs.
  if (splitTenders) {
    for (const tender of splitTenders) {
      await ctx.db.insert('payments', {
        cafeId,
        orderId,
        method: tender.method,
        amountIDR: tender.amountIDR,
        ...(tender.method === 'cash'
          ? { cashTenderedIDR: tender.tenderedIDR, changeIDR: tender.tenderedIDR - tender.amountIDR }
          : {}),
      });
    }
  } else {
    await ctx.db.insert('payments', {
      cafeId,
      orderId,
      method: payment.method as 'cash' | 'qris_static' | 'qris_dynamic',
      amountIDR: totalIDR,
      ...(payment.method === 'cash' ? { cashTenderedIDR: payment.tenderedIDR, changeIDR } : {}),
      ...(payment.method === 'qris_dynamic' ? { providerStatus: 'pending' } : {}),
    });
  }

  return { orderId, totalIDR, changeIDR };
}

/**
 * Applies all post-payment side effects from the persisted order doc: inventory
 * deduction, loyalty transactions, the customer patch, and the order → paid +
 * payment confirmedAt transition. Takes only the orderId so it can run from a
 * webhook. Idempotent: a no-op unless the order is still `pending`, so duplicate
 * deliveries are safe.
 */
export async function settleSale(ctx: MutationCtx, orderId: Id<'orders'>): Promise<void> {
  const order = await ctx.db.get(orderId);
  if (!order) throw new Error('Pesanan tidak ditemukan.');
  if (order.paymentStatus !== 'pending') return; // already settled or voided

  const now = Date.now();

  // Inventory deduction: one inventoryMovements row per (line × ingredient).
  for (const line of order.lines) {
    for (const recipeLine of line.recipeSnapshot ?? []) {
      const consumed = line.qty * recipeLine.qty * recipeLine.wastageFactor;
      await ctx.db.insert('inventoryMovements', {
        cafeId: order.cafeId,
        ingredientId: recipeLine.ingredientId,
        delta: -consumed,
        reason: 'sale',
        refType: 'order',
        refId: orderId as unknown as string,
        at: now,
      });
    }
  }

  if (order.customerId) {
    const customer = await ctx.db.get(order.customerId);
    if (customer) {
      const pointsRedeemed = order.pointsRedeemed ?? 0;
      const earned = order.pointsEarned ?? 0;
      if (pointsRedeemed > 0) {
        await ctx.db.insert('loyaltyTransactions', {
          cafeId: order.cafeId,
          customerId: customer._id,
          orderId,
          type: 'redeem',
          points: -pointsRedeemed,
          at: now,
        });
      }
      if (earned > 0) {
        await ctx.db.insert('loyaltyTransactions', {
          cafeId: order.cafeId,
          customerId: customer._id,
          orderId,
          type: 'earn',
          points: earned,
          at: now,
        });
      }
      await ctx.db.patch(customer._id, {
        pointsBalance: customer.pointsBalance + earned - pointsRedeemed,
        visitCount: customer.visitCount + 1,
        totalSpentIDR: customer.totalSpentIDR + order.totalIDR,
        lastVisitAt: now,
      });
    }
  }

  await ctx.db.patch(orderId, { paymentStatus: 'paid', kitchenStatus: 'new' });
  // A split order has N payment rows; confirm each one (collect, not unique).
  const payments = await ctx.db
    .query('payments')
    .withIndex('by_order', (q) => q.eq('orderId', orderId))
    .collect();
  for (const payment of payments) {
    await ctx.db.patch(payment._id, {
      confirmedAt: now,
      ...(payment.method === 'qris_dynamic' ? { providerStatus: 'paid' } : {}),
    });
  }
}

/**
 * Reverses every side effect of `settleSale` for a paid order: restores inventory
 * (positive deltas), reverses loyalty points + customer stats (floored at 0), and
 * flips the order to `void`. Throws unless the order is currently `paid`, which
 * doubles as a re-entrancy guard against double-voiding.
 */
export async function reverseSettledSale(
  ctx: MutationCtx,
  orderId: Id<'orders'>,
  opts: { reason?: string; cashierId?: Id<'cafeStaff'> }
): Promise<void> {
  const order = await ctx.db.get(orderId);
  if (!order) throw new Error('Pesanan tidak ditemukan.');
  if (order.paymentStatus !== 'paid') throw new Error('Hanya pesanan lunas yang bisa dibatalkan.');
  const now = Date.now();
  for (const line of order.lines) {
    for (const rl of line.recipeSnapshot ?? []) {
      const consumed = line.qty * rl.qty * rl.wastageFactor;
      await ctx.db.insert('inventoryMovements', {
        cafeId: order.cafeId,
        ingredientId: rl.ingredientId,
        delta: consumed,
        reason: 'adjustment',
        reasonLabel: 'Pembatalan pesanan',
        refType: 'order',
        refId: orderId as unknown as string,
        at: now,
      });
    }
  }
  if (order.customerId) {
    const customer = await ctx.db.get(order.customerId);
    if (customer) {
      const redeemed = order.pointsRedeemed ?? 0;
      const earned = order.pointsEarned ?? 0;
      // Inverse of settleSale's `pointsBalance += earned - redeemed`. Floor at 0 so
      // a void never drives the balance negative (would break redemption/display
      // assumptions) — e.g. if points earned by this sale were already spent on a
      // later order. Record the ACTUALLY-applied delta (post-floor) so the loyalty
      // ledger always reconciles with pointsBalance instead of silently diverging.
      const newBalance = Math.max(0, customer.pointsBalance - earned + redeemed);
      const appliedPoints = newBalance - customer.pointsBalance;
      if (appliedPoints !== 0) {
        await ctx.db.insert('loyaltyTransactions', {
          cafeId: order.cafeId,
          customerId: customer._id,
          orderId,
          type: 'adjust',
          points: appliedPoints,
          note: 'Pembatalan pesanan',
          at: now,
        });
      }
      await ctx.db.patch(customer._id, {
        pointsBalance: newBalance,
        visitCount: Math.max(0, customer.visitCount - 1),
        totalSpentIDR: Math.max(0, customer.totalSpentIDR - order.totalIDR),
      });
    }
  }
  await ctx.db.patch(orderId, {
    paymentStatus: 'void',
    voidedAt: now,
    ...(opts.reason?.trim() ? { voidReason: opts.reason.trim() } : {}),
    ...(opts.cashierId ? { voidedByCashierId: opts.cashierId } : {}),
  });
}

/** Void a pending order + stamp its payment providerStatus. No-op unless pending. Idempotent. */
export async function voidPendingOrder(
  ctx: MutationCtx,
  orderId: Id<'orders'>,
  providerStatus: string
): Promise<boolean> {
  const order = await ctx.db.get(orderId);
  if (order?.paymentStatus !== 'pending') return false;
  await ctx.db.patch(orderId, { paymentStatus: 'void' });
  // Loop-patch every row (a split has N; collect, not unique).
  const payments = await ctx.db
    .query('payments')
    .withIndex('by_order', (q) => q.eq('orderId', orderId))
    .collect();
  for (const payment of payments) await ctx.db.patch(payment._id, { providerStatus });
  return true;
}
