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
