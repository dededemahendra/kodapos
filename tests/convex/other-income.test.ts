import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');
const TZ = 'Asia/Jakarta';
// UTC instant for a local WIB wall-clock time on a given date (h defaults to noon)
const wib = (y: number, mo: number, d: number, h = 12) => Date.UTC(y, mo - 1, d, h - 7, 0, 0);

type Refs = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
  shiftId: Id<'shifts'>;
  itemId: Id<'menuItems'>;
};

async function setup(t: ReturnType<typeof convexTest>, email = 'o@x.com'): Promise<Refs> {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja', timezone: TZ, taxRatePct: 0, taxEnabled: false,
  });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id as Id<'cafes'>;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, { categoryId, name: 'Espresso', priceIDR: 18000 });
  return { asOwner, cafeId, cashierId, shiftId, itemId };
}

describe('otherIncome', () => {
  it('records and lists other income in range with the right total', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    await asOwner.mutation(api.otherIncome.record, { source: 'Sewa tempat', amountIDR: 1000000 });
    await asOwner.mutation(api.otherIncome.record, {
      source: 'Penjualan alat',
      amountIDR: 250000,
      note: 'Mesin lama',
    });
    const data = await asOwner.query(api.otherIncome.list, { range: { preset: 'today' } });
    expect(data.totalIDR).toBe(1250000);
    expect(data.rows).toHaveLength(2);
    const rent = data.rows.find((r) => r.source === 'Sewa tempat');
    expect(rent?.amountIDR).toBe(1000000);
  });

  it('lists newest-first', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    await asOwner.mutation(api.otherIncome.record, { source: 'Pertama', amountIDR: 1000 });
    await asOwner.mutation(api.otherIncome.record, { source: 'Kedua', amountIDR: 2000 });
    const data = await asOwner.query(api.otherIncome.list, { range: { preset: 'today' } });
    expect(data.rows.map((r) => r.source)).toEqual(['Kedua', 'Pertama']);
  });

  it('rejects a non-positive amount', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    await expect(
      asOwner.mutation(api.otherIncome.record, { source: 'X', amountIDR: 0 })
    ).rejects.toThrow(/nol/i);
  });

  it('rejects a negative amount', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    await expect(
      asOwner.mutation(api.otherIncome.record, { source: 'X', amountIDR: -100 })
    ).rejects.toThrow(/nol/i);
  });

  it('rejects a non-integer amount', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    await expect(
      asOwner.mutation(api.otherIncome.record, { source: 'X', amountIDR: 1500.5 })
    ).rejects.toThrow(/nol/i);
  });

  it('rejects an empty / whitespace source', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    await expect(
      asOwner.mutation(api.otherIncome.record, { source: '', amountIDR: 1000 })
    ).rejects.toThrow(/sumber/i);
    await expect(
      asOwner.mutation(api.otherIncome.record, { source: '   ', amountIDR: 1000 })
    ).rejects.toThrow(/sumber/i);
  });

  it('list is range-scoped: excludes entries stamped outside the window', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const { asOwner, cafeId } = refs;
    // In-range entry (within 2026-05-10).
    await t.run((ctx) =>
      ctx.db.insert('otherIncome', {
        cafeId,
        source: 'Sewa',
        amountIDR: 50000,
        at: wib(2026, 5, 10),
      })
    );
    // Out-of-range entry (the day before).
    await t.run((ctx) =>
      ctx.db.insert('otherIncome', {
        cafeId,
        source: 'Lama',
        amountIDR: 99999,
        at: wib(2026, 5, 9),
      })
    );
    const data = await asOwner.query(api.otherIncome.list, {
      range: { from: '2026-05-10', to: '2026-05-10' },
    });
    expect(data.totalIDR).toBe(50000);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]?.source).toBe('Sewa');
  });

  it('removes an entry; a foreign cafe row throws on remove', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const id = await asOwner.mutation(api.otherIncome.record, { source: 'Hibah', amountIDR: 5000 });
    await asOwner.mutation(api.otherIncome.remove, { id });
    const data = await asOwner.query(api.otherIncome.list, { range: { preset: 'today' } });
    expect(data.rows).toHaveLength(0);

    const { asOwner: asOther } = await setup(t, 'other@x.com');
    const id2 = await asOwner.mutation(api.otherIncome.record, { source: 'Bunga', amountIDR: 9000 });
    await expect(asOther.mutation(api.otherIncome.remove, { id: id2 })).rejects.toThrow();
  });
});

describe('reports.profitLoss + otherIncome', () => {
  async function seedRecipeItem(t: ReturnType<typeof convexTest>, refs: Refs) {
    const { asOwner } = refs;
    const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Teh' });
    const itemId = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Teh Susu',
      priceIDR: 10000,
    });
    const ingredientId = await asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu',
      canonicalUnit: 'ml',
      reorderThreshold: 500,
      lastCostPerUnitIDR: 1000,
    });
    await asOwner.mutation(api.ingredients.adjustStock, {
      ingredientId,
      newQty: 1000,
      reasonLabel: 'Stok awal',
    });
    await asOwner.mutation(api.recipes.upsert, {
      menuItemId: itemId,
      lines: [{ ingredientId, qty: 2, wastageFactor: 1.0 }],
    });
    return itemId;
  }

  it('folds other income into net profit', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const { asOwner, shiftId, cashierId } = refs;
    const itemId = await seedRecipeItem(t, refs);
    // sell qty 3 → revenue 30000, cogs 6000 (unit COGS 2000)
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'pl-oi-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      cashTenderedIDR: 30000,
      createdAtClient: Date.now(),
    });
    await asOwner.mutation(api.expenses.record, { category: 'rent', amountIDR: 10000 });
    await asOwner.mutation(api.otherIncome.record, { source: 'Sewa tempat', amountIDR: 4000 });
    const data = await asOwner.query(api.reports.profitLoss, { range: { preset: 'today' } });
    expect(data.revenueIDR).toBe(30000);
    expect(data.cogsIDR).toBe(6000);
    expect(data.grossProfitIDR).toBe(24000);
    expect(data.expensesIDR).toBe(10000);
    expect(data.otherIncomeIDR).toBe(4000);
    // net = grossProfit − expenses + otherIncome = 24000 − 10000 + 4000 = 18000
    expect(data.netProfitIDR).toBe(18000);
    expect(data.netProfitIDR).toBe(
      data.grossProfitIDR - data.expensesIDR + data.otherIncomeIDR
    );
    expect(data.netMarginPct).toBe(60); // Math.round(18000/30000*100)
  });
});
