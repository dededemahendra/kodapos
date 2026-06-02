import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');
const TZ = 'Asia/Jakarta';
const DAY = 86_400_000;

type Refs = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
  shiftId: Id<'shifts'>;
  itemKopi: Id<'menuItems'>;
  itemTeh: Id<'menuItems'>;
};

async function setup(t: ReturnType<typeof convexTest>, email = 'o@x.com'): Promise<Refs> {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, { name: 'Kopi Senja', timezone: TZ, taxRatePct: 0, taxEnabled: false });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id as Id<'cafes'>;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Minuman' });
  const itemKopi = await asOwner.mutation(api.menu.items.create, { categoryId, name: 'Kopi', priceIDR: 15000 });
  const itemTeh = await asOwner.mutation(api.menu.items.create, { categoryId, name: 'Teh', priceIDR: 10000 });
  return { asOwner, cafeId, cashierId, shiftId, itemKopi, itemTeh };
}

type SeedLine = { menuItemId: Id<'menuItems'>; name: string; qty: number; price: number };

async function seedOrder(
  t: ReturnType<typeof convexTest>,
  refs: Refs,
  daysAgo: number,
  lines: SeedLine[],
  nowMs: number
) {
  const at = nowMs - daysAgo * DAY;
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  await t.run((ctx) =>
    ctx.db.insert('orders', {
      cafeId: refs.cafeId,
      shiftId: refs.shiftId,
      cashierId: refs.cashierId,
      clientId: `c-${daysAgo}-${Math.round(total)}`,
      lines: lines.map((l) => ({
        menuItemId: l.menuItemId,
        nameSnapshot: l.name,
        qty: l.qty,
        unitPriceIDR: l.price,
        modifiersSnapshot: [],
        lineTotalIDR: l.qty * l.price,
      })),
      subtotalIDR: total,
      taxRatePct: 0,
      taxIDR: 0,
      discountIDR: 0,
      totalIDR: total,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      createdAtClient: at,
      syncedAt: at,
    })
  );
}

describe('forecast.demand', () => {
  it('cold-start: fewer than 14 active days → learning', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const now = Date.now();
    for (let d = 1; d <= 5; d++) {
      await seedOrder(t, refs, d, [{ menuItemId: refs.itemKopi, name: 'Kopi', qty: 3, price: 15000 }], now);
    }
    const r = await refs.asOwner.query(api.forecast.demand, {});
    expect(r.status).toBe('learning');
    if (r.status === 'learning') {
      expect(r.daysCollected).toBe(5);
      expect(r.daysNeeded).toBe(14);
      expect(typeof r.etaDateKey).toBe('string');
    }
  });

  it('ready: >=14 active days → per-item lines sorted by tomorrowQty desc', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const now = Date.now();
    for (let d = 1; d <= 20; d++) {
      await seedOrder(t, refs, d, [
        { menuItemId: refs.itemKopi, name: 'Kopi', qty: 10, price: 15000 },
        { menuItemId: refs.itemTeh, name: 'Teh', qty: 2, price: 10000 },
      ], now);
    }
    const r = await refs.asOwner.query(api.forecast.demand, {});
    expect(r.status).toBe('ready');
    if (r.status === 'ready') {
      const names = r.lines.map((l) => l.name);
      expect(names).toContain('Kopi');
      expect(names).toContain('Teh');
      expect(r.lines[0]?.name).toBe('Kopi'); // higher demand sorts first
      const kopi = r.lines.find((l) => l.name === 'Kopi')!;
      expect(kopi.tomorrowQty).toBeGreaterThan(0);
      expect(kopi.sevenDayQty).toBeGreaterThanOrEqual(kopi.tomorrowQty);
    }
  });

  it('cafe B (no orders) is tenant-isolated → learning', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'a@x.com');
    const now = Date.now();
    for (let d = 1; d <= 20; d++) {
      await seedOrder(t, a, d, [{ menuItemId: a.itemKopi, name: 'Kopi', qty: 5, price: 15000 }], now);
    }
    const b = await setup(t, 'b@x.com');
    const rb = await b.asOwner.query(api.forecast.demand, {});
    expect(rb.status).toBe('learning'); // cafe B sees none of cafe A's orders
  });

  it('void orders in range do not count as active days', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const now = Date.now();
    for (let d = 2; d <= 6; d++) {
      await seedOrder(t, refs, d, [{ menuItemId: refs.itemKopi, name: 'Kopi', qty: 3, price: 15000 }], now);
    }
    const at = now - 1 * DAY;
    await t.run((ctx) =>
      ctx.db.insert('orders', {
        cafeId: refs.cafeId,
        shiftId: refs.shiftId,
        cashierId: refs.cashierId,
        clientId: 'void-order',
        lines: [{ menuItemId: refs.itemKopi, nameSnapshot: 'Kopi', qty: 5, unitPriceIDR: 15000, modifiersSnapshot: [], lineTotalIDR: 75000 }],
        subtotalIDR: 75000,
        taxRatePct: 0,
        taxIDR: 0,
        discountIDR: 0,
        totalIDR: 75000,
        paymentMethod: 'cash',
        paymentStatus: 'void',
        createdAtClient: at,
        syncedAt: at,
      })
    );
    const r = await refs.asOwner.query(api.forecast.demand, {});
    expect(r.status).toBe('learning');
    if (r.status === 'learning') {
      expect(r.daysCollected).toBe(5); // the void day is not counted
    }
  });

  it('serves the persisted snapshot even after the underlying orders are gone', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const now = Date.now();
    for (let d = 1; d <= 20; d++) {
      await seedOrder(t, refs, d, [{ menuItemId: refs.itemKopi, name: 'Kopi', qty: 10, price: 15000 }], now);
    }
    await t.action(internal.forecast.generateNightly, {});
    // wipe all orders AFTER the snapshot — live compute would now be 'learning'
    await t.run(async (ctx) => {
      for (const o of await ctx.db.query('orders').collect()) await ctx.db.delete(o._id);
    });
    const r = await refs.asOwner.query(api.forecast.demand, {});
    expect(r.status).toBe('ready'); // served from the snapshot, not recomputed live
    if (r.status === 'ready') {
      expect(r.lines.some((l) => l.name === 'Kopi')).toBe(true);
    }
  });
});
