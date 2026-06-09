import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { requireOwned, requireOwnerCafe } from './auth';
import { DEFAULT_LOYALTY, pointsEarned, redemptionIDR } from './loyalty';
import { computeOrderTotals, DEFAULT_SERVICE_CHARGE_NAME, promoDiscountIDR } from './pricing';
import { requireActiveCashier } from './staff';

export const lineInput = v.object({
  menuItemId: v.id('menuItems'),
  qty: v.number(),
  modifierOptionIds: v.array(v.id('modifierOptions')),
});

export const saleArgs = {
  clientId: v.string(),
  shiftId: v.id('shifts'),
  cashierId: v.id('cafeStaff'),
  lines: v.array(lineInput),
  promoId: v.optional(v.id('promotions')),
  customerId: v.optional(v.id('customers')),
  redeemPoints: v.optional(v.number()),
  createdAtClient: v.optional(v.number()),
};

export const saleResult = v.object({
  orderId: v.id('orders'),
  totalIDR: v.number(),
  changeIDR: v.number(),
});

export type SaleArgs = {
  clientId: string;
  shiftId: Id<'shifts'>;
  cashierId: Id<'cafeStaff'>;
  lines: Array<{
    menuItemId: Id<'menuItems'>;
    qty: number;
    modifierOptionIds: Array<Id<'modifierOptions'>>;
  }>;
  promoId?: Id<'promotions'>;
  customerId?: Id<'customers'>;
  redeemPoints?: number;
  createdAtClient?: number;
};

export type PaymentInput =
  | { method: 'cash'; tenderedIDR: number }
  | { method: 'qris_static' }
  | { method: 'qris_dynamic'; providerRef: string; expiresAt: number };

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
    const existingPayment = await ctx.db
      .query('payments')
      .withIndex('by_order', (q) => q.eq('orderId', existing._id))
      .unique();
    return {
      orderId: existing._id,
      totalIDR: existing.totalIDR,
      changeIDR: existingPayment?.changeIDR ?? 0,
    };
  }

  if (args.lines.length < 1) throw new Error('Keranjang kosong.');

  const shift = await requireOwned(ctx, cafeId, args.shiftId, 'Shift');
  if (shift.status !== 'open') throw new Error('Shift sudah ditutup.');

  await requireActiveCashier(ctx, cafeId, args.cashierId);

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

    const unitPriceIDR = item.priceIDR + modifierAdjustments;
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
  const methods = settings?.payment?.methods;
  if (payment.method === 'cash' && methods?.cash === false) {
    throw new Error('Metode tunai tidak aktif.');
  }
  if (payment.method === 'qris_static') {
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

  // method-specific: funds check + change only for cash.
  let changeIDR = 0;
  if (payment.method === 'cash') {
    const tendered = assertIDR(payment.tenderedIDR, 'Uang yang diterima');
    if (tendered < totalIDR) {
      throw new Error('Uang yang diterima kurang dari total.');
    }
    changeIDR = tendered - totalIDR;
  }

  const earnBase = subtotalIDR - discountIDR;
  const earned = customer ? pointsEarned(earnBase, loyaltyCfg) : 0;

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
    serviceChargeIDR,
    serviceChargePct: scPct,
    serviceChargeName: scName,
    ...(customer ? { customerId: customer._id, pointsEarned: earned } : {}),
    ...(pointsRedeemed > 0 ? { pointsRedeemed, pointsRedeemedIDR } : {}),
    totalIDR,
    paymentMethod: payment.method,
    paymentStatus: 'pending',
    createdAtClient: args.createdAtClient ?? now,
    syncedAt: now,
  });

  // method-specific: cash records tendered/change; qris_dynamic records provider
  // ref + status + expiry; qris_static records neither. No confirmedAt until
  // settleSale runs.
  await ctx.db.insert('payments', {
    cafeId,
    orderId,
    method: payment.method,
    amountIDR: totalIDR,
    ...(payment.method === 'cash' ? { cashTenderedIDR: payment.tenderedIDR, changeIDR } : {}),
    ...(payment.method === 'qris_dynamic'
      ? {
          providerRef: payment.providerRef,
          providerStatus: 'pending',
          expiresAt: payment.expiresAt,
        }
      : {}),
  });

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

  await ctx.db.patch(orderId, { paymentStatus: 'paid' });
  const payment = await ctx.db
    .query('payments')
    .withIndex('by_order', (q) => q.eq('orderId', orderId))
    .unique();
  if (payment) {
    await ctx.db.patch(payment._id, {
      confirmedAt: now,
      ...(payment.method === 'qris_dynamic' ? { providerStatus: 'paid' } : {}),
    });
  }
}
