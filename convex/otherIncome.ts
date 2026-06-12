import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { rangeArg, resolveRange, tzFor } from './lib/time';

export const record = mutation({
  args: {
    source: v.string(),
    amountIDR: v.number(),
    note: v.optional(v.string()),
  },
  returns: v.id('otherIncome'),
  handler: async (ctx, { source, amountIDR, note }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    if (!Number.isInteger(amountIDR) || amountIDR <= 0) {
      throw new Error('Jumlah harus lebih dari nol.');
    }
    const s = source.trim();
    if (s.length < 1 || s.length > 60) {
      throw new Error('Sumber pendapatan wajib diisi.');
    }
    const trimmed = note?.trim();
    return await ctx.db.insert('otherIncome', {
      cafeId,
      source: s,
      amountIDR,
      ...(trimmed ? { note: trimmed } : {}),
      at: Date.now(),
    });
  },
});

const incomeRow = v.object({
  id: v.id('otherIncome'),
  at: v.number(),
  source: v.string(),
  amountIDR: v.number(),
  note: v.optional(v.string()),
});

export const list = query({
  args: { range: rangeArg },
  returns: v.object({
    rows: v.array(incomeRow),
    totalIDR: v.number(),
  }),
  handler: async (ctx, { range }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const tz = await tzFor(ctx, cafeId);
    const { startMs, endMs } = resolveRange(tz, range, Date.now());
    const rows = await ctx.db
      .query('otherIncome')
      .withIndex('by_cafe_at', (q) =>
        q.eq('cafeId', cafeId).gte('at', startMs).lte('at', endMs)
      )
      .order('desc')
      .collect();
    let totalIDR = 0;
    for (const r of rows) {
      totalIDR += r.amountIDR;
    }
    return {
      rows: rows.map((r) => ({
        id: r._id,
        at: r.at,
        source: r.source,
        amountIDR: r.amountIDR,
        ...(r.note ? { note: r.note } : {}),
      })),
      totalIDR,
    };
  },
});

export const remove = mutation({
  args: { id: v.id('otherIncome') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Pendapatan');
    await ctx.db.delete(id);
    return null;
  },
});
