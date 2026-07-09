import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from '../../convex/_generated/api';
import { hashToken } from '../../convex/lib/token';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

describe('accessTokens.resolve', () => {
  it('returns userId+cafeId for a live token, null for revoked/missing', async () => {
    const t = convexTest(schema, modules);
    const { userId, cafeId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Owner' });
      const cafeId = await ctx.db.insert('cafes', {
        name: 'Cafe',
        ownerUserId: userId,
        createdAt: 0,
      });
      return { userId, cafeId };
    });
    const hash = await hashToken('kpat_live');
    await t.run(async (ctx) => {
      await ctx.db.insert('accessTokens', {
        userId,
        cafeId,
        tokenHash: hash,
        name: 'x',
        createdAt: 0,
      });
    });

    expect(await t.query(internal.accessTokens.resolve, { tokenHash: hash })).toEqual({
      userId,
      cafeId,
    });
    expect(
      await t.query(internal.accessTokens.resolve, { tokenHash: await hashToken('nope') })
    ).toBeNull();

    // revoke -> resolve returns null
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query('accessTokens')
        .withIndex('by_hash', (q) => q.eq('tokenHash', hash))
        .unique();
      if (row) await ctx.db.patch(row._id, { revokedAt: 1 });
    });
    expect(await t.query(internal.accessTokens.resolve, { tokenHash: hash })).toBeNull();
  });
});
