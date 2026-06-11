import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

type Setup = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  categoryId: Id<'categories'>;
};

async function setup(t: ReturnType<typeof convexTest>): Promise<Setup> {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email: 'owner@test.com' });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Test' });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id;
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Minuman' });
  return { asOwner, cafeId, categoryId };
}

describe('menu item images', () => {
  it('create + getById resolve imageUrl; update clears it', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setup(t);
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(['img'], { type: 'image/png' }))
    );
    const id = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Latte',
      priceIDR: 25000,
      imageStorageId: storageId,
    });
    const detail = await asOwner.query(api.menu.items.getById, { id });
    expect(detail?.imageUrl).toEqual(expect.any(String));
    // Update without imageStorageId — should clear the field
    await asOwner.mutation(api.menu.items.update, {
      id,
      categoryId,
      name: 'Latte',
      priceIDR: 25000,
    });
    const after = await asOwner.query(api.menu.items.getById, { id });
    expect(after?.imageUrl).toBeNull();
  });

  it('list returns imageUrl null when no image', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setup(t);
    await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Americano',
      priceIDR: 20000,
    });
    const rows = await asOwner.query(api.menu.items.list, {});
    expect(rows.every((r) => r.imageUrl === null || typeof r.imageUrl === 'string')).toBe(true);
    expect(rows[0]?.imageUrl).toBeNull();
  });

  it('listForSale returns imageUrl null when no image', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setup(t);
    await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Cappuccino',
      priceIDR: 28000,
    });
    const rows = await asOwner.query(api.menu.items.listForSale, {});
    expect(rows.every((r) => r.imageUrl === null || typeof r.imageUrl === 'string')).toBe(true);
  });
});
