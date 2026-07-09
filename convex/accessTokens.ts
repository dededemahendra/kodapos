import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

export const resolve = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.union(v.object({ userId: v.id('users'), cafeId: v.id('cafes') }), v.null()),
  handler: async (ctx, { tokenHash }) => {
    const row = await ctx.db
      .query('accessTokens')
      .withIndex('by_hash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    if (!row || row.revokedAt != null) return null;
    return { userId: row.userId, cafeId: row.cafeId };
  },
});

export const touchLastUsed = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, { tokenHash }) => {
    const row = await ctx.db
      .query('accessTokens')
      .withIndex('by_hash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    // Throttle: skip if used within the last 5 minutes.
    if (row && row.revokedAt == null && (row.lastUsedAt ?? 0) < Date.now() - 5 * 60 * 1000) {
      await ctx.db.patch(row._id, { lastUsedAt: Date.now() });
    }
    return null;
  },
});
