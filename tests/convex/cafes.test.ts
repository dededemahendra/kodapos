import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

describe('cafes.createForOwner / cafes.mine', () => {
  it('creates a cafe owned by the authenticated user and returns it from mine()', async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Owner',
        email: 'owner@example.com',
      });
    });
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
    const list = await asOwner.query(api.cafes.mine);

    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Kopi Senja');
    expect(list[0]?.ownerUserId).toBe(userId);
  });

  it('returns an empty list when no cafe is owned', async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Empty Owner',
        email: 'empty@example.com',
      });
    });
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    const list = await asOwner.query(api.cafes.mine);
    expect(list).toEqual([]);
  });

  it('returns an empty list when not authenticated', async () => {
    const t = convexTest(schema, modules);
    const list = await t.query(api.cafes.mine);
    expect(list).toEqual([]);
  });

  it('createForOwner throws when not authenticated', async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.cafes.createForOwner, { name: 'Anon Cafe' })).rejects.toThrow(
      /not authenticated/i
    );
  });
});
