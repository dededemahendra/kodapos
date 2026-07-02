import { getAuthUserId } from '@convex-dev/auth/server';
import type { DataModel, Doc, Id, TableNames } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type TenantTable = {
  [T in TableNames]: DataModel[T]['document'] extends { cafeId: Id<'cafes'> } ? T : never;
}[TableNames];

export type ActiveOutlet = {
  userId: Id<'users'>;
  cafeId: Id<'cafes'>;
  businessId: Id<'businesses'> | null;
  role: 'owner' | 'manager';
};

export type OutletAccess = {
  member: Doc<'businessMembers'> | null;
  accessibleCafeIds: Id<'cafes'>[];
  businessId: Id<'businesses'> | null;
  role: 'owner' | 'manager';
};

/**
 * Resolve which outlets a user may operate, plus their membership context.
 * Returns null when the user can reach no outlet (no membership and no cafe).
 * Shared by requireActiveOutlet (active pick), outlets.myOutlets (switcher
 * list) and outlets.setActiveOutlet (access validation). Never writes.
 */
export async function resolveOutletAccess(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>
): Promise<OutletAccess | null> {
  const member = await ctx.db
    .query('businessMembers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();

  // Transitional fallback: an owner whose data predates the multi-outlet
  // backfill has a cafe but no businessMembers row. Mirror the legacy
  // requireOwnerCafe behavior (oldest cafe by owner). Removable once the
  // backfill is confirmed run in all environments.
  if (!member) {
    const cafe = await ctx.db
      .query('cafes')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
      .first();
    if (!cafe) return null;
    return {
      member: null,
      accessibleCafeIds: [cafe._id],
      businessId: cafe.businessId ?? null,
      role: 'owner',
    };
  }

  let accessibleCafeIds: Id<'cafes'>[];
  if (member.role === 'owner') {
    const cafes = await ctx.db
      .query('cafes')
      .withIndex('by_business', (q) => q.eq('businessId', member.businessId))
      .collect();
    accessibleCafeIds = cafes.map((c) => c._id);
  } else {
    const access = await ctx.db
      .query('memberOutletAccess')
      .withIndex('by_member', (q) => q.eq('businessMemberId', member._id))
      .collect();
    // Skip grants whose cafe was deleted, so a stale memberOutletAccess row
    // never yields a dangling id downstream (myOutlets/active pick).
    const maybeCafes = await Promise.all(access.map((a) => ctx.db.get(a.cafeId)));
    accessibleCafeIds = maybeCafes.filter((c) => c !== null).map((c) => c!._id);
  }

  return { member, accessibleCafeIds, businessId: member.businessId, role: member.role };
}

/**
 * Resolve the signed-in, non-deactivated user. Throws 'not authenticated' with
 * no identity and 'account deactivated' when the account has been deactivated
 * by a platform admin. Use at the top of any handler that must be denied to a
 * deactivated user but does not need full outlet resolution.
 */
export async function requireActiveUser(
  ctx: QueryCtx | MutationCtx
): Promise<{ userId: Id<'users'>; user: Doc<'users'> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('not authenticated');
  }
  const user = await ctx.db.get(userId);
  if (user?.deactivatedAt != null) {
    throw new Error('account deactivated');
  }
  // user can be null only if the row was deleted mid-session; downstream
  // resolution handles that (no outlet access), so return it as-is typed.
  return { userId, user: user as Doc<'users'> };
}

/**
 * Resolve the outlet (cafe) the signed-in user is currently operating, or null
 * when there is no identity, the account is deactivated, or the user can reach
 * no outlet (e.g. a brand-new user who has not created a cafe yet). Non-throwing
 * so app-wide queries (permissions, dashboards) degrade gracefully instead of
 * crashing.
 *
 * Returns a superset of the legacy `{ userId, cafeId }` shape so the ~230
 * existing call sites keep working unchanged. Resolution:
 *   1. owner  -> all cafes in their business
 *      manager-> the cafes granted via memberOutletAccess
 *   2. active outlet = the persisted choice when still accessible, else the
 *      first accessible outlet (an ephemeral default; this helper runs in
 *      queries and MUST NOT write; only setActiveOutlet persists a choice).
 */
export async function tryActiveOutlet(
  ctx: QueryCtx | MutationCtx
): Promise<ActiveOutlet | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  // Deactivated users are locked out everywhere: deny access gracefully here so
  // graceful callers degrade and the throwing gate can surface the distinct
  // 'account deactivated' message.
  const user = await ctx.db.get(userId);
  if (user?.deactivatedAt != null) return null;

  const access = await resolveOutletAccess(ctx, userId);
  if (!access || access.accessibleCafeIds.length === 0) return null;

  const active = await ctx.db
    .query('activeOutlet')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();
  const cafeId =
    active && access.accessibleCafeIds.includes(active.cafeId)
      ? active.cafeId
      : access.accessibleCafeIds[0]!;

  return { userId, cafeId, businessId: access.businessId, role: access.role };
}

/**
 * Throwing gate over {@link tryActiveOutlet} for the ~230 handlers that require
 * an active outlet. Preserves distinct messages: 'not authenticated' (no
 * identity), 'account deactivated' (locked out by a platform admin), and
 * 'no outlet access' (identity but no reachable outlet).
 */
export async function requireActiveOutlet(
  ctx: QueryCtx | MutationCtx
): Promise<ActiveOutlet> {
  const resolved = await tryActiveOutlet(ctx);
  if (!resolved) {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('not authenticated');
    const user = await ctx.db.get(userId);
    if (user?.deactivatedAt != null) throw new Error('account deactivated');
    throw new Error('no outlet access');
  }
  return resolved;
}

/**
 * Owner-only gate for business-level operations (manage members, add/remove
 * outlets, business settings). Resolves the active outlet first, then asserts
 * the member is the owner. Consumed by later phases.
 */
export async function requireBusinessOwner(
  ctx: QueryCtx | MutationCtx
): Promise<ActiveOutlet & { role: 'owner' }> {
  const resolved = await requireActiveOutlet(ctx);
  if (resolved.role !== 'owner') {
    throw new Error('owner access required');
  }
  return { ...resolved, role: 'owner' };
}

/**
 * Fetch a row from a multi-tenant table and assert it belongs to the
 * given cafe. Throws a Bahasa Indonesia "tidak ditemukan." error suitable
 * for direct render via `<FieldError>`. Use after `requireActiveOutlet(ctx)`.
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

/**
 * Platform-operator gate. Resolves the signed-in user and asserts the
 * isPlatformAdmin flag. Cross-tenant: not scoped to any cafe/business.
 * Throws 'not authenticated' with no identity, 'not a platform admin' otherwise.
 */
export async function requirePlatformAdmin(
  ctx: QueryCtx | MutationCtx
): Promise<{ userId: Id<'users'>; user: Doc<'users'> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('not authenticated');
  }
  const user = await ctx.db.get(userId);
  if (!user || user.isPlatformAdmin !== true) {
    throw new Error('not a platform admin');
  }
  return { userId, user };
}
