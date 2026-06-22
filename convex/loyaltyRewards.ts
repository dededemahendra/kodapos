import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireActiveOutlet } from './lib/auth';

const rewardDoc = v.object({
  _id: v.id('loyaltyRewards'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  pointsCost: v.number(),
  discountIDR: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

/** Validate a reward's fields. Returns the trimmed name or throws (off-catalog Bahasa). */
function assertReward(name: string, pointsCost: number, discountIDR: number): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 60) throw new Error('Nama reward tidak valid.');
  if (!Number.isInteger(pointsCost) || pointsCost <= 0) throw new Error('Poin tidak valid.');
  if (!Number.isInteger(discountIDR) || discountIDR <= 0) throw new Error('Diskon tidak valid.');
  return trimmed;
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(rewardDoc),
  handler: async (ctx, { includeArchived = false }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const rows = await ctx.db
      .query('loyaltyRewards')
      .withIndex('by_cafe_active', (q) =>
        includeArchived ? q.eq('cafeId', cafeId) : q.eq('cafeId', cafeId).eq('archived', false)
      )
      .collect();
    return rows.sort((a, b) => a.pointsCost - b.pointsCost);
  },
});

export const create = mutation({
  args: { name: v.string(), pointsCost: v.number(), discountIDR: v.number() },
  returns: v.id('loyaltyRewards'),
  handler: async (ctx, { name, pointsCost, discountIDR }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const cleanName = assertReward(name, pointsCost, discountIDR);
    return await ctx.db.insert('loyaltyRewards', {
      cafeId,
      name: cleanName,
      pointsCost,
      discountIDR,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('loyaltyRewards'),
    name: v.string(),
    pointsCost: v.number(),
    discountIDR: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { id, name, pointsCost, discountIDR }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, id, 'Reward');
    const cleanName = assertReward(name, pointsCost, discountIDR);
    await ctx.db.patch(id, { name: cleanName, pointsCost, discountIDR });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('loyaltyRewards') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, id, 'Reward');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

/** Active rewards the customer can afford (pointsCost <= pointsBalance), for the
 *  checkout picker. When afterPromoIDR is provided, also drops rewards whose
 *  discountIDR exceeds the post-promo cart remainder, so the picker never offers
 *  a reward checkout would reject with "Reward melebihi total.". Sorted by
 *  pointsCost asc. */
export const listForCustomer = query({
  args: { customerId: v.id('customers'), afterPromoIDR: v.optional(v.number()) },
  returns: v.array(rewardDoc),
  handler: async (ctx, { customerId, afterPromoIDR }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const customer = await requireOwned(ctx, cafeId, customerId, 'Pelanggan');
    const rows = await ctx.db
      .query('loyaltyRewards')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    return rows
      .filter(
        (r) =>
          r.pointsCost <= customer.pointsBalance &&
          (afterPromoIDR === undefined || r.discountIDR <= afterPromoIDR)
      )
      .sort((a, b) => a.pointsCost - b.pointsCost);
  },
});
