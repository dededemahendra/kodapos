import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../../convex/_generated/api';
import schema from '../../../convex/schema';

const modules = import.meta.glob('../../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  await t
    .withIdentity({ subject: `${userId}|test_session` })
    .mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return t.withIdentity({ subject: `${userId}|test_session` });
}

describe('menu.categories', () => {
  it('create + list happy path', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    await asOwner.mutation(api.menu.categories.create, { name: 'Non-Kopi' });
    const list = await asOwner.query(api.menu.categories.list, {});
    expect(list).toHaveLength(2);
    expect(list[0]?.name).toBe('Kopi');
    expect(list[1]?.name).toBe('Non-Kopi');
    expect(list[0]?.position).toBeLessThan(list[1]?.position ?? 0);
  });

  it('create rejects blank name', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    await expect(asOwner.mutation(api.menu.categories.create, { name: '  ' })).rejects.toThrow(
      /nama/i
    );
  });

  it('update renames a category', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    await asOwner.mutation(api.menu.categories.update, { id, name: 'Kopi Khas' });
    const list = await asOwner.query(api.menu.categories.list, {});
    expect(list[0]?.name).toBe('Kopi Khas');
  });

  it('reorder up/down swaps positions', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const aId = await asOwner.mutation(api.menu.categories.create, { name: 'A' });
    const bId = await asOwner.mutation(api.menu.categories.create, { name: 'B' });
    await asOwner.mutation(api.menu.categories.reorder, { id: bId, direction: 'up' });
    const list = await asOwner.query(api.menu.categories.list, {});
    expect(list[0]?.name).toBe('B');
    expect(list[1]?.name).toBe('A');
    // reorder beyond edge is a no-op
    await asOwner.mutation(api.menu.categories.reorder, { id: bId, direction: 'up' });
    const list2 = await asOwner.query(api.menu.categories.list, {});
    expect(list2[0]?.name).toBe('B');
  });

  it('archive hides from default list, visible with includeArchived', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.menu.categories.create, { name: 'Lama' });
    await asOwner.mutation(api.menu.categories.archive, { id });
    expect(await asOwner.query(api.menu.categories.list, {})).toHaveLength(0);
    expect(await asOwner.query(api.menu.categories.list, { includeArchived: true })).toHaveLength(
      1
    );
  });

  it('tenant isolation: cafe A cannot read or mutate cafe B categories', async () => {
    const t = convexTest(schema, modules);
    const ownerA = await setupOwner(t, 'a@x.com');
    const ownerB = await setupOwner(t, 'b@x.com');
    const idA = await ownerA.mutation(api.menu.categories.create, { name: 'A-only' });
    expect(await ownerB.query(api.menu.categories.list, {})).toHaveLength(0);
    await expect(
      ownerB.mutation(api.menu.categories.update, { id: idA, name: 'pwn' })
    ).rejects.toThrow(/akses|not found|forbidden/i);
  });
});
