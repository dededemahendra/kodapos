import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) =>
    ctx.db.insert('users', { name: 'Owner', email })
  );
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

describe('promotions CRUD', () => {
  it('creates + lists (non-archived by default)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.promotions.create, { name: 'Diskon Kopi', type: 'percent', value: 20 });
    await asOwner.mutation(api.promotions.create, { name: 'Promo Lebaran', type: 'fixed', value: 10000 });
    const list = await asOwner.query(api.promotions.list, {});
    expect(list).toHaveLength(2);
    // Sorted by name (id-ID): "Diskon Kopi" before "Promo Lebaran".
    expect(list[0]?.name).toBe('Diskon Kopi');
    expect(list[0]?.type).toBe('percent');
    expect(list[0]?.value).toBe(20);
    expect(list[1]?.type).toBe('fixed');
    expect(list[1]?.value).toBe(10000);
  });

  it('update changes fields; archive hides from default list', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.promotions.create, { name: 'X', type: 'percent', value: 10 });
    await asOwner.mutation(api.promotions.update, { id, name: 'X2', type: 'fixed', value: 5000 });
    let list = await asOwner.query(api.promotions.list, {});
    expect(list[0]?.name).toBe('X2');
    expect(list[0]?.type).toBe('fixed');
    expect(list[0]?.value).toBe(5000);
    await asOwner.mutation(api.promotions.archive, { id });
    expect(await asOwner.query(api.promotions.list, {})).toHaveLength(0);
    expect(await asOwner.query(api.promotions.list, { includeArchived: true })).toHaveLength(1);
  });

  it('validates name + value', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.promotions.create, { name: '  ', type: 'percent', value: 10 })
    ).rejects.toThrow(/nama/i);
    await expect(
      asOwner.mutation(api.promotions.create, { name: 'P', type: 'percent', value: 0 })
    ).rejects.toThrow(/1.*100|persentase/i);
    await expect(
      asOwner.mutation(api.promotions.create, { name: 'P', type: 'percent', value: 150 })
    ).rejects.toThrow(/1.*100|persentase/i);
    await expect(
      asOwner.mutation(api.promotions.create, { name: 'P', type: 'fixed', value: 0 })
    ).rejects.toThrow(/nominal|≥ 1/i);
    await expect(
      asOwner.mutation(api.promotions.create, { name: 'P', type: 'percent', value: 10.5 })
    ).rejects.toThrow(/1.*100|persentase/i);
    await expect(
      asOwner.mutation(api.promotions.create, { name: 'P', type: 'fixed', value: 1.5 })
    ).rejects.toThrow(/nominal|≥ 1/i);
  });

  it('tenant isolation: cafe B cannot list or archive cafe A promos', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const aId = await ownerA.mutation(api.promotions.create, { name: 'A', type: 'percent', value: 10 });
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    expect(await ownerB.query(api.promotions.list, { includeArchived: true })).toHaveLength(0);
    await expect(ownerB.mutation(api.promotions.archive, { id: aId })).rejects.toThrow();
  });
});

describe('promotions: coupon codes', () => {
  it('stores the code UPPERCASE', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.promotions.create, {
      name: 'Summer', type: 'percent', value: 20, code: 'summer20',
    });
    const list = await asOwner.query(api.promotions.list, {});
    expect(list[0]?.code).toBe('SUMMER20');
  });

  it('rejects a 2nd promo with the same code (case-insensitive) in the same cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.promotions.create, {
      name: 'First', type: 'percent', value: 20, code: 'summer20',
    });
    await expect(
      asOwner.mutation(api.promotions.create, {
        name: 'Second', type: 'percent', value: 10, code: 'SUMMER20',
      })
    ).rejects.toThrow(/kode/i);
    await expect(
      asOwner.mutation(api.promotions.create, {
        name: 'Third', type: 'percent', value: 10, code: 'Summer20',
      })
    ).rejects.toThrow(/kode/i);
  });

  it('allows the same code in a different cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    await ownerA.mutation(api.promotions.create, {
      name: 'A', type: 'percent', value: 20, code: 'summer20',
    });
    await ownerB.mutation(api.promotions.create, {
      name: 'B', type: 'percent', value: 20, code: 'summer20',
    });
    expect((await ownerB.query(api.promotions.list, {}))[0]?.code).toBe('SUMMER20');
  });

  it('rejects an invalid code', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.promotions.create, { name: 'P', type: 'percent', value: 10, code: 'ab' })
    ).rejects.toThrow(/kode/i);
    await expect(
      asOwner.mutation(api.promotions.create, { name: 'P', type: 'percent', value: 10, code: 'has space' })
    ).rejects.toThrow(/kode/i);
  });

  it('update can change the code; rejects a duplicate but allows keeping its own', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id1 = await asOwner.mutation(api.promotions.create, {
      name: 'P1', type: 'percent', value: 20, code: 'CODE1',
    });
    await asOwner.mutation(api.promotions.create, {
      name: 'P2', type: 'percent', value: 20, code: 'CODE2',
    });
    // keeping its own code is fine (excludes self)
    await asOwner.mutation(api.promotions.update, {
      id: id1, name: 'P1', type: 'percent', value: 20, code: 'code1',
    });
    // taking P2's code is rejected
    await expect(
      asOwner.mutation(api.promotions.update, {
        id: id1, name: 'P1', type: 'percent', value: 20, code: 'CODE2',
      })
    ).rejects.toThrow(/kode/i);
  });
});

async function setupMenu(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const { asOwner } = await setupOwner(t, email);
  const catX = await asOwner.mutation(api.menu.categories.create, { name: 'CatX' });
  const itemA = await asOwner.mutation(api.menu.items.create, {
    categoryId: catX, name: 'A', priceIDR: 18000,
  });
  return { asOwner, catX, itemA };
}

describe('promotions: scope validation', () => {
  it('rejects scope:item with empty targetItemIds', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupMenu(t);
    await expect(
      asOwner.mutation(api.promotions.create, {
        name: 'P', type: 'percent', value: 10, scope: 'item', targetItemIds: [],
      })
    ).rejects.toThrow(/target|pilih/i);
  });

  it('rejects scope:item with a foreign item id', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupMenu(t, 'a@x.com');
    const { itemA: foreignItem } = await setupMenu(t, 'b@x.com');
    await expect(
      asOwner.mutation(api.promotions.create, {
        name: 'P', type: 'percent', value: 10, scope: 'item', targetItemIds: [foreignItem],
      })
    ).rejects.toThrow();
  });

  it('stores valid item targets', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemA } = await setupMenu(t);
    await asOwner.mutation(api.promotions.create, {
      name: 'P', type: 'percent', value: 10, scope: 'item', targetItemIds: [itemA],
    });
    const list = await asOwner.query(api.promotions.list, {});
    expect(list[0]?.scope).toBe('item');
    expect(list[0]?.targetItemIds).toEqual([itemA]);
  });

  it('rejects scope:category with empty + foreign targets, stores valid', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, catX } = await setupMenu(t, 'a@x.com');
    const { catX: foreignCat } = await setupMenu(t, 'b@x.com');
    await expect(
      asOwner.mutation(api.promotions.create, {
        name: 'P', type: 'percent', value: 10, scope: 'category', targetCategoryIds: [],
      })
    ).rejects.toThrow(/target|pilih/i);
    await expect(
      asOwner.mutation(api.promotions.create, {
        name: 'P', type: 'percent', value: 10, scope: 'category', targetCategoryIds: [foreignCat],
      })
    ).rejects.toThrow();
    await asOwner.mutation(api.promotions.create, {
      name: 'P', type: 'percent', value: 10, scope: 'category', targetCategoryIds: [catX],
    });
    const list = await asOwner.query(api.promotions.list, {});
    expect(list[0]?.scope).toBe('category');
    expect(list[0]?.targetCategoryIds).toEqual([catX]);
  });

  it('update with scope:order clears targets', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemA } = await setupMenu(t);
    const id = await asOwner.mutation(api.promotions.create, {
      name: 'P', type: 'percent', value: 10, scope: 'item', targetItemIds: [itemA],
    });
    await asOwner.mutation(api.promotions.update, {
      id, name: 'P', type: 'percent', value: 10, scope: 'order',
    });
    const list = await asOwner.query(api.promotions.list, {});
    expect(list[0]?.scope).toBe('order');
    expect(list[0]?.targetItemIds ?? []).toEqual([]);
  });
});

describe('promotions.resolveByCode', () => {
  it('resolves the active promo case-insensitively with scope/targets', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, itemA } = await setupMenu(t);
    await asOwner.mutation(api.promotions.create, {
      name: 'Summer', type: 'percent', value: 20, code: 'summer20',
      scope: 'item', targetItemIds: [itemA],
    });
    const promo = await asOwner.query(api.promotions.resolveByCode, { code: 'summer20' });
    expect(promo?.code).toBe('SUMMER20');
    expect(promo?.scope).toBe('item');
    expect(promo?.targetItemIds).toEqual([itemA]);
    // case-insensitive
    expect(await asOwner.query(api.promotions.resolveByCode, { code: 'SuMmEr20' })).not.toBeNull();
  });

  it('returns null for an unknown code', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    expect(await asOwner.query(api.promotions.resolveByCode, { code: 'nope' })).toBeNull();
  });

  it('returns null for an archived promo', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.promotions.create, {
      name: 'Old', type: 'percent', value: 20, code: 'old20',
    });
    await asOwner.mutation(api.promotions.archive, { id });
    expect(await asOwner.query(api.promotions.resolveByCode, { code: 'old20' })).toBeNull();
  });

  it('is cafe-scoped: cafe B cannot resolve cafe A code', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    await ownerA.mutation(api.promotions.create, {
      name: 'A', type: 'percent', value: 20, code: 'shared',
    });
    expect(await ownerB.query(api.promotions.resolveByCode, { code: 'shared' })).toBeNull();
  });
});
