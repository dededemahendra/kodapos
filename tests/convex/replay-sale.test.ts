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
    // The closed shift was counted and reconciled before this cash arrived, so
    // the owner has to be told the drawer moved after the fact.
    const recon = await t.run((ctx) => ctx.db.query('saleReconciliations').collect());
    const row = recon.find((r) => r.kind === 'shift_closed');
    expect(row).toBeDefined();
    expect(row?.detail).toBeTruthy();
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

  it('records a row for a variant archived during the outage', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const variantId = await s.asOwner.mutation(api.menu.variants.create, {
      menuItemId: s.itemId,
      name: 'Besar',
      priceIDR: 25000,
    });
    await s.asOwner.mutation(api.menu.variants.archive, { id: variantId });

    const res = await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-variant',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [
        {
          menuItemId: s.itemId,
          qty: 1,
          modifierOptionIds: [],
          variantId,
          nameSnapshot: 'Kopi Besar',
          unitPriceIDR: 25000,
          lineTotalIDR: 25000,
        },
      ],
      discountIDR: 0,
      serviceChargeIDR: 0,
      taxIDR: 0,
      totalIDR: 25000,
      cashTenderedIDR: 25000,
      createdAtClient: Date.now(),
    });

    expect(res.totalIDR).toBe(25000);
    const recon = await t.run((ctx) => ctx.db.query('saleReconciliations').collect());
    const row = recon.find((r) => r.kind === 'item_unavailable');
    expect(row).toBeDefined();
    // Distinguishable by a human from an item-level row on the same order.
    expect(row?.detail).toContain('Besar');
  });

  it('records a row for a modifier option archived during the outage', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const groupId = await s.asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Tambahan',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'Susu', priceAdjustmentIDR: 0, position: 100 }],
    });
    await s.asOwner.mutation(api.menu.itemGroups.attach, {
      menuItemId: s.itemId,
      modifierGroupId: groupId,
    });
    const optionId = await t.run(async (ctx) => {
      const option = await ctx.db
        .query('modifierOptions')
        .withIndex('by_group_active', (q) => q.eq('groupId', groupId).eq('archived', false))
        .first();
      if (!option) throw new Error('seed: modifier option not found');
      return option._id;
    });
    // No public mutation archives a single option in isolation (upsert reconciles
    // the whole option list), so drive the outage-time change directly.
    await t.run((ctx) => ctx.db.patch(optionId, { archived: true }));

    const res = await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-option',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [
        {
          menuItemId: s.itemId,
          qty: 1,
          modifierOptionIds: [optionId],
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
    const row = recon.find((r) => r.kind === 'item_unavailable');
    expect(row).toBeDefined();
    expect(row?.detail).toContain('Susu');
  });

  it('records a row for a modifier group detached during the outage', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const groupId = await s.asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Tambahan',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'Susu', priceAdjustmentIDR: 0, position: 100 }],
    });
    await s.asOwner.mutation(api.menu.itemGroups.attach, {
      menuItemId: s.itemId,
      modifierGroupId: groupId,
    });
    const optionId = await t.run(async (ctx) => {
      const option = await ctx.db
        .query('modifierOptions')
        .withIndex('by_group_active', (q) => q.eq('groupId', groupId).eq('archived', false))
        .first();
      if (!option) throw new Error('seed: modifier option not found');
      return option._id;
    });
    await s.asOwner.mutation(api.menu.itemGroups.detach, {
      menuItemId: s.itemId,
      modifierGroupId: groupId,
    });

    const res = await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-detached',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [
        {
          menuItemId: s.itemId,
          qty: 1,
          modifierOptionIds: [optionId],
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
    const row = recon.find((r) => r.kind === 'modifier_rule_changed');
    expect(row).toBeDefined();
    expect(row?.detail).toContain('Tambahan');
  });

  it('does not duplicate reconciliation rows when a drifted sale is replayed twice', async () => {
    // The plain idempotency test above rings at the current price, so it produces
    // no rows and would stay green even with the guard deleted. This one drifts
    // first, so the `if (!already)` guard is the only thing keeping the count at 1.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.items.update, {
      id: s.itemId,
      categoryId: s.categoryId,
      name: 'Kopi',
      priceIDR: 30000,
    });
    const args = {
      clientId: 'offline-dupe-drift',
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
    const recon = await t.run((ctx) => ctx.db.query('saleReconciliations').collect());
    expect(recon).toHaveLength(1);
    expect(recon[0]?.kind).toBe('price_drift');
  });

  it('still rejects an item belonging to another cafe', async () => {
    // The tenancy check is the one guard deliberately NOT relaxed under replay.
    // A forged payload must not be able to post another tenant's menu item.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const other = await setup(t, { email: 'other@x.com' });

    await expect(
      s.asOwner.mutation(api.orders.createReplayedCashSale, {
        clientId: 'offline-foreign',
        shiftId: s.shiftId,
        cashierId: s.cashierId,
        lines: [
          {
            menuItemId: other.itemId,
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
      })
    ).rejects.toThrow(/tidak tersedia/i);

    const orders = await t.run((ctx) => ctx.db.query('orders').collect());
    expect(orders).toHaveLength(0);
  });

  it('accepts a sale whose cashier was archived during the outage', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    // The real sequence, and why staff.archive refuses otherwise: the shift is
    // closed at end of day and the cashier who quit is archived right after.
    await s.asOwner.mutation(api.shifts.close, { id: s.shiftId, countedCashIDR: 0 });
    await s.asOwner.mutation(api.staff.archive, { id: s.cashierId });

    const res = await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-cashier',
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
    const row = recon.find((r) => r.kind === 'cashier_archived');
    expect(row).toBeDefined();
    expect(row?.detail).toContain('Andi');
  });

  it('accepts a sale whose price category was archived during the outage', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const priceCategoryId = await s.asOwner.mutation(api.menu.priceCategories.create, {
      name: 'Turis',
    });
    await s.asOwner.mutation(api.menu.priceCategories.archive, { id: priceCategoryId });

    const res = await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-tier',
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
      priceCategoryId,
    });

    expect(res.totalIDR).toBe(20000);
    const recon = await t.run((ctx) => ctx.db.query('saleReconciliations').collect());
    const row = recon.find((r) => r.kind === 'price_category_archived');
    expect(row).toBeDefined();
    expect(row?.detail).toContain('Turis');
  });

  it('rejects a non-integer amount from the till', async () => {
    // An offline till computing tax itself has no reason to land on a whole
    // rupiah: 24 990 x 11% is 2748.9. The online path never produces this
    // because computeOrderTotals rounds; the replay path takes the number as
    // given, so it has to be gated here. Trusting the till's arithmetic never
    // meant trusting that the bytes are well-formed rupiah.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    // Computed, not a literal, so the value under test is the one the till
    // would actually produce. Asserted non-integer so this test can never
    // quietly stop testing anything.
    const taxIDR = 24990 * 0.11;
    expect(Number.isInteger(taxIDR)).toBe(false);
    await expect(
      s.asOwner.mutation(api.orders.createReplayedCashSale, {
        clientId: 'offline-float',
        shiftId: s.shiftId,
        cashierId: s.cashierId,
        lines: [
          {
            menuItemId: s.itemId,
            qty: 1,
            modifierOptionIds: [],
            nameSnapshot: 'Kopi',
            unitPriceIDR: 24990,
            lineTotalIDR: 24990,
          },
        ],
        discountIDR: 0,
        serviceChargeIDR: 0,
        taxIDR,
        totalIDR: 24990 + taxIDR,
        cashTenderedIDR: 30000,
        createdAtClient: Date.now(),
      })
    ).rejects.toThrow(/bulat/i);
    expect(await t.run((ctx) => ctx.db.query('orders').collect())).toHaveLength(0);
  });

  it('rejects a negative total from the till', async () => {
    // Would otherwise clear the funds check and pay out change.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await expect(
      s.asOwner.mutation(api.orders.createReplayedCashSale, {
        clientId: 'offline-negative',
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
        totalIDR: -5000,
        cashTenderedIDR: 0,
        createdAtClient: Date.now(),
      })
    ).rejects.toThrow(/negatif/i);
    expect(await t.run((ctx) => ctx.db.query('orders').collect())).toHaveLength(0);
  });

  it('rejects a line whose total is not qty x unit price', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await expect(
      s.asOwner.mutation(api.orders.createReplayedCashSale, {
        clientId: 'offline-bad-line',
        shiftId: s.shiftId,
        cashierId: s.cashierId,
        lines: [
          {
            menuItemId: s.itemId,
            qty: 2,
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
      })
    ).rejects.toThrow(/jumlah dikali harga satuan/i);
    expect(await t.run((ctx) => ctx.db.query('orders').collect())).toHaveLength(0);
  });

  it('rejects a total that does not match its own line items', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await expect(
      s.asOwner.mutation(api.orders.createReplayedCashSale, {
        clientId: 'offline-inconsistent',
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
        totalIDR: 0,
        cashTenderedIDR: 0,
        createdAtClient: Date.now(),
      })
    ).rejects.toThrow(/tidak cocok dengan rinciannya/i);
    expect(await t.run((ctx) => ctx.db.query('orders').collect())).toHaveLength(0);
  });

  /**
   * Gives the item a one-ingredient recipe and sets the ingredient's stock, so
   * a replay can be made to drive it below zero on demand.
   */
  async function withRecipe(s: Setup, opts: { stock: number; perDrink: number }) {
    const ingredientId = await s.asOwner.mutation(api.ingredients.upsert, {
      name: 'Susu UHT',
      canonicalUnit: 'ml',
      reorderThreshold: 0,
      lastCostPerUnitIDR: 100,
    });
    await s.asOwner.mutation(api.recipes.upsert, {
      menuItemId: s.itemId,
      lines: [{ ingredientId, qty: opts.perDrink, wastageFactor: 1 }],
    });
    if (opts.stock > 0) {
      await s.asOwner.mutation(api.ingredients.adjustStock, {
        ingredientId,
        newQty: opts.stock,
        reasonLabel: 'Stok awal',
      });
    }
    return ingredientId;
  }

  async function replayTwoDrinks(s: Setup, clientId: string) {
    return await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId,
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [
        {
          menuItemId: s.itemId,
          qty: 2,
          modifierOptionIds: [],
          nameSnapshot: 'Kopi',
          unitPriceIDR: 20000,
          lineTotalIDR: 40000,
        },
      ],
      discountIDR: 0,
      serviceChargeIDR: 0,
      taxIDR: 0,
      totalIDR: 40000,
      cashTenderedIDR: 40000,
      createdAtClient: Date.now(),
    });
  }

  it('flags an ingredient the replay drove below zero', async () => {
    // `settleSale` posts the inventory deduction unconditionally, and that is
    // correct: the coffee was made and handed over during the outage, so the
    // milk is gone whether or not the books said there was any. What the spec
    // requires — and what was missing — is that the owner be TOLD which
    // ingredient went negative, instead of finding out at the next stock take.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    // 150ml on hand, two coffees at 100ml each: 50ml short.
    await withRecipe(s, { stock: 150, perDrink: 100 });

    await replayTwoDrinks(s, 'offline-negative-stock');

    const recon = await t.run((ctx) => ctx.db.query('saleReconciliations').collect());
    const row = recon.find((r) => r.kind === 'negative_stock');
    expect(row).toBeDefined();
    // Named, because "some ingredient is negative" is not actionable.
    expect(row?.detail).toContain('Susu UHT');
    expect(row?.detail).toContain('-50');
  });

  it('does not flag a replay the stock covered', async () => {
    // The other half of the assertion: a row on every replay with a recipe
    // would be noise, and noise is how a real discrepancy gets ignored.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await withRecipe(s, { stock: 500, perDrink: 100 });

    await replayTwoDrinks(s, 'offline-stock-ok');

    const recon = await t.run((ctx) => ctx.db.query('saleReconciliations').collect());
    expect(recon.filter((r) => r.kind === 'negative_stock')).toHaveLength(0);
  });

  it('surfaces the negative-stock row in the reconciliation view', async () => {
    // The spec names `negative_stock` as one of the kinds the reconciliation
    // report must surface; the row is worthless if it cannot be read back out.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await withRecipe(s, { stock: 0, perDrink: 100 });

    await replayTwoDrinks(s, 'offline-negative-stock-2');

    const rows = await s.asOwner.query(api.reconciliation.listOpen, {});
    expect(rows.some((r) => r.kind === 'negative_stock')).toBe(true);
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
