import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
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
