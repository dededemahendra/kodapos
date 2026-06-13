import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'owner@test.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Test' });
  return { asOwner };
}

describe('menu.items.bulkImport', () => {
  it('creates an item and its category', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const res = await asOwner.mutation(api.menu.items.bulkImport, {
      rows: [{ name: 'Kopi', category: 'Minuman', priceIDR: 18000 }],
    });
    expect(res).toEqual({ created: 1, skipped: 0, errors: [] });

    const cats = await asOwner.query(api.menu.categories.list, {});
    expect(cats.some((c) => c.name === 'Minuman')).toBe(true);

    const items = await asOwner.query(api.menu.items.list, {});
    const kopi = items.find((i) => i.name === 'Kopi');
    expect(kopi).toBeTruthy();
    expect(kopi?.priceIDR).toBe(18000);
  });

  it('creates a shared new category only once across two rows', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const res = await asOwner.mutation(api.menu.items.bulkImport, {
      rows: [
        { name: 'Kopi', category: 'Minuman', priceIDR: 18000 },
        { name: 'Teh', category: 'minuman', priceIDR: 12000 },
      ],
    });
    expect(res.created).toBe(2);

    const cats = await asOwner.query(api.menu.categories.list, {});
    expect(cats.filter((c) => c.name.toLowerCase() === 'minuman')).toHaveLength(1);
  });

  it('skips an item whose name already exists (case-insensitive)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.menu.items.bulkImport, {
      rows: [{ name: 'Kopi', category: 'Minuman', priceIDR: 18000 }],
    });
    const res = await asOwner.mutation(api.menu.items.bulkImport, {
      rows: [{ name: 'kopi', category: 'Minuman', priceIDR: 20000 }],
    });
    expect(res.created).toBe(0);
    expect(res.skipped).toBe(1);
    expect(res.errors).toHaveLength(0);
  });

  it('reports a bad price or empty name as an error, not created', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const res = await asOwner.mutation(api.menu.items.bulkImport, {
      rows: [
        { name: 'Gratis', category: 'Minuman', priceIDR: 0 },
        { name: '', category: 'Minuman', priceIDR: 5000 },
        { name: 'Kopi', category: 'Minuman', priceIDR: 18000 },
      ],
    });
    expect(res.created).toBe(1);
    expect(res.errors).toHaveLength(2);
    expect(res.errors[0]).toMatchObject({ row: 0, name: 'Gratis' });
    expect(res.errors[1]).toMatchObject({ row: 1, name: '' });
    expect(typeof res.errors[0]?.reason).toBe('string');

    const items = await asOwner.query(api.menu.items.list, {});
    expect(items.some((i) => i.name === 'Gratis')).toBe(false);
  });

  it('reports a duplicate barcode as an error', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const catId = await asOwner.mutation(api.menu.categories.create, { name: 'Minuman' });
    await asOwner.mutation(api.menu.items.create, {
      categoryId: catId,
      name: 'Latte',
      priceIDR: 25000,
      barcode: '8991234567890',
    });
    const res = await asOwner.mutation(api.menu.items.bulkImport, {
      rows: [{ name: 'Kopi', category: 'Minuman', priceIDR: 18000, barcode: '8991234567890' }],
    });
    expect(res.created).toBe(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]?.reason).toMatch(/barcode/i);
  });

  it('rejects another cafe attempting to import into its own scope only', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: a } = await setupOwner(t, 'a@test.com');
    const { asOwner: b } = await setupOwner(t, 'b@test.com');
    await a.mutation(api.menu.items.bulkImport, {
      rows: [{ name: 'Kopi', category: 'Minuman', priceIDR: 18000 }],
    });
    // B does not see A's item.
    const bItems = await b.query(api.menu.items.list, {});
    expect(bItems.some((i) => i.name === 'Kopi')).toBe(false);
  });
});

describe('ingredients.bulkImport', () => {
  it('creates a valid ingredient with cost defaulting to 0', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const res = await asOwner.mutation(api.ingredients.bulkImport, {
      rows: [
        { name: 'Susu', unit: 'ml', reorderThreshold: 1000, lastCostPerUnitIDR: 25 },
        { name: 'Gula', unit: 'g', reorderThreshold: 500 },
      ],
    });
    expect(res.created).toBe(2);
    expect(res.errors).toHaveLength(0);

    const list = await asOwner.query(api.ingredients.list, {});
    const susu = list.find((r) => r.name === 'Susu');
    const gula = list.find((r) => r.name === 'Gula');
    expect(susu?.lastCostPerUnitIDR).toBe(25);
    expect(gula?.lastCostPerUnitIDR).toBe(0);
  });

  it('reports a bad unit as an error', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const res = await asOwner.mutation(api.ingredients.bulkImport, {
      rows: [{ name: 'Susu', unit: 'liter', reorderThreshold: 1000 }],
    });
    expect(res.created).toBe(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toMatchObject({ row: 0, name: 'Susu' });
  });

  it('reports a negative reorder threshold as an error', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const res = await asOwner.mutation(api.ingredients.bulkImport, {
      rows: [{ name: 'Susu', unit: 'ml', reorderThreshold: -1 }],
    });
    expect(res.created).toBe(0);
    expect(res.errors).toHaveLength(1);
  });

  it('skips a duplicate ingredient name (case-insensitive)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.ingredients.bulkImport, {
      rows: [{ name: 'Susu', unit: 'ml', reorderThreshold: 1000 }],
    });
    const res = await asOwner.mutation(api.ingredients.bulkImport, {
      rows: [{ name: 'susu', unit: 'ml', reorderThreshold: 500 }],
    });
    expect(res.created).toBe(0);
    expect(res.skipped).toBe(1);
    expect(res.errors).toHaveLength(0);
  });

  it('keeps imports cafe-scoped', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: a } = await setupOwner(t, 'a@test.com');
    const { asOwner: b } = await setupOwner(t, 'b@test.com');
    await a.mutation(api.ingredients.bulkImport, {
      rows: [{ name: 'Susu', unit: 'ml', reorderThreshold: 1000 }],
    });
    const bList = await b.query(api.ingredients.list, {});
    expect(bList.some((r) => r.name === 'Susu')).toBe(false);
  });
});
