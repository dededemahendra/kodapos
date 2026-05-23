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
    // Idempotent: if a cafe already exists for this owner, return it.
    // The signup flow retries this call against auth-token-propagation
    // races, so the mutation MUST be safe to invoke multiple times.
    const existing = await ctx.db
      .query('cafes')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
      .first();
    if (existing) {
      return existing._id;
    }
    const cafeId = await ctx.db.insert('cafes', {
      name,
      ownerUserId: userId,
      createdAt: Date.now(),
      timezone: 'Asia/Jakarta',
      taxRatePct: 11,
      taxEnabled: true,
    });
    const user = await ctx.db.get(userId);
    const ownerName = (user as { name?: string } | null)?.name?.trim() || 'Pemilik';
    await ctx.db.insert('cafeStaff', {
      cafeId,
      name: ownerName,
      role: 'owner',
      archived: false,
      createdAt: Date.now(),
    });
    return cafeId;
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
    // .first() (not .unique()) so a corrupted state with multiple cafes
    // for the same owner still returns deterministically (the oldest one,
    // since the index orders by insertion). The mutation is now
    // idempotent so duplicates can only arise from data already in the DB.
    const cafe = await ctx.db
      .query('cafes')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
      .first();
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
    const trimmedName = args.name.trim();
    if (trimmedName.length < 1) {
      throw new Error('Nama kafe wajib diisi.');
    }
    if (trimmedName.length > 80) {
      throw new Error('Nama kafe maksimal 80 karakter.');
    }
    if (args.taxRatePct < 0 || args.taxRatePct > 100) {
      throw new Error('Persentase pajak harus antara 0 dan 100.');
    }
    await ctx.db.patch(cafeId, {
      name: trimmedName,
      phone: args.phone?.trim() || undefined,
      addressLine: args.addressLine?.trim() || undefined,
      timezone: args.timezone,
      taxRatePct: args.taxRatePct,
      taxEnabled: args.taxEnabled,
    });
    return null;
  },
});

/**
 * One-shot cleanup for owners with duplicate cafe rows (caused by the
 * non-idempotent createForOwner mutation before it was fixed). Keeps the
 * OLDEST cafe (the one that `requireOwnerCafe`/`myCafe` now pick via
 * `.first()`); deletes every empty newer duplicate. A "duplicate" is only
 * deleted if it has no categories, items, modifier groups, staff rows,
 * shifts, or orders attached — keeping anything that has data, so the
 * caller can manually reconcile if a newer cafe accidentally accrued
 * content.
 *
 * Safe to call repeatedly. Returns counts so the caller can verify.
 */
export const cleanupDuplicateCafes = mutation({
  args: {},
  returns: v.object({
    kept: v.id('cafes'),
    deleted: v.array(v.id('cafes')),
    skippedWithData: v.array(v.id('cafes')),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('not authenticated');
    }
    const all = await ctx.db
      .query('cafes')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
      .collect();
    if (all.length === 0) {
      throw new Error('Tidak ada kafe untuk dibersihkan.');
    }
    const sorted = [...all].sort((a, b) => a._creationTime - b._creationTime);
    const kept = sorted[0]!;
    const duplicates = sorted.slice(1);

    const deleted: typeof kept._id[] = [];
    const skippedWithData: typeof kept._id[] = [];

    for (const dup of duplicates) {
      const [categories, items, groups, staff, shifts, orders] = await Promise.all([
        ctx.db
          .query('categories')
          .withIndex('by_cafe_active', (q) => q.eq('cafeId', dup._id))
          .first(),
        ctx.db
          .query('menuItems')
          .withIndex('by_cafe_active', (q) => q.eq('cafeId', dup._id))
          .first(),
        ctx.db
          .query('modifierGroups')
          .withIndex('by_cafe_active', (q) => q.eq('cafeId', dup._id))
          .first(),
        ctx.db
          .query('cafeStaff')
          .withIndex('by_cafe_active', (q) => q.eq('cafeId', dup._id))
          .first(),
        ctx.db
          .query('shifts')
          .withIndex('by_cafe_opened', (q) => q.eq('cafeId', dup._id))
          .first(),
        ctx.db
          .query('orders')
          .withIndex('by_cafe_created', (q) => q.eq('cafeId', dup._id))
          .first(),
      ]);
      if (categories || items || groups || shifts || orders) {
        skippedWithData.push(dup._id);
        continue;
      }
      // staff rows are the only thing createForOwner inserts alongside the
      // cafe, so they're allowed — archive them as part of the cleanup.
      if (staff) {
        const staffRows = await ctx.db
          .query('cafeStaff')
          .withIndex('by_cafe_active', (q) => q.eq('cafeId', dup._id))
          .collect();
        for (const row of staffRows) {
          await ctx.db.delete(row._id);
        }
      }
      await ctx.db.delete(dup._id);
      deleted.push(dup._id);
    }
    return { kept: kept._id, deleted, skippedWithData };
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
