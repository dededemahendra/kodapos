import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';
import { currentStockQty } from './lib/inventory';
import { methodTotals } from './lib/payment';
import { DAY_MS, dayKeyFn, startOfLocalDay, tzFor } from './lib/time';

const paymentStatus = v.union(
  v.literal('pending'),
  v.literal('paid'),
  v.literal('void')
);
const canonicalUnit = v.union(
  v.literal('g'),
  v.literal('ml'),
  v.literal('piece')
);

/** Buckets the last 7 cafe-local days (oldest → newest), keyed by day. Returns
 *  the ordered buckets plus a `windowStart` instant for the index range scan
 *  and a `bucketFor` that resolves an order's instant to its bucket (or null). */
function sevenDayBuckets<T extends object>(
  tz: string,
  nowMs: number,
  init: () => T
): {
  windowStart: number;
  buckets: Array<{ day: string } & T>;
  bucketFor: (atMs: number) => ({ day: string } & T) | undefined;
} {
  const keyOf = dayKeyFn(tz);
  const buckets = Array.from({ length: 7 }, (_, i) => ({
    day: keyOf(nowMs - (6 - i) * DAY_MS),
    ...init(),
  }));
  const byDay = new Map(buckets.map((b) => [b.day, b]));
  return {
    windowStart: startOfLocalDay(tz, 6, nowMs),
    buckets,
    bucketFor: (atMs) => byDay.get(keyOf(atMs)),
  };
}

function pctDelta(cur: number, prev: number): number {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

function lineItemQty(o: Doc<'orders'>): number {
  return o.lines.reduce((sum, l) => sum + l.qty, 0);
}

/** Today's KPIs with deltas vs yesterday. */
export const kpis = query({
  args: {},
  returns: v.object({
    revenueIDR: v.number(),
    revenueDeltaPct: v.number(),
    orders: v.number(),
    ordersDeltaPct: v.number(),
    avgOrderIDR: v.number(),
    avgOrderDeltaPct: v.number(),
    itemsSold: v.number(),
    itemsSoldDeltaPct: v.number(),
  }),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const tz = await tzFor(ctx, cafeId);
    const now = Date.now();
    const todayStart = startOfLocalDay(tz, 0, now);
    const yesterdayStart = startOfLocalDay(tz, 1, now);

    const rows = await ctx.db
      .query('orders')
      .withIndex('by_cafe_created', (q) =>
        q.eq('cafeId', cafeId).gte('createdAtClient', yesterdayStart)
      )
      .collect();
    const paid = rows.filter((o) => o.paymentStatus === 'paid');
    const today = paid.filter((o) => o.createdAtClient >= todayStart);
    const yest = paid.filter(
      (o) => o.createdAtClient >= yesterdayStart && o.createdAtClient < todayStart
    );

    const sum = (a: Doc<'orders'>[]) => a.reduce((s, o) => s + o.totalIDR, 0);
    const items = (a: Doc<'orders'>[]) => a.reduce((s, o) => s + lineItemQty(o), 0);

    const tRev = sum(today);
    const yRev = sum(yest);
    const tOrders = today.length;
    const yOrders = yest.length;
    const tAvg = tOrders ? tRev / tOrders : 0;
    const yAvg = yOrders ? yRev / yOrders : 0;
    const tItems = items(today);
    const yItems = items(yest);

    return {
      revenueIDR: tRev,
      revenueDeltaPct: pctDelta(tRev, yRev),
      orders: tOrders,
      ordersDeltaPct: pctDelta(tOrders, yOrders),
      avgOrderIDR: Math.round(tAvg),
      avgOrderDeltaPct: pctDelta(tAvg, yAvg),
      itemsSold: tItems,
      itemsSoldDeltaPct: pctDelta(tItems, yItems),
    };
  },
});

/** Daily paid revenue for the last 7 days (oldest → newest). */
export const revenueDaily = query({
  args: {},
  returns: v.array(v.object({ day: v.string(), revenueIDR: v.number() })),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const tz = await tzFor(ctx, cafeId);
    const { windowStart, buckets, bucketFor } = sevenDayBuckets(
      tz,
      Date.now(),
      () => ({ revenueIDR: 0 })
    );
    const rows = await ctx.db
      .query('orders')
      .withIndex('by_cafe_created', (q) =>
        q.eq('cafeId', cafeId).gte('createdAtClient', windowStart)
      )
      .collect();
    for (const o of rows) {
      if (o.paymentStatus !== 'paid') continue;
      const b = bucketFor(o.createdAtClient);
      if (b) b.revenueIDR += o.totalIDR;
    }
    return buckets;
  },
});

/** Daily transaction counts by payment method, last 7 days (QRIS = static+dynamic). */
export const paymentMethods = query({
  args: {},
  returns: v.array(
    v.object({ day: v.string(), cash: v.number(), qris: v.number() })
  ),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const tz = await tzFor(ctx, cafeId);
    const { windowStart, buckets, bucketFor } = sevenDayBuckets(
      tz,
      Date.now(),
      () => ({ cash: 0, qris: 0 })
    );
    const rows = await ctx.db
      .query('orders')
      .withIndex('by_cafe_created', (q) =>
        q.eq('cafeId', cafeId).gte('createdAtClient', windowStart)
      )
      .collect();
    for (const o of rows) {
      if (o.paymentStatus !== 'paid') continue;
      const b = bucketFor(o.createdAtClient);
      if (!b) continue;
      // A split touches both channels: count each method the order used.
      const methods = new Set(methodTotals(o).map((t) => t.method));
      if (methods.has('cash')) b.cash += 1;
      if (methods.has('qris_static') || methods.has('qris_dynamic')) b.qris += 1;
    }
    return buckets;
  },
});

/** Latest orders for the recent-transactions table. */
export const recentOrders = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id('orders'),
      cashier: v.string(),
      totalIDR: v.number(),
      status: paymentStatus,
      at: v.number(),
    })
  ),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('orders')
      .withIndex('by_cafe_created', (q) => q.eq('cafeId', cafeId))
      .order('desc')
      .take(6);
    const names = new Map<string, string>();
    const out = [];
    for (const o of rows) {
      let cashier = names.get(o.cashierId);
      if (cashier === undefined) {
        const staff = await ctx.db.get(o.cashierId);
        cashier = staff?.name ?? '—';
        names.set(o.cashierId, cashier);
      }
      out.push({
        id: o._id,
        cashier,
        totalIDR: o.totalIDR,
        status: o.paymentStatus,
        at: o.createdAtClient,
      });
    }
    return out;
  },
});

/** Ingredients at or below their reorder threshold. */
export const lowStock = query({
  args: {},
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
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const ingredients = await ctx.db
      .query('ingredients')
      .withIndex('by_cafe_active', (q) =>
        q.eq('cafeId', cafeId).eq('archived', false)
      )
      .collect();
    const low = [];
    for (const ing of ingredients) {
      const qty = await currentStockQty(ctx, cafeId, ing._id);
      if (qty < ing.reorderThreshold) {
        low.push({
          id: ing._id,
          name: ing.name,
          currentStockQty: qty,
          reorderThreshold: ing.reorderThreshold,
          unit: ing.canonicalUnit,
        });
      }
    }
    low.sort((a, b) => a.currentStockQty - b.currentStockQty);
    return { count: low.length, items: low.slice(0, 5) };
  },
});

/** Recent activity feed: latest paid sales + shift open/close events. */
export const recentActivity = query({
  args: {},
  returns: v.array(
    v.object({
      type: v.union(
        v.literal('sale'),
        v.literal('shift-open'),
        v.literal('shift-close')
      ),
      at: v.number(),
      amountIDR: v.optional(v.number()),
    })
  ),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const orders = await ctx.db
      .query('orders')
      .withIndex('by_cafe_created', (q) => q.eq('cafeId', cafeId))
      .order('desc')
      .take(5);
    const shifts = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_opened', (q) => q.eq('cafeId', cafeId))
      .order('desc')
      .take(5);

    const feed: Array<{
      type: 'sale' | 'shift-open' | 'shift-close';
      at: number;
      amountIDR?: number;
    }> = [];
    for (const o of orders) {
      if (o.paymentStatus === 'paid') {
        feed.push({ type: 'sale', at: o.createdAtClient, amountIDR: o.totalIDR });
      }
    }
    for (const s of shifts) {
      feed.push({ type: 'shift-open', at: s.openedAt });
      if (s.closedAt !== undefined) {
        feed.push({ type: 'shift-close', at: s.closedAt });
      }
    }
    feed.sort((a, b) => b.at - a.at);
    return feed.slice(0, 6);
  },
});
