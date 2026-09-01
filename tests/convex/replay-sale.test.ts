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

// Mirrors tests/convex/sale-core.test.ts, except the item is priced at exactly
// the amount the replay payloads below were "rung" at, so a discrepancy row is
// only ever produced by the drift a test deliberately introduces.
async function setup(t: ReturnType<typeof convexTest>): Promise<Setup> {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
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

describe('createReplayedCashSale', () => {
  it('posts into a CLOSED shift', async () => {
    // The reason this mutation exists: shift close is allowed with sales still
    // queued, so replay always runs after the shift closed. buildOrder's
    // `Shift sudah ditutup.` would otherwise reject every queued sale forever.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.shifts.close, { id: s.shiftId, countedCashIDR: 0 });

    const res = await s.asOwner.mutation(api.orders.createReplayedCashSale, {
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
    expect(res.totalIDR).toBe(20000);
  });

  it('records the price it was rung at, not the current price', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    // Price rises during the outage.
    await s.asOwner.mutation(api.menu.items.update, {
      id: s.itemId,
      categoryId: s.categoryId,
      name: 'Kopi',
      priceIDR: 30000,
    });

    const res = await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-2',
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

    expect(res.totalIDR).toBe(20000);
    const recon = await t.run((ctx) => ctx.db.query('saleReconciliations').collect());
    expect(recon).toHaveLength(1);
    // Indexed access is `| undefined` under noUncheckedIndexedAccess; the
    // toHaveLength above is what actually pins the row's existence.
    const drift = recon[0];
    expect(drift?.kind).toBe('price_drift');
    // Line-level: qty 1 here, so the line total equals the unit price.
    expect(drift?.rungIDR).toBe(20000);
    expect(drift?.currentIDR).toBe(30000);
  });

  it('reports price drift at the LINE level, not per unit', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.items.update, {
      id: s.itemId,
      categoryId: s.categoryId,
      name: 'Kopi',
      priceIDR: 30000,
    });

    await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-qty3',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [
        {
          menuItemId: s.itemId,
          qty: 3,
          modifierOptionIds: [],
          nameSnapshot: 'Kopi',
          unitPriceIDR: 20000,
          lineTotalIDR: 60000,
        },
      ],
      discountIDR: 0,
      serviceChargeIDR: 0,
      taxIDR: 0,
      totalIDR: 60000,
      cashTenderedIDR: 60000,
      createdAtClient: Date.now(),
    });

    const recon = await t.run((ctx) => ctx.db.query('saleReconciliations').collect());
    expect(recon).toHaveLength(1);
    const drift = recon[0];
    expect(drift?.kind).toBe('price_drift');
    // 3 x 20 000 rung against 3 x 30 000 now — the whole line's cash impact,
    // not the 10 000 per-unit gap.
    expect(drift?.rungIDR).toBe(60000);
    expect(drift?.currentIDR).toBe(90000);
  });

  it('accepts a line whose modifier group became required during the outage', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    // Rung with no modifiers; the owner then attaches a group that demands one.
    const groupId = await s.asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Ukuran',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [{ name: 'Besar', priceAdjustmentIDR: 0, position: 100 }],
    });
    await s.asOwner.mutation(api.menu.itemGroups.attach, {
      menuItemId: s.itemId,
      modifierGroupId: groupId,
    });

    const res = await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-mod',
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

    expect(res.totalIDR).toBe(20000);
    const recon = await t.run((ctx) => ctx.db.query('saleReconciliations').collect());
    expect(recon.some((r) => r.kind === 'modifier_rule_changed')).toBe(true);
  });

  it('accepts a cash sale after cash was switched off during the outage', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.settings.updatePayment, {
      payment: {
        methods: {
          cash: false,
          qrisStatic: true,
          qrisDynamic: false,
          card: false,
          ewallet: false,
          transfer: false,
        },
        defaultMethod: 'qris_static',
        cashRounding: 'none',
        quickCashButtons: [20000, 50000, 100000],
        serviceChargeEnabled: false,
        serviceChargePct: 0,
        serviceChargeName: 'Biaya Layanan',
      },
    });

    const res = await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-cash-off',
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

    expect(res.totalIDR).toBe(20000);
    const recon = await t.run((ctx) => ctx.db.query('saleReconciliations').collect());
    expect(recon.some((r) => r.kind === 'payment_method_disabled')).toBe(true);
  });

  it('is idempotent — replaying the same clientId twice posts one order', async () => {
    // The single most important test in the feature. A retry after a timeout
    // must never charge the customer twice.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const args = {
      clientId: 'offline-3',
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
    };
    const a = await s.asOwner.mutation(api.orders.createReplayedCashSale, args);
    const b = await s.asOwner.mutation(api.orders.createReplayedCashSale, args);

    expect(b.orderId).toBe(a.orderId);
    const orders = await t.run((ctx) => ctx.db.query('orders').collect());
    expect(orders).toHaveLength(1);
  });

  it('accepts a line whose item was archived during the outage', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.items.archive, { id: s.itemId });

    const res = await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-4',
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

    expect(res.totalIDR).toBe(20000);
    const recon = await t.run((ctx) => ctx.db.query('saleReconciliations').collect());
    expect(recon.some((r) => r.kind === 'item_unavailable')).toBe(true);
  });

  it('settles the sale so it counts as paid revenue', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const res = await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-5',
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
    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    expect(order?.paymentStatus).toBe('paid');
  });
});
