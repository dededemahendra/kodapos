import { v } from 'convex/values';
import { query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { getAuthUserId } from '@convex-dev/auth/server';
import { requireActiveOutlet, resolveOutletAccess } from './lib/auth';
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
  const { cafeId } = await requireActiveOutlet(ctx);
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

/**
 * Per-cafe overview metrics for a window. Pulled out of `overview` so the
 * consolidated `businessOverview` can run the identical computation for each
 * accessible outlet. Net revenue = paid order totals minus refunds dated in
 * the window; AOV is off net revenue.
 */
async function computeOverview(
  ctx: QueryCtx,
  cafeId: Id<'cafes'>,
  range: RangeArgs
): Promise<{
  revenueIDR: number;
  refundsIDR: number;
  orders: number;
  aovIDR: number;
  itemsSold: number;
  fromKey: string;
  toKey: string;
}> {
  const tz = await tzFor(ctx, cafeId);
  const { startMs, endMs, fromKey, toKey } = resolveRange(tz, range, Date.now());
  const rows = await ctx.db
    .query('orders')
    .withIndex('by_cafe_created', (q) =>
      q.eq('cafeId', cafeId).gte('createdAtClient', startMs).lte('createdAtClient', endMs)
    )
    .collect();
  const paid = rows.filter((o) => o.paymentStatus === 'paid');
  const grossRevenueIDR = paid.reduce((s, o) => s + o.totalIDR, 0);
  const refunds = await ctx.db
    .query('refunds')
    .withIndex('by_cafe_at', (q) => q.eq('cafeId', cafeId).gte('at', startMs).lte('at', endMs))
    .collect();
  const refundsIDR = refunds.reduce((s, r) => s + r.amountIDR, 0);
  const revenueIDR = grossRevenueIDR - refundsIDR;
  const orders = paid.length;
  const itemsSold = paid.reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty, 0), 0);
  const aovIDR = orders === 0 ? 0 : Math.round(revenueIDR / orders);
  return { revenueIDR, refundsIDR, orders, aovIDR, itemsSold, fromKey, toKey };
}

export const overview = query({
  args: { range: rangeArg },
  returns: v.object({
    revenueIDR: v.number(),
    refundsIDR: v.number(),
    orders: v.number(),
    aovIDR: v.number(),
    itemsSold: v.number(),
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { range }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    return computeOverview(ctx, cafeId, range);
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
    const { cafeId, tz, fromKey, toKey, paid } = await paidInRange(ctx, range);
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
    // Net out refunds dated (by `refund.at`) into their own day's bucket, so the
    // chart reconciles with the net KPI rather than overstating gross revenue.
    const { startMs, endMs } = resolveRange(tz, range, Date.now());
    const refunds = await ctx.db
      .query('refunds')
      .withIndex('by_cafe_at', (q) => q.eq('cafeId', cafeId).gte('at', startMs).lte('at', endMs))
      .collect();
    for (const r of refunds) {
      const b = byDay.get(keyOf(r.at));
      if (b) b.revenueIDR -= r.amountIDR;
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
      // COGS is qty * wastage * unit cost, so it is fractional; round to whole
      // rupiah (amounts are displayed via formatIDR, which requires integers).
      const cogsIDR = Math.round(a.cogsIDR);
      const marginIDR = a.revenueIDR - cogsIDR;
      return {
        name,
        qty: a.qty,
        revenueIDR: a.revenueIDR,
        cogsIDR,
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
    refundsIDR: v.number(),
    netRevenueIDR: v.number(),
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
    otherIncomeIDR: v.number(),
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
    let grossCogsIDR = 0;
    for (const o of paid) {
      revenueIDR += o.totalIDR;
      for (const l of o.lines) {
        const unitCogs = (l.recipeSnapshot ?? []).reduce(
          (s, rl) => s + rl.qty * rl.wastageFactor * (cost.get(rl.ingredientId) ?? 0),
          0
        );
        grossCogsIDR += l.qty * unitCogs;
      }
    }
    // Operating expenses in the same range (the non-inventory expenses table).
    const { startMs, endMs } = resolveRange(tz, range, Date.now());
    // Refunds are dated by `refund.at` — net them (and their COGS) out of the
    // refund's period, not the original sale's. COGS uses the order's own
    // recipeSnapshot so it matches what the sale deducted.
    const refunds = await ctx.db
      .query('refunds')
      .withIndex('by_cafe_at', (q) =>
        q.eq('cafeId', cafeId).gte('at', startMs).lte('at', endMs)
      )
      .collect();
    let refundsIDR = 0;
    let refundCogsIDR = 0;
    for (const r of refunds) {
      refundsIDR += r.amountIDR;
      const order = await ctx.db.get(r.orderId);
      if (!order) continue;
      for (const line of r.lines) {
        const orderLine = order.lines[line.lineIndex];
        if (!orderLine) continue;
        const unitCogs = (orderLine.recipeSnapshot ?? []).reduce(
          (s, rl) => s + rl.qty * rl.wastageFactor * (cost.get(rl.ingredientId) ?? 0),
          0
        );
        refundCogsIDR += line.qty * unitCogs;
      }
    }
    const netRevenueIDR = revenueIDR - refundsIDR;
    // COGS is qty * wastage * unit cost, so it is fractional; round to whole
    // rupiah so every derived figure (and formatIDR, which requires an integer)
    // stays integral.
    const cogsIDR = Math.round(grossCogsIDR - refundCogsIDR);
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
    // Non-sales income in the same range (the otherIncome ledger).
    const incomes = await ctx.db
      .query('otherIncome')
      .withIndex('by_cafe_at', (q) =>
        q.eq('cafeId', cafeId).gte('at', startMs).lte('at', endMs)
      )
      .collect();
    let otherIncomeIDR = 0;
    for (const i of incomes) {
      otherIncomeIDR += i.amountIDR;
    }
    const grossProfitIDR = netRevenueIDR - cogsIDR;
    const netProfitIDR = grossProfitIDR - expensesIDR + otherIncomeIDR;
    return {
      revenueIDR,
      refundsIDR,
      netRevenueIDR,
      cogsIDR,
      grossProfitIDR,
      expensesIDR,
      expensesByCategory: [...byCat.entries()].map(([category, amountIDR]) => ({
        category: category as 'rent' | 'utilities' | 'supplies' | 'salary' | 'other',
        amountIDR,
      })),
      otherIncomeIDR,
      netProfitIDR,
      // Guard a non-positive denominator: a negative netRevenue (refunds > sales)
      // would otherwise invert the sign / blow past the documented 0..100 range.
      grossMarginPct: netRevenueIDR <= 0 ? 0 : Math.round((grossProfitIDR / netRevenueIDR) * 100),
      netMarginPct: netRevenueIDR <= 0 ? 0 : Math.round((netProfitIDR / netRevenueIDR) * 100),
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

export const businessOverview = query({
  args: { range: rangeArg },
  returns: v.object({
    outlets: v.array(
      v.object({
        cafeId: v.id('cafes'),
        name: v.string(),
        revenueIDR: v.number(),
        refundsIDR: v.number(),
        orders: v.number(),
        aovIDR: v.number(),
        itemsSold: v.number(),
      })
    ),
    totals: v.object({
      revenueIDR: v.number(),
      refundsIDR: v.number(),
      orders: v.number(),
      aovIDR: v.number(),
      itemsSold: v.number(),
    }),
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { range }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('not authenticated');
    const access = await resolveOutletAccess(ctx, userId);
    if (!access || access.accessibleCafeIds.length === 0) {
      throw new Error('no outlet access');
    }
    const outlets = [];
    let fromKey = '';
    let toKey = '';
    for (const cafeId of access.accessibleCafeIds) {
      const cafe = await ctx.db.get(cafeId);
      if (!cafe) continue; // tolerate a dangling id defensively
      const ov = await computeOverview(ctx, cafeId, range);
      // Outlets in one business share a timezone in practice; use each
      // computed window (last wins) for the range label.
      fromKey = ov.fromKey;
      toKey = ov.toKey;
      outlets.push({
        cafeId,
        name: cafe.name,
        revenueIDR: ov.revenueIDR,
        refundsIDR: ov.refundsIDR,
        orders: ov.orders,
        aovIDR: ov.aovIDR,
        itemsSold: ov.itemsSold,
      });
    }
    outlets.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
    const totals = outlets.reduce(
      (t, o) => ({
        revenueIDR: t.revenueIDR + o.revenueIDR,
        refundsIDR: t.refundsIDR + o.refundsIDR,
        orders: t.orders + o.orders,
        itemsSold: t.itemsSold + o.itemsSold,
      }),
      { revenueIDR: 0, refundsIDR: 0, orders: 0, itemsSold: 0 }
    );
    const aovIDR = totals.orders === 0 ? 0 : Math.round(totals.revenueIDR / totals.orders);
    return { outlets, totals: { ...totals, aovIDR }, fromKey, toKey };
  },
});
