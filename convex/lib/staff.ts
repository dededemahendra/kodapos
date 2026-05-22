import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

/**
 * Validate that the given cashierId belongs to the cafe and is not archived.
 * Mirrors `requireOwned` from convex/lib/auth.ts but emits a cashier-specific
 * message and includes the archived check (archiving never deletes).
 */
export async function requireActiveCashier(
  ctx: QueryCtx | MutationCtx,
  cafeId: Id<'cafes'>,
  cashierId: Id<'cafeStaff'>
): Promise<Doc<'cafeStaff'>> {
  const row = await ctx.db.get(cashierId);
  if (!row || row.cafeId !== cafeId || row.archived) {
    throw new Error('Kasir tidak ditemukan atau sudah diarsipkan.');
  }
  return row;
}
