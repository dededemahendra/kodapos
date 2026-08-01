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
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: 'Asia/Jakarta',
    taxRatePct: 0,
    taxEnabled: false,
  });
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, {
    cashierId,
    openingFloatIDR: 100000,
  });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
  const tierId = await asOwner.mutation(api.menu.priceCategories.create, { name: 'Turis' });
  return { asOwner, cashierId, shiftId, categoryId, itemId, tierId };
}

async function sell(
  s: Awaited<ReturnType<typeof setup>>,
  clientId: string,
  lines: Array<Record<string, unknown>>,
  priceCategoryId?: string
) {
  return await s.asOwner.mutation(api.orders.createCashSale, {
    clientId,
    shiftId: s.shiftId,
    cashierId: s.cashierId,
    lines,
    cashTenderedIDR: 100000,
    ...(priceCategoryId ? { priceCategoryId } : {}),
  } as never);
}

describe('price category resolution', () => {
  // The regression guard for every existing cafe: no category means today's
  // behavior, byte for byte.
  it('charges the standard price when no category is given', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const res = await sell(s, 'pc-1', [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [] }]);
    expect(res.totalIDR).toBe(18000);
    const order = await t.run(async (ctx) => await ctx.db.get(res.orderId));
    expect(order!.priceCategoryName).toBeUndefined();
  });

  it('charges the override when the category has one', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'item',
      targetId: s.itemId,
      priceIDR: 30000,
    });
    const res = await sell(
      s,
      'pc-2',
      [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [] }],
      s.tierId
    );
    expect(res.totalIDR).toBe(30000);
    const order = await t.run(async (ctx) => await ctx.db.get(res.orderId));
    expect(order!.priceCategoryName).toBe('Turis');
  });

  // The fallback that makes the sparse model safe: an unpriced item is not free.
  it('falls back to the standard price for an item the category does not reprice', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const other = await s.asOwner.mutation(api.menu.items.create, {
      categoryId: s.categoryId,
      name: 'Teh',
      priceIDR: 12000,
    });
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'item',
      targetId: s.itemId,
      priceIDR: 30000,
    });
    const res = await sell(
      s,
      'pc-3',
      [{ menuItemId: other, qty: 1, modifierOptionIds: [] }],
      s.tierId
    );
    expect(res.totalIDR).toBe(12000);
  });

  // A variant's price already REPLACES the item's base price, so an item-level
  // override must not leak into a line that selected a size.
  it('keys a variant line on the variant, never the item override', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const variantId = await s.asOwner.mutation(api.menu.variants.create, {
      menuItemId: s.itemId,
      name: 'L',
      priceIDR: 25000,
    });
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'item',
      targetId: s.itemId,
      priceIDR: 99000,
    });
    // Only the item is overridden, so the variant line keeps the variant price.
    const res = await sell(
      s,
      'pc-4',
      [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [], variantId }],
      s.tierId
    );
    expect(res.totalIDR).toBe(25000);

    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'variant',
      targetId: variantId,
      priceIDR: 40000,
    });
    const res2 = await sell(
      s,
      'pc-5',
      [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [], variantId }],
      s.tierId
    );
    expect(res2.totalIDR).toBe(40000);
  });

  // Add-ons vary by category too. The override REPLACES priceAdjustmentIDR for
  // that option rather than stacking with it.
  it('applies a modifier override on top of the resolved base price', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const groupId = await s.asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Susu',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [{ name: 'Oat', priceAdjustmentIDR: 5000, position: 0 }],
    });
    await s.asOwner.mutation(api.menu.itemGroups.attach, {
      menuItemId: s.itemId,
      modifierGroupId: groupId,
    });
    const group = await s.asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
    const oat = group!.options.find((o) => o.name === 'Oat')!;

    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'item',
      targetId: s.itemId,
      priceIDR: 30000,
    });
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'modifier',
      targetId: oat._id,
      priceIDR: 9000,
    });

    const res = await sell(
      s,
      'pc-7',
      [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [oat._id] }],
      s.tierId
    );
    // 30000 overridden base plus 9000 overridden add-on, not 18000 plus 5000.
    expect(res.totalIDR).toBe(39000);
  });

  it('rejects a category from another cafe', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const otherUser = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Other', email: 'b@x.com' });
    });
    const asOther = t.withIdentity({ subject: `${otherUser}|test_session` });
    await asOther.mutation(api.cafes.createForOwner, { name: 'Warung B' });
    const foreignTier = await asOther.mutation(api.menu.priceCategories.create, {
      name: 'Turis',
    });
    await expect(
      sell(s, 'pc-6', [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [] }], foreignTier)
    ).rejects.toThrow();
  });

  // Regression guard: orders.getById + orders.listForShift have strict whole-
  // document return validators. An order carrying priceCategoryId/priceCategoryName
  // must not make them throw (they'd otherwise break every other order on the
  // shift too, since listForShift returns the whole shift in one call).
  it('getById and listForShift both succeed for an order with a price category', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'item',
      targetId: s.itemId,
      priceIDR: 30000,
    });
    const res = await sell(
      s,
      'pc-8',
      [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [] }],
      s.tierId
    );

    const detail = await s.asOwner.query(api.orders.getById, { id: res.orderId });
    expect(detail?._id).toBe(res.orderId);
    expect(detail?.priceCategoryName).toBe('Turis');

    const rows = await s.asOwner.query(api.orders.listForShift, { shiftId: s.shiftId });
    expect(rows.map((r) => r._id)).toContain(res.orderId);
    expect(rows.find((r) => r._id === res.orderId)?.priceCategoryName).toBe('Turis');
  });

  // Same failure mode, different pre-existing field: appliedPromo's scope/target
  // snapshot (written by buildOrder for every promo) must also round-trip through
  // both strict return validators.
  it('getById and listForShift both succeed for an order with an applied promo', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const promoId = await s.asOwner.mutation(api.promotions.create, {
      name: 'Diskon 25',
      type: 'percent',
      value: 25,
    });
    // sell() doesn't thread promoId; ring it up directly instead.
    const withPromo = await s.asOwner.mutation(api.orders.createCashSale, {
      clientId: 'pc-9',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 100000,
      promoId,
    });

    const detail = await s.asOwner.query(api.orders.getById, { id: withPromo.orderId });
    expect(detail?._id).toBe(withPromo.orderId);
    expect(detail?.appliedPromo?.scope).toBe('order');

    const rows = await s.asOwner.query(api.orders.listForShift, { shiftId: s.shiftId });
    expect(rows.find((r) => r._id === withPromo.orderId)?.appliedPromo?.scope).toBe('order');
  });
});

describe('listForSale price resolution', () => {
  it('returns standard prices when no category is given', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const rows = await s.asOwner.query(api.menu.items.listForSale, {});
    const row = rows.find((r) => r.item._id === s.itemId)!;
    expect(row.item.priceIDR).toBe(18000);
  });

  it('returns the override price for the selected category', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'item',
      targetId: s.itemId,
      priceIDR: 30000,
    });
    const rows = await s.asOwner.query(api.menu.items.listForSale, {
      priceCategoryId: s.tierId,
    });
    const row = rows.find((r) => r.item._id === s.itemId)!;
    expect(row.item.priceIDR).toBe(30000);
  });

  // The register must show exactly what buildOrder will charge. If these two
  // ever disagree the cashier quotes one number and the till takes another.
  it('agrees with what buildOrder charges for the same category', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'item',
      targetId: s.itemId,
      priceIDR: 30000,
    });
    const rows = await s.asOwner.query(api.menu.items.listForSale, {
      priceCategoryId: s.tierId,
    });
    const displayed = rows.find((r) => r.item._id === s.itemId)!.item.priceIDR;
    const res = await sell(
      s,
      'lfs-1',
      [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [] }],
      s.tierId
    );
    expect(res.totalIDR).toBe(displayed);
  });

  it('resolves variant prices too', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const variantId = await s.asOwner.mutation(api.menu.variants.create, {
      menuItemId: s.itemId,
      name: 'L',
      priceIDR: 25000,
    });
    await s.asOwner.mutation(api.menu.priceOverrides.set, {
      priceCategoryId: s.tierId,
      targetKind: 'variant',
      targetId: variantId,
      priceIDR: 40000,
    });
    const rows = await s.asOwner.query(api.menu.items.listForSale, {
      priceCategoryId: s.tierId,
    });
    const row = rows.find((r) => r.item._id === s.itemId)!;
    expect(row.variants.find((v) => v._id === variantId)!.priceIDR).toBe(40000);
  });

  it('rejects a category from another cafe', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const otherUser = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Other', email: 'b@x.com' });
    });
    const asOther = t.withIdentity({ subject: `${otherUser}|test_session` });
    await asOther.mutation(api.cafes.createForOwner, { name: 'Warung B' });
    const foreignTier = await asOther.mutation(api.menu.priceCategories.create, {
      name: 'Turis',
    });
    await expect(
      s.asOwner.query(api.menu.items.listForSale, { priceCategoryId: foreignTier })
    ).rejects.toThrow();
  });

  // The register guards against this by clearing the selection client-side,
  // but the server-side guard itself was never asserted directly.
  it('rejects an archived category', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.priceCategories.archive, { id: s.tierId });
    await expect(
      s.asOwner.query(api.menu.items.listForSale, { priceCategoryId: s.tierId })
    ).rejects.toThrow();
  });
});
