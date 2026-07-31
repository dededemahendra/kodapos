import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

describe('price categories', () => {
  it('starts empty, because Standard is not a row', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    expect(await asOwner.query(api.menu.priceCategories.list, {})).toEqual([]);
  });

  it('creates categories in insertion order', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    await asOwner.mutation(api.menu.priceCategories.create, { name: 'Turis' });
    await asOwner.mutation(api.menu.priceCategories.create, { name: 'Member' });
    const list = await asOwner.query(api.menu.priceCategories.list, {});
    expect(list.map((c) => c.name)).toEqual(['Turis', 'Member']);
    expect(list.map((c) => c.position)).toEqual([0, 1]);
  });

  it('rejects a blank name', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    await expect(
      asOwner.mutation(api.menu.priceCategories.create, { name: '   ' })
    ).rejects.toThrow();
  });

  it('renames a category', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const id = await asOwner.mutation(api.menu.priceCategories.create, { name: 'Turis' });
    await asOwner.mutation(api.menu.priceCategories.update, { id, name: 'Tourist' });
    const list = await asOwner.query(api.menu.priceCategories.list, {});
    expect(list[0]!.name).toBe('Tourist');
  });

  // Archived, never hard deleted, because settled orders reference the name.
  it('archives a category out of the list', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const id = await asOwner.mutation(api.menu.priceCategories.create, { name: 'Turis' });
    await asOwner.mutation(api.menu.priceCategories.archive, { id });
    expect(await asOwner.query(api.menu.priceCategories.list, {})).toEqual([]);
  });
});
