import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

/**
 * Seed an owner (with a fully-bootstrapped cafe/business) and a manager
 * who has outlet access to the same cafe.
 */
async function seedOwnerWithManager(t: ReturnType<typeof convexTest>) {
  const ownerId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' })
  );
  const asOwner = t.withIdentity({ subject: `${ownerId}|test_session` });
  const cafeId = await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const businessId = (await t.run((ctx) => ctx.db.get(cafeId as Id<'cafes'>)))!
    .businessId as Id<'businesses'>;

  const mgrUserId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Mgr', email: 'm@x.com' })
  );
  const mgrMemberId = await t.run((ctx) =>
    ctx.db.insert('businessMembers', {
      businessId,
      userId: mgrUserId,
      role: 'manager',
      createdAt: 5,
    })
  );
  await t.run((ctx) =>
    ctx.db.insert('memberOutletAccess', {
      businessMemberId: mgrMemberId,
      cafeId: cafeId as Id<'cafes'>,
      createdAt: 5,
    })
  );

  const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });
  return { asOwner, asMgr };
}

// ---------------------------------------------------------------------------
// disconnectIntegration: auth gate
// ---------------------------------------------------------------------------
describe('integration config is owner-only', () => {
  it('rejects a manager from disconnectIntegration with "owner access required"', async () => {
    const t = convexTest(schema, modules);
    const { asMgr } = await seedOwnerWithManager(t);
    await expect(
      asMgr.mutation(api.settings.disconnectIntegration, { key: 'qris' })
    ).rejects.toThrow('owner access required');
  });

  it('allows the owner to call disconnectIntegration (not auth-rejected)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedOwnerWithManager(t);
    // disconnecting a key that was never connected is a no-op — no auth error
    await expect(
      asOwner.mutation(api.settings.disconnectIntegration, { key: 'qris' })
    ).resolves.toBeNull();
  });
});
