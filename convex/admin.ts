import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requirePlatformAdmin, resolveOutletAccess } from './lib/auth';

type UserRow = {
  _id: Id<'users'>;
  name: string | null;
  email: string | null;
  isPlatformAdmin: boolean;
  deactivated: boolean;
  role: 'owner' | 'manager' | null;
  cafeNames: string[];
  accessHealth: 'ok' | 'no_outlet';
};

async function buildRow(ctx: Parameters<typeof requirePlatformAdmin>[0], user: Doc<'users'>): Promise<UserRow> {
  const ownedCafes = await ctx.db
    .query('cafes')
    .withIndex('by_owner', (q) => q.eq('ownerUserId', user._id))
    .collect();
  const access = await resolveOutletAccess(ctx, user._id);
  const ownsCafes = ownedCafes.length > 0;
  // no_outlet: owns at least one cafe but has no businessMembers row
  // (the pre-backfill state the operator needs to repair).
  const accessHealth: 'ok' | 'no_outlet' =
    ownsCafes && (!access || !access.member) ? 'no_outlet' : 'ok';
  return {
    _id: user._id,
    name: user.name ?? null,
    email: user.email ?? null,
    isPlatformAdmin: user.isPlatformAdmin === true,
    deactivated: user.deactivatedAt != null,
    role: access?.role ?? null,
    cafeNames: ownedCafes.map((c) => c.name),
    accessHealth,
  };
}

export const listUsers = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    await requirePlatformAdmin(ctx);
    const users = await ctx.db.query('users').collect();
    const term = (search ?? '').trim().toLowerCase();
    const filtered = term
      ? users.filter(
          (u) =>
            (u.name ?? '').toLowerCase().includes(term) ||
            (u.email ?? '').toLowerCase().includes(term)
        )
      : users;
    return Promise.all(filtered.map((u) => buildRow(ctx, u)));
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { isPlatformAdmin: false };
    const user = await ctx.db.get(userId);
    return { isPlatformAdmin: user?.isPlatformAdmin === true };
  },
});
