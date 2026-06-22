import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

/**
 * One-off, idempotent backfill: wrap every pre-multi-outlet cafe in a business,
 * give its owner a business membership, and seed their active outlet. Safe to
 * re-run — cafes that already have a businessId are skipped, and owner
 * membership / active-outlet rows are only created when missing.
 *
 * Run against a deployment with:
 *   ./node_modules/.bin/convex run multiOutlet:backfillBusinesses
 */
export const backfillBusinesses = internalMutation({
  args: {},
  returns: v.object({ migrated: v.number() }),
  handler: async (ctx) => {
    const cafes = await ctx.db.query('cafes').collect();
    let migrated = 0;
    for (const cafe of cafes) {
      if (cafe.businessId) continue;
      const now = Date.now();
      const businessId = await ctx.db.insert('businesses', {
        name: cafe.name,
        ownerUserId: cafe.ownerUserId,
        createdAt: cafe.createdAt ?? now,
      });
      await ctx.db.patch(cafe._id, { businessId });

      const existingMember = await ctx.db
        .query('businessMembers')
        .withIndex('by_user', (q) => q.eq('userId', cafe.ownerUserId))
        .first();
      if (!existingMember) {
        await ctx.db.insert('businessMembers', {
          businessId,
          userId: cafe.ownerUserId,
          role: 'owner',
          createdAt: now,
        });
      }

      const existingActive = await ctx.db
        .query('activeOutlet')
        .withIndex('by_user', (q) => q.eq('userId', cafe.ownerUserId))
        .first();
      if (!existingActive) {
        await ctx.db.insert('activeOutlet', {
          userId: cafe.ownerUserId,
          cafeId: cafe._id,
          updatedAt: now,
        });
      }

      migrated += 1;
    }
    return { migrated };
  },
});
