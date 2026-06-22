import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { requireActiveOutlet, requireBusinessOwner } from '../../convex/lib/auth';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

/** Seed a fresh owner via the real bootstrap (creates business + membership + active outlet). */
async function seedOwner(t: ReturnType<typeof convexTest>, name = 'Kopi Senja') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: `${name}@x.com` }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  const cafeId = await asOwner.mutation(api.cafes.createForOwner, { name });
  const cafe = await t.run((ctx) => ctx.db.get(cafeId as Id<'cafes'>));
  return { userId, asOwner, cafeId, businessId: cafe!.businessId as Id<'businesses'> };
}

describe('requireActiveOutlet — owner', () => {
  it('resolves the single outlet for a freshly bootstrapped owner', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, businessId, userId } = await seedOwner(t);

    const resolved = await asOwner.run((ctx) => requireActiveOutlet(ctx));
    expect(resolved.cafeId).toBe(cafeId);
    expect(resolved.businessId).toBe(businessId);
    expect(resolved.role).toBe('owner');
    expect(resolved.userId).toBe(userId);
  });

  it('honors the persisted active outlet when the owner has multiple outlets', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, businessId, userId } = await seedOwner(t);
    // A second outlet under the same business.
    const second = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang 2', ownerUserId: userId, businessId, createdAt: 2 })
    );
    // Point the active outlet at the second cafe.
    await t.run(async (ctx) => {
      const active = await ctx.db
        .query('activeOutlet')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .first();
      await ctx.db.patch(active!._id, { cafeId: second, updatedAt: 3 });
    });

    const resolved = await asOwner.run((ctx) => requireActiveOutlet(ctx));
    expect(resolved.cafeId).toBe(second);
  });

  it('falls back to the first accessible outlet when the active outlet is not accessible', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId } = await seedOwner(t);
    // Point active outlet at a cafe in a DIFFERENT business (not accessible).
    const otherUser = await t.run((ctx) => ctx.db.insert('users', { name: 'X', email: 'x2@x.com' }));
    const otherBiz = await t.run((ctx) => ctx.db.insert('businesses', { name: 'B', ownerUserId: otherUser, createdAt: 1 }));
    const foreignCafe = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Foreign', ownerUserId: otherUser, businessId: otherBiz, createdAt: 1 })
    );
    await t.run(async (ctx) => {
      const active = await ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId)).first();
      await ctx.db.patch(active!._id, { cafeId: foreignCafe, updatedAt: 4 });
    });

    const resolved = await asOwner.run((ctx) => requireActiveOutlet(ctx));
    expect(resolved.cafeId).not.toBe(foreignCafe);
    expect(resolved.role).toBe('owner');
  });

  it('does not write when defaulting (helper is query-safe)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId } = await seedOwner(t);
    // Remove the seeded active outlet so the helper must default.
    await t.run(async (ctx) => {
      const active = await ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId)).first();
      if (active) await ctx.db.delete(active._id);
    });

    await asOwner.run((ctx) => requireActiveOutlet(ctx));

    const after = await t.run((ctx) =>
      ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId)).collect()
    );
    expect(after).toHaveLength(0); // helper never persisted a default
  });
});

describe('requireActiveOutlet — manager', () => {
  it('resolves only outlets granted via memberOutletAccess', async () => {
    const t = convexTest(schema, modules);
    const { userId: ownerId, businessId } = await seedOwner(t);
    const ownerCafe = await t.run((ctx) =>
      ctx.db.query('cafes').withIndex('by_business', (q) => q.eq('businessId', businessId)).first()
    );
    const granted = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang Manajer', ownerUserId: ownerId, businessId, createdAt: 2 })
    );

    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'm@x.com' }));
    const mgrMemberId = await t.run((ctx) =>
      ctx.db.insert('businessMembers', { businessId, userId: mgrUserId, role: 'manager', createdAt: 5 })
    );
    await t.run((ctx) =>
      ctx.db.insert('memberOutletAccess', { businessMemberId: mgrMemberId, cafeId: granted, createdAt: 5 })
    );
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });

    const resolved = await asMgr.run((ctx) => requireActiveOutlet(ctx));
    expect(resolved.cafeId).toBe(granted);
    expect(resolved.cafeId).not.toBe(ownerCafe!._id);
    expect(resolved.role).toBe('manager');
  });
});

describe('requireActiveOutlet — failure & fallback', () => {
  it('throws when the user has no membership and no cafe', async () => {
    const t = convexTest(schema, modules);
    const orphan = await t.run((ctx) => ctx.db.insert('users', { name: 'Orphan', email: 'orphan@x.com' }));
    const asOrphan = t.withIdentity({ subject: `${orphan}|test_session` });
    await expect(asOrphan.run((ctx) => requireActiveOutlet(ctx))).rejects.toThrow('no outlet access');
  });

  it('legacy fallback: an owner with a cafe but no membership row still resolves', async () => {
    const t = convexTest(schema, modules);
    const { userId, cafeId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Legacy', email: 'legacy@x.com' });
      const cafeId = await ctx.db.insert('cafes', { name: 'Warung Lama', ownerUserId: userId, createdAt: 1 });
      return { userId, cafeId };
    });
    const asLegacy = t.withIdentity({ subject: `${userId}|test_session` });

    const resolved = await asLegacy.run((ctx) => requireActiveOutlet(ctx));
    expect(resolved.cafeId).toBe(cafeId);
    expect(resolved.role).toBe('owner');
    expect(resolved.businessId).toBeNull();
  });
});

describe('requireBusinessOwner', () => {
  it('passes for an owner', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, businessId } = await seedOwner(t);
    const resolved = await asOwner.run((ctx) => requireBusinessOwner(ctx));
    expect(resolved.role).toBe('owner');
    expect(resolved.businessId).toBe(businessId);
  });

  it('rejects a manager', async () => {
    const t = convexTest(schema, modules);
    const { userId: ownerId, businessId } = await seedOwner(t);
    const granted = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang', ownerUserId: ownerId, businessId, createdAt: 2 })
    );
    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'm2@x.com' }));
    const mgrMemberId = await t.run((ctx) =>
      ctx.db.insert('businessMembers', { businessId, userId: mgrUserId, role: 'manager', createdAt: 5 })
    );
    await t.run((ctx) =>
      ctx.db.insert('memberOutletAccess', { businessMemberId: mgrMemberId, cafeId: granted, createdAt: 5 })
    );
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });

    await expect(asMgr.run((ctx) => requireBusinessOwner(ctx))).rejects.toThrow('owner access required');
  });
});
