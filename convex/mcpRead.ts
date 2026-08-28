import { v } from 'convex/values';
import { internalQuery } from './_generated/server';
import { computeCafeInfo } from './cafes';
import { computeKpis, computeLowStock } from './dashboard';
import { rangeArg } from './lib/time';
import { computeOverview, computeProducts } from './reports';

const canonicalUnit = v.union(v.literal('g'), v.literal('ml'), v.literal('piece'));

/**
 * Internal read queries for the v1 read-only MCP server. Each takes an
 * explicit `cafeId` (no `requireActiveOutlet`/session resolution) since the
 * caller is a token-authenticated MCP tool, not a signed-in browser session;
 * cross-tenant isolation comes entirely from the caller passing the right
 * `cafeId`, so every query here must stay a thin wrapper around a `compute*`
 * helper that never widens beyond the given cafe.
 */

export const cafeInfo = internalQuery({
  args: { cafeId: v.id('cafes') },
  returns: v.object({
    name: v.string(),
    timezone: v.string(),
    taxRatePct: v.number(),
    taxEnabled: v.boolean(),
    currency: v.literal('IDR'),
  }),
  handler: async (ctx, { cafeId }) => computeCafeInfo(ctx, cafeId),
});

export const kpis = internalQuery({
  args: { cafeId: v.id('cafes') },
  returns: v.object({
    revenueIDR: v.number(),
    refundsIDR: v.number(),
    revenueDeltaPct: v.number(),
    orders: v.number(),
    ordersDeltaPct: v.number(),
    avgOrderIDR: v.number(),
    avgOrderDeltaPct: v.number(),
    itemsSold: v.number(),
    itemsSoldDeltaPct: v.number(),
  }),
  handler: async (ctx, { cafeId }) => computeKpis(ctx, cafeId),
});

export const salesSummary = internalQuery({
  args: { cafeId: v.id('cafes'), range: rangeArg },
  returns: v.object({
    revenueIDR: v.number(),
    refundsIDR: v.number(),
    orders: v.number(),
    aovIDR: v.number(),
    itemsSold: v.number(),
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { cafeId, range }) => computeOverview(ctx, cafeId, range),
});

export const topProducts = internalQuery({
  args: { cafeId: v.id('cafes'), range: rangeArg, limit: v.optional(v.number()) },
  returns: v.object({
    items: v.array(v.object({ name: v.string(), qty: v.number(), revenueIDR: v.number() })),
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { cafeId, range, limit }) => {
    const { items, fromKey, toKey } = await computeProducts(ctx, cafeId, range);
    return { items: items.slice(0, Math.min(limit ?? 10, 50)), fromKey, toKey };
  },
});

export const lowStock = internalQuery({
  args: { cafeId: v.id('cafes') },
  returns: v.object({
    count: v.number(),
    items: v.array(
      v.object({
        id: v.id('ingredients'),
        name: v.string(),
        currentStockQty: v.number(),
        reorderThreshold: v.number(),
        unit: canonicalUnit,
      })
    ),
  }),
  handler: async (ctx, { cafeId }) => computeLowStock(ctx, cafeId),
});
