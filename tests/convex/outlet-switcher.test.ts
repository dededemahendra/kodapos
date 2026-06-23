import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

/** Owner seeded via the real bootstrap; returns helpers + the owner's first cafe/business. */
async function seedOwner(t: ReturnType<typeof convexTest>, name = 'Kopi Senja') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: `${name}@x.com` }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  const cafeId = await asOwner.mutation(api.cafes.createForOwner, { name });
  const cafe = await t.run((ctx) => ctx.db.get(cafeId as Id<'cafes'>));
  return { userId, asOwner, cafeId, businessId: cafe!.businessId as Id<'businesses'> };
}

describe('myOutlets', () => {
  it('returns the single outlet as active for a fresh owner', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await seedOwner(t);
    const outlets = await asOwner.query(api.outlets.myOutlets, {});
    expect(outlets).toHaveLength(1);
    expect(outlets[0]).toMatchObject({ cafeId, isActive: true });
  });

  it('lists all of an owner business outlets, marking the active one', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId, businessId, cafeId: first } = await seedOwner(t);
    const second = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang 2', ownerUserId: userId, businessId, createdAt: 2 })
    );
    await t.run(async (ctx) => {
      const active = await ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId)).first();
      await ctx.db.patch(active!._id, { cafeId: second, updatedAt: 3 });
    });

    const outlets = await asOwner.query(api.outlets.myOutlets, {});
    expect(outlets).toHaveLength(2);
    const active = outlets.find((o) => o.isActive);
    expect(active?.cafeId).toBe(second);
    expect(outlets.map((o) => o.cafeId).sort()).toEqual([first, second].sort());
  });

  it('returns only granted outlets for a manager', async () => {
    const t = convexTest(schema, modules);
    const { userId: ownerId, businessId } = await seedOwner(t);
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

    const outlets = await asMgr.query(api.outlets.myOutlets, {});
    expect(outlets).toHaveLength(1);
    expect(outlets[0]).toMatchObject({ cafeId: granted, isActive: true });
  });

  it('returns [] when unauthenticated', async () => {
    const t = convexTest(schema, modules);
    const outlets = await t.query(api.outlets.myOutlets, {});
    expect(outlets).toEqual([]);
  });
});

describe('myCafe resolves the active outlet', () => {
  it('returns the active outlet, not the oldest cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId, businessId, cafeId: first } = await seedOwner(t);
    const second = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang 2', ownerUserId: userId, businessId, createdAt: 2 })
    );
    await t.run(async (ctx) => {
      const active = await ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId)).first();
      await ctx.db.patch(active!._id, { cafeId: second, updatedAt: 3 });
    });

    const cafe = await asOwner.query(api.cafes.myCafe, {});
    expect(cafe?._id).toBe(second);
    expect(cafe?._id).not.toBe(first);
  });

  it('returns null when unauthenticated', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.cafes.myCafe, {})).toBeNull();
  });
});

describe('setActiveOutlet', () => {
  it('switches the active outlet to an accessible cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId, businessId, cafeId: first } = await seedOwner(t);
    const second = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang 2', ownerUserId: userId, businessId, createdAt: 2 })
    );

    await asOwner.mutation(api.outlets.setActiveOutlet, { cafeId: second });

    const active = await t.run((ctx) =>
      ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId)).first()
    );
    expect(active?.cafeId).toBe(second);
    const cafe = await asOwner.query(api.cafes.myCafe, {});
    expect(cafe?._id).toBe(second);
    expect(second).not.toBe(first);
  });

  it('rejects switching to an outlet the user cannot access', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedOwner(t);
    const otherUser = await t.run((ctx) => ctx.db.insert('users', { name: 'X', email: 'x2@x.com' }));
    const otherBiz = await t.run((ctx) => ctx.db.insert('businesses', { name: 'B', ownerUserId: otherUser, createdAt: 1 }));
    const foreign = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Foreign', ownerUserId: otherUser, businessId: otherBiz, createdAt: 1 })
    );

    await expect(asOwner.mutation(api.outlets.setActiveOutlet, { cafeId: foreign })).rejects.toThrow('no outlet access');
  });

  it('upserts (does not duplicate) the activeOutlet row', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId, businessId } = await seedOwner(t);
    const second = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang 2', ownerUserId: userId, businessId, createdAt: 2 })
    );
    await asOwner.mutation(api.outlets.setActiveOutlet, { cafeId: second });
    const rows = await t.run((ctx) =>
      ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId)).collect()
    );
    expect(rows).toHaveLength(1);
  });
});
