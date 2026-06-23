import { v } from 'convex/values';
import { internal } from './_generated/api';
import { mutation } from './_generated/server';
import { requireBusinessOwner } from './lib/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const inviteManager = mutation({
  args: { email: v.string(), cafeIds: v.array(v.id('cafes')) },
  returns: v.id('businessInvites'),
  handler: async (ctx, { email, cafeIds }) => {
    const { businessId } = await requireBusinessOwner(ctx);
    if (!businessId) {
      throw new Error('no outlet access');
    }
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      throw new Error('Email tidak valid.');
    }
    if (cafeIds.length === 0) {
      throw new Error('Pilih minimal satu outlet.');
    }
    // Every chosen outlet must belong to this owner's business.
    for (const cafeId of cafeIds) {
      const cafe = await ctx.db.get(cafeId);
      if (!cafe || cafe.businessId !== businessId) {
        throw new Error('Outlet tidak ditemukan.');
      }
    }

    const now = Date.now();
    const existing = await ctx.db
      .query('businessInvites')
      .withIndex('by_email', (q) => q.eq('email', normalized))
      .filter((q) => q.eq(q.field('businessId'), businessId))
      .first();
    let inviteId;
    if (existing) {
      await ctx.db.patch(existing._id, { cafeIds });
      inviteId = existing._id;
    } else {
      inviteId = await ctx.db.insert('businessInvites', {
        businessId,
        email: normalized,
        role: 'manager',
        cafeIds,
        createdAt: now,
      });
    }

    const business = await ctx.db.get(businessId);
    await ctx.scheduler.runAfter(0, internal.email.sendInviteEmailScheduled, {
      to: normalized,
      businessName: business?.name ?? 'kodapos',
    });
    return inviteId;
  },
});
