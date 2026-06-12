import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

type Setup = {
  t: ReturnType<typeof convexTest>;
  cafeId: Id<'cafes'>;
  tableId: Id<'tables'>;
  qrToken: string;
  categoryId: Id<'categories'>;
  itemId: Id<'menuItems'>;
  variantSId: Id<'menuItemVariants'>;
  variantLId: Id<'menuItemVariants'>;
  groupId: Id<'modifierGroups'>;
  oatId: Id<'modifierOptions'>;
  regularId: Id<'modifierOptions'>;
};

const QR_TOKEN = 'a'.repeat(32);

/** Owner + cafe + a table (with a qrToken patched in) + a sellable item with a
 * variant + a min/max modifier group. The PUBLIC functions are then called on
 * the bare `t` (no identity). */
async function setup(
  t: ReturnType<typeof convexTest>,
  opts: { email?: string; qrToken?: string } = {}
): Promise<Setup> {
  const email = opts.email ?? 'o@x.com';
  const qrToken = opts.qrToken ?? QR_TOKEN;
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

  const tableId = await asOwner.mutation(api.tables.create, { name: 'A1' });
  await t.run(async (ctx) => {
    await ctx.db.patch(tableId, { qrToken });
  });

  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });

  const variantSId = await asOwner.mutation(api.menu.variants.create, {
    menuItemId: itemId,
    name: 'S',
    priceIDR: 15000,
  });
  const variantLId = await asOwner.mutation(api.menu.variants.create, {
    menuItemId: itemId,
    name: 'L',
    priceIDR: 25000,
  });

  const groupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
    name: 'Susu',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options: [
      { name: 'Reguler', priceAdjustmentIDR: 0, position: 0 },
      { name: 'Oat (+5k)', priceAdjustmentIDR: 5000, position: 1 },
    ],
  });
  await asOwner.mutation(api.menu.itemGroups.attach, {
    menuItemId: itemId,
    modifierGroupId: groupId,
  });
  const group = await asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
  const oatId = group!.options.find((o) => o.name === 'Oat (+5k)')!._id;
  const regularId = group!.options.find((o) => o.name === 'Reguler')!._id;

  return {
    t,
    cafeId,
    tableId,
    qrToken,
    categoryId,
    itemId,
    variantSId,
    variantLId,
    groupId,
    oatId,
    regularId,
  };
}

describe('public.menuForTable', () => {
  it('returns cafe/table/categories/items/pricing for a valid token', async () => {
    const t = convexTest(schema, modules);
    const { itemId, categoryId } = await setup(t);

    // NO identity — this is the public surface.
    const menu = await t.query(api.public.menuForTable, { qrToken: QR_TOKEN });
    expect(menu).not.toBeNull();
    expect(menu!.cafe.name).toBe('Kopi Senja');
    expect(menu!.table.name).toBe('A1');
    expect(menu!.categories.map((c) => c.id)).toContain(categoryId);

    const item = menu!.items.find((i) => i.id === itemId)!;
    expect(item).toBeTruthy();
    expect(item.priceIDR).toBe(18000);
    expect(item.variants.map((vr) => vr.name).sort()).toEqual(['L', 'S']);
    expect(item.modifierGroups).toHaveLength(1);
    expect(item.modifierGroups[0]!.options.map((o) => o.name).sort()).toEqual([
      'Oat (+5k)',
      'Reguler',
    ]);

    expect(menu!.pricing).toMatchObject({
      taxEnabled: false,
      serviceChargeEnabled: false,
    });
  });

  it('returns null for an invalid/unknown token (no info leak)', async () => {
    const t = convexTest(schema, modules);
    await setup(t);
    const menu = await t.query(api.public.menuForTable, { qrToken: 'b'.repeat(32) });
    expect(menu).toBeNull();
  });

  it('excludes archived and inactive items', async () => {
    const t = convexTest(schema, modules);
    const { t: tt, categoryId, itemId } = await setup(t);

    const userId2 = await tt.run(async (ctx) =>
      ctx.db.query('users').first().then((u) => u!._id)
    );
    const asOwner = tt.withIdentity({ subject: `${userId2}|test_session` });

    const inactiveId = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Inactive',
      priceIDR: 5000,
    });
    await asOwner.mutation(api.menu.items.setActive, { id: inactiveId, isActive: false });

    const archivedId = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Archived',
      priceIDR: 6000,
    });
    await asOwner.mutation(api.menu.items.archive, { id: archivedId });

    const menu = await t.query(api.public.menuForTable, { qrToken: QR_TOKEN });
    const ids = menu!.items.map((i) => i.id);
    expect(ids).toContain(itemId);
    expect(ids).not.toContain(inactiveId);
    expect(ids).not.toContain(archivedId);
  });

  it('exposes NO owner/cost/stock/recipe fields anywhere', async () => {
    const t = convexTest(schema, modules);
    await setup(t);
    const menu = await t.query(api.public.menuForTable, { qrToken: QR_TOKEN });
    const blob = JSON.stringify(menu);
    expect(blob).not.toMatch(/lowStockIngredientNames/i);
    expect(blob).not.toMatch(/recipe/i);
    expect(blob).not.toMatch(/cost/i);
    expect(blob).not.toMatch(/hasRecipe/i);
    // owner/internal-only fields that must not leak through the for-sale shape
    for (const item of menu!.items) {
      expect(item).not.toHaveProperty('cafeId');
      expect(item).not.toHaveProperty('isActive');
      expect(item).not.toHaveProperty('archived');
      expect(item).not.toHaveProperty('lowStockIngredientNames');
    }
  });
});

describe('public.submitSelfOrder', () => {
  it('inserts status:new with SERVER-computed unitPriceIDR + subtotalIDR', async () => {
    const t = convexTest(schema, modules);
    const { itemId, variantLId, oatId, regularId } = await setup(t);

    const { selfOrderId } = await t.mutation(api.public.submitSelfOrder, {
      qrToken: QR_TOKEN,
      clientId: 'client-1',
      lines: [
        // variant L (25000) + Oat (+5000) → 30000, qty 2 → 60000
        { menuItemId: itemId, qty: 2, variantId: variantLId, modifierOptionIds: [oatId] },
        // base 18000 + Reguler (0) → 18000, qty 1 → 18000
        { menuItemId: itemId, qty: 1, modifierOptionIds: [regularId] },
      ],
    });

    const row = await t.run(async (ctx) => await ctx.db.get(selfOrderId));
    expect(row).toBeTruthy();
    expect(row!.status).toBe('new');
    expect(row!.tableName).toBe('A1');
    expect(row!.lines).toHaveLength(2);

    // Line 0: variant L price (25000) + Oat adjustment (5000) = 30000.
    expect(row!.lines[0]!.unitPriceIDR).toBe(30000);
    expect(row!.lines[0]!.variantName).toBe('L');
    expect(row!.lines[0]!.nameSnapshot).toBe('Espresso');
    expect(row!.lines[0]!.modifierLabels).toContain('Oat (+5k)');
    // Line 1: base 18000 + Reguler (0) = 18000.
    expect(row!.lines[1]!.unitPriceIDR).toBe(18000);

    // subtotal = 2*30000 + 1*18000 = 78000 (server-summed).
    expect(row!.subtotalIDR).toBe(78000);
  });

  it('the line arg validator forbids a client-sent price field', async () => {
    const t = convexTest(schema, modules);
    const { itemId, regularId } = await setup(t);

    // The line validator accepts ONLY ids + qty — passing a `unitPriceIDR`-shaped
    // field is rejected at the validator boundary, so a client can never inject a
    // price. (The happy-path test above proves the server then recomputes it.)
    await expect(
      t.mutation(api.public.submitSelfOrder, {
        qrToken: QR_TOKEN,
        clientId: 'client-price',
        // @ts-expect-error — unitPriceIDR is NOT part of the line arg validator.
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [regularId], unitPriceIDR: 1 }],
      })
    ).rejects.toThrow(/Unexpected field `unitPriceIDR`/);
  });

  it('rejects an invalid token', async () => {
    const t = convexTest(schema, modules);
    const { itemId, regularId } = await setup(t);
    await expect(
      t.mutation(api.public.submitSelfOrder, {
        qrToken: 'z'.repeat(32),
        clientId: 'client-bad',
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [regularId] }],
      })
    ).rejects.toThrow(/QR/i);
  });

  it('rejects empty lines', async () => {
    const t = convexTest(schema, modules);
    await setup(t);
    await expect(
      t.mutation(api.public.submitSelfOrder, {
        qrToken: QR_TOKEN,
        clientId: 'client-empty',
        lines: [],
      })
    ).rejects.toThrow();
  });

  it('rejects qty 0, qty 100, and non-integer qty', async () => {
    const t = convexTest(schema, modules);
    const { itemId, regularId } = await setup(t);
    for (const qty of [0, 100, 1.5]) {
      await expect(
        t.mutation(api.public.submitSelfOrder, {
          qrToken: QR_TOKEN,
          clientId: `client-qty-${qty}`,
          lines: [{ menuItemId: itemId, qty, modifierOptionIds: [regularId] }],
        })
      ).rejects.toThrow();
    }
  });

  it('rejects a variantId not belonging to the item', async () => {
    const t = convexTest(schema, modules);
    const { t: tt, itemId, categoryId, regularId } = await setup(t);
    const userId2 = await tt.run(async (ctx) =>
      ctx.db.query('users').first().then((u) => u!._id)
    );
    const asOwner = tt.withIdentity({ subject: `${userId2}|test_session` });
    const otherItemId = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Other',
      priceIDR: 9000,
    });
    const otherVariantId = await asOwner.mutation(api.menu.variants.create, {
      menuItemId: otherItemId,
      name: 'M',
      priceIDR: 12000,
    });
    await expect(
      t.mutation(api.public.submitSelfOrder, {
        qrToken: QR_TOKEN,
        clientId: 'client-badvariant',
        lines: [
          { menuItemId: itemId, qty: 1, variantId: otherVariantId, modifierOptionIds: [regularId] },
        ],
      })
    ).rejects.toThrow();
  });

  it('rejects a modifierOptionId not on the item', async () => {
    const t = convexTest(schema, modules);
    const { t: tt, itemId } = await setup(t);
    const userId2 = await tt.run(async (ctx) =>
      ctx.db.query('users').first().then((u) => u!._id)
    );
    const asOwner = tt.withIdentity({ subject: `${userId2}|test_session` });
    const detachedGroupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Loose',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'Extra', priceAdjustmentIDR: 3000, position: 0 }],
    });
    const looseGroup = await asOwner.query(api.menu.modifierGroups.getById, {
      id: detachedGroupId,
    });
    const looseOptId = looseGroup!.options[0]!._id;
    await expect(
      t.mutation(api.public.submitSelfOrder, {
        qrToken: QR_TOKEN,
        clientId: 'client-badmod',
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [looseOptId] }],
      })
    ).rejects.toThrow();
  });

  it('rejects an item from another cafe', async () => {
    const t = convexTest(schema, modules);
    await setup(t);
    // A second cafe with its own item.
    const other = await setup(t, { email: 'o2@x.com', qrToken: 'c'.repeat(32) });
    await expect(
      t.mutation(api.public.submitSelfOrder, {
        qrToken: QR_TOKEN, // cafe #1's token
        clientId: 'client-crosscafe',
        lines: [{ menuItemId: other.itemId, qty: 1, modifierOptionIds: [] }],
      })
    ).rejects.toThrow();
  });

  it('is idempotent on clientId (second call → same id, one row)', async () => {
    const t = convexTest(schema, modules);
    const { itemId, regularId, cafeId } = await setup(t);
    const args = {
      qrToken: QR_TOKEN,
      clientId: 'client-idem',
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [regularId] }],
    };
    const first = await t.mutation(api.public.submitSelfOrder, args);
    const second = await t.mutation(api.public.submitSelfOrder, args);
    expect(second.selfOrderId).toBe(first.selfOrderId);

    const count = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query('selfOrders')
        .withIndex('by_cafe_clientId', (q) =>
          q.eq('cafeId', cafeId).eq('clientId', 'client-idem')
        )
        .collect();
      return rows.length;
    });
    expect(count).toBe(1);
  });

  it('enforces the pending cap: 8 new orders OK, the 9th throws', async () => {
    const t = convexTest(schema, modules);
    const { itemId, regularId } = await setup(t);
    for (let i = 0; i < 8; i++) {
      await t.mutation(api.public.submitSelfOrder, {
        qrToken: QR_TOKEN,
        clientId: `cap-${i}`,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [regularId] }],
      });
    }
    await expect(
      t.mutation(api.public.submitSelfOrder, {
        qrToken: QR_TOKEN,
        clientId: 'cap-9',
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [regularId] }],
      })
    ).rejects.toThrow(/terlalu banyak/i);
  });
});

describe('public.selfOrderStatus', () => {
  it('returns only { status }', async () => {
    const t = convexTest(schema, modules);
    const { itemId, regularId } = await setup(t);
    const { selfOrderId } = await t.mutation(api.public.submitSelfOrder, {
      qrToken: QR_TOKEN,
      clientId: 'client-status',
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [regularId] }],
    });
    const status = await t.query(api.public.selfOrderStatus, { selfOrderId });
    expect(status).toEqual({ status: 'new' });
  });
});
