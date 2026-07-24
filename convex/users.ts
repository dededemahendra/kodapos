import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const myName = query({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return (user as { name?: string } | null)?.name ?? null;
  },
});

export const setName = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const trimmed = name.trim();
    if (trimmed.length < 1) throw new Error('Nama wajib diisi.');
    if (trimmed.length > 80) throw new Error('Nama maksimal 80 karakter.');
    await ctx.db.patch(userId, { name: trimmed });
    return null;
  },
});

export const hello = query({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const name = (user as { name?: string }).name ?? 'kawan';
    return `Halo, ${name}!`;
  },
});

/**
 * The single query the analytics provider needs to identify a session.
 *
 * Deliberately returns opaque ids and counts only. No name, no email, no phone
 * ever leaves through this query, and the test asserts that. `role` is the
 * account-level businessMembers role (owner | manager), NOT cafeStaff.role
 * (owner | cashier), which is a per-outlet PIN record and a different concept.
 *
 * `accountAgeMs` rather than a boolean: the new-account threshold is a product
 * heuristic, so it lives in src/lib/analytics/policy.ts where it is unit-tested,
 * not baked into the backend.
 */
export const analyticsIdentity = query({
  args: {},
  returns: v.union(
    v.object({
      userId: v.id('users'),
      accountAgeMs: v.number(),
      businessId: v.union(v.id('businesses'), v.null()),
      role: v.union(v.literal('owner'), v.literal('manager'), v.null()),
      outletCount: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const membership = await ctx.db
      .query('businessMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();

    const businessId = membership?.businessId ?? null;
    const outlets = businessId
      ? await ctx.db
          .query('cafes')
          .withIndex('by_business', (q) => q.eq('businessId', businessId))
          .collect()
      : [];

    return {
      userId,
      accountAgeMs: Math.max(0, Date.now() - user._creationTime),
      businessId,
      role: membership?.role ?? null,
      outletCount: outlets.length,
    };
  },
});
