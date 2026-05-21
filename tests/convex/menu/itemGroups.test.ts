import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../../convex/_generated/api';
import schema from '../../../convex/schema';

const modules = import.meta.glob('../../../convex/**/*.*s');

async function setupOwnerWithItemAndGroup(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const menuItemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Kopi',
    priceIDR: 22000,
  });
  const modifierGroupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
    name: 'Ukuran',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options: [{ name: 'R', priceAdjustmentIDR: 0, position: 100 }],
  });
  return { asOwner, menuItemId, modifierGroupId };
}

describe('menu.itemGroups', () => {
  it('attach links a group to an item', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, menuItemId, modifierGroupId } = await setupOwnerWithItemAndGroup(t);
    await asOwner.mutation(api.menu.itemGroups.attach, { menuItemId, modifierGroupId });
    const detail = await asOwner.query(api.menu.items.getById, { id: menuItemId });
    expect(detail?.attachedGroups).toHaveLength(1);
    expect(detail?.attachedGroups[0]?.group._id).toBe(modifierGroupId);
  });

  it('double-attach is idempotent', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, menuItemId, modifierGroupId } = await setupOwnerWithItemAndGroup(t);
    await asOwner.mutation(api.menu.itemGroups.attach, { menuItemId, modifierGroupId });
    await asOwner.mutation(api.menu.itemGroups.attach, { menuItemId, modifierGroupId });
    const detail = await asOwner.query(api.menu.items.getById, { id: menuItemId });
    expect(detail?.attachedGroups).toHaveLength(1);
  });

  it('detach removes the link', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, menuItemId, modifierGroupId } = await setupOwnerWithItemAndGroup(t);
    await asOwner.mutation(api.menu.itemGroups.attach, { menuItemId, modifierGroupId });
    await asOwner.mutation(api.menu.itemGroups.detach, { menuItemId, modifierGroupId });
    const detail = await asOwner.query(api.menu.items.getById, { id: menuItemId });
    expect(detail?.attachedGroups).toHaveLength(0);
  });

  it('reorder swaps positions', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, menuItemId, modifierGroupId } = await setupOwnerWithItemAndGroup(t);
    const secondGroup = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Susu',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'Sapi', priceAdjustmentIDR: 0, position: 100 }],
    });
    await asOwner.mutation(api.menu.itemGroups.attach, { menuItemId, modifierGroupId });
    await asOwner.mutation(api.menu.itemGroups.attach, {
      menuItemId,
      modifierGroupId: secondGroup,
    });
    await asOwner.mutation(api.menu.itemGroups.reorder, {
      menuItemId,
      modifierGroupId: secondGroup,
      direction: 'up',
    });
    const detail = await asOwner.query(api.menu.items.getById, { id: menuItemId });
    expect(detail?.attachedGroups[0]?.group._id).toBe(secondGroup);
    expect(detail?.attachedGroups[1]?.group._id).toBe(modifierGroupId);
  });

  it('cannot attach a group from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA, menuItemId: itemA } = await setupOwnerWithItemAndGroup(t, 'a@x.com');
    const { modifierGroupId: groupB } = await setupOwnerWithItemAndGroup(t, 'b@x.com');
    await expect(
      ownerA.mutation(api.menu.itemGroups.attach, { menuItemId: itemA, modifierGroupId: groupB })
    ).rejects.toThrow(/akses|tidak ditemukan/i);
  });
});
