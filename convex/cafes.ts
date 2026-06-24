import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireActiveOutlet, requireActiveUser } from './lib/auth';
import { parseGeocode } from './lib/weather';

const cafeFields = {
  _id: v.id('cafes'),
  _creationTime: v.number(),
  name: v.string(),
  ownerUserId: v.id('users'),
  businessId: v.optional(v.id('businesses')),
  createdAt: v.number(),
  phone: v.optional(v.string()),
  addressLine: v.optional(v.string()),
  timezone: v.optional(v.string()),
  taxRatePct: v.optional(v.number()),
  taxEnabled: v.optional(v.boolean()),
  setupCompletedAt: v.optional(v.number()),
  businessType: v.optional(v.string()),
  whatsapp: v.optional(v.string()),
  email: v.optional(v.string()),
  instagram: v.optional(v.string()),
  city: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  logoStorageId: v.optional(v.id('_storage')),
  operatingHours: v.optional(
    v.array(
      v.object({
        day: v.number(),
        open: v.boolean(),
        openTime: v.string(),
        closeTime: v.string(),
      })
    )
  ),
};
const cafeDoc = v.object(cafeFields);

export const createForOwner = mutation({
  args: { name: v.string() },
  returns: v.id('cafes'),
  handler: async (ctx, { name }) => {
    const { userId } = await requireActiveUser(ctx);
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
    const now = Date.now();
    const businessId = await ctx.db.insert('businesses', {
      name,
      ownerUserId: userId,
      createdAt: now,
    });
    const cafeId = await ctx.db.insert('cafes', {
      name,
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
    await ctx.db.insert('businessMembers', {
      businessId,
      userId,
      role: 'owner',
      createdAt: now,
    });
    await ctx.db.insert('activeOutlet', { userId, cafeId, updatedAt: now });
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
  returns: v.union(
    v.object({
      ...cafeFields,
      logoUrl: v.optional(v.string()),
      // The signed-in user's business-member role for this outlet. Drives the
      // client owner gate (a manager has an account + a non-null cafe, so
      // "has a cafe" no longer implies owner).
      role: v.union(v.literal('owner'), v.literal('manager')),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    // Resolve the active outlet (not the oldest cafe) so the client re-scopes
    // when the user switches outlets. Returns null on no-access rather than
    // throwing, preserving the query's null-on-signed-out contract.
    let resolved;
    try {
      resolved = await requireActiveOutlet(ctx);
    } catch (e) {
      // A signed-in user with no reachable outlet resolves to null (the
      // query's contract). Re-throw anything unexpected so real failures
      // are not silently hidden.
      if (e instanceof Error && (e.message === 'not authenticated' || e.message === 'no outlet access')) {
        return null;
      }
      throw e;
    }
    const cafe = await ctx.db.get(resolved.cafeId);
    if (!cafe) return null;
    const logoUrl = cafe.logoStorageId
      ? await ctx.storage.getUrl(cafe.logoStorageId)
      : null;
    return { ...cafe, role: resolved.role, ...(logoUrl ? { logoUrl } : {}) };
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
    const { cafeId } = await requireActiveOutlet(ctx);
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

export const updateProfileDetails = mutation({
  args: {
    name: v.string(),
    businessType: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    email: v.optional(v.string()),
    instagram: v.optional(v.string()),
    addressLine: v.optional(v.string()),
    city: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    timezone: v.string(),
    operatingHours: v.optional(
      v.array(
        v.object({
          day: v.number(),
          open: v.boolean(),
          openTime: v.string(),
          closeTime: v.string(),
        })
      )
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const name = args.name.trim();
    if (name.length < 1) throw new Error('Nama kafe wajib diisi.');
    if (name.length > 80) throw new Error('Nama kafe maksimal 80 karakter.');
    const clean = (s?: string) => s?.trim() || undefined;
    const existing = await ctx.db.get(cafeId);
    const newCity = clean(args.city);
    // When the city changes, the stored weather coordinates no longer match it.
    // Clear them so the nightly weather fetch doesn't keep using a stale
    // location until the owner re-geocodes (Settings → "Perbarui lokasi cuaca").
    const cityChanged = existing?.city !== newCity;
    await ctx.db.patch(cafeId, {
      name,
      businessType: clean(args.businessType),
      phone: clean(args.phone),
      whatsapp: clean(args.whatsapp),
      email: clean(args.email),
      instagram: clean(args.instagram),
      addressLine: clean(args.addressLine),
      city: newCity,
      postalCode: clean(args.postalCode),
      timezone: args.timezone,
      operatingHours: args.operatingHours,
      ...(cityChanged ? { latitude: undefined, longitude: undefined } : {}),
    });
    return null;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireActiveOutlet(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setLogo = mutation({
  args: { storageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const cafe = await ctx.db.get(cafeId);
    if (cafe?.logoStorageId) await ctx.storage.delete(cafe.logoStorageId);
    await ctx.db.patch(cafeId, { logoStorageId: storageId });
    return null;
  },
});

export const removeLogo = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const cafe = await ctx.db.get(cafeId);
    if (cafe?.logoStorageId) {
      await ctx.storage.delete(cafe.logoStorageId);
      await ctx.db.patch(cafeId, { logoStorageId: undefined });
    }
    return null;
  },
});

/**
 * One-shot cleanup for owners with duplicate cafe rows (caused by the
 * non-idempotent createForOwner mutation before it was fixed). Keeps the
 * OLDEST cafe by creation time; deletes every empty newer duplicate. (The
 * active outlet is resolved separately by `requireActiveOutlet`/`myCafe`,
 * not by oldest-cafe order.) A "duplicate" is only
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
    const { cafeId } = await requireActiveOutlet(ctx);
    const cafe = await ctx.db.get(cafeId);
    if (cafe?.setupCompletedAt) {
      return null;
    }
    await ctx.db.patch(cafeId, { setupCompletedAt: Date.now() });
    return null;
  },
});

/** The signed-in owner's cafe id + city, for the geocode action (which can't read ctx.db). */
export const myCafeForGeocode = internalQuery({
  args: {},
  returns: v.object({ cafeId: v.id('cafes'), city: v.union(v.string(), v.null()) }),
  handler: async (ctx) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const cafe = await ctx.db.get(cafeId);
    return { cafeId, city: cafe?.city ?? null };
  },
});

/** Patch a cafe's weather coordinates. Internal: only geocodeFromCity calls it. */
export const setLocation = internalMutation({
  args: { cafeId: v.id('cafes'), latitude: v.number(), longitude: v.number() },
  returns: v.null(),
  handler: async (ctx, { cafeId, latitude, longitude }) => {
    await ctx.db.patch(cafeId, { latitude, longitude });
    return null;
  },
});

/**
 * Owner-triggered: geocode the cafe's city to lat/long via Open-Meteo and
 * store the coordinates (used by the nightly weather fetch). Returns a status
 * so the UI can distinguish the outcomes: 'ok' (stored), 'no_city' (nothing to
 * geocode), 'not_found' (the city didn't resolve), and 'error' (Open-Meteo was
 * unreachable) — the last must NOT be reported to the owner as "city not found".
 */
export const geocodeFromCity = action({
  args: {},
  returns: v.object({
    status: v.union(
      v.literal('ok'),
      v.literal('no_city'),
      v.literal('not_found'),
      v.literal('error')
    ),
  }),
  handler: async (ctx): Promise<{ status: 'ok' | 'no_city' | 'not_found' | 'error' }> => {
    const info: { cafeId: Id<'cafes'>; city: string | null } = await ctx.runQuery(
      internal.cafes.myCafeForGeocode,
      {}
    );
    if (!info.city) return { status: 'no_city' };
    let coords: { latitude: number; longitude: number } | null = null;
    try {
      const url =
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(info.city)}` +
        `&count=1&language=id&format=json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Open-Meteo geocode ${res.status}`);
      const json = await res.json();
      coords = parseGeocode(json);
    } catch (err) {
      // Transient/network failure — distinct from a genuine geocode miss.
      console.warn(`geocode failed for cafe ${info.cafeId}:`, err);
      return { status: 'error' };
    }
    if (!coords) return { status: 'not_found' };
    await ctx.runMutation(internal.cafes.setLocation, {
      cafeId: info.cafeId,
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    return { status: 'ok' };
  },
});
