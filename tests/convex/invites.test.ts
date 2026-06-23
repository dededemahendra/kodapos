import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function seedOwner(t: ReturnType<typeof convexTest>, name = 'Kopi Senja') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: `${name}@x.com` }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  const cafeId = await asOwner.mutation(api.cafes.createForOwner, { name });
  const cafe = await t.run((ctx) => ctx.db.get(cafeId as Id<'cafes'>));
  return { userId, asOwner, cafeId, businessId: cafe!.businessId as Id<'businesses'> };
}

describe('inviteManager', () => {
  it('records a normalized pending invite scoped to the chosen outlets', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, businessId } = await seedOwner(t);

    await asOwner.mutation(api.invites.inviteManager, {
      email: '  Manager@Example.COM ',
      cafeIds: [cafeId],
    });

    const invite = await t.run((ctx) =>
      ctx.db.query('businessInvites').withIndex('by_business', (q) => q.eq('businessId', businessId)).first()
    );
    expect(invite?.email).toBe('manager@example.com'); // trimmed + lowercased
    expect(invite?.role).toBe('manager');
    expect(invite?.cafeIds).toEqual([cafeId]);
  });

  it('re-inviting the same email replaces the outlet set (no duplicate invite)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId, cafeId, businessId } = await seedOwner(t);
    const second = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang 2', ownerUserId: userId, businessId, createdAt: 2 })
    );

    await asOwner.mutation(api.invites.inviteManager, { email: 'm@x.com', cafeIds: [cafeId] });
    await asOwner.mutation(api.invites.inviteManager, { email: 'm@x.com', cafeIds: [second] });

    const invites = await t.run((ctx) =>
      ctx.db.query('businessInvites').withIndex('by_email', (q) => q.eq('email', 'm@x.com')).collect()
    );
    expect(invites).toHaveLength(1);
    expect(invites[0]!.cafeIds).toEqual([second]);
  });

  it('rejects an outlet outside the business', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedOwner(t);
    const otherUser = await t.run((ctx) => ctx.db.insert('users', { name: 'X', email: 'x2@x.com' }));
    const otherBiz = await t.run((ctx) => ctx.db.insert('businesses', { name: 'B', ownerUserId: otherUser, createdAt: 1 }));
    const foreign = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Foreign', ownerUserId: otherUser, businessId: otherBiz, createdAt: 1 })
    );
    await expect(
      asOwner.mutation(api.invites.inviteManager, { email: 'm@x.com', cafeIds: [foreign] })
    ).rejects.toThrow('Outlet tidak ditemukan.');
  });

  it('rejects an empty outlet set and an invalid email', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await seedOwner(t);
    await expect(asOwner.mutation(api.invites.inviteManager, { email: 'm@x.com', cafeIds: [] })).rejects.toThrow('minimal satu outlet');
    await expect(asOwner.mutation(api.invites.inviteManager, { email: 'nope', cafeIds: [cafeId] })).rejects.toThrow('Email tidak valid.');
  });

  it('rejects a manager (owner-only)', async () => {
    const t = convexTest(schema, modules);
    const { userId: ownerId, businessId, cafeId } = await seedOwner(t);
    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'mgr2@x.com' }));
    const mgrMemberId = await t.run((ctx) =>
      ctx.db.insert('businessMembers', { businessId, userId: mgrUserId, role: 'manager', createdAt: 5 })
    );
    await t.run((ctx) =>
      ctx.db.insert('memberOutletAccess', { businessMemberId: mgrMemberId, cafeId, createdAt: 5 })
    );
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });
    await expect(
      asMgr.mutation(api.invites.inviteManager, { email: 'x@x.com', cafeIds: [cafeId] })
    ).rejects.toThrow('owner access required');
  });
});
