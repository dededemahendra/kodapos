import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

// Sign-in identity for a given inserted user id (mirrors the repo convention).
const as = (t: ReturnType<typeof convexTest>, userId: string) =>
  t.withIdentity({ subject: `${userId}|test_session` });

describe('requirePlatformAdmin via admin.listUsers gate', () => {
  it('rejects a non-admin caller', async () => {
    const t = convexTest(schema, modules);
    const uid = await t.run((ctx) => ctx.db.insert('users', { name: 'Reg', email: 'reg@x.com' }));
    await expect(as(t, uid).query(api.admin.listUsers, {})).rejects.toThrow('not a platform admin');
  });

  it('rejects an unauthenticated caller', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.admin.listUsers, {})).rejects.toThrow('not authenticated');
  });

  it('allows a platform admin', async () => {
    const t = convexTest(schema, modules);
    const uid = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Boss', email: 'boss@x.com', isPlatformAdmin: true })
    );
    const rows = await as(t, uid).query(api.admin.listUsers, {});
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe('admin.listUsers joins', () => {
  it('flags a pre-backfill owner as no_outlet and finds by search', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Boss', email: 'boss@x.com', isPlatformAdmin: true })
    );
    // A legacy owner: owns a cafe with NO businessId / businessMembers row.
    const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Legacy', email: 'legacy@x.com' }));
    await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Old Cafe', ownerUserId: ownerId, createdAt: 1 })
    );

    const all = await as(t, adminId).query(api.admin.listUsers, {});
    const legacy = all.find((r) => r.email === 'legacy@x.com')!;
    expect(legacy.accessHealth).toBe('no_outlet');
    expect(legacy.cafeNames).toEqual(['Old Cafe']);

    const filtered = await as(t, adminId).query(api.admin.listUsers, { search: 'legacy' });
    expect(filtered.map((r) => r.email)).toEqual(['legacy@x.com']);
  });

  it('me() reports admin status and false when signed out', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Boss', email: 'boss@x.com', isPlatformAdmin: true })
    );
    expect(await as(t, adminId).query(api.admin.me, {})).toEqual({ isPlatformAdmin: true });
    expect(await t.query(api.admin.me, {})).toEqual({ isPlatformAdmin: false });
  });
});

describe('admin.fixOutletAccess', () => {
  it('repairs a pre-backfill owner and is idempotent', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Boss', email: 'boss@x.com', isPlatformAdmin: true })
    );
    const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Legacy', email: 'legacy@x.com' }));
    await t.run((ctx) => ctx.db.insert('cafes', { name: 'Old Cafe', ownerUserId: ownerId, createdAt: 1 }));

    const first = await as(t, adminId).mutation(api.admin.fixOutletAccess, { userId: ownerId });
    expect(first).toEqual({ fixed: true });

    const rows = await as(t, adminId).query(api.admin.listUsers, { search: 'legacy' });
    expect(rows[0].accessHealth).toBe('ok');
    expect(rows[0].role).toBe('owner');

    const second = await as(t, adminId).mutation(api.admin.fixOutletAccess, { userId: ownerId });
    expect(second).toEqual({ fixed: false });
  });

  it('rejects a non-admin caller', async () => {
    const t = convexTest(schema, modules);
    const uid = await t.run((ctx) => ctx.db.insert('users', { name: 'Reg', email: 'reg@x.com' }));
    await expect(
      as(t, uid).mutation(api.admin.fixOutletAccess, { userId: uid })
    ).rejects.toThrow('not a platform admin');
  });
});
