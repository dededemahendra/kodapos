import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireBusinessOwner, resolveOutletAccess } from './lib/auth';

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
    const access = await resolveOutletAccess(ctx, userId);
    if (!access || access.accessibleCafeIds.length === 0) return [];
    // Mirror requireActiveOutlet's active pick (persisted choice when still
    // accessible, else first accessible) without resolving access twice.
    const active = await ctx.db
      .query('activeOutlet')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    const activeCafeId =
      active && access.accessibleCafeIds.includes(active.cafeId)
        ? active.cafeId
        : access.accessibleCafeIds[0]!;
    const cafes = await Promise.all(access.accessibleCafeIds.map((id) => ctx.db.get(id)));
    return cafes
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map((c) => ({ cafeId: c._id, name: c.name, isActive: c._id === activeCafeId }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const createOutlet = mutation({
  args: { name: v.string() },
  returns: v.id('cafes'),
  handler: async (ctx, { name }) => {
    const { userId, businessId } = await requireBusinessOwner(ctx);
    // businessId is only null for an owner whose data predates the backfill;
    // by the time an owner adds a second outlet the backfill has run.
    if (!businessId) {
      throw new Error('no outlet access');
    }
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      throw new Error('Nama outlet wajib diisi.');
    }
    if (trimmed.length > 80) {
      throw new Error('Nama outlet maksimal 80 karakter.');
    }
    const now = Date.now();
    const cafeId = await ctx.db.insert('cafes', {
      name: trimmed,
      ownerUserId: userId,
      businessId,
      createdAt: now,
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
      createdAt: now,
    });
    const existing = await ctx.db
      .query('activeOutlet')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { cafeId, updatedAt: now });
    } else {
      await ctx.db.insert('activeOutlet', { userId, cafeId, updatedAt: now });
    }
    return cafeId;
  },
});

export const setActiveOutlet = mutation({
  args: { cafeId: v.id('cafes') },
  returns: v.null(),
  handler: async (ctx, { cafeId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('not authenticated');
    }
    const access = await resolveOutletAccess(ctx, userId);
    if (!access || !access.accessibleCafeIds.includes(cafeId)) {
      throw new Error('no outlet access');
    }
    const now = Date.now();
    const existing = await ctx.db
      .query('activeOutlet')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { cafeId, updatedAt: now });
    } else {
      await ctx.db.insert('activeOutlet', { userId, cafeId, updatedAt: now });
    }
    return null;
  },
});
