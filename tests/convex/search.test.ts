/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>) {
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' })
  );
  const asOwner = t.withIdentity({ subject: `${userId}|test` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  if (!cafe) throw new Error('cafe not created');
  const catId = await t.run((ctx) =>
    ctx.db.insert('categories', {
      cafeId: cafe._id,
      name: 'Minuman',
      position: 0,
      archived: false,
      createdAt: Date.now(),
    })
  );
  return { asOwner, cafeId: cafe._id, catId };
}

describe('search.global', () => {
  it('returns empty arrays when term is shorter than 2 chars', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const r1 = await asOwner.query(api.search.global, { term: '' });
    expect(r1).toEqual({ menuItems: [], customers: [] });
    const r2 = await asOwner.query(api.search.global, { term: 'a' });
    expect(r2).toEqual({ menuItems: [], customers: [] });
  });

  it('finds menu items by name (case-insensitive)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, catId } = await setup(t);
    await t.run((ctx) =>
      ctx.db.insert('menuItems', {
        cafeId,
        categoryId: catId,
        name: 'Es Kopi Susu',
        priceIDR: 18000,
        isActive: true,
        archived: false,
        soldOut: false,
        position: 0,
        createdAt: Date.now(),
      })
    );
    const result = await asOwner.query(api.search.global, { term: 'kopi' });
    expect(result.menuItems).toHaveLength(1);
    expect(result.menuItems[0]?.name).toBe('Es Kopi Susu');
    expect(result.menuItems[0]?.priceIDR).toBe(18000);
    expect(result.menuItems[0]?.categoryName).toBe('Minuman');
    expect(result.customers).toHaveLength(0);
  });

  it('does not return archived or inactive menu items', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, catId } = await setup(t);
    await t.run((ctx) =>
      ctx.db.insert('menuItems', {
        cafeId,
        categoryId: catId,
        name: 'Archived Kopi',
        priceIDR: 10000,
        isActive: true,
        archived: true,
        position: 0,
        createdAt: Date.now(),
      })
    );
    await t.run((ctx) =>
      ctx.db.insert('menuItems', {
        cafeId,
        categoryId: catId,
        name: 'Inactive Kopi',
        priceIDR: 10000,
        isActive: false,
        archived: false,
        position: 1,
        createdAt: Date.now(),
      })
    );
    const result = await asOwner.query(api.search.global, { term: 'kopi' });
    expect(result.menuItems).toHaveLength(0);
  });

  it('caps menu item results at 5', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, catId } = await setup(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 8; i++) {
        await ctx.db.insert('menuItems', {
          cafeId,
          categoryId: catId,
          name: `Kopi ${i}`,
          priceIDR: 10000,
          isActive: true,
          archived: false,
          position: i,
          createdAt: Date.now() + i,
        });
      }
    });
    const result = await asOwner.query(api.search.global, { term: 'kopi' });
    expect(result.menuItems.length).toBeLessThanOrEqual(5);
  });

  it('finds customers by name (case-insensitive)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await setup(t);
    await t.run((ctx) =>
      ctx.db.insert('customers', {
        cafeId,
        name: 'Budi Santoso',
        phone: '081234567890',
        pointsBalance: 0,
        visitCount: 0,
        totalSpentIDR: 0,
        archived: false,
        createdAt: Date.now(),
      })
    );
    const result = await asOwner.query(api.search.global, { term: 'budi' });
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0]?.name).toBe('Budi Santoso');
    expect(result.customers[0]?.phone).toBe('081234567890');
  });

  it('finds customers by phone', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await setup(t);
    await t.run((ctx) =>
      ctx.db.insert('customers', {
        cafeId,
        name: 'Ani Wijaya',
        phone: '082211223344',
        pointsBalance: 0,
        visitCount: 0,
        totalSpentIDR: 0,
        archived: false,
        createdAt: Date.now(),
      })
    );
    const result = await asOwner.query(api.search.global, { term: '0822' });
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0]?.name).toBe('Ani Wijaya');
  });

  it('does not return archived customers', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await setup(t);
    await t.run((ctx) =>
      ctx.db.insert('customers', {
        cafeId,
        name: 'Archived Budi',
        phone: '081199998888',
        pointsBalance: 0,
        visitCount: 0,
        totalSpentIDR: 0,
        archived: true,
        createdAt: Date.now(),
      })
    );
    const result = await asOwner.query(api.search.global, { term: 'budi' });
    expect(result.customers).toHaveLength(0);
  });

  it('caps customer results at 5', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await setup(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 8; i++) {
        await ctx.db.insert('customers', {
          cafeId,
          name: `Budi ${i}`,
          phone: `0812000000${i}`,
          pointsBalance: 0,
          visitCount: 0,
          totalSpentIDR: 0,
          archived: false,
          createdAt: Date.now() + i,
        });
      }
    });
    const result = await asOwner.query(api.search.global, { term: 'budi' });
    expect(result.customers.length).toBeLessThanOrEqual(5);
  });

  it('does not return data from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await setup(t);

    // Create a second owner + cafe
    const userId2 = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Other', email: 'other@x.com' })
    );
    const asOwner2 = t.withIdentity({ subject: `${userId2}|test` });
    await asOwner2.mutation(api.cafes.createForOwner, { name: 'Warung Lain' });
    const cafe2 = await asOwner2.query(api.cafes.myCafe, {});
    if (!cafe2) throw new Error('cafe2 not created');
    const catId2 = await t.run((ctx) =>
      ctx.db.insert('categories', {
        cafeId: cafe2._id,
        name: 'Makanan',
        position: 0,
        archived: false,
        createdAt: Date.now(),
      })
    );
    await t.run((ctx) =>
      ctx.db.insert('menuItems', {
        cafeId: cafe2._id,
        categoryId: catId2,
        name: 'Kopi Rival',
        priceIDR: 20000,
        isActive: true,
        archived: false,
        position: 0,
        createdAt: Date.now(),
      })
    );

    // Owner 1 searches — must not see other cafe's item
    const result = await asOwner.query(api.search.global, { term: 'kopi' });
    expect(result.menuItems).toHaveLength(0);
  });
});
