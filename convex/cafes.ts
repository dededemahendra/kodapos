import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';

const cafeDoc = v.object({
  _id: v.id('cafes'),
  _creationTime: v.number(),
  name: v.string(),
  ownerUserId: v.id('users'),
  createdAt: v.number(),
  phone: v.optional(v.string()),
  addressLine: v.optional(v.string()),
  timezone: v.optional(v.string()),
  taxRatePct: v.optional(v.number()),
  taxEnabled: v.optional(v.boolean()),
  setupCompletedAt: v.optional(v.number()),
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
      timezone: 'Asia/Jakarta',
      taxRatePct: 11,
      taxEnabled: true,
    });
  },
});

/**
 * Backward-compatible list query kept from Phase 0. Prefer `myCafe` for
 * the single-cafe owner shape used by Phase 1 onboarding/settings UI.
 */
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

export const myCafe = query({
  args: {},
  returns: v.union(cafeDoc, v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const cafe = await ctx.db
      .query('cafes')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
      .unique();
    return cafe ?? null;
  },
});

export const updateProfile = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    addressLine: v.optional(v.string()),
    timezone: v.string(),
    taxRatePct: v.number(),
    taxEnabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    if (args.name.trim().length < 1) {
      throw new Error('Nama kafe wajib diisi.');
    }
    if (args.name.length > 80) {
      throw new Error('Nama kafe maksimal 80 karakter.');
    }
    if (args.taxRatePct < 0 || args.taxRatePct > 100) {
      throw new Error('Persentase pajak harus antara 0 dan 100.');
    }
    await ctx.db.patch(cafeId, {
      name: args.name.trim(),
      phone: args.phone?.trim() || undefined,
      addressLine: args.addressLine?.trim() || undefined,
      timezone: args.timezone,
      taxRatePct: args.taxRatePct,
      taxEnabled: args.taxEnabled,
    });
    return null;
  },
});

export const markSetupComplete = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cafe = await ctx.db.get(cafeId);
    if (cafe?.setupCompletedAt) {
      return null;
    }
    await ctx.db.patch(cafeId, { setupCompletedAt: Date.now() });
    return null;
  },
});
