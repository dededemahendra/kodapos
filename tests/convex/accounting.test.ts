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
  susuId: Id<'ingredients'>;
};

/** Owner + open shift + a recipe-backed Espresso (200ml Susu/unit). */
async function setup(
  t: ReturnType<typeof convexTest>,
  opts: { email?: string } = {}
): Promise<Setup> {
  const email = opts.email ?? 'o@x.com';
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
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
    name: 'Espresso',
    priceIDR: 18000,
  });
  const susuId = await asOwner.mutation(api.ingredients.upsert, {
    name: 'Susu',
    canonicalUnit: 'ml',
    reorderThreshold: 500,
    lastCostPerUnitIDR: 25,
  });
  await asOwner.mutation(api.recipes.upsert, {
    menuItemId: itemId,
    lines: [{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }],
  });
  return { asOwner, cafeId, cashierId, shiftId, categoryId, itemId, susuId };
}

// A calendar day key (YYYY-MM-DD) in Asia/Jakarta for a given instant.
function jakartaKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

/**
 * Seeds one of each money event in range:
 *  - a paid sale (3 Espresso = 54000 inflow), then a 1-unit refund (18000 outflow),
 *  - an expense (75000), an other-income (40000), a purchase (250000 = 5×50000).
 * Returns the hand-computed amounts for reconciliation.
 */
async function seedAll(t: ReturnType<typeof convexTest>, s: Setup, now: number) {
  const sale = await s.asOwner.mutation(api.orders.createCashSale, {
    clientId: 'acc-sale',
    shiftId: s.shiftId,
    cashierId: s.cashierId,
    lines: [{ menuItemId: s.itemId, qty: 3, modifierOptionIds: [] }],
    cashTenderedIDR: 60000,
    createdAtClient: now,
  });
  expect(sale.totalIDR).toBe(54000);
  await s.asOwner.mutation(api.refunds.create, {
    orderId: sale.orderId,
    clientId: 'acc-refund',
    cashierId: s.cashierId,
    method: 'cash',
    lines: [{ lineIndex: 0, qty: 1 }],
  });
  await s.asOwner.mutation(api.expenses.record, {
    category: 'supplies',
    amountIDR: 75000,
  });
  await s.asOwner.mutation(api.otherIncome.record, {
    source: 'Sewa meja',
    amountIDR: 40000,
  });
  await s.asOwner.mutation(api.purchases.record, {
    supplierName: 'Toko Bahan',
    lines: [{ ingredientId: s.susuId, qty: 5, unitCostIDR: 50000 }],
  });
  return {
    salesIDR: 54000,
    refundsIDR: 18000,
    expensesIDR: 75000,
    otherIncomeIDR: 40000,
    purchasesIDR: 250000,
  };
}

describe('accounting.ledger — merged money events', () => {
  it('returns one sorted entry per event with correct type + inflow/outflow', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const now = Date.now();
    const amounts = await seedAll(t, s, now);
    const range = { from: jakartaKey(now), to: jakartaKey(now) } as const;

    const res = await s.asOwner.query(api.accounting.ledger, { range });

    expect(res.entries).toHaveLength(5);

    // Entries are sorted by `at` ascending.
    const ats = res.entries.map((e) => e.at);
    expect(ats).toEqual([...ats].sort((a, b) => a - b));

    // Exactly one of inflow/outflow is non-zero on every entry.
    for (const e of res.entries) {
      const inflowSet = e.inflowIDR > 0;
      const outflowSet = e.outflowIDR > 0;
      expect(inflowSet !== outflowSet).toBe(true);
    }

    const byType = (type: string) => res.entries.find((e) => e.type === type)!;
    expect(byType('sale').inflowIDR).toBe(amounts.salesIDR);
    expect(byType('sale').outflowIDR).toBe(0);
    expect(byType('other_income').inflowIDR).toBe(amounts.otherIncomeIDR);
    expect(byType('other_income').outflowIDR).toBe(0);
    expect(byType('refund').outflowIDR).toBe(amounts.refundsIDR);
    expect(byType('refund').inflowIDR).toBe(0);
    expect(byType('expense').outflowIDR).toBe(amounts.expensesIDR);
    expect(byType('expense').inflowIDR).toBe(0);
    expect(byType('purchase').outflowIDR).toBe(amounts.purchasesIDR);
    expect(byType('purchase').inflowIDR).toBe(0);

    // Accounts + descriptions per spec.
    expect(byType('sale').account).toBe('Penjualan');
    expect(byType('refund').account).toBe('Pengembalian');
    expect(byType('expense').account).toBe('Pengeluaran');
    expect(byType('expense').description).toBe('supplies');
    expect(byType('other_income').account).toBe('Pendapatan Lain');
    expect(byType('other_income').description).toBe('Sewa meja');
    expect(byType('purchase').account).toBe('Pembelian');
    expect(byType('purchase').description).toBe('Toko Bahan');
  });

  it('summary totals reconcile (inflow − outflow === net)', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const now = Date.now();
    const a = await seedAll(t, s, now);
    const range = { from: jakartaKey(now), to: jakartaKey(now) } as const;

    const { summary, fromKey, toKey } = await s.asOwner.query(api.accounting.ledger, { range });

    expect(summary.salesIDR).toBe(a.salesIDR);
    expect(summary.otherIncomeIDR).toBe(a.otherIncomeIDR);
    expect(summary.refundsIDR).toBe(a.refundsIDR);
    expect(summary.expensesIDR).toBe(a.expensesIDR);
    expect(summary.purchasesIDR).toBe(a.purchasesIDR);

    const expectedInflow = a.salesIDR + a.otherIncomeIDR; // 94000
    const expectedOutflow = a.refundsIDR + a.expensesIDR + a.purchasesIDR; // 343000
    expect(summary.inflowIDR).toBe(expectedInflow);
    expect(summary.outflowIDR).toBe(expectedOutflow);
    expect(summary.netIDR).toBe(expectedInflow - expectedOutflow); // -249000
    expect(summary.netIDR).toBe(summary.inflowIDR - summary.outflowIDR);

    expect(fromKey).toBe(jakartaKey(now));
    expect(toKey).toBe(jakartaKey(now));
  });

  it('excludes events stamped outside the range', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const now = Date.now();
    await seedAll(t, s, now);

    // A future-only range (tomorrow) sees nothing.
    const future = jakartaKey(now + 2 * 24 * 60 * 60 * 1000);
    const res = await s.asOwner.query(api.accounting.ledger, {
      range: { from: future, to: future },
    });
    expect(res.entries).toHaveLength(0);
    expect(res.summary.inflowIDR).toBe(0);
    expect(res.summary.outflowIDR).toBe(0);
    expect(res.summary.netIDR).toBe(0);
  });

  it('excludes another cafe\'s events (owner scope)', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, { email: 'a@x.com' });
    const b = await setup(t, { email: 'b@x.com' });
    const now = Date.now();
    // Seed everything under cafe B.
    await seedAll(t, b, now);

    const range = { from: jakartaKey(now), to: jakartaKey(now) } as const;
    // Owner A sees nothing.
    const res = await a.asOwner.query(api.accounting.ledger, { range });
    expect(res.entries).toHaveLength(0);
    expect(res.summary.inflowIDR).toBe(0);
    expect(res.summary.outflowIDR).toBe(0);
  });
});
