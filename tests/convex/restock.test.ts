import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
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

describe('restock.suggestion', () => {
  it('cold-start (<14 active days) → learning', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 5, Date.now());
    const r = await refs.asOwner.query(api.restock.suggestion, {});
    expect(r.status).toBe('learning');
  });

  it('ready → suggests the recipe ingredient with qty > 0', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    const r = await refs.asOwner.query(api.restock.suggestion, {});
    expect(r.status).toBe('ready');
    if (r.status === 'ready') {
      const susu = r.lines.find((l) => l.name === 'Susu');
      expect(susu).toBeDefined();
      expect(susu!.unit).toBe('ml');
      expect(susu!.suggestedQty).toBeGreaterThan(0);
      expect(susu!.currentStockQty).toBe(0);
    }
  });

  it('omits a fully-stocked ingredient', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await seedSales(t, refs, 20, Date.now());
    const now = Date.now();
    await t.run((ctx) =>
      ctx.db.insert('inventoryMovements', {
        cafeId: refs.cafeId, ingredientId: refs.ingSusu, delta: 1_000_000, reason: 'adjustment', at: now,
      })
    );
    const r = await refs.asOwner.query(api.restock.suggestion, {});
    expect(r.status).toBe('ready');
    if (r.status === 'ready') {
      expect(r.lines.find((l) => l.name === 'Susu')).toBeUndefined();
    }
  });

  it('tenant isolation: cafe B sees learning (no data)', async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, 'a@x.com');
    await seedSales(t, a, 20, Date.now());
    const b = await setup(t, 'b@x.com');
    const rb = await b.asOwner.query(api.restock.suggestion, {});
    expect(rb.status).toBe('learning');
  });
});
