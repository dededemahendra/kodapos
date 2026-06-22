import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

describe('multi-outlet schema', () => {
  it('stores a business, an owner membership, and an active outlet', async () => {
    const t = convexTest(schema, modules);
    const result = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
      const businessId = await ctx.db.insert('businesses', {
        name: 'Kopi Senja',
        ownerUserId: userId,
        createdAt: 1,
      });
      const cafeId = await ctx.db.insert('cafes', {
        name: 'Kopi Senja',
        ownerUserId: userId,
        businessId,
        createdAt: 1,
      });
      const memberId = await ctx.db.insert('businessMembers', {
        businessId,
        userId,
        role: 'owner',
        createdAt: 1,
      });
      await ctx.db.insert('activeOutlet', { userId, cafeId, updatedAt: 1 });
      return { userId, businessId, cafeId, memberId };
    });

    const cafe = await t.run((ctx) => ctx.db.get(result.cafeId as Id<'cafes'>));
    expect(cafe?.businessId).toBe(result.businessId);

    const active = await t.run((ctx) =>
      ctx.db
        .query('activeOutlet')
        .withIndex('by_user', (q) => q.eq('userId', result.userId as Id<'users'>))
        .first()
    );
    expect(active?.cafeId).toBe(result.cafeId);
  });
});

describe('createForOwner — business bootstrap', () => {
  it('creates a business, owner membership, and active outlet for a new owner', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' }));
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    const cafeId = await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });

    const cafe = await t.run((ctx) => ctx.db.get(cafeId as Id<'cafes'>));
    expect(cafe?.businessId).toBeDefined();

    const business = await t.run((ctx) => ctx.db.get(cafe!.businessId as Id<'businesses'>));
    expect(business?.ownerUserId).toBe(userId);

    const member = await t.run((ctx) =>
      ctx.db.query('businessMembers').withIndex('by_user', (q) => q.eq('userId', userId as Id<'users'>)).first()
    );
    expect(member?.role).toBe('owner');
    expect(member?.businessId).toBe(cafe!.businessId);

    const active = await t.run((ctx) =>
      ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId as Id<'users'>)).first()
    );
    expect(active?.cafeId).toBe(cafeId);
  });

  it('is idempotent: a second call returns the same cafe and does not duplicate the business', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' }));
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    const first = await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
    const second = await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
    expect(second).toBe(first);

    const businesses = await t.run((ctx) =>
      ctx.db.query('businesses').withIndex('by_owner', (q) => q.eq('ownerUserId', userId as Id<'users'>)).collect()
    );
    expect(businesses).toHaveLength(1);
  });
});
