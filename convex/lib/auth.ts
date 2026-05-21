import { getAuthUserId } from '@convex-dev/auth/server';
import type { DataModel, Doc, Id, TableNames } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type TenantTable = {
  [T in TableNames]: DataModel[T]['document'] extends { cafeId: Id<'cafes'> } ? T : never;
}[TableNames];

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

/**
 * Fetch a row from a multi-tenant table and assert it belongs to the
 * given cafe. Throws a Bahasa Indonesia "tidak ditemukan." error suitable
 * for direct render via `<FieldError>`. Use after `requireOwnerCafe(ctx)`.
 *
 * Centralizes the `ctx.db.get → row.cafeId !== cafeId → throw` triad
 * that appears on every owned-row mutation. The constrained `Table` type
 * ensures only tables that actually carry `cafeId` can be passed in.
 */
export async function requireOwned<T extends TenantTable>(
  ctx: QueryCtx | MutationCtx,
  cafeId: Id<'cafes'>,
  id: Id<T>,
  label: string
): Promise<Doc<T>> {
  const row = await ctx.db.get(id);
  const rowCafeId = (row as unknown as { cafeId?: Id<'cafes'> } | null)?.cafeId;
  if (!row || rowCafeId !== cafeId) {
    throw new Error(`${label} tidak ditemukan.`);
  }
  return row as Doc<T>;
}
