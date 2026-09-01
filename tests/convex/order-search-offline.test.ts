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

// Mirrors the setup() helper in tests/convex/sale-core.test.ts and
// tests/convex/replay-sale.test.ts.
async function setup(
  t: ReturnType<typeof convexTest>,
  opts: { email?: string } = {}
): Promise<Setup> {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email: opts.email ?? 'o@x.com' });
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
  const shiftId = await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Kopi',
    priceIDR: 20000,
  });
  return { asOwner, cafeId, cashierId, shiftId, categoryId, itemId };
}

describe('orders.search', () => {
  it('finds an offline sale by its printed clientId code', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const clientId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeef12';
    await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId,
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [
        {
          menuItemId: s.itemId,
          qty: 1,
          modifierOptionIds: [],
          nameSnapshot: 'Kopi',
          unitPriceIDR: 20000,
          lineTotalIDR: 20000,
        },
      ],
      discountIDR: 0,
      serviceChargeIDR: 0,
      taxIDR: 0,
      totalIDR: 20000,
      cashTenderedIDR: 20000,
      createdAtClient: Date.now(),
    });

    const found = await s.asOwner.query(api.orders.search, {
      range: { preset: 'today' },
      q: 'EF12',
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(found.page.length).toBeGreaterThan(0);
  });

  it('matches case-insensitively and excludes orders whose codes differ', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeef12',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [
        {
          menuItemId: s.itemId,
          qty: 1,
          modifierOptionIds: [],
          nameSnapshot: 'Kopi',
          unitPriceIDR: 20000,
          lineTotalIDR: 20000,
        },
      ],
      discountIDR: 0,
      serviceChargeIDR: 0,
      taxIDR: 0,
      totalIDR: 20000,
      cashTenderedIDR: 20000,
      createdAtClient: Date.now(),
    });
    // A second, unrelated order whose clientId suffix does not match either
    // query below — it must never show up in the results.
    await s.asOwner.mutation(api.orders.createCashSale, {
      clientId: 'zzzzzzzz-0000-1111-2222-333333330000',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: Date.now(),
    });

    const lower = await s.asOwner.query(api.orders.search, {
      range: { preset: 'today' },
      q: 'ef12',
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(lower.page.length).toBe(1);

    const upper = await s.asOwner.query(api.orders.search, {
      range: { preset: 'today' },
      q: 'EF12',
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(upper.page.length).toBe(1);
    expect(upper.page[0]?._id).toBe(lower.page[0]?._id);
  });

  it('treats a non-4-character query as no matches, not as an ignored filter', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeef12',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [
        {
          menuItemId: s.itemId,
          qty: 1,
          modifierOptionIds: [],
          nameSnapshot: 'Kopi',
          unitPriceIDR: 20000,
          lineTotalIDR: 20000,
        },
      ],
      discountIDR: 0,
      serviceChargeIDR: 0,
      taxIDR: 0,
      totalIDR: 20000,
      cashTenderedIDR: 20000,
      createdAtClient: Date.now(),
    });

    const threeChars = await s.asOwner.query(api.orders.search, {
      range: { preset: 'today' },
      q: 'F12',
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(threeChars.page).toHaveLength(0);

    const fiveChars = await s.asOwner.query(api.orders.search, {
      range: { preset: 'today' },
      q: 'EEF12',
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(fiveChars.page).toHaveLength(0);

    // An absent/empty q is "no search", not "search for nothing" — the
    // unfiltered page still comes back.
    const noQuery = await s.asOwner.query(api.orders.search, {
      range: { preset: 'today' },
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(noQuery.page.length).toBeGreaterThan(0);
  });
});
