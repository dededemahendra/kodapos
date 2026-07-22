import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

describe('menu.board.get', () => {
  it('groups sellable items under their category, in position order', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const kopi = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    const teh = await asOwner.mutation(api.menu.categories.create, { name: 'Teh' });
    await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi,
      name: 'Espresso',
      priceIDR: 18000,
    });
    await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi,
      name: 'Latte',
      priceIDR: 25000,
    });
    await asOwner.mutation(api.menu.items.create, {
      categoryId: teh,
      name: 'Teh Tarik',
      priceIDR: 15000,
    });

    const board = await asOwner.query(api.menu.board.get, {});
    expect(board.cafe.name).toBe('Kopi Senja');
    expect(board.cafe.logoUrl).toBeNull();
    expect(board.categories.map((c) => c.name)).toEqual(['Kopi', 'Teh']);
    expect(board.categories[0]?.items.map((i) => i.name)).toEqual(['Espresso', 'Latte']);
    expect(board.categories[0]?.items[0]).toEqual({
      name: 'Espresso',
      priceIDR: 18000,
      imageUrl: null,
      soldOut: false,
    });
    expect(board.categories[1]?.items.map((i) => i.name)).toEqual(['Teh Tarik']);
  });

  it('exposes only the four board fields per item (no cost, stock, ids)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const kopi = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi,
      name: 'Espresso',
      priceIDR: 18000,
      barcode: '8991234567890',
    });

    const board = await asOwner.query(api.menu.board.get, {});
    const item = board.categories[0]?.items[0];
    expect(Object.keys(item ?? {}).sort()).toEqual(['imageUrl', 'name', 'priceIDR', 'soldOut']);
  });

  it('omits inactive items, archived items, and archived categories', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const kopi = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    const teh = await asOwner.mutation(api.menu.categories.create, { name: 'Teh' });
    const keep = await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi,
      name: 'Espresso',
      priceIDR: 18000,
    });
    const off = await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi,
      name: 'Nonaktif',
      priceIDR: 1000,
    });
    const gone = await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi,
      name: 'Diarsip',
      priceIDR: 2000,
    });
    await asOwner.mutation(api.menu.items.create, {
      categoryId: teh,
      name: 'Teh Tarik',
      priceIDR: 15000,
    });
    await asOwner.mutation(api.menu.items.setActive, { id: off, isActive: false });
    await asOwner.mutation(api.menu.items.archive, { id: gone });
    await asOwner.mutation(api.menu.categories.archive, { id: teh });

    const board = await asOwner.query(api.menu.board.get, {});
    expect(board.categories.map((c) => c.name)).toEqual(['Kopi']);
    expect(board.categories[0]?.items.map((i) => i.name)).toEqual(['Espresso']);
    expect(keep).toBeTruthy();
  });

  it('omits categories with no sellable items', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const kopi = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    await asOwner.mutation(api.menu.categories.create, { name: 'Kosong' });
    await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi,
      name: 'Espresso',
      priceIDR: 18000,
    });

    const board = await asOwner.query(api.menu.board.get, {});
    expect(board.categories.map((c) => c.name)).toEqual(['Kopi']);
  });

  it('reports soldOut items (kept, not hidden)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const kopi = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    const id = await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi,
      name: 'Espresso',
      priceIDR: 18000,
    });
    await asOwner.mutation(api.menu.items.setSoldOut, { id, soldOut: true });

    const board = await asOwner.query(api.menu.board.get, {});
    expect(board.categories[0]?.items[0]?.soldOut).toBe(true);
  });

  it('is scoped to the active outlet', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    const catA = await ownerA.mutation(api.menu.categories.create, { name: 'Kopi A' });
    await ownerA.mutation(api.menu.items.create, {
      categoryId: catA,
      name: 'Espresso A',
      priceIDR: 18000,
    });

    const boardB = await ownerB.query(api.menu.board.get, {});
    expect(boardB.categories).toEqual([]);
  });

  it('rejects an unauthenticated caller', async () => {
    const t = convexTest(schema, modules);
    await setupOwner(t);
    await expect(t.query(api.menu.board.get, {})).rejects.toThrow();
  });

  it('resolves imageUrl for an item with a photo', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const kopi = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(['img'], { type: 'image/png' }))
    );
    await asOwner.mutation(api.menu.items.create, {
      categoryId: kopi,
      name: 'Espresso',
      priceIDR: 18000,
      imageStorageId: storageId,
    });

    const board = await asOwner.query(api.menu.board.get, {});
    expect(board.categories[0]?.items[0]?.imageUrl).toEqual(expect.any(String));
  });
});
