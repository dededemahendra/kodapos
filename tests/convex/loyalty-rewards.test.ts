import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'rw@x.com') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

/** Full POS setup (cafe + cashier + open shift + a 100k menu item) for a reward
 *  redemption cash sale. The item is priced so afterPromo comfortably exceeds the
 *  reward discount under test. */
async function setupSale(t: ReturnType<typeof convexTest>, email = 'rwsale@x.com') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  // createForOwner defaults to 11% PPN; disable it so reward math is clean (no tax).
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: 'Asia/Jakarta',
    taxRatePct: 0,
    taxEnabled: false,
  });
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Beans 1kg',
    priceIDR: 100000,
  });
  await asOwner.mutation(api.loyalty.updateConfig, {
    enabled: true,
    earnRatePerIDR: 1000,
    redeemBlockPoints: 100,
    redeemBlockIDR: 10000,
  });
  return { asOwner, cashierId, shiftId, itemId };
}

describe('loyaltyRewards CRUD', () => {
  it('create → list → update → archive', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.loyaltyRewards.create, {
      name: 'Free Latte',
      pointsCost: 120,
      discountIDR: 25000,
    });
    let rows = await asOwner.query(api.loyaltyRewards.list, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Free Latte');
    expect(rows[0]?.pointsCost).toBe(120);
    expect(rows[0]?.discountIDR).toBe(25000);
    expect(rows[0]?.archived).toBe(false);

    await asOwner.mutation(api.loyaltyRewards.update, {
      id,
      name: 'Free Cappuccino',
      pointsCost: 150,
      discountIDR: 30000,
    });
    rows = await asOwner.query(api.loyaltyRewards.list, {});
    expect(rows[0]?.name).toBe('Free Cappuccino');
    expect(rows[0]?.pointsCost).toBe(150);
    expect(rows[0]?.discountIDR).toBe(30000);

    await asOwner.mutation(api.loyaltyRewards.archive, { id });
    expect(await asOwner.query(api.loyaltyRewards.list, {})).toHaveLength(0);
    expect(await asOwner.query(api.loyaltyRewards.list, { includeArchived: true })).toHaveLength(1);
  });

  it('rejects bad name / pointsCost 0 / discountIDR 0', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.loyaltyRewards.create, { name: '  ', pointsCost: 100, discountIDR: 10000 })
    ).rejects.toThrow(/nama reward/i);
    await expect(
      asOwner.mutation(api.loyaltyRewards.create, { name: 'A', pointsCost: 0, discountIDR: 10000 })
    ).rejects.toThrow(/poin/i);
    await expect(
      asOwner.mutation(api.loyaltyRewards.create, { name: 'A', pointsCost: 100, discountIDR: 0 })
    ).rejects.toThrow(/diskon/i);
  });

  it('rejects updating/archiving a reward owned by another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwner(t, 'a@x.com');
    const { asOwner: ownerB } = await setupOwner(t, 'b@x.com');
    const foreign = await ownerA.mutation(api.loyaltyRewards.create, {
      name: 'A only',
      pointsCost: 100,
      discountIDR: 10000,
    });
    await expect(
      ownerB.mutation(api.loyaltyRewards.update, {
        id: foreign,
        name: 'Hijack',
        pointsCost: 50,
        discountIDR: 5000,
      })
    ).rejects.toThrow(/tidak ditemukan/i);
    await expect(
      ownerB.mutation(api.loyaltyRewards.archive, { id: foreign })
    ).rejects.toThrow(/tidak ditemukan/i);
  });
});

describe('loyaltyRewards.listForCustomer', () => {
  it('returns only rewards the customer can afford, sorted by pointsCost', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.loyaltyRewards.create, { name: 'Cheap', pointsCost: 100, discountIDR: 10000 });
    await asOwner.mutation(api.loyaltyRewards.create, { name: 'Pricey', pointsCost: 200, discountIDR: 20000 });
    const customerId = await asOwner.mutation(api.customers.create, { name: 'C', phone: '08120000001' });
    await asOwner.mutation(api.customers.adjustPoints, { id: customerId, points: 150 });
    const rows = await asOwner.query(api.loyaltyRewards.listForCustomer, { customerId });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Cheap');
    expect(rows[0]?.pointsCost).toBe(100);
  });
});

describe('reward redemption at checkout', () => {
  it('a reward deducts exactly its pointsCost + discounts exactly its discountIDR', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setupSale(t);
    const rewardId = await asOwner.mutation(api.loyaltyRewards.create, {
      name: 'Free Latte',
      pointsCost: 120,
      discountIDR: 25000,
    });
    const customerId = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111111' });
    await asOwner.mutation(api.customers.adjustPoints, { id: customerId, points: 200 });

    // Baseline: identical sale WITHOUT a reward → its totalIDR (100000, no tax).
    const baseline = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'reward-baseline',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 200000,
      createdAtClient: 1700000000000,
    });
    expect(baseline.totalIDR).toBe(100000);

    const res = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'reward-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 200000,
      customerId,
      redeemRewardId: rewardId,
      createdAtClient: 1700000001000,
    });
    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    expect(order?.pointsRedeemedIDR).toBe(25000);
    expect(order?.pointsRedeemed).toBe(120);
    expect(order?.discountIDR).toBe(25000);
    expect(order?.totalIDR).toBe(75000); // 100000 baseline - 25000
    expect(baseline.totalIDR - res.totalIDR).toBe(25000);

    // After settle: balance dropped by exactly 120 (200 - 120), and a redeem
    // loyaltyTransactions row exists for this order.
    const detail = await asOwner.query(api.customers.getDetail, { id: customerId });
    // earned = floor((100000 - 25000) / 1000) = 75; balance = 200 - 120 + 75 = 155.
    expect(detail?.pointsBalance).toBe(155);
    const redeemRows = await t.run((ctx) =>
      ctx.db
        .query('loyaltyTransactions')
        .withIndex('by_customer_at', (q) => q.eq('customerId', customerId as Id<'customers'>))
        .collect()
    );
    const redeem = redeemRows.filter((r) => r.orderId === res.orderId && r.type === 'redeem');
    expect(redeem).toHaveLength(1);
    expect(redeem[0]?.points).toBe(-120);
  });

  it('rejects a reward when the balance is below its pointsCost', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setupSale(t, 'rw-low@x.com');
    const rewardId = await asOwner.mutation(api.loyaltyRewards.create, {
      name: 'Free Latte',
      pointsCost: 120,
      discountIDR: 25000,
    });
    const customerId = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111112' });
    await asOwner.mutation(api.customers.adjustPoints, { id: customerId, points: 100 });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'reward-low',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 200000,
        customerId,
        redeemRewardId: rewardId,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/poin/i);
  });

  it('rejects a reward whose discountIDR exceeds afterPromo', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setupSale(t, 'rw-over@x.com');
    const rewardId = await asOwner.mutation(api.loyaltyRewards.create, {
      name: 'Huge',
      pointsCost: 100,
      discountIDR: 999999,
    });
    const customerId = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111113' });
    await asOwner.mutation(api.customers.adjustPoints, { id: customerId, points: 200 });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'reward-over',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 200000,
        customerId,
        redeemRewardId: rewardId,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/melebihi/i);
  });

  it('rejects combining a reward with free-form redeemPoints', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setupSale(t, 'rw-both@x.com');
    const rewardId = await asOwner.mutation(api.loyaltyRewards.create, {
      name: 'Free Latte',
      pointsCost: 120,
      discountIDR: 25000,
    });
    const customerId = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111114' });
    await asOwner.mutation(api.customers.adjustPoints, { id: customerId, points: 300 });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'reward-both',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 200000,
        customerId,
        redeemRewardId: rewardId,
        redeemPoints: 100,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow();
  });

  it('rejects a reward with no customer selected', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setupSale(t, 'rw-nocust@x.com');
    const rewardId = await asOwner.mutation(api.loyaltyRewards.create, {
      name: 'Free Latte',
      pointsCost: 120,
      discountIDR: 25000,
    });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'reward-nocust',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 200000,
        redeemRewardId: rewardId,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/pelanggan/i);
  });
});
