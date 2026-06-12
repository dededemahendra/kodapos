import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

type Setup = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
  shiftId: Id<'shifts'>;
  categoryId: Id<'categories'>;
  itemId: Id<'menuItems'>;
};

async function setup(
  t: ReturnType<typeof convexTest>,
  opts: { email?: string } = {}
): Promise<Setup> {
  const email = opts.email ?? 'o@x.com';
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: 'Asia/Jakarta',
    taxRatePct: 0,
    taxEnabled: false,
  });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, {
    cashierId,
    openingFloatIDR: 100000,
  });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Latte',
    priceIDR: 18000,
  });
  return { asOwner, cafeId, cashierId, shiftId, categoryId, itemId };
}

describe('menu.variants CRUD', () => {
  it('create + listForItem round-trip, defaults position/archived', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId } = await setup(t);
    const sId = await asOwner.mutation(api.menu.variants.create, {
      menuItemId: itemId,
      name: 'S',
      priceIDR: 16000,
    });
    expect(sId).toEqual(expect.any(String));
    const variants = await asOwner.query(api.menu.variants.listForItem, { menuItemId: itemId });
    expect(variants).toHaveLength(1);
    expect(variants[0]?.name).toBe('S');
    expect(variants[0]?.priceIDR).toBe(16000);
    expect(variants[0]?.position).toBe(0);
    expect(variants[0]?.archived).toBe(false);
  });

  it('position increments by max+1 and listForItem is ordered by position', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId } = await setup(t);
    await asOwner.mutation(api.menu.variants.create, { menuItemId: itemId, name: 'S', priceIDR: 16000 });
    await asOwner.mutation(api.menu.variants.create, { menuItemId: itemId, name: 'M', priceIDR: 20000 });
    await asOwner.mutation(api.menu.variants.create, { menuItemId: itemId, name: 'L', priceIDR: 24000 });
    const variants = await asOwner.query(api.menu.variants.listForItem, { menuItemId: itemId });
    expect(variants.map((v) => v.name)).toEqual(['S', 'M', 'L']);
    expect(variants.map((v) => v.position)).toEqual([0, 1, 2]);
  });

  it('update patches name + price', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId } = await setup(t);
    const id = await asOwner.mutation(api.menu.variants.create, {
      menuItemId: itemId,
      name: 'S',
      priceIDR: 16000,
    });
    await asOwner.mutation(api.menu.variants.update, { id, name: 'Small', priceIDR: 15000 });
    const variants = await asOwner.query(api.menu.variants.listForItem, { menuItemId: itemId });
    expect(variants[0]?.name).toBe('Small');
    expect(variants[0]?.priceIDR).toBe(15000);
  });

  it('archive removes from listForItem', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId } = await setup(t);
    const id = await asOwner.mutation(api.menu.variants.create, {
      menuItemId: itemId,
      name: 'S',
      priceIDR: 16000,
    });
    await asOwner.mutation(api.menu.variants.archive, { id });
    const variants = await asOwner.query(api.menu.variants.listForItem, { menuItemId: itemId });
    expect(variants).toHaveLength(0);
  });

  it('rejects an empty / too-long name', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId } = await setup(t);
    await expect(
      asOwner.mutation(api.menu.variants.create, { menuItemId: itemId, name: '  ', priceIDR: 16000 })
    ).rejects.toThrow(/nama/i);
    await expect(
      asOwner.mutation(api.menu.variants.create, {
        menuItemId: itemId,
        name: 'x'.repeat(25),
        priceIDR: 16000,
      })
    ).rejects.toThrow(/nama/i);
  });

  it('rejects a fractional / negative price', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId } = await setup(t);
    await expect(
      asOwner.mutation(api.menu.variants.create, { menuItemId: itemId, name: 'S', priceIDR: 1.5 })
    ).rejects.toThrow(/bulat|rupiah/i);
    await expect(
      asOwner.mutation(api.menu.variants.create, { menuItemId: itemId, name: 'S', priceIDR: -1 })
    ).rejects.toThrow(/negatif/i);
  });

  it('rejects creating a variant on an item from another cafe', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, { email: 'a@x.com' });
    const b = await setup(t, { email: 'b@x.com' });
    await expect(
      b.asOwner.mutation(api.menu.variants.create, {
        menuItemId: a.itemId,
        name: 'S',
        priceIDR: 16000,
      })
    ).rejects.toThrow(/tidak ditemukan/i);
  });

  it('rejects updating / archiving a variant owned by another cafe', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, { email: 'a@x.com' });
    const b = await setup(t, { email: 'b@x.com' });
    const aVariant = await a.asOwner.mutation(api.menu.variants.create, {
      menuItemId: a.itemId,
      name: 'S',
      priceIDR: 16000,
    });
    await expect(
      b.asOwner.mutation(api.menu.variants.update, { id: aVariant, name: 'X', priceIDR: 1000 })
    ).rejects.toThrow(/tidak ditemukan/i);
    await expect(
      b.asOwner.mutation(api.menu.variants.archive, { id: aVariant })
    ).rejects.toThrow(/tidak ditemukan/i);
  });
});

describe('read paths expose active variants', () => {
  it('listForSale returns an item active variants in position order', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId } = await setup(t);
    await asOwner.mutation(api.menu.variants.create, { menuItemId: itemId, name: 'S', priceIDR: 16000 });
    const mId = await asOwner.mutation(api.menu.variants.create, { menuItemId: itemId, name: 'M', priceIDR: 20000 });
    await asOwner.mutation(api.menu.variants.archive, { id: mId });
    await asOwner.mutation(api.menu.variants.create, { menuItemId: itemId, name: 'L', priceIDR: 24000 });

    const rows = await asOwner.query(api.menu.items.listForSale, {});
    const row = rows.find((r) => r.item._id === itemId);
    expect(row?.variants.map((v) => v.name)).toEqual(['S', 'L']);
    expect(row?.variants.map((v) => v.priceIDR)).toEqual([16000, 24000]);
  });

  it('getById returns the item active variants', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemId } = await setup(t);
    await asOwner.mutation(api.menu.variants.create, { menuItemId: itemId, name: 'S', priceIDR: 16000 });
    await asOwner.mutation(api.menu.variants.create, { menuItemId: itemId, name: 'L', priceIDR: 24000 });
    const detail = await asOwner.query(api.menu.items.getById, { id: itemId });
    expect(detail?.variants.map((v) => v.name)).toEqual(['S', 'L']);
  });
});

describe('buildOrder variant pricing', () => {
  it('prices a line at the variant priceIDR and stores variantId/variantName', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const variantId = await asOwner.mutation(api.menu.variants.create, {
      menuItemId: itemId,
      name: 'L',
      priceIDR: 24000,
    });
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'var-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 2, modifierOptionIds: [], variantId }],
      cashTenderedIDR: 50000,
      createdAtClient: 1700000000000,
    });
    // 2 * 24000 = 48000 (variant price, NOT item.priceIDR 18000)
    expect(result.totalIDR).toBe(48000);
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.lines?.[0]?.unitPriceIDR).toBe(24000);
    expect(order?.lines?.[0]?.lineTotalIDR).toBe(48000);
    expect(order?.lines?.[0]?.variantId).toBe(variantId);
    expect(order?.lines?.[0]?.variantName).toBe('L');
    expect(order?.lines?.[0]?.nameSnapshot).toBe('Latte');
  });

  it('adds modifier adjustments on top of the variant base price', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const variantId = await asOwner.mutation(api.menu.variants.create, {
      menuItemId: itemId,
      name: 'L',
      priceIDR: 24000,
    });
    const groupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Susu',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [{ name: 'Oat (+5k)', priceAdjustmentIDR: 5000, position: 0 }],
    });
    await asOwner.mutation(api.menu.itemGroups.attach, {
      menuItemId: itemId,
      modifierGroupId: groupId,
    });
    const group = await asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
    const oat = group!.options[0]!;

    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'var-mod-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [oat._id], variantId }],
      cashTenderedIDR: 50000,
      createdAtClient: 1700000000000,
    });
    // 24000 + 5000 = 29000
    expect(result.totalIDR).toBe(29000);
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.lines?.[0]?.unitPriceIDR).toBe(29000);
    expect(order?.lines?.[0]?.variantName).toBe('L');
  });

  it('a line without variantId uses item.priceIDR and stores no variant fields', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    // even with variants present on the item
    await asOwner.mutation(api.menu.variants.create, { menuItemId: itemId, name: 'L', priceIDR: 24000 });
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'novar-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    expect(result.totalIDR).toBe(18000);
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.lines?.[0]?.unitPriceIDR).toBe(18000);
    expect(order?.lines?.[0]?.variantId).toBeUndefined();
    expect(order?.lines?.[0]?.variantName).toBeUndefined();
  });

  it('rejects a variantId belonging to another item', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, categoryId } = await setup(t);
    const otherItem = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Americano',
      priceIDR: 20000,
    });
    const otherVariant = await asOwner.mutation(api.menu.variants.create, {
      menuItemId: otherItem,
      name: 'L',
      priceIDR: 25000,
    });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'var-foreign-item',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [], variantId: otherVariant }],
        cashTenderedIDR: 50000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/varian tidak tersedia/i);
  });

  it('rejects a variantId from another cafe', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, { email: 'a@x.com' });
    const b = await setup(t, { email: 'b@x.com' });
    const aVariant = await a.asOwner.mutation(api.menu.variants.create, {
      menuItemId: a.itemId,
      name: 'L',
      priceIDR: 24000,
    });
    await expect(
      b.asOwner.mutation(api.orders.createCashSale, {
        clientId: 'var-foreign-cafe',
        shiftId: b.shiftId,
        cashierId: b.cashierId,
        lines: [{ menuItemId: b.itemId, qty: 1, modifierOptionIds: [], variantId: aVariant }],
        cashTenderedIDR: 50000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/varian tidak tersedia/i);
  });

  it('rejects an archived variantId', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const variantId = await asOwner.mutation(api.menu.variants.create, {
      menuItemId: itemId,
      name: 'L',
      priceIDR: 24000,
    });
    await asOwner.mutation(api.menu.variants.archive, { id: variantId });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'var-archived',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [], variantId }],
        cashTenderedIDR: 50000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/varian tidak tersedia/i);
  });
});
