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

const RANGE = { from: '2026-05-10', to: '2026-05-11' } as const;

describe('businessOverview', () => {
  it('single-outlet owner: one row whose totals equal that row', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedOrder(t, refs, { at: wib(2026, 5, 10), total: 10000, lines: [{ name: 'Kopi', qty: 2, lineTotal: 10000 }] });
    const res = await refs.asOwner.query(api.reports.businessOverview, { range: RANGE });
    expect(res.outlets).toHaveLength(1);
    expect(res.outlets[0]!.cafeId).toBe(refs.cafeId);
    expect(res.outlets[0]!.revenueIDR).toBe(10000);
    expect(res.outlets[0]!.itemsSold).toBe(2);
    expect(res.totals.revenueIDR).toBe(10000);
    expect(res.totals.orders).toBe(1);
  });

  it('sums totals across two outlets and sorts rows by name', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t); // outlet "Kopi Senja" (active)
    await seedOrder(t, refs, { at: wib(2026, 5, 10), total: 30000, lines: [{ name: 'Kopi', qty: 3, lineTotal: 30000 }] });
    // Second outlet (named to sort BEFORE "Kopi Senja"): createOutlet switches active to it.
    await refs.asOwner.mutation(api.outlets.createOutlet, { name: 'Alpha' });
    const alpha = (await refs.asOwner.query(api.cafes.myCafe, {}))!._id;
    const aCashier = await refs.asOwner.mutation(api.staff.create, { name: 'B', pin: '5678' });
    const aShift = await refs.asOwner.mutation(api.shifts.open, { cashierId: aCashier, openingFloatIDR: 0 });
    const aCat = await refs.asOwner.mutation(api.menu.categories.create, { name: 'Teh' });
    const aItem = await refs.asOwner.mutation(api.menu.items.create, { categoryId: aCat, name: 'Teh', priceIDR: 20000 });
    await seedOrder(t, { ...refs, cafeId: alpha, cashierId: aCashier, shiftId: aShift, itemId: aItem },
      { at: wib(2026, 5, 10), total: 20000, lines: [{ name: 'Teh', qty: 1, lineTotal: 20000 }] });

    const res = await refs.asOwner.query(api.reports.businessOverview, { range: RANGE });
    expect(res.outlets.map((o) => o.name)).toEqual(['Alpha', 'Kopi Senja']); // sorted by name
    expect(res.totals.revenueIDR).toBe(50000);
    expect(res.totals.orders).toBe(2);
    expect(res.totals.itemsSold).toBe(4);
    expect(res.totals.aovIDR).toBe(25000); // 50000 / 2
  });

  it('returns only the manager accessible outlets', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t); // owner outlet, active
    await seedOrder(t, refs, { at: wib(2026, 5, 10), total: 99000, lines: [{ name: 'Kopi', qty: 1, lineTotal: 99000 }] });
    await refs.asOwner.mutation(api.outlets.createOutlet, { name: 'Cabang' });
    const granted = (await refs.asOwner.query(api.cafes.myCafe, {}))!._id;
    const gCashier = await refs.asOwner.mutation(api.staff.create, { name: 'C', pin: '4321' });
    const gShift = await refs.asOwner.mutation(api.shifts.open, { cashierId: gCashier, openingFloatIDR: 0 });
    const gCat = await refs.asOwner.mutation(api.menu.categories.create, { name: 'X' });
    const gItem = await refs.asOwner.mutation(api.menu.items.create, { categoryId: gCat, name: 'X', priceIDR: 15000 });
    await seedOrder(t, { ...refs, cafeId: granted, cashierId: gCashier, shiftId: gShift, itemId: gItem },
      { at: wib(2026, 5, 10), total: 15000, lines: [{ name: 'X', qty: 1, lineTotal: 15000 }] });

    const businessId = (await t.run((ctx) => ctx.db.get(granted)))!.businessId as Id<'businesses'>;
    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'm@x.com' }));
    const mgrMemberId = await t.run((ctx) =>
      ctx.db.insert('businessMembers', { businessId, userId: mgrUserId, role: 'manager', createdAt: 5 })
    );
    await t.run((ctx) =>
      ctx.db.insert('memberOutletAccess', { businessMemberId: mgrMemberId, cafeId: granted, createdAt: 5 })
    );
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });

    const res = await asMgr.query(api.reports.businessOverview, { range: RANGE });
    expect(res.outlets.map((o) => o.cafeId)).toEqual([granted]);
    expect(res.totals.revenueIDR).toBe(15000); // owner-only outlet excluded
  });

  it('throws when unauthenticated', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.reports.businessOverview, { range: RANGE })).rejects.toThrow('not authenticated');
  });

  it('throws no outlet access for a member with zero granted outlets', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t); // owner + business + cafe
    const businessId = (await t.run((ctx) => ctx.db.get(refs.cafeId)))!.businessId as Id<'businesses'>;
    // A manager member with NO memberOutletAccess rows -> empty accessible set.
    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'noaccess@x.com' }));
    await t.run((ctx) =>
      ctx.db.insert('businessMembers', { businessId, userId: mgrUserId, role: 'manager', createdAt: 5 })
    );
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });
    await expect(asMgr.query(api.reports.businessOverview, { range: RANGE })).rejects.toThrow('no outlet access');
  });
});

describe('overview is unchanged after the refactor', () => {
  it('still returns the active outlet metrics', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedOrder(t, refs, { at: wib(2026, 5, 10), total: 12000, lines: [{ name: 'Kopi', qty: 4, lineTotal: 12000 }] });
    const res = await refs.asOwner.query(api.reports.overview, { range: RANGE });
    expect(res.revenueIDR).toBe(12000);
    expect(res.orders).toBe(1);
    expect(res.itemsSold).toBe(4);
  });
});
