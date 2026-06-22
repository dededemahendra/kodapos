import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireActiveOutlet } from './lib/auth';
import { DEFAULT_LOYALTY } from './lib/loyalty';

const configValidator = v.object({
  enabled: v.boolean(),
  earnRatePerIDR: v.number(),
  redeemBlockPoints: v.number(),
  redeemBlockIDR: v.number(),
  tiers: v.optional(
    v.array(
      v.object({
        name: v.string(),
        minSpendIDR: v.number(),
        earnMultiplier: v.number(),
      })
    )
  ),
});

export const getConfig = query({
  args: {},
  returns: configValidator,
  handler: async (ctx) => {
    const { cafeId } = await requireActiveOutlet(ctx);
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
    const { cafeId } = await requireActiveOutlet(ctx);
    if (cfg.earnRatePerIDR <= 0) throw new Error('Nilai perolehan poin harus lebih dari 0.');
    if (cfg.redeemBlockPoints <= 0 || cfg.redeemBlockIDR <= 0) {
      throw new Error('Nilai penukaran poin harus lebih dari 0.');
    }

    // Validate + normalize tiers (optional). Store sorted by minSpendIDR asc.
    let tiers = cfg.tiers;
    if (tiers !== undefined) {
      const seenThresholds = new Set<number>();
      for (const tier of tiers) {
        const name = tier.name.trim();
        if (name.length < 1 || name.length > 24) {
          throw new Error('Nama tier harus 1–24 karakter.');
        }
        if (!Number.isInteger(tier.minSpendIDR) || tier.minSpendIDR < 0) {
          throw new Error('Belanja minimum tier tidak valid.');
        }
        if (
          !Number.isFinite(tier.earnMultiplier) ||
          tier.earnMultiplier < 1 ||
          tier.earnMultiplier > 10
        ) {
          throw new Error('Pengali poin harus antara 1 dan 10.');
        }
        if (seenThresholds.has(tier.minSpendIDR)) {
          throw new Error('Ambang tier tidak boleh sama.');
        }
        seenThresholds.add(tier.minSpendIDR);
      }
      tiers = [...tiers]
        .map((t) => ({ name: t.name.trim(), minSpendIDR: t.minSpendIDR, earnMultiplier: t.earnMultiplier }))
        .sort((a, b) => a.minSpendIDR - b.minSpendIDR);
    }
    const loyalty = { ...cfg, ...(tiers !== undefined ? { tiers } : {}) };

    // settings.ts keeps its `getOrCreateSettingsId` helper private, so we inline the same
    // patch-or-insert here; keep in sync if that helper gains required-field initialization.
    const existing = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { loyalty, updatedAt: Date.now() });
    } else {
      await ctx.db.insert('cafeSettings', { cafeId, loyalty, updatedAt: Date.now() });
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
    const { cafeId } = await requireActiveOutlet(ctx);
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
