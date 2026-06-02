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
  ingSusu: Id<'ingredients'>;
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
  const ingSusu = await asOwner.mutation(api.ingredients.upsert, { name: 'Susu', canonicalUnit: 'ml', reorderThreshold: 0, lastCostPerUnitIDR: 100 });
  await asOwner.mutation(api.recipes.upsert, { menuItemId: itemKopi, lines: [{ ingredientId: ingSusu, qty: 50, wastageFactor: 1 }] });
  return { asOwner, cafeId, cashierId, shiftId, itemKopi, ingSusu };
}

async function seedSales(t: ReturnType<typeof convexTest>, refs: Refs, days: number, nowMs: number) {
  for (let d = 1; d <= days; d++) {
    const at = nowMs - d * DAY;
    await t.run((ctx) =>
      ctx.db.insert('orders', {
        cafeId: refs.cafeId, shiftId: refs.shiftId, cashierId: refs.cashierId,
        clientId: `c-${d}`,
        lines: [{ menuItemId: refs.itemKopi, nameSnapshot: 'Kopi', qty: 10, unitPriceIDR: 15000, modifiersSnapshot: [], lineTotalIDR: 150000 }],
        subtotalIDR: 150000, taxRatePct: 0, taxIDR: 0, discountIDR: 0, totalIDR: 150000,
        paymentMethod: 'cash', paymentStatus: 'paid', createdAtClient: at, syncedAt: at,
      })
    );
  }
}

describe('generateNightly', () => {
  it('persists a ready forecast + a draft restock for a cafe with data', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    await t.mutation(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    const restocks = await t.run((ctx) => ctx.db.query('restockSuggestions').collect());
    expect(forecasts).toHaveLength(1);
    expect(forecasts[0]?.status).toBe('ready');
    expect((forecasts[0]?.lines ?? []).some((l) => l.name === 'Kopi')).toBe(true);
    expect(restocks).toHaveLength(1);
    expect(restocks[0]?.status).toBe('draft');
    expect(restocks[0]?.forecastId).toBe(forecasts[0]?._id);
    expect(restocks[0]?.lines.some((l) => l.name === 'Susu')).toBe(true);
  });

  it('cold-start cafe → learning forecast, no restock row', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 5, Date.now());
    await t.mutation(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    const restocks = await t.run((ctx) => ctx.db.query('restockSuggestions').collect());
    expect(forecasts[0]?.status).toBe('learning');
    expect(restocks).toHaveLength(0);
  });

  it('each cafe gets its own snapshot', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'a@x.com');
    await seedSales(t, a, 20, Date.now());
    const b = await setup(t, 'b@x.com');
    await t.mutation(internal.forecast.generateNightly, {});
    const forecasts = await t.run((ctx) => ctx.db.query('forecasts').collect());
    expect(forecasts).toHaveLength(2);
    expect(forecasts.map((f) => f.cafeId).sort()).toEqual([a.cafeId, b.cafeId].sort());
  });
});
