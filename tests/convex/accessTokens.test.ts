import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { generateToken, hashToken } from '../../convex/lib/token';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function ownerWithCafe(t: ReturnType<typeof convexTest>, name = 'Owner', email = 'o@x.com') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name, email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id as Id<'cafes'>;
  const businessId = cafe!.businessId as Id<'businesses'>;
  return { asOwner, userId, cafeId, businessId };
}

// Signed-in NON-owner: a manager membership scoped to the given business,
// granted access to the given cafe via memberOutletAccess (so
// requireActiveOutlet resolves to 'no outlet access' never masks the
// 'owner access required' check these tests assert on).
async function managerWithAccess(
  t: ReturnType<typeof convexTest>,
  businessId: Id<'businesses'>,
  cafeId: Id<'cafes'>,
  email = 'mgr@x.com'
) {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email }));
  const memberId = await t.run((ctx) =>
    ctx.db.insert('businessMembers', { businessId, userId, role: 'manager', createdAt: 5 })
  );
  await t.run((ctx) =>
    ctx.db.insert('memberOutletAccess', { businessMemberId: memberId, cafeId, createdAt: 5 })
  );
  return t.withIdentity({ subject: `${userId}|test_session` });
}

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

describe('accessTokens.create', () => {
  it('owner can create a token: returns a kpat_ token and stores only the hash', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId, cafeId } = await ownerWithCafe(t);

    const { token, id } = await asOwner.mutation(api.accessTokens.create, {
      name: 'Reporting bot',
      cafeId,
    });

    expect(token).toMatch(/^kpat_[A-Za-z0-9]{43}$/);

    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ userId, cafeId, name: 'Reporting bot' });
    expect(row?.tokenHash).not.toEqual(token);
    expect(row?.tokenHash).toEqual(await hashToken(token));

    // The freshly created token resolves via the internal lookup.
    expect(await t.query(internal.accessTokens.resolve, { tokenHash: row!.tokenHash })).toEqual({
      userId,
      cafeId,
    });
  });

  it('rejects a non-owner (not authenticated)', async () => {
    const t = convexTest(schema, modules);
    const { cafeId } = await ownerWithCafe(t);

    await expect(
      t.mutation(api.accessTokens.create, { name: 'x', cafeId })
    ).rejects.toThrow(/not authenticated/i);
  });

  it('rejects a signed-in manager (owner access required)', async () => {
    const t = convexTest(schema, modules);
    const { businessId, cafeId } = await ownerWithCafe(t);
    const asManager = await managerWithAccess(t, businessId, cafeId);

    await expect(
      asManager.mutation(api.accessTokens.create, { name: 'x', cafeId })
    ).rejects.toThrow(/owner access required/);
  });

  it('rejects a cafeId the caller does not own', async () => {
    const t = convexTest(schema, modules);
    const { cafeId: cafeA } = await ownerWithCafe(t, 'Owner A', 'a@x.com');
    const { asOwner: asOwnerB } = await ownerWithCafe(t, 'Owner B', 'b@x.com');

    await expect(
      asOwnerB.mutation(api.accessTokens.create, { name: 'x', cafeId: cafeA })
    ).rejects.toThrow();
  });
});

describe('accessTokens.revoke', () => {
  it('revoking a token makes resolve fail', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await ownerWithCafe(t);
    const { id } = await asOwner.mutation(api.accessTokens.create, { name: 'x', cafeId });
    const row = await t.run((ctx) => ctx.db.get(id));

    await asOwner.mutation(api.accessTokens.revoke, { id });

    expect(await t.query(internal.accessTokens.resolve, { tokenHash: row!.tokenHash })).toBeNull();
  });

  it('rejects revoking a token not owned by the caller', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: asOwnerA, cafeId: cafeA } = await ownerWithCafe(t, 'Owner A', 'a@x.com');
    const { asOwner: asOwnerB } = await ownerWithCafe(t, 'Owner B', 'b@x.com');
    const { id } = await asOwnerA.mutation(api.accessTokens.create, { name: 'x', cafeId: cafeA });

    await expect(asOwnerB.mutation(api.accessTokens.revoke, { id })).rejects.toThrow();
  });

  it('rejects a signed-in manager (owner access required)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, businessId, cafeId } = await ownerWithCafe(t);
    const { id } = await asOwner.mutation(api.accessTokens.create, { name: 'x', cafeId });
    const asManager = await managerWithAccess(t, businessId, cafeId);

    // The owner gate runs before the token lookup, so any id is rejected the
    // same way regardless of who it belongs to.
    await expect(asManager.mutation(api.accessTokens.revoke, { id })).rejects.toThrow(
      /owner access required/
    );
  });
});

describe('accessTokens.list', () => {
  it('excludes the hash and excludes revoked tokens', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await ownerWithCafe(t);

    const live = await asOwner.mutation(api.accessTokens.create, { name: 'Live token', cafeId });
    const revoked = await asOwner.mutation(api.accessTokens.create, {
      name: 'Revoked token',
      cafeId,
    });
    await asOwner.mutation(api.accessTokens.revoke, { id: revoked.id });

    const list = await asOwner.query(api.accessTokens.list, {});

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ _id: live.id, name: 'Live token', cafeId });
    expect(list[0]).not.toHaveProperty('tokenHash');
  });

  it('scopes to the caller (cross-user isolation)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: asOwnerA, cafeId: cafeA } = await ownerWithCafe(t, 'Owner A', 'a@x.com');
    const { asOwner: asOwnerB, cafeId: cafeB } = await ownerWithCafe(t, 'Owner B', 'b@x.com');

    await asOwnerA.mutation(api.accessTokens.create, { name: 'A token', cafeId: cafeA });
    await asOwnerB.mutation(api.accessTokens.create, { name: 'B token', cafeId: cafeB });

    const listA = await asOwnerA.query(api.accessTokens.list, {});
    const listB = await asOwnerB.query(api.accessTokens.list, {});

    expect(listA).toHaveLength(1);
    expect(listA[0]?.name).toBe('A token');
    expect(listB).toHaveLength(1);
    expect(listB[0]?.name).toBe('B token');
  });

  it('rejects a signed-in manager (owner access required)', async () => {
    const t = convexTest(schema, modules);
    const { businessId, cafeId } = await ownerWithCafe(t);
    const asManager = await managerWithAccess(t, businessId, cafeId);

    await expect(asManager.query(api.accessTokens.list, {})).rejects.toThrow(
      /owner access required/
    );
  });
});
