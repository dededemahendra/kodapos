import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireActiveOutlet } from './lib/auth';
import { EXPENSE_CATEGORIES, expenseCategoryValidator } from './lib/expense';
import { rangeArg, resolveRange, tzFor } from './lib/time';

type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const record = mutation({
  args: {
    category: expenseCategoryValidator,
    amountIDR: v.number(),
    note: v.optional(v.string()),
  },
  returns: v.id('expenses'),
  handler: async (ctx, { category, amountIDR, note }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    if (!Number.isInteger(amountIDR) || amountIDR <= 0) {
      throw new Error('Jumlah harus lebih dari nol.');
    }
    const trimmed = note?.trim();
    return await ctx.db.insert('expenses', {
      cafeId,
      category,
      amountIDR,
      ...(trimmed ? { note: trimmed } : {}),
      at: Date.now(),
    });
  },
});

const expenseRow = v.object({
  id: v.id('expenses'),
  at: v.number(),
  category: expenseCategoryValidator,
  amountIDR: v.number(),
  note: v.optional(v.string()),
});

export const list = query({
  args: { range: rangeArg },
  returns: v.object({
    rows: v.array(expenseRow),
    totalIDR: v.number(),
    byCategory: v.array(
      v.object({ category: expenseCategoryValidator, amountIDR: v.number() })
    ),
  }),
  handler: async (ctx, { range }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const tz = await tzFor(ctx, cafeId);
    const { startMs, endMs } = resolveRange(tz, range, Date.now());
    const rows = await ctx.db
      .query('expenses')
      .withIndex('by_cafe_at', (q) =>
        q.eq('cafeId', cafeId).gte('at', startMs).lte('at', endMs)
      )
      .order('desc')
      .collect();
    const byCatMap = new Map<ExpenseCategory, number>();
    let totalIDR = 0;
    for (const r of rows) {
      totalIDR += r.amountIDR;
      byCatMap.set(r.category, (byCatMap.get(r.category) ?? 0) + r.amountIDR);
    }
    return {
      rows: rows.map((r) => ({
        id: r._id,
        at: r.at,
        category: r.category,
        amountIDR: r.amountIDR,
        ...(r.note ? { note: r.note } : {}),
      })),
      totalIDR,
      byCategory: [...byCatMap.entries()].map(([category, amountIDR]) => ({
        category,
        amountIDR,
      })),
    };
  },
});

export const remove = mutation({
  args: { id: v.id('expenses') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, id, 'Pengeluaran');
    await ctx.db.delete(id);
    return null;
  },
});
