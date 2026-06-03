import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';
import { DEFAULT_LOYALTY } from './lib/loyalty';

const configValidator = v.object({
  enabled: v.boolean(),
  earnRatePerIDR: v.number(),
  redeemBlockPoints: v.number(),
  redeemBlockIDR: v.number(),
});

export const getConfig = query({
  args: {},
  returns: configValidator,
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const settings = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    return { ...DEFAULT_LOYALTY, ...(settings?.loyalty ?? {}) };
  },
});

export const updateConfig = mutation({
  args: configValidator,
  returns: v.null(),
  handler: async (ctx, cfg) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    if (cfg.earnRatePerIDR <= 0) throw new Error('Nilai perolehan poin harus lebih dari 0.');
    if (cfg.redeemBlockPoints <= 0 || cfg.redeemBlockIDR <= 0) {
      throw new Error('Nilai penukaran poin harus lebih dari 0.');
    }
    const existing = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { loyalty: cfg, updatedAt: Date.now() });
    } else {
      await ctx.db.insert('cafeSettings', { cafeId, loyalty: cfg, updatedAt: Date.now() });
    }
    return null;
  },
});

export const stats = query({
  args: {},
  returns: v.object({
    memberCount: v.number(),
    pointsOutstanding: v.number(),
    topCustomers: v.array(
      v.object({ _id: v.id('customers'), name: v.string(), pointsBalance: v.number() })
    ),
  }),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const active = await ctx.db
      .query('customers')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    const pointsOutstanding = active.reduce((sum, c) => sum + c.pointsBalance, 0);
    const topCustomers = [...active]
      .sort((a, b) => b.pointsBalance - a.pointsBalance)
      .slice(0, 5)
      .map((c) => ({ _id: c._id, name: c.name, pointsBalance: c.pointsBalance }));
    return { memberCount: active.length, pointsOutstanding, topCustomers };
  },
});
