import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');
const TZ = 'Asia/Jakarta';

type Refs = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
  shiftId: Id<'shifts'>;
  itemId: Id<'menuItems'>;
};

async function setup(t: ReturnType<typeof convexTest>): Promise<Refs> {
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' })
  );
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: TZ,
    taxRatePct: 0,
    taxEnabled: false,
  });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id as Id<'cafes'>;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, {
    cashierId,
    openingFloatIDR: 100000,
  });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
  return { asOwner, cafeId, cashierId, shiftId, itemId };
}

describe('dashboard.kpis paid-only invariant', () => {
  // A pending dynamic-QRIS order must NOT inflate today's revenue / order /
  // item counts. Only `paymentStatus === 'paid'` orders are completed sales.
  it("counts the paid sale but excludes a pending dynamic-QRIS order", async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const now = Date.now();

    // One real, settled cash sale (1 × Espresso @ 18000) → paid.
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'dash-paid',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: now,
    });

    // One dynamic-QRIS order left pending (provider hasn't confirmed) — the
    // qris integration must be connected for the action to run.
    await asOwner.mutation(api.settings.connectIntegration, {
      key: 'qris',
      config: { apiKey: 'k' },
    });
    const pending = await asOwner.action(api.payments.qrisDynamic.createQrisDynamicSale, {
      clientId: 'dash-pending',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      createdAtClient: now,
    });
    const pendingOrder = await t.run((ctx) => ctx.db.get(pending.orderId));
    expect(pendingOrder?.paymentStatus).toBe('pending');

    const kpis = await asOwner.query(api.dashboard.kpis, {});
    // Only the paid cash sale is counted: 1 order, 18000 revenue, 1 item.
    expect(kpis.revenueIDR).toBe(18000);
    expect(kpis.orders).toBe(1);
    expect(kpis.itemsSold).toBe(1);
  });
});
