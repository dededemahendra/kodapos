import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from '../../convex/_generated/api';
import { generateToken, hashToken } from '../../convex/lib/token';
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

describe('generateToken', () => {
  it('returns a kpat_ prefixed 43-char base62 string, unique per call', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^kpat_[A-Za-z0-9]{43}$/);
    expect(b).toMatch(/^kpat_[A-Za-z0-9]{43}$/);
    expect(a).not.toEqual(b);
  });
});

describe('accessTokens.touchLastUsed', () => {
  it('updates lastUsedAt for a stale live token, throttles immediate re-touch, skips revoked', async () => {
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

    const staleAt = Date.now() - 6 * 60 * 1000;
    const liveHash = await hashToken('kpat_live-touch');
    const revokedHash = await hashToken('kpat_revoked-touch');
    await t.run(async (ctx) => {
      await ctx.db.insert('accessTokens', {
        userId,
        cafeId,
        tokenHash: liveHash,
        name: 'live',
        createdAt: 0,
        lastUsedAt: staleAt,
      });
      await ctx.db.insert('accessTokens', {
        userId,
        cafeId,
        tokenHash: revokedHash,
        name: 'revoked',
        createdAt: 0,
        lastUsedAt: staleAt,
        revokedAt: 1,
      });
    });

    // Stale lastUsedAt (>5min throttle) gets updated.
    await t.mutation(internal.accessTokens.touchLastUsed, { tokenHash: liveHash });
    const afterFirstTouch = await t.run(async (ctx) => {
      const row = await ctx.db
        .query('accessTokens')
        .withIndex('by_hash', (q) => q.eq('tokenHash', liveHash))
        .unique();
      return row?.lastUsedAt;
    });
    expect(afterFirstTouch).toBeDefined();
    expect(afterFirstTouch).toBeGreaterThan(staleAt);

    // Immediate re-touch is throttled: lastUsedAt does not change.
    await t.mutation(internal.accessTokens.touchLastUsed, { tokenHash: liveHash });
    const afterSecondTouch = await t.run(async (ctx) => {
      const row = await ctx.db
        .query('accessTokens')
        .withIndex('by_hash', (q) => q.eq('tokenHash', liveHash))
        .unique();
      return row?.lastUsedAt;
    });
    expect(afterSecondTouch).toEqual(afterFirstTouch);

    // Revoked token is never touched.
    await t.mutation(internal.accessTokens.touchLastUsed, { tokenHash: revokedHash });
    const revokedRow = await t.run(async (ctx) => {
      const row = await ctx.db
        .query('accessTokens')
        .withIndex('by_hash', (q) => q.eq('tokenHash', revokedHash))
        .unique();
      return row?.lastUsedAt;
    });
    expect(revokedRow).toEqual(staleAt);
  });
});
