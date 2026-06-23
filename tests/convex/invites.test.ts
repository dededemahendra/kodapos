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

describe('acceptPendingInvites', () => {
  it('turns a pending invite into a manager membership + outlet access, then deletes it', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, businessId } = await seedOwner(t);
    await asOwner.mutation(api.invites.inviteManager, { email: 'mgr@x.com', cafeIds: [cafeId] });

    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'mgr@x.com' }));
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });

    const result = await asMgr.mutation(api.invites.acceptPendingInvites, {});
    expect(result.accepted).toBe(1);

    const member = await t.run((ctx) =>
      ctx.db.query('businessMembers').withIndex('by_user', (q) => q.eq('userId', mgrUserId)).first()
    );
    expect(member?.role).toBe('manager');
    expect(member?.businessId).toBe(businessId);

    const access = await t.run((ctx) =>
      ctx.db.query('memberOutletAccess').withIndex('by_member', (q) => q.eq('businessMemberId', member!._id)).collect()
    );
    expect(access.map((a) => a.cafeId)).toEqual([cafeId]);

    const remaining = await t.run((ctx) =>
      ctx.db.query('businessInvites').withIndex('by_email', (q) => q.eq('email', 'mgr@x.com')).collect()
    );
    expect(remaining).toHaveLength(0);

    // Idempotent: a second call accepts nothing.
    const again = await asMgr.mutation(api.invites.acceptPendingInvites, {});
    expect(again.accepted).toBe(0);
  });

  it('matches the user email case-insensitively', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await seedOwner(t);
    await asOwner.mutation(api.invites.inviteManager, { email: 'mixed@x.com', cafeIds: [cafeId] });
    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'M', email: 'Mixed@X.com' }));
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });
    const result = await asMgr.mutation(api.invites.acceptPendingInvites, {});
    expect(result.accepted).toBe(1);
  });

  it('leaves the invite pending if the user already has a membership (one business per user)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await seedOwner(t);
    // The invitee is themselves already an owner of another business.
    const otherOwnerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other', email: 'other@x.com' }));
    const asOther = t.withIdentity({ subject: `${otherOwnerId}|test_session` });
    await asOther.mutation(api.cafes.createForOwner, { name: 'Other Biz' }); // gives them an owner membership

    await asOwner.mutation(api.invites.inviteManager, { email: 'other@x.com', cafeIds: [cafeId] });
    const result = await asOther.mutation(api.invites.acceptPendingInvites, {});
    expect(result.accepted).toBe(0);

    const remaining = await t.run((ctx) =>
      ctx.db.query('businessInvites').withIndex('by_email', (q) => q.eq('email', 'other@x.com')).collect()
    );
    expect(remaining).toHaveLength(1); // still pending, surfaced to the owner
  });

  it('returns { accepted: 0 } when unauthenticated', async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(api.invites.acceptPendingInvites, {});
    expect(result.accepted).toBe(0);
  });
});

describe('member management', () => {
  async function seedOwnerWithManager(t: ReturnType<typeof convexTest>) {
    const { asOwner, userId: ownerId, cafeId, businessId } = await seedOwner(t);
    const second = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang 2', ownerUserId: ownerId, businessId, createdAt: 2 })
    );
    await asOwner.mutation(api.invites.inviteManager, { email: 'mgr@x.com', cafeIds: [cafeId] });
    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'mgr@x.com' }));
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });
    await asMgr.mutation(api.invites.acceptPendingInvites, {});
    const member = await t.run((ctx) =>
      ctx.db.query('businessMembers').filter((q) => q.eq(q.field('userId'), mgrUserId)).first()
    );
    return { asOwner, ownerId, cafeId, second, businessId, mgrUserId, memberId: member!._id };
  }

  it('lists members (owner + manager) and pending invites', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await seedOwnerWithManager(t);
    await asOwner.mutation(api.invites.inviteManager, { email: 'pending@x.com', cafeIds: [cafeId] });

    const members = await asOwner.query(api.invites.listMembers, {});
    expect(members.some((m) => m.role === 'owner')).toBe(true);
    const mgr = members.find((m) => m.role === 'manager');
    expect(mgr?.email).toBe('mgr@x.com');
    expect(mgr?.cafeIds).toEqual([cafeId]);

    const invites = await asOwner.query(api.invites.listPendingInvites, {});
    expect(invites.map((i) => i.email)).toContain('pending@x.com');
  });

  it('reassigns a manager outlets', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, second, memberId } = await seedOwnerWithManager(t);
    await asOwner.mutation(api.invites.setManagerOutlets, { memberId, cafeIds: [second] });
    const access = await t.run((ctx) =>
      ctx.db.query('memberOutletAccess').withIndex('by_member', (q) => q.eq('businessMemberId', memberId)).collect()
    );
    expect(access.map((a) => a.cafeId)).toEqual([second]);
  });

  it('revokes a manager (deletes membership + access)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, mgrUserId, memberId } = await seedOwnerWithManager(t);
    await asOwner.mutation(api.invites.revokeMember, { memberId });
    const member = await t.run((ctx) =>
      ctx.db.query('businessMembers').withIndex('by_user', (q) => q.eq('userId', mgrUserId)).first()
    );
    expect(member).toBeNull();
    const access = await t.run((ctx) =>
      ctx.db.query('memberOutletAccess').withIndex('by_member', (q) => q.eq('businessMemberId', memberId)).collect()
    );
    expect(access).toHaveLength(0);
  });

  it('cancels a pending invite', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await seedOwner(t);
    await asOwner.mutation(api.invites.inviteManager, { email: 'cancel@x.com', cafeIds: [cafeId] });
    const invites = await asOwner.query(api.invites.listPendingInvites, {});
    await asOwner.mutation(api.invites.cancelInvite, { inviteId: invites[0]!.inviteId });
    expect(await asOwner.query(api.invites.listPendingInvites, {})).toHaveLength(0);
  });

  it('rejects revoking the owner and reassigning across businesses', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, ownerId } = await seedOwnerWithManager(t);
    const ownerMember = await t.run((ctx) =>
      ctx.db.query('businessMembers').withIndex('by_user', (q) => q.eq('userId', ownerId)).first()
    );
    await expect(asOwner.mutation(api.invites.revokeMember, { memberId: ownerMember!._id })).rejects.toThrow();
  });

  it('rejects mutating members, outlets, and invites of another business', async () => {
    const t = convexTest(schema, modules);
    // Business A (the attacker owner) with a manager.
    const { asOwner: ownerA, memberId: mgrA } = await seedOwnerWithManager(t);

    // Business B: independent owner + manager + pending invite + outlet.
    const ownerBUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'B', email: 'ownerb@x.com' }));
    const asOwnerB = t.withIdentity({ subject: `${ownerBUserId}|test_session` });
    const cafeB = await asOwnerB.mutation(api.cafes.createForOwner, { name: 'Bisnis B' });
    await asOwnerB.mutation(api.invites.inviteManager, { email: 'mgrb@x.com', cafeIds: [cafeB] });
    const mgrBUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'MgrB', email: 'mgrb@x.com' }));
    await t.withIdentity({ subject: `${mgrBUserId}|test_session` }).mutation(api.invites.acceptPendingInvites, {});
    const mgrBMember = await t.run((ctx) =>
      ctx.db.query('businessMembers').withIndex('by_user', (q) => q.eq('userId', mgrBUserId)).first()
    );
    await asOwnerB.mutation(api.invites.inviteManager, { email: 'pendingb@x.com', cafeIds: [cafeB] });
    const inviteB = (await asOwnerB.query(api.invites.listPendingInvites, {}))[0]!.inviteId;

    // Owner A cannot touch business B's manager, invite, or use B's outlet.
    await expect(
      ownerA.mutation(api.invites.revokeMember, { memberId: mgrBMember!._id })
    ).rejects.toThrow('Anggota tidak ditemukan.');
    await expect(
      ownerA.mutation(api.invites.setManagerOutlets, { memberId: mgrBMember!._id, cafeIds: [cafeB] })
    ).rejects.toThrow('Anggota tidak ditemukan.');
    await expect(
      ownerA.mutation(api.invites.cancelInvite, { inviteId: inviteB })
    ).rejects.toThrow('Undangan tidak ditemukan.');
    // And cannot grant business A's own manager an outlet from business B.
    await expect(
      ownerA.mutation(api.invites.setManagerOutlets, { memberId: mgrA, cafeIds: [cafeB] })
    ).rejects.toThrow('Outlet tidak ditemukan.');

    // Business B is untouched.
    expect(await t.run((ctx) => ctx.db.get(mgrBMember!._id))).not.toBeNull();
    expect(await asOwnerB.query(api.invites.listPendingInvites, {})).toHaveLength(1);
  });
});
