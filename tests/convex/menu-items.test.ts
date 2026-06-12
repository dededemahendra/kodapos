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

describe('menu item soldOut flag', () => {
  it('setSoldOut(true) is carried by getById + listForSale; setSoldOut(false) clears it', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setup(t);
    const id = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Latte',
      priceIDR: 25000,
    });

    // Fresh item has no soldOut flag.
    const fresh = await asOwner.query(api.menu.items.getById, { id });
    expect(fresh?.item.soldOut).toBeUndefined();

    await asOwner.mutation(api.menu.items.setSoldOut, { id, soldOut: true });

    const detail = await asOwner.query(api.menu.items.getById, { id });
    expect(detail?.item.soldOut).toBe(true);

    const rows = await asOwner.query(api.menu.items.listForSale, {});
    const row = rows.find((r) => r.item._id === id);
    // listForSale STILL returns the sold-out item (not filtered) with the flag.
    expect(row).toBeTruthy();
    expect(row?.item.soldOut).toBe(true);

    await asOwner.mutation(api.menu.items.setSoldOut, { id, soldOut: false });
    const after = await asOwner.query(api.menu.items.getById, { id });
    expect(after?.item.soldOut).toBe(false);
  });

  it('setSoldOut on a foreign item throws (owner-scope)', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'owner-a@test.com');
    const aItem = await a.asOwner.mutation(api.menu.items.create, {
      categoryId: a.categoryId,
      name: 'Latte',
      priceIDR: 25000,
    });
    const b = await setup(t, 'owner-b@test.com');
    await expect(
      b.asOwner.mutation(api.menu.items.setSoldOut, { id: aItem, soldOut: true })
    ).rejects.toThrow();
  });

  it('ordering a sold-out item via createCashSale is rejected and inserts nothing', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setup(t);
    const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
    const shiftId = await asOwner.mutation(api.shifts.open, {
      cashierId,
      openingFloatIDR: 100000,
    });
    const itemId = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Espresso',
      priceIDR: 18000,
    });
    await asOwner.mutation(api.menu.items.setSoldOut, { id: itemId, soldOut: true });

    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'soldout-1',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
      })
    ).rejects.toThrow(/tidak tersedia/i);

    const orders = await t.run((ctx) => ctx.db.query('orders').collect());
    expect(orders).toHaveLength(0);
    const payments = await t.run((ctx) => ctx.db.query('payments').collect());
    expect(payments).toHaveLength(0);
  });
});

describe('menu item assign barcode', () => {
  it('assignBarcode generates a unique 12-digit code carried by getById/listForSale', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setup(t);
    const idA = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Latte',
      priceIDR: 25000,
    });
    const idB = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Americano',
      priceIDR: 20000,
    });
    const codeA = await asOwner.mutation(api.menu.items.assignBarcode, { id: idA });
    const codeB = await asOwner.mutation(api.menu.items.assignBarcode, { id: idB });
    expect(codeA).toMatch(/^\d{12}$/);
    expect(codeB).toMatch(/^\d{12}$/);
    expect(codeA).not.toBe(codeB);

    const detail = await asOwner.query(api.menu.items.getById, { id: idA });
    expect(detail?.item.barcode).toBe(codeA);

    const rows = await asOwner.query(api.menu.items.listForSale, {});
    const row = rows.find((r) => r.item._id === idA);
    expect(row?.item.barcode).toBe(codeA);
  });

  it('assignBarcode throws when the item already has a barcode', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setup(t);
    const id = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Latte',
      priceIDR: 25000,
      barcode: '8991234567890',
    });
    await expect(
      asOwner.mutation(api.menu.items.assignBarcode, { id })
    ).rejects.toThrow(/sudah punya/i);
  });

  it('assignMissingBarcodes assigns only to sellable items lacking one', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setup(t);
    // One already has a barcode.
    const withCode = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Latte',
      priceIDR: 25000,
      barcode: '8991234567890',
    });
    // Two are missing a barcode.
    const missing1 = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Americano',
      priceIDR: 20000,
    });
    const missing2 = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Cappuccino',
      priceIDR: 28000,
    });

    // Count the sellable items missing a barcode up front.
    const before = await asOwner.query(api.menu.items.listForSale, {});
    const missingCount = before.filter((r) => !r.item.barcode).length;
    expect(missingCount).toBe(2);

    const res = await asOwner.mutation(api.menu.items.assignMissingBarcodes, {});
    expect(res.assigned).toBe(missingCount);

    // The pre-barcoded item is untouched.
    const keep = await asOwner.query(api.menu.items.getById, { id: withCode });
    expect(keep?.item.barcode).toBe('8991234567890');

    // The previously-missing items now carry a fresh 12-digit code.
    const d1 = await asOwner.query(api.menu.items.getById, { id: missing1 });
    const d2 = await asOwner.query(api.menu.items.getById, { id: missing2 });
    expect(d1?.item.barcode).toMatch(/^\d{12}$/);
    expect(d2?.item.barcode).toMatch(/^\d{12}$/);
    expect(d1?.item.barcode).not.toBe(d2?.item.barcode);

    // Nothing is left missing; a second pass assigns zero.
    const after = await asOwner.query(api.menu.items.listForSale, {});
    expect(after.filter((r) => !r.item.barcode).length).toBe(0);
    const second = await asOwner.mutation(api.menu.items.assignMissingBarcodes, {});
    expect(second.assigned).toBe(0);
  });

  it('assignMissingBarcodes is cafe-scoped and does not touch another cafe', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'owner-a@test.com');
    const aItem = await a.asOwner.mutation(api.menu.items.create, {
      categoryId: a.categoryId,
      name: 'Latte',
      priceIDR: 25000,
    });
    const b = await setup(t, 'owner-b@test.com');
    const bItem = await b.asOwner.mutation(api.menu.items.create, {
      categoryId: b.categoryId,
      name: 'Latte',
      priceIDR: 25000,
    });

    // Cafe A assigns; cafe B's item must remain untouched.
    const res = await a.asOwner.mutation(api.menu.items.assignMissingBarcodes, {});
    expect(res.assigned).toBe(1);
    const bDetail = await b.asOwner.query(api.menu.items.getById, { id: bItem });
    expect(bDetail?.item.barcode).toBeUndefined();

    // Both cafes can hold their own (independent) codes; assign B too.
    await b.asOwner.mutation(api.menu.items.assignMissingBarcodes, {});
    const aDetail = await a.asOwner.query(api.menu.items.getById, { id: aItem });
    const bDetail2 = await b.asOwner.query(api.menu.items.getById, { id: bItem });
    expect(aDetail?.item.barcode).toMatch(/^\d{12}$/);
    expect(bDetail2?.item.barcode).toMatch(/^\d{12}$/);
  });
});
