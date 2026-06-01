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

async function seedOrder(
  t: ReturnType<typeof convexTest>,
  refs: Refs,
  opts: { at: number; total: number; method?: 'cash' | 'qris_static'; lines: { name: string; qty: number; lineTotal: number }[] }
) {
  await t.run((ctx) =>
    ctx.db.insert('orders', {
      cafeId: refs.cafeId,
      shiftId: refs.shiftId,
      cashierId: refs.cashierId,
      clientId: `c-${opts.at}-${Math.round(opts.total)}`,
      lines: opts.lines.map((l) => ({
        menuItemId: refs.itemId,
        nameSnapshot: l.name,
        qty: l.qty,
        unitPriceIDR: Math.round(l.lineTotal / l.qty),
        modifiersSnapshot: [],
        lineTotalIDR: l.lineTotal,
      })),
      subtotalIDR: opts.total,
      taxRatePct: 0,
      taxIDR: 0,
      discountIDR: 0,
      totalIDR: opts.total,
      paymentMethod: opts.method ?? 'cash',
      paymentStatus: 'paid',
      createdAtClient: opts.at,
      syncedAt: opts.at,
    })
  );
}

describe('reports.overview + salesDaily', () => {
  it('overview aggregates revenue, orders, AOV, items over the range', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const { asOwner } = refs;
    await seedOrder(t, refs, { at: wib(2026, 5, 10), total: 20000, lines: [{ name: 'Espresso', qty: 2, lineTotal: 20000 }] });
    await seedOrder(t, refs, { at: wib(2026, 5, 11), total: 30000, lines: [{ name: 'Latte', qty: 1, lineTotal: 30000 }] });
    const r = await asOwner.query(api.reports.overview, { range: { from: '2026-05-10', to: '2026-05-11' } });
    expect(r.revenueIDR).toBe(50000);
    expect(r.orders).toBe(2);
    expect(r.aovIDR).toBe(25000);
    expect(r.itemsSold).toBe(3);
  });

  it('overview ignores orders outside the range and non-paid orders', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const { asOwner } = refs;
    await seedOrder(t, refs, { at: wib(2026, 5, 9), total: 99999, lines: [{ name: 'X', qty: 1, lineTotal: 99999 }] });
    const r = await asOwner.query(api.reports.overview, { range: { from: '2026-05-10', to: '2026-05-10' } });
    expect(r.revenueIDR).toBe(0);
    expect(r.orders).toBe(0);
    expect(r.aovIDR).toBe(0);
  });

  it('salesDaily returns zero-filled buckets for every day in range', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const { asOwner } = refs;
    await seedOrder(t, refs, { at: wib(2026, 5, 10), total: 20000, lines: [{ name: 'A', qty: 1, lineTotal: 20000 }] });
    await seedOrder(t, refs, { at: wib(2026, 5, 12), total: 10000, lines: [{ name: 'A', qty: 1, lineTotal: 10000 }] });
    const r = await asOwner.query(api.reports.salesDaily, { range: { from: '2026-05-10', to: '2026-05-12' } });
    expect(r.days).toEqual([
      { day: '2026-05-10', revenueIDR: 20000, orders: 1 },
      { day: '2026-05-11', revenueIDR: 0, orders: 0 },
      { day: '2026-05-12', revenueIDR: 10000, orders: 1 },
    ]);
  });

  it('tenant isolation: cafe B sees none of cafe A orders', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'a@x.com');
    await seedOrder(t, a, { at: wib(2026, 5, 10), total: 20000, lines: [{ name: 'A', qty: 1, lineTotal: 20000 }] });
    const b = await setup(t, 'b@x.com');
    const r = await b.asOwner.query(api.reports.overview, { range: { from: '2026-05-10', to: '2026-05-10' } });
    expect(r.revenueIDR).toBe(0);
  });
});
