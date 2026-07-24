import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

describe('users.analyticsIdentity', () => {
  it('returns null when signed out', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.users.analyticsIdentity, {})).toBeNull();
  });

  it('returns the pseudonymous identity for a signed-in owner', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
    });
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });

    const identity = await asOwner.query(api.users.analyticsIdentity, {});
    expect(identity).not.toBeNull();
    expect(identity?.userId).toBe(userId);
    expect(identity?.role).toBe('owner');
    expect(identity?.outletCount).toBe(1);
    expect(identity?.accountAgeMs).toBeGreaterThanOrEqual(0);
  });

  it('never returns personal data', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
    });
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });

    const identity = await asOwner.query(api.users.analyticsIdentity, {});
    const keys = Object.keys(identity ?? {}).sort();
    expect(keys).toEqual(['accountAgeMs', 'businessId', 'outletCount', 'role', 'userId']);
    expect(JSON.stringify(identity)).not.toContain('o@x.com');
    expect(JSON.stringify(identity)).not.toContain('Owner');
    expect(JSON.stringify(identity)).not.toContain('Kopi Senja');
  });

  it('counts every outlet in the business', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
    });
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
    const identity = await asOwner.query(api.users.analyticsIdentity, {});

    await t.run(async (ctx) => {
      await ctx.db.insert('cafes', {
        name: 'Kopi Senja 2',
        ownerUserId: userId,
        ...(identity?.businessId ? { businessId: identity.businessId } : {}),
        createdAt: Date.now(),
      });
    });

    const after = await asOwner.query(api.users.analyticsIdentity, {});
    expect(after?.outletCount).toBe(2);
  });

  it('returns the businessMembers role, not cafeStaff.role, for a manager', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
    });
    const asOwner = t.withIdentity({ subject: `${ownerId}|test_session` });
    const cafeId = await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
    await asOwner.mutation(api.invites.inviteManager, { email: 'mgr@x.com', cafeIds: [cafeId] });

    const mgrUserId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Mgr', email: 'mgr@x.com' });
    });
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });
    await asMgr.mutation(api.invites.acceptPendingInvites, {});

    // The outlet's cafeStaff row (created for the owner's PIN session by
    // cafes.createForOwner) still says role: 'owner', and 'manager' is not
    // even a legal cafeStaff.role value. If the handler ever reads
    // cafeStaff.role instead of businessMembers.role for this manager, it
    // would return 'owner' (or 'cashier', or null) here, never 'manager' —
    // so this assertion catches a wrong-table regression that an owner-only
    // fixture cannot.
    const identity = await asMgr.query(api.users.analyticsIdentity, {});
    expect(identity?.role).toBe('manager');
  });

  it('returns businessId null, role null, and outletCount 0 mid-onboarding (no businessMembers row)', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Newbie', email: 'n@x.com' });
    });
    const asUser = t.withIdentity({ subject: `${userId}|test_session` });

    const identity = await asUser.query(api.users.analyticsIdentity, {});
    expect(identity).not.toBeNull();
    expect(identity?.businessId).toBeNull();
    expect(identity?.role).toBeNull();
    expect(identity?.outletCount).toBe(0);
  });
});
