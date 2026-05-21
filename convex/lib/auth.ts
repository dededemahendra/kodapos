import { getAuthUserId } from '@convex-dev/auth/server';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

/**
 * Resolve the signed-in owner's cafe. Throws if no user identity or no cafe.
 * Every Slice 1 menu mutation/query calls this first.
 */
export async function requireOwnerCafe(
  ctx: QueryCtx | MutationCtx
): Promise<{ userId: Id<'users'>; cafeId: Id<'cafes'> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('not authenticated');
  }
  const cafe = await ctx.db
    .query('cafes')
    .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
    .unique();
  if (!cafe) {
    throw new Error('cafe not found');
  }
  return { userId, cafeId: cafe._id };
}
