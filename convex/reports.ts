import { v } from 'convex/values';
import { query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';
import { type RangeArgs, dayKeyFn, eachDayKey, resolveRange, tzFor } from './lib/time';

const rangeArg = v.union(
  v.object({
    preset: v.union(
      v.literal('today'),
      v.literal('yesterday'),
      v.literal('last7'),
      v.literal('last30')
    ),
  }),
  v.object({ from: v.string(), to: v.string() })
);

// Resolves the cafe + tz + window, then returns paid orders in range.
async function paidInRange(
  ctx: QueryCtx,
  range: RangeArgs
) {
  const { cafeId } = await requireOwnerCafe(ctx);
  const tz = await tzFor(ctx, cafeId);
  const { startMs, endMs, fromKey, toKey } = resolveRange(tz, range, Date.now());
  const rows = await ctx.db
    .query('orders')
    .withIndex('by_cafe_created', (q) =>
      q.eq('cafeId', cafeId).gte('createdAtClient', startMs).lte('createdAtClient', endMs)
    )
    .collect();
  return { cafeId, tz, fromKey, toKey, paid: rows.filter((o) => o.paymentStatus === 'paid') };
}

export const overview = query({
  args: { range: rangeArg },
  returns: v.object({
    revenueIDR: v.number(),
    orders: v.number(),
    aovIDR: v.number(),
    itemsSold: v.number(),
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { range }) => {
    const { fromKey, toKey, paid } = await paidInRange(ctx, range);
    const revenueIDR = paid.reduce((s, o) => s + o.totalIDR, 0);
    const orders = paid.length;
    const itemsSold = paid.reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty, 0), 0);
    const aovIDR = orders === 0 ? 0 : Math.round(revenueIDR / orders);
    return { revenueIDR, orders, aovIDR, itemsSold, fromKey, toKey };
  },
});

export const salesDaily = query({
  args: { range: rangeArg },
  returns: v.object({
    days: v.array(
      v.object({ day: v.string(), revenueIDR: v.number(), orders: v.number() })
    ),
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { range }) => {
    const { tz, fromKey, toKey, paid } = await paidInRange(ctx, range);
    const keyOf = dayKeyFn(tz);
    const dayKeys = eachDayKey(fromKey, toKey);
    const byDay = new Map<string, { revenueIDR: number; orders: number }>();
    for (const key of dayKeys) byDay.set(key, { revenueIDR: 0, orders: 0 });
    for (const o of paid) {
      const b = byDay.get(keyOf(o.createdAtClient));
      if (b) {
        b.revenueIDR += o.totalIDR;
        b.orders += 1;
      }
    }
    const days = dayKeys.map((day) => ({ day, ...byDay.get(day)! }));
    return { days, fromKey, toKey };
  },
});

export const products = query({
  args: { range: rangeArg },
  returns: v.object({
    items: v.array(
      v.object({ name: v.string(), qty: v.number(), revenueIDR: v.number() })
    ),
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { range }) => {
    const { fromKey, toKey, paid } = await paidInRange(ctx, range);
    const byName = new Map<string, { qty: number; revenueIDR: number }>();
    for (const o of paid) {
      for (const l of o.lines) {
        const cur = byName.get(l.nameSnapshot) ?? { qty: 0, revenueIDR: 0 };
        cur.qty += l.qty;
        cur.revenueIDR += l.lineTotalIDR;
        byName.set(l.nameSnapshot, cur);
      }
    }
    const items = Array.from(byName, ([name, agg]) => ({ name, ...agg })).sort(
      (a, b) => b.revenueIDR - a.revenueIDR || b.qty - a.qty || a.name.localeCompare(b.name, 'id-ID')
    );
    return { items, fromKey, toKey };
  },
});

export const payments = query({
  args: { range: rangeArg },
  returns: v.object({
    methods: v.array(
      v.object({
        method: v.union(
          v.literal('cash'),
          v.literal('qris_static'),
          v.literal('qris_dynamic')
        ),
        count: v.number(),
        amountIDR: v.number(),
      })
    ),
    totalIDR: v.number(),
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { range }) => {
    const { fromKey, toKey, paid } = await paidInRange(ctx, range);
    const order: Array<'cash' | 'qris_static' | 'qris_dynamic'> = ['cash', 'qris_static', 'qris_dynamic'];
    const byMethod = new Map<string, { count: number; amountIDR: number }>();
    for (const o of paid) {
      const cur = byMethod.get(o.paymentMethod) ?? { count: 0, amountIDR: 0 };
      cur.count += 1;
      cur.amountIDR += o.totalIDR;
      byMethod.set(o.paymentMethod, cur);
    }
    const methods = order
      .filter((m) => byMethod.has(m))
      .map((method) => ({ method, ...byMethod.get(method)! }));
    const totalIDR = paid.reduce((s, o) => s + o.totalIDR, 0);
    return { methods, totalIDR, fromKey, toKey };
  },
});

export const cashiers = query({
  args: { range: rangeArg },
  returns: v.object({
    rows: v.array(
      v.object({
        cashierId: v.id('cafeStaff'),
        name: v.string(),
        orders: v.number(),
        revenueIDR: v.number(),
      })
    ),
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { range }) => {
    const { fromKey, toKey, paid } = await paidInRange(ctx, range);
    const agg = new Map<string, { cashierId: typeof paid[number]['cashierId']; orders: number; revenueIDR: number }>();
    for (const o of paid) {
      const cur = agg.get(o.cashierId) ?? { cashierId: o.cashierId, orders: 0, revenueIDR: 0 };
      cur.orders += 1;
      cur.revenueIDR += o.totalIDR;
      agg.set(o.cashierId, cur);
    }
    const rows = [];
    for (const a of agg.values()) {
      const staff = await ctx.db.get(a.cashierId);
      rows.push({ cashierId: a.cashierId, name: staff?.name ?? '—', orders: a.orders, revenueIDR: a.revenueIDR });
    }
    rows.sort((x, y) => y.revenueIDR - x.revenueIDR || x.name.localeCompare(y.name, 'id-ID'));
    return { rows, fromKey, toKey };
  },
});
