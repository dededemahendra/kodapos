import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const cafeDoc = v.object({
  _id: v.id('cafes'),
  _creationTime: v.number(),
  name: v.string(),
  ownerUserId: v.id('users'),
  createdAt: v.number(),
});

export const createForOwner = mutation({
  args: { name: v.string() },
  returns: v.id('cafes'),
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('not authenticated');
    }
    return await ctx.db.insert('cafes', {
      name,
      ownerUserId: userId,
      createdAt: Date.now(),
    });
  },
});

export const mine = query({
  args: {},
  returns: v.array(cafeDoc),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }
    return await ctx.db
      .query('cafes')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
      .collect();
  },
});
