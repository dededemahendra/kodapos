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
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
  const variantId = await asOwner.mutation(api.menu.variants.create, {
    menuItemId: itemId,
    name: 'L',
    priceIDR: 25000,
  });
  const groupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
    name: 'Susu',
    required: false,
    minSelect: 0,
    maxSelect: 1,
    options: [{ name: 'Oat', priceAdjustmentIDR: 5000, position: 0 }],
  });
  await asOwner.mutation(api.menu.itemGroups.attach, {
    menuItemId: itemId,
    modifierGroupId: groupId,
  });
  const tierId = await asOwner.mutation(api.menu.priceCategories.create, { name: 'Turis' });
  return { asOwner, itemId, variantId, groupId, tierId };
}

describe('price grid', () => {
  it('lists every priceable target with its standard price', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const rows = await s.asOwner.query(api.menu.priceOverrides.grid, {
      priceCategoryId: s.tierId,
    });
    const kinds = rows.map((r) => r.targetKind).sort();
    expect(kinds).toEqual(['item', 'modifier', 'variant']);
    const item = rows.find((r) => r.targetKind === 'item')!;
    expect(item.label).toBe('Espresso');
    expect(item.standardPriceIDR).toBe(18000);
    const variant = rows.find((r) => r.targetKind === 'variant')!;
    expect(variant.standardPriceIDR).toBe(25000);
    const modifier = rows.find((r) => r.targetKind === 'modifier')!;
    expect(modifier.standardPriceIDR).toBe(5000);
  });

  // A blank cell in the grid means inherit, so an unpriced target must come back
  // as null rather than as its standard price, or the UI cannot tell the two apart.
  it('returns a null override for a target the category does not reprice', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const rows = await s.asOwner.query(api.menu.priceOverrides.grid, {
      priceCategoryId: s.tierId,
    });
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.overrideIDR === null)).toBe(true);
  });

  it('returns the override where one exists', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'item',
      targetId: s.itemId,
      priceIDR: 30000,
    });
    const rows = await s.asOwner.query(api.menu.priceOverrides.grid, {
      priceCategoryId: s.tierId,
    });
    const item = rows.find((r) => r.targetKind === 'item')!;
    expect(item.overrideIDR).toBe(30000);
    expect(item.standardPriceIDR).toBe(18000);
    const variant = rows.find((r) => r.targetKind === 'variant')!;
    expect(variant.overrideIDR).toBeNull();
  });

  it('excludes an archived item and its variants', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.items.archive, { id: s.itemId });
    const rows = await s.asOwner.query(api.menu.priceOverrides.grid, {
      priceCategoryId: s.tierId,
    });
    expect(rows.some((r) => r.targetKind === 'item')).toBe(false);
    expect(rows.some((r) => r.targetKind === 'variant')).toBe(false);
    expect(rows.some((r) => r.targetKind === 'modifier')).toBe(true);
  });

  // The item stays active here (unlike the case above), so the items query
  // alone would still return it and its variants. Only the in-memory
  // `variant.archived` filter added alongside the N+1 fix keeps an archived
  // variant off the grid while its still-active item stays on.
  it('excludes an archived variant but keeps its still-active item', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.variants.archive, { id: s.variantId });
    const rows = await s.asOwner.query(api.menu.priceOverrides.grid, {
      priceCategoryId: s.tierId,
    });
    expect(rows.some((r) => r.targetKind === 'variant')).toBe(false);
    const item = rows.find((r) => r.targetKind === 'item');
    expect(item?.label).toBe('Espresso');
  });

  it('rejects an archived price category', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.priceCategories.archive, { id: s.tierId });
    await expect(
      s.asOwner.mutation(api.menu.priceOverrides.set, {
        priceCategoryId: s.tierId,
        targetKind: 'item',
        targetId: s.itemId,
        priceIDR: 30000,
      })
    ).rejects.toThrow(/diarsipkan/);
  });

  it('rejects a category from another cafe', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const otherUser = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Other', email: 'b@x.com' });
    });
    const asOther = t.withIdentity({ subject: `${otherUser}|test_session` });
    await asOther.mutation(api.cafes.createForOwner, { name: 'Warung B' });
    await expect(
      asOther.query(api.menu.priceOverrides.grid, { priceCategoryId: s.tierId })
    ).rejects.toThrow();
  });
});
