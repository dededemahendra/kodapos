import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { DEFAULT_LOYALTY, pointsEarned } from './lib/loyalty';
import { DEFAULT_SERVICE_CHARGE_NAME, computeOrderTotals, promoDiscountIDR } from './lib/pricing';
import { requireActiveCashier } from './lib/staff';

const lineInput = v.object({
  menuItemId: v.id('menuItems'),
  qty: v.number(),
  modifierOptionIds: v.array(v.id('modifierOptions')),
});

const createCashSaleResult = v.object({
  orderId: v.id('orders'),
  totalIDR: v.number(),
  changeIDR: v.number(),
});

function assertIDR(n: number, label: string): number {
  if (!Number.isInteger(n)) throw new Error(`${label} harus berupa angka bulat (rupiah).`);
  if (n < 0) throw new Error(`${label} tidak boleh negatif.`);
  return n;
}

export const createCashSale = mutation({
  args: {
    clientId: v.string(),
    shiftId: v.id('shifts'),
    cashierId: v.id('cafeStaff'),
    lines: v.array(lineInput),
    cashTenderedIDR: v.number(),
    promoId: v.optional(v.id('promotions')),
    customerId: v.optional(v.id('customers')),
    redeemPoints: v.optional(v.number()),
    createdAtClient: v.optional(v.number()),
  },
  returns: createCashSaleResult,
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);

    // Idempotency check first — return existing order if clientId already used.
    // promoId is intentionally NOT re-evaluated here — the original sale's discount
    // and appliedPromo snapshot win. A different promo requires a new clientId.
    const existing = await ctx.db
      .query('orders')
      .withIndex('by_cafe_clientId', (q) =>
        q.eq('cafeId', cafeId).eq('clientId', args.clientId)
      )
      .unique();
    if (existing) {
      const payment = await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', existing._id))
        .unique();
      return {
        orderId: existing._id,
        totalIDR: existing.totalIDR,
        changeIDR: payment?.changeIDR ?? 0,
      };
    }

    if (args.lines.length < 1) throw new Error('Keranjang kosong.');

    const shift = await requireOwned(ctx, cafeId, args.shiftId, 'Shift');
    if (shift.status !== 'open') throw new Error('Shift sudah ditutup.');

    await requireActiveCashier(ctx, cafeId, args.cashierId);

    const tendered = assertIDR(args.cashTenderedIDR, 'Uang yang diterima');

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

      // Hoist attachment query once per line (avoids O(N*M) DB reads).
      const attachments = await ctx.db
        .query('menuItemModifierGroups')
        .withIndex('by_item', (q) => q.eq('menuItemId', item._id))
        .collect();
      const attachedGroupIds = new Set(attachments.map((a) => a.modifierGroupId));

      // Tally selected options per group while validating each option.
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

      // Enforce min/max per attached modifier group.
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

      // Look up the recipe (if any) and build recipeSnapshot. Archived
      // ingredients are silently skipped — the owner intentionally
      // opted them out; the line still sells.
      const recipe = await ctx.db
        .query('recipes')
        .withIndex('by_cafe_item', (q) =>
          q.eq('cafeId', cafeId).eq('menuItemId', item._id)
        )
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

    // Loyalty: resolve customer + program config. Redemption handled in a later task.
    let customer: Doc<'customers'> | null = null;
    let loyaltyCfg = DEFAULT_LOYALTY;
    if (args.customerId) {
      const c = await requireOwned(ctx, cafeId, args.customerId, 'Pelanggan');
      if (c.archived) throw new Error('Pelanggan sudah diarsipkan.');
      customer = c;
      const settings0 = await ctx.db
        .query('cafeSettings')
        .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
        .first();
      loyaltyCfg = { ...DEFAULT_LOYALTY, ...(settings0?.loyalty ?? {}) };
    }

    const cafe = await ctx.db.get(cafeId);
    const taxEnabled = cafe?.taxEnabled === true;
    const taxRatePct = taxEnabled ? cafe?.taxRatePct ?? 0 : 0;

    const settings = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    const pay = settings?.payment;
    const scEnabled = pay?.serviceChargeEnabled === true;
    const scPct = scEnabled ? pay?.serviceChargePct ?? 0 : 0;
    const scName = pay?.serviceChargeName ?? DEFAULT_SERVICE_CHARGE_NAME;

    const { serviceChargeIDR, taxIDR, totalIDR } = computeOrderTotals({
      subtotalIDR,
      discountIDR,
      serviceChargeEnabled: scEnabled,
      serviceChargePct: scPct,
      taxEnabled,
      taxRatePct,
    });

    if (tendered < totalIDR) {
      throw new Error('Uang yang diterima kurang dari total.');
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
      totalIDR,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      createdAtClient: args.createdAtClient ?? now,
      syncedAt: now,
    });

    const changeIDR = tendered - totalIDR;
    await ctx.db.insert('payments', {
      cafeId,
      orderId,
      method: 'cash',
      amountIDR: totalIDR,
      cashTenderedIDR: tendered,
      changeIDR,
      confirmedAt: now,
    });

    // Inventory deduction: one inventoryMovements row per (line × ingredient).
    // Atomic with the order + payment because this all runs in one mutation.
    for (const builtLine of builtLines) {
      for (const recipeLine of builtLine.recipeSnapshot ?? []) {
        const consumed = builtLine.qty * recipeLine.qty * recipeLine.wastageFactor;
        await ctx.db.insert('inventoryMovements', {
          cafeId,
          ingredientId: recipeLine.ingredientId,
          delta: -consumed,
          reason: 'sale',
          refType: 'order',
          refId: orderId as unknown as string,
          at: now,
        });
      }
    }

    if (customer) {
      if (earned > 0) {
        await ctx.db.insert('loyaltyTransactions', {
          cafeId,
          customerId: customer._id,
          orderId,
          type: 'earn',
          points: earned,
          at: now,
        });
      }
      await ctx.db.patch(customer._id, {
        pointsBalance: customer.pointsBalance + earned,
        visitCount: customer.visitCount + 1,
        totalSpentIDR: customer.totalSpentIDR + totalIDR,
        lastVisitAt: now,
      });
    }

    return { orderId, totalIDR, changeIDR };
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
  customerId: v.optional(v.id('customers')),
  pointsRedeemed: v.optional(v.number()),
  pointsRedeemedIDR: v.optional(v.number()),
  pointsEarned: v.optional(v.number()),
  totalIDR: v.number(),
  paymentMethod: v.union(
    v.literal('cash'),
    v.literal('qris_static'),
    v.literal('qris_dynamic')
  ),
  paymentStatus: v.union(v.literal('pending'), v.literal('paid'), v.literal('void')),
  createdAtClient: v.number(),
  syncedAt: v.optional(v.number()),
});

const orderDetail = v.object({
  ...orderSummary.fields,
  cashierName: v.string(),
  payment: v.union(
    v.object({
      method: v.union(
        v.literal('cash'),
        v.literal('qris_static'),
        v.literal('qris_dynamic')
      ),
      amountIDR: v.number(),
      cashTenderedIDR: v.optional(v.number()),
      changeIDR: v.optional(v.number()),
      confirmedAt: v.optional(v.number()),
    }),
    v.null()
  ),
});

export const listForShift = query({
  args: { shiftId: v.id('shifts') },
  returns: v.array(orderSummary),
  handler: async (ctx, { shiftId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, shiftId, 'Shift');
    const rows = await ctx.db
      .query('orders')
      .withIndex('by_shift', (q) => q.eq('shiftId', shiftId))
      .collect();
    return rows.sort((a, b) => b.createdAtClient - a.createdAtClient);
  },
});

export const getById = query({
  args: { id: v.id('orders') },
  returns: v.union(orderDetail, v.null()),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const order = await ctx.db.get(id);
    if (!order || order.cafeId !== cafeId) return null;
    const cashier = await ctx.db.get(order.cashierId);
    const payment = await ctx.db
      .query('payments')
      .withIndex('by_order', (q) => q.eq('orderId', order._id))
      .unique();
    const paymentObj = payment
      ? {
          method: payment.method,
          amountIDR: payment.amountIDR,
          ...(payment.cashTenderedIDR !== undefined && { cashTenderedIDR: payment.cashTenderedIDR }),
          ...(payment.changeIDR !== undefined && { changeIDR: payment.changeIDR }),
          ...(payment.confirmedAt !== undefined && { confirmedAt: payment.confirmedAt }),
        }
      : null;
    return {
      ...order,
      cashierName: cashier?.name ?? '—',
      payment: paymentObj,
    };
  },
});
