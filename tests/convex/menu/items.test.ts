import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../../convex/_generated/api';
import schema from '../../../convex/schema';

const modules = import.meta.glob('../../../convex/**/*.*s');

async function setupOwnerAndCategory(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  return { asOwner, categoryId };
}

describe('menu.items', () => {
  it('create + list happy path', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Kopi Susu Gula Aren',
      priceIDR: 22000,
    });
    const items = await asOwner.query(api.menu.items.list, {});
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('Kopi Susu Gula Aren');
    expect(items[0]?.priceIDR).toBe(22000);
    expect(items[0]?.isActive).toBe(true);
    expect(items[0]?.archived).toBe(false);
  });

  it('list filters by categoryId when provided', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    const otherCat = await asOwner.mutation(api.menu.categories.create, { name: 'Non-Kopi' });
    await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Espresso',
      priceIDR: 18000,
    });
    await asOwner.mutation(api.menu.items.create, {
      categoryId: otherCat,
      name: 'Matcha',
      priceIDR: 28000,
    });
    const kopiItems = await asOwner.query(api.menu.items.list, { categoryId });
    expect(kopiItems).toHaveLength(1);
    expect(kopiItems[0]?.name).toBe('Espresso');
  });

  it('update changes price + category', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    const otherCat = await asOwner.mutation(api.menu.categories.create, { name: 'Non-Kopi' });
    const id = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'X',
      priceIDR: 10000,
    });
    await asOwner.mutation(api.menu.items.update, {
      id,
      categoryId: otherCat,
      name: 'X-Renamed',
      priceIDR: 12000,
    });
    const items = await asOwner.query(api.menu.items.list, {});
    expect(items[0]?.name).toBe('X-Renamed');
    expect(items[0]?.priceIDR).toBe(12000);
    expect(items[0]?.categoryId).toBe(otherCat);
  });

  it('setActive toggles isActive', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    const id = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'X',
      priceIDR: 10000,
    });
    await asOwner.mutation(api.menu.items.setActive, { id, isActive: false });
    expect(await asOwner.query(api.menu.items.list, { includeInactive: false })).toHaveLength(0);
    expect(await asOwner.query(api.menu.items.list, { includeInactive: true })).toHaveLength(1);
  });

  it('archive hides from default list', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    const id = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'X',
      priceIDR: 10000,
    });
    await asOwner.mutation(api.menu.items.archive, { id });
    expect(await asOwner.query(api.menu.items.list, {})).toHaveLength(0);
    expect(await asOwner.query(api.menu.items.list, { includeArchived: true })).toHaveLength(1);
  });

  it('create rejects non-integer price', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    await expect(
      asOwner.mutation(api.menu.items.create, { categoryId, name: 'X', priceIDR: 99.99 })
    ).rejects.toThrow(/bulat|rupiah/i);
  });

  it('create rejects negative price', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    await expect(
      asOwner.mutation(api.menu.items.create, { categoryId, name: 'X', priceIDR: -1 })
    ).rejects.toThrow(/negatif/i);
  });

  it('create rejects blank name', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    await expect(
      asOwner.mutation(api.menu.items.create, { categoryId, name: '   ', priceIDR: 10000 })
    ).rejects.toThrow(/nama/i);
  });

  it('create rejects category from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwnerAndCategory(t, 'a@x.com');
    const { categoryId: catB } = await setupOwnerAndCategory(t, 'b@x.com');
    await expect(
      ownerA.mutation(api.menu.items.create, { categoryId: catB, name: 'X', priceIDR: 10000 })
    ).rejects.toThrow(/kategori|akses/i);
  });

  it('getById returns item with attached groups in position order', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    const itemId = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Kopi',
      priceIDR: 22000,
    });
    const g1 = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Ukuran',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [{ name: 'R', priceAdjustmentIDR: 0, position: 100 }],
    });
    const g2 = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Susu',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'Sapi', priceAdjustmentIDR: 0, position: 100 }],
    });
    // @ts-expect-error api.menu.itemGroups lands in Task 8; this assertion drives that work.
    await asOwner.mutation(api.menu.itemGroups.attach, { menuItemId: itemId, modifierGroupId: g1 });
    // @ts-expect-error api.menu.itemGroups lands in Task 8; this assertion drives that work.
    await asOwner.mutation(api.menu.itemGroups.attach, { menuItemId: itemId, modifierGroupId: g2 });
    const detail = await asOwner.query(api.menu.items.getById, { id: itemId });
    expect(detail?.item.name).toBe('Kopi');
    expect(detail?.attachedGroups).toHaveLength(2);
    expect(detail?.attachedGroups[0]?.group.name).toBe('Ukuran');
    expect(detail?.attachedGroups[1]?.group.name).toBe('Susu');
  });

  it('tenant isolation: cafe A cannot read cafe B items', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA, categoryId: catA } = await setupOwnerAndCategory(t, 'a@x.com');
    const { asOwner: ownerB } = await setupOwnerAndCategory(t, 'b@x.com');
    await ownerA.mutation(api.menu.items.create, {
      categoryId: catA,
      name: 'A-only',
      priceIDR: 10000,
    });
    expect(await ownerB.query(api.menu.items.list, {})).toHaveLength(0);
  });
});
