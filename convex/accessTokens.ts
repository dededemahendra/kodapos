import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { requireBusinessOwner } from './lib/auth';
import { generateToken, hashToken } from './lib/token';

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

/**
 * Owner-only: mint a personal access token scoped to one of the owner's own
 * outlets. The raw token is returned exactly once here; only its hash is
 * persisted, so it cannot be recovered later (only revoked and reissued).
 */
export const create = mutation({
  args: { name: v.string(), cafeId: v.id('cafes') },
  returns: v.object({ token: v.string(), id: v.id('accessTokens') }),
  handler: async (ctx, { name, cafeId }) => {
    const { userId } = await requireBusinessOwner(ctx);
    const cafe = await ctx.db.get(cafeId);
    if (!cafe || cafe.ownerUserId !== userId) throw new Error('outlet not found');
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 60) throw new Error('Nama token wajib diisi.');
    const token = generateToken();
    const id = await ctx.db.insert('accessTokens', {
      userId,
      cafeId,
      tokenHash: await hashToken(token),
      name: trimmed,
      createdAt: Date.now(),
    });
    return { token, id };
  },
});

/**
 * Owner-only: revoke one of the caller's own tokens. Idempotent (revoking an
 * already-revoked token is a no-op) and rejects a token the caller does not
 * own.
 */
export const revoke = mutation({
  args: { id: v.id('accessTokens') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { userId } = await requireBusinessOwner(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error('token not found');
    if (row.revokedAt == null) await ctx.db.patch(id, { revokedAt: Date.now() });
    return null;
  },
});

/**
 * Owner-only: list the caller's own live (non-revoked) tokens. Never
 * includes tokenHash so the raw hash can't leak back to a client.
 */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('accessTokens'),
      name: v.string(),
      cafeId: v.id('cafes'),
      createdAt: v.number(),
      lastUsedAt: v.union(v.number(), v.null()),
    })
  ),
  handler: async (ctx) => {
    const { userId } = await requireBusinessOwner(ctx);
    const rows = await ctx.db
      .query('accessTokens')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return rows
      .filter((r) => r.revokedAt == null)
      .map((r) => ({
        _id: r._id,
        name: r.name,
        cafeId: r.cafeId,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt ?? null,
      }));
  },
});
