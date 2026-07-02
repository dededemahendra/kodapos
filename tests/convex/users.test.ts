import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

// pnpm hoists convex-test outside the project root, breaking its default
// import.meta.glob discovery. Pass modules explicitly from the test file's
// own location so Vite resolves the project's convex/ directory.
const modules = import.meta.glob('../../convex/**/*.*s');

describe('users.hello', () => {
  it('returns null when not authenticated', async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.users.hello);
    expect(result).toBeNull();
  });

  it('returns a Bahasa greeting for an authenticated user', async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Warren',
        email: 'warren@example.com',
      });
    });

    const asUser = t.withIdentity({ subject: `${userId}|test_session` });
    const greeting = await asUser.query(api.users.hello);
    expect(greeting).toMatch(/Halo, Warren/);
  });
});

describe('setName / myName', () => {
  it('sets and reads back the authed user name (trimmed)', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'o@x.com' }));
    const asUser = t.withIdentity({ subject: `${userId}|test_session` });

    expect(await asUser.query(api.users.myName)).toBeNull();
    await asUser.mutation(api.users.setName, { name: '  Warren  ' });
    expect(await asUser.query(api.users.myName)).toBe('Warren');
  });

  it('rejects an empty name', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'o2@x.com' }));
    const asUser = t.withIdentity({ subject: `${userId}|test_session` });
    await expect(asUser.mutation(api.users.setName, { name: '   ' })).rejects.toThrow('Nama wajib diisi.');
  });

  it('setName throws when unauthenticated', async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.users.setName, { name: 'X' })).rejects.toThrow('Not authenticated');
  });
});
