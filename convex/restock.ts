import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireActiveOutlet } from './lib/auth';
import { computeDemand } from './lib/demand';
import { computeRestock } from './lib/restockCompute';

const learningV = v.object({
  status: v.literal('learning'),
  daysCollected: v.number(),
  daysNeeded: v.number(),
  etaDateKey: v.string(),
});
const restockLineV = v.object({
  ingredientId: v.id('ingredients'),
  name: v.string(),
  unit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
  suggestedQty: v.number(),
  currentStockQty: v.number(),
});

export const suggestion = query({
  args: {},
  returns: v.union(
    learningV,
    v.object({
      status: v.literal('ready'),
      suggestionId: v.union(v.id('restockSuggestions'), v.null()),
      suggestionStatus: v.union(v.literal('draft'), v.literal('sent'), v.literal('dismissed')),
      lines: v.array(restockLineV),
    })
  ),
  handler: async (ctx, _args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const snap = await ctx.db
      .query('restockSuggestions')
      .withIndex('by_cafe_generated', (q) => q.eq('cafeId', cafeId))
      .order('desc')
      .first();
    if (snap) {
      return { status: 'ready' as const, suggestionId: snap._id, suggestionStatus: snap.status, lines: snap.lines };
    }
    const demand = await computeDemand(ctx, cafeId);
    if (demand.status === 'learning') return demand;
    const lines = await computeRestock(ctx, cafeId, demand.lines);
    return { status: 'ready' as const, suggestionId: null, suggestionStatus: 'draft' as const, lines };
  },
});

export const markSent = mutation({
  args: {
    id: v.id('restockSuggestions'),
    supplierId: v.id('suppliers'),
    sentLines: v.array(v.object({ name: v.string(), qty: v.number(), unit: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, { id, supplierId, sentLines }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const suggestion = await requireOwned(ctx, cafeId, id, 'Saran belanja');
    if (suggestion.status !== 'draft') {
      throw new Error('Saran belanja sudah dikirim atau ditolak.');
    }
    await requireOwned(ctx, cafeId, supplierId, 'Pemasok');
    await ctx.db.patch(id, { status: 'sent', supplierId, sentLines, exportedAt: Date.now() });
    return null;
  },
});
