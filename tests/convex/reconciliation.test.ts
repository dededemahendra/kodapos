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
  itemId: Id<'menuItems'>;
  orderId: Id<'orders'>;
};

// Mirrors the setup() helper in tests/convex/sale-core.test.ts and
// tests/convex/replay-sale.test.ts, plus one committed order so the
// reconciliation rows below point at a real one.
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
  const sale = await asOwner.mutation(api.orders.createCashSale, {
    clientId: 'seed-order-1',
    shiftId,
    cashierId,
    lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
    cashTenderedIDR: 20000,
    createdAtClient: Date.now(),
  });
  return { asOwner, cafeId, cashierId, shiftId, itemId, orderId: sale.orderId };
}

describe('reconciliation.listOpen', () => {
  it('returns only unresolved rows for the caller cafe', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('saleReconciliations', {
        cafeId: s.cafeId,
        orderId: s.orderId,
        clientId: 'c1',
        kind: 'price_drift',
        rungIDR: 20000,
        currentIDR: 30000,
        createdAt: Date.now(),
      });
      await ctx.db.insert('saleReconciliations', {
        cafeId: s.cafeId,
        orderId: s.orderId,
        clientId: 'c2',
        kind: 'price_drift',
        createdAt: Date.now(),
        resolvedAt: Date.now(),
      });
    });

    const rows = await s.asOwner.query(api.reconciliation.listOpen, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.clientId).toBe('c1');
    expect(rows[0]?.rungIDR).toBe(20000);
    expect(rows[0]?.currentIDR).toBe(30000);
    // Order context comes back so the row can be judged without opening it.
    expect(rows[0]?.orderTotalIDR).toBe(20000);
  });

  it('never leaks another cafe rows', async () => {
    const t = convexTest(schema, modules);
    const mine = await setup(t);
    const theirs = await setup(t, { email: 'other@x.com' });
    await t.run(async (ctx) => {
      await ctx.db.insert('saleReconciliations', {
        cafeId: theirs.cafeId,
        orderId: theirs.orderId,
        clientId: 'not-mine',
        kind: 'shift_closed',
        createdAt: Date.now(),
      });
    });

    expect(await mine.asOwner.query(api.reconciliation.listOpen, {})).toHaveLength(0);
    expect(await theirs.asOwner.query(api.reconciliation.listOpen, {})).toHaveLength(1);
  });

  it('requires an authenticated outlet', async () => {
    const t = convexTest(schema, modules);
    await setup(t);
    await expect(t.query(api.reconciliation.listOpen, {})).rejects.toThrow('not authenticated');
  });

  it('surfaces the shift_closed rows a replayed sale writes', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.shifts.close, { id: s.shiftId, countedCashIDR: 120000 });
    await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-1',
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

    const rows = await s.asOwner.query(api.reconciliation.listOpen, {});
    expect(rows.some((r) => r.kind === 'shift_closed')).toBe(true);
  });
});

describe('reconciliation.resolve', () => {
  it('removes the row from listOpen and keeps the first timestamp', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('saleReconciliations', {
        cafeId: s.cafeId,
        orderId: s.orderId,
        clientId: 'c1',
        kind: 'item_unavailable',
        detail: 'Kopi',
        createdAt: Date.now(),
      });
    });
    const [row] = await s.asOwner.query(api.reconciliation.listOpen, {});
    await s.asOwner.mutation(api.reconciliation.resolve, { id: row!._id });
    expect(await s.asOwner.query(api.reconciliation.listOpen, {})).toHaveLength(0);

    const first = await t.run(async (ctx) => (await ctx.db.get(row!._id))?.resolvedAt);
    // A double tap must not move the "handled at" stamp.
    await s.asOwner.mutation(api.reconciliation.resolve, { id: row!._id });
    const second = await t.run(async (ctx) => (await ctx.db.get(row!._id))?.resolvedAt);
    expect(second).toBe(first);
  });

  it('refuses a row belonging to another cafe', async () => {
    const t = convexTest(schema, modules);
    const mine = await setup(t);
    const theirs = await setup(t, { email: 'other@x.com' });
    const foreignId = await t.run(async (ctx) => {
      return await ctx.db.insert('saleReconciliations', {
        cafeId: theirs.cafeId,
        orderId: theirs.orderId,
        clientId: 'not-mine',
        kind: 'shift_closed',
        createdAt: Date.now(),
      });
    });
    await expect(
      mine.asOwner.mutation(api.reconciliation.resolve, { id: foreignId })
    ).rejects.toThrow('tidak ditemukan');
  });
});
