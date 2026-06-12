import { v } from 'convex/values';
import { query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';
import { methodTotals } from './lib/payment';
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

export const margin = query({
  args: { range: rangeArg },
  returns: v.object({
    items: v.array(
      v.object({
        name: v.string(),
        qty: v.number(),
        revenueIDR: v.number(),
        cogsIDR: v.number(),
        marginIDR: v.number(),
        marginPct: v.number(), // 0..100, 0 when revenue is 0
      })
    ),
    totalRevenueIDR: v.number(),
    totalCogsIDR: v.number(),
    totalMarginIDR: v.number(),
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { range }) => {
    const { cafeId, fromKey, toKey, paid } = await paidInRange(ctx, range);
    // current ingredient cost map
    const ingredients = await ctx.db
      .query('ingredients')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    const cost = new Map(ingredients.map((i) => [i._id, i.lastCostPerUnitIDR]));
    const byName = new Map<string, { qty: number; revenueIDR: number; cogsIDR: number }>();
    for (const o of paid) {
      for (const l of o.lines) {
        const unitCogs = (l.recipeSnapshot ?? []).reduce(
          (s, rl) => s + rl.qty * rl.wastageFactor * (cost.get(rl.ingredientId) ?? 0),
          0
        );
        const cur = byName.get(l.nameSnapshot) ?? { qty: 0, revenueIDR: 0, cogsIDR: 0 };
        cur.qty += l.qty;
        cur.revenueIDR += l.lineTotalIDR;
        cur.cogsIDR += l.qty * unitCogs;
        byName.set(l.nameSnapshot, cur);
      }
    }
    const items = Array.from(byName, ([name, a]) => {
      const marginIDR = a.revenueIDR - a.cogsIDR;
      return {
        name,
        qty: a.qty,
        revenueIDR: a.revenueIDR,
        cogsIDR: a.cogsIDR,
        marginIDR,
        marginPct: a.revenueIDR === 0 ? 0 : Math.round((marginIDR / a.revenueIDR) * 100),
      };
    }).sort(
      (x, y) =>
        y.marginIDR - x.marginIDR ||
        y.revenueIDR - x.revenueIDR ||
        x.name.localeCompare(y.name, 'id-ID')
    );
    const totalRevenueIDR = items.reduce((s, i) => s + i.revenueIDR, 0);
    const totalCogsIDR = items.reduce((s, i) => s + i.cogsIDR, 0);
    return {
      items,
      totalRevenueIDR,
      totalCogsIDR,
      totalMarginIDR: totalRevenueIDR - totalCogsIDR,
      fromKey,
      toKey,
    };
  },
});

export const profitLoss = query({
  args: { range: rangeArg },
  returns: v.object({
    revenueIDR: v.number(),
    cogsIDR: v.number(),
    grossProfitIDR: v.number(),
    expensesIDR: v.number(),
    expensesByCategory: v.array(
      v.object({
        category: v.union(
          v.literal('rent'),
          v.literal('utilities'),
          v.literal('supplies'),
          v.literal('salary'),
          v.literal('other')
        ),
        amountIDR: v.number(),
      })
    ),
    netProfitIDR: v.number(),
    grossMarginPct: v.number(), // 0..100, 0 when revenue is 0
    netMarginPct: v.number(), // can be negative
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { range }) => {
    const { cafeId, tz, fromKey, toKey, paid } = await paidInRange(ctx, range);
    // Revenue + recipe COGS (mirror the margin computation).
    const ingredients = await ctx.db
      .query('ingredients')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    const cost = new Map(ingredients.map((i) => [i._id, i.lastCostPerUnitIDR]));
    let revenueIDR = 0;
    let cogsIDR = 0;
    for (const o of paid) {
      revenueIDR += o.totalIDR;
      for (const l of o.lines) {
        const unitCogs = (l.recipeSnapshot ?? []).reduce(
          (s, rl) => s + rl.qty * rl.wastageFactor * (cost.get(rl.ingredientId) ?? 0),
          0
        );
        cogsIDR += l.qty * unitCogs;
      }
    }
    // Operating expenses in the same range (the non-inventory expenses table).
    const { startMs, endMs } = resolveRange(tz, range, Date.now());
    const expenses = await ctx.db
      .query('expenses')
      .withIndex('by_cafe_at', (q) =>
        q.eq('cafeId', cafeId).gte('at', startMs).lte('at', endMs)
      )
      .collect();
    const byCat = new Map<string, number>();
    let expensesIDR = 0;
    for (const e of expenses) {
      expensesIDR += e.amountIDR;
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amountIDR);
    }
    const grossProfitIDR = revenueIDR - cogsIDR;
    const netProfitIDR = grossProfitIDR - expensesIDR;
    return {
      revenueIDR,
      cogsIDR,
      grossProfitIDR,
      expensesIDR,
      expensesByCategory: [...byCat.entries()].map(([category, amountIDR]) => ({
        category: category as 'rent' | 'utilities' | 'supplies' | 'salary' | 'other',
        amountIDR,
      })),
      netProfitIDR,
      grossMarginPct: revenueIDR === 0 ? 0 : Math.round((grossProfitIDR / revenueIDR) * 100),
      netMarginPct: revenueIDR === 0 ? 0 : Math.round((netProfitIDR / revenueIDR) * 100),
      fromKey,
      toKey,
    };
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
          v.literal('qris_dynamic'),
          v.literal('giftcard')
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
    const order: Array<'cash' | 'qris_static' | 'qris_dynamic' | 'giftcard'> = ['cash', 'qris_static', 'qris_dynamic', 'giftcard'];
    const byMethod = new Map<string, { count: number; amountIDR: number }>();
    for (const o of paid) {
      // Each order contributes to every method it used (a split touches 2+).
      // count = number of orders that used the method (once per order/method).
      for (const entry of methodTotals(o)) {
        const cur = byMethod.get(entry.method) ?? { count: 0, amountIDR: 0 };
        cur.count += 1;
        cur.amountIDR += entry.amountIDR;
        byMethod.set(entry.method, cur);
      }
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
