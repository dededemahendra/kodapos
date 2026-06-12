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

async function setup(
  t: ReturnType<typeof convexTest>,
  email = 'owner@test.com'
): Promise<Setup> {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
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

describe('menu item barcode', () => {
  it('create stores barcode; getById and listForSale carry it', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setup(t);
    const id = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Latte',
      priceIDR: 25000,
      barcode: '8991234567890',
    });
    const detail = await asOwner.query(api.menu.items.getById, { id });
    expect(detail?.item.barcode).toBe('8991234567890');
    const rows = await asOwner.query(api.menu.items.listForSale, {});
    const row = rows.find((r) => r.item._id === id);
    expect(row?.item.barcode).toBe('8991234567890');
  });

  it('item created without a barcode omits the field', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setup(t);
    const id = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Americano',
      priceIDR: 20000,
    });
    const detail = await asOwner.query(api.menu.items.getById, { id });
    expect(detail?.item.barcode).toBeUndefined();
  });

  it('rejects a second item create with the same barcode in the cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setup(t);
    await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Latte',
      priceIDR: 25000,
      barcode: '8991234567890',
    });
    await expect(
      asOwner.mutation(api.menu.items.create, {
        categoryId,
        name: 'Cappuccino',
        priceIDR: 28000,
        barcode: '8991234567890',
      })
    ).rejects.toThrow(/barcode/i);
  });

  it('rejects an update setting a barcode already used by another item', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setup(t);
    await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Latte',
      priceIDR: 25000,
      barcode: '8991234567890',
    });
    const otherId = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Cappuccino',
      priceIDR: 28000,
    });
    await expect(
      asOwner.mutation(api.menu.items.update, {
        id: otherId,
        categoryId,
        name: 'Cappuccino',
        priceIDR: 28000,
        barcode: '8991234567890',
      })
    ).rejects.toThrow(/barcode/i);
  });

  it('allows the same barcode in a different cafe', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'owner-a@test.com');
    await a.asOwner.mutation(api.menu.items.create, {
      categoryId: a.categoryId,
      name: 'Latte',
      priceIDR: 25000,
      barcode: '8991234567890',
    });
    const b = await setup(t, 'owner-b@test.com');
    const id = await b.asOwner.mutation(api.menu.items.create, {
      categoryId: b.categoryId,
      name: 'Latte',
      priceIDR: 25000,
      barcode: '8991234567890',
    });
    const detail = await b.asOwner.query(api.menu.items.getById, { id });
    expect(detail?.item.barcode).toBe('8991234567890');
  });

  it('update clearing the barcode removes the field', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setup(t);
    const id = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Latte',
      priceIDR: 25000,
      barcode: '8991234567890',
    });
    await asOwner.mutation(api.menu.items.update, {
      id,
      categoryId,
      name: 'Latte',
      priceIDR: 25000,
      barcode: '',
    });
    const detail = await asOwner.query(api.menu.items.getById, { id });
    expect(detail?.item.barcode).toBeUndefined();
  });
});
