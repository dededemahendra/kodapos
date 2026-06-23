import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireActiveOutlet } from './lib/auth';
import { dayKeyFn, resolveRange, tzFor } from './lib/time';

// Same range arg shape as reports.* so the page's `useReportRange` range fits.
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

const entryType = v.union(
  v.literal('sale'),
  v.literal('expense'),
  v.literal('other_income'),
  v.literal('refund'),
  v.literal('purchase')
);

const method = v.union(
  v.literal('cash'),
  v.literal('qris_static'),
  v.literal('qris_dynamic'),
  v.literal('giftcard'),
  v.literal('split')
);

const ledgerEntry = v.object({
  at: v.number(),
  dateKey: v.string(),
  type: entryType,
  ref: v.string(),
  description: v.string(),
  account: v.string(),
  method: v.optional(method),
  inflowIDR: v.number(),
  outflowIDR: v.number(),
});

type LedgerEntry = {
  at: number;
  dateKey: string;
  type: 'sale' | 'expense' | 'other_income' | 'refund' | 'purchase';
  ref: string;
  description: string;
  account: string;
  method?: 'cash' | 'qris_static' | 'qris_dynamic' | 'giftcard' | 'split';
  inflowIDR: number;
  outflowIDR: number;
};

// Short, human-scannable reference from a Convex id (last 6 chars).
function shortRef(id: string): string {
  return id.slice(-6);
}

/**
 * A combined, date-sorted cash-flow ledger: every money-in / money-out event
 * across the cafe in one range, as bank-statement-style entries (exactly one of
 * inflow/outflow non-zero). Owner-gated, read-only. PO receipts are inventory
 * movements (not cash events) and are intentionally excluded — only the ad-hoc
 * `purchases` table, which records actual spend.
 */
export const ledger = query({
  args: { range: rangeArg },
  returns: v.object({
    entries: v.array(ledgerEntry),
    summary: v.object({
      salesIDR: v.number(),
      otherIncomeIDR: v.number(),
      refundsIDR: v.number(),
      expensesIDR: v.number(),
      purchasesIDR: v.number(),
      inflowIDR: v.number(),
      outflowIDR: v.number(),
      netIDR: v.number(),
    }),
    fromKey: v.string(),
    toKey: v.string(),
  }),
  handler: async (ctx, { range }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const tz = await tzFor(ctx, cafeId);
    const { startMs, endMs, fromKey, toKey } = resolveRange(tz, range, Date.now());
    const keyOf = dayKeyFn(tz);

    const entries: LedgerEntry[] = [];

    // Sales — paid orders dated by createdAtClient.
    const orders = await ctx.db
      .query('orders')
      .withIndex('by_cafe_created', (q) =>
        q.eq('cafeId', cafeId).gte('createdAtClient', startMs).lte('createdAtClient', endMs)
      )
      .collect();
    let salesIDR = 0;
    for (const o of orders) {
      if (o.paymentStatus !== 'paid') continue;
      salesIDR += o.totalIDR;
      const itemCount = o.lines.reduce((n, l) => n + l.qty, 0);
      entries.push({
        at: o.createdAtClient,
        dateKey: keyOf(o.createdAtClient),
        type: 'sale',
        ref: shortRef(o._id),
        description: `${itemCount} item`,
        account: 'Penjualan',
        method: o.paymentMethod,
        inflowIDR: o.totalIDR,
        outflowIDR: 0,
      });
    }

    // Refunds — dated by refund.at.
    const refunds = await ctx.db
      .query('refunds')
      .withIndex('by_cafe_at', (q) => q.eq('cafeId', cafeId).gte('at', startMs).lte('at', endMs))
      .collect();
    let refundsIDR = 0;
    for (const r of refunds) {
      refundsIDR += r.amountIDR;
      entries.push({
        at: r.at,
        dateKey: keyOf(r.at),
        type: 'refund',
        ref: shortRef(r.orderId),
        description: 'Pengembalian pesanan',
        account: 'Pengembalian',
        method: r.method,
        inflowIDR: 0,
        outflowIDR: r.amountIDR,
      });
    }

    // Expenses — dated by expense.at.
    const expenses = await ctx.db
      .query('expenses')
      .withIndex('by_cafe_at', (q) => q.eq('cafeId', cafeId).gte('at', startMs).lte('at', endMs))
      .collect();
    let expensesIDR = 0;
    for (const e of expenses) {
      expensesIDR += e.amountIDR;
      entries.push({
        at: e.at,
        dateKey: keyOf(e.at),
        type: 'expense',
        ref: shortRef(e._id),
        description: e.category,
        account: 'Pengeluaran',
        inflowIDR: 0,
        outflowIDR: e.amountIDR,
      });
    }

    // Other income — dated by otherIncome.at.
    const incomes = await ctx.db
      .query('otherIncome')
      .withIndex('by_cafe_at', (q) => q.eq('cafeId', cafeId).gte('at', startMs).lte('at', endMs))
      .collect();
    let otherIncomeIDR = 0;
    for (const i of incomes) {
      otherIncomeIDR += i.amountIDR;
      entries.push({
        at: i.at,
        dateKey: keyOf(i.at),
        type: 'other_income',
        ref: shortRef(i._id),
        description: i.source,
        account: 'Pendapatan Lain',
        inflowIDR: i.amountIDR,
        outflowIDR: 0,
      });
    }

    // Purchases — the ad-hoc spend table, dated by purchase.at.
    const purchases = await ctx.db
      .query('purchases')
      .withIndex('by_cafe_at', (q) => q.eq('cafeId', cafeId).gte('at', startMs).lte('at', endMs))
      .collect();
    let purchasesIDR = 0;
    for (const p of purchases) {
      purchasesIDR += p.totalIDR;
      entries.push({
        at: p.at,
        dateKey: keyOf(p.at),
        type: 'purchase',
        ref: shortRef(p._id),
        description: p.supplierName ?? '—',
        account: 'Pembelian',
        inflowIDR: 0,
        outflowIDR: p.totalIDR,
      });
    }

    entries.sort((a, b) => a.at - b.at);

    const inflowIDR = salesIDR + otherIncomeIDR;
    const outflowIDR = refundsIDR + expensesIDR + purchasesIDR;
    return {
      entries,
      summary: {
        salesIDR,
        otherIncomeIDR,
        refundsIDR,
        expensesIDR,
        purchasesIDR,
        inflowIDR,
        outflowIDR,
        netIDR: inflowIDR - outflowIDR,
      },
      fromKey,
      toKey,
    };
  },
});
