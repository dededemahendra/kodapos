import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, type MutationCtx } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
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
    createdAtClient: v.optional(v.number()),
  },
  returns: createCashSaleResult,
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);

    // Idempotency check first — return existing order if clientId already used.
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
        throw new Error(`Item ${item?.name ?? ''} tidak tersedia.`.replace(/\s+/g, ' ').trim());
      }

      const modifiersSnapshot: Doc<'orders'>['lines'][number]['modifiersSnapshot'] = [];
      let modifierAdjustments = 0;
      for (const optionId of line.modifierOptionIds) {
        const option = await ctx.db.get(optionId);
        if (!option || option.cafeId !== cafeId || option.archived) {
          throw new Error('Modifier tidak tersedia.');
        }
        const group = await ctx.db.get(option.groupId);
        if (!group) throw new Error('Modifier tidak tersedia.');
        const attachment = await ctx.db
          .query('menuItemModifierGroups')
          .withIndex('by_item', (q) => q.eq('menuItemId', item._id))
          .filter((q) => q.eq(q.field('modifierGroupId'), group._id))
          .unique();
        if (!attachment) throw new Error('Modifier tidak tersedia.');
        modifiersSnapshot.push({
          groupName: group.name,
          optionName: option.name,
          priceAdjustmentIDR: option.priceAdjustmentIDR,
        });
        modifierAdjustments += option.priceAdjustmentIDR;
      }

      const unitPriceIDR = item.priceIDR + modifierAdjustments;
      const lineTotalIDR = line.qty * unitPriceIDR;
      builtLines.push({
        menuItemId: item._id,
        nameSnapshot: item.name,
        qty: line.qty,
        unitPriceIDR,
        modifiersSnapshot,
        lineTotalIDR,
      });
    }

    const subtotalIDR = builtLines.reduce((sum, l) => sum + l.lineTotalIDR, 0);

    const cafe = await ctx.db.get(cafeId);
    const taxEnabled = cafe?.taxEnabled === true;
    const taxRatePct = taxEnabled ? cafe?.taxRatePct ?? 0 : 0;
    const taxIDR = Math.round((subtotalIDR * taxRatePct) / 100);
    const totalIDR = subtotalIDR + taxIDR;

    if (tendered < totalIDR) {
      throw new Error('Uang yang diterima kurang dari total.');
    }

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
      discountIDR: 0,
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

    return { orderId, totalIDR, changeIDR };
  },
});
