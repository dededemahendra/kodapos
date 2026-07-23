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
});
