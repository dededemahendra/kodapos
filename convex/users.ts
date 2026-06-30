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
