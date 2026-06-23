import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireActiveOutlet, resolveOutletAccess } from './lib/auth';

export const myOutlets = query({
  args: {},
  returns: v.array(
    v.object({
      cafeId: v.id('cafes'),
      name: v.string(),
      isActive: v.boolean(),
    })
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    let activeCafeId;
    try {
      activeCafeId = (await requireActiveOutlet(ctx)).cafeId;
    } catch {
      return [];
    }
    const access = await resolveOutletAccess(ctx, userId);
    if (!access) return [];
    const cafes = await Promise.all(access.accessibleCafeIds.map((id) => ctx.db.get(id)));
    return cafes
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map((c) => ({ cafeId: c._id, name: c.name, isActive: c._id === activeCafeId }));
  },
});
