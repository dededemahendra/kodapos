import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { earnMultiplierFor, nextTierFor, tierFor } from '../../convex/lib/loyalty';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

/** Full POS setup (cafe + cashier + open shift + menu item) for a customer earn-path sale. */
async function setupSale(t: ReturnType<typeof convexTest>, email = 'sale@x.com') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 50000,
  });
  return { asOwner, cashierId, shiftId, itemId };
}

describe('loyalty config', () => {
  it('returns defaults when unset, then persists updates', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const cfg = await asOwner.query(api.loyalty.getConfig, {});
    expect(cfg).toEqual({ enabled: false, earnRatePerIDR: 1000, redeemBlockPoints: 100, redeemBlockIDR: 10000 });
    await asOwner.mutation(api.loyalty.updateConfig, {
      enabled: true, earnRatePerIDR: 1000, redeemBlockPoints: 100, redeemBlockIDR: 5000,
    });
    expect((await asOwner.query(api.loyalty.getConfig, {})).redeemBlockIDR).toBe(5000);
  });

  it('rejects non-positive numeric config', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.loyalty.updateConfig, {
        enabled: true, earnRatePerIDR: 0, redeemBlockPoints: 100, redeemBlockIDR: 10000,
      })
    ).rejects.toThrow();
  });

  it('rejects non-positive redeem block values', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.loyalty.updateConfig, {
        enabled: true, earnRatePerIDR: 1000, redeemBlockPoints: 0, redeemBlockIDR: 10000,
      })
    ).rejects.toThrow();
    await expect(
      asOwner.mutation(api.loyalty.updateConfig, {
        enabled: true, earnRatePerIDR: 1000, redeemBlockPoints: 100, redeemBlockIDR: 0,
      })
    ).rejects.toThrow();
  });
});

describe('loyalty stats', () => {
  it('counts members + outstanding points + top customers', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const a = await asOwner.mutation(api.customers.create, { name: 'A', phone: '08120000001' });
    await asOwner.mutation(api.customers.create, { name: 'B', phone: '08120000002' });
    await asOwner.mutation(api.customers.adjustPoints, { id: a, points: 300 });
    const stats = await asOwner.query(api.loyalty.stats, {});
    expect(stats.memberCount).toBe(2);
    expect(stats.pointsOutstanding).toBe(300);
    expect(stats.topCustomers[0]?.name).toBe('A');
    expect(stats.topCustomers[0]?.pointsBalance).toBe(300);
  });
});

describe('loyalty tier helpers', () => {
  const tiers = [
    { name: 'Silver', minSpendIDR: 50000, earnMultiplier: 1.5 },
    { name: 'Gold', minSpendIDR: 100000, earnMultiplier: 2 },
  ];

  it('tierFor: below all thresholds → null', () => {
    expect(tierFor(49999, tiers)).toBeNull();
  });

  it('tierFor: exactly at threshold → in that tier', () => {
    expect(tierFor(50000, tiers)?.name).toBe('Silver');
  });

  it('tierFor: highest eligible tier wins', () => {
    expect(tierFor(150000, tiers)?.name).toBe('Gold');
  });

  it('tierFor: no tiers → null', () => {
    expect(tierFor(999999, undefined)).toBeNull();
    expect(tierFor(999999, [])).toBeNull();
  });

  it('earnMultiplierFor: tier multiplier, else 1', () => {
    expect(earnMultiplierFor(100000, tiers)).toBe(2);
    expect(earnMultiplierFor(50000, tiers)).toBe(1.5);
    expect(earnMultiplierFor(0, tiers)).toBe(1);
    expect(earnMultiplierFor(100000, undefined)).toBe(1);
  });

  it('nextTierFor: lowest tier strictly above spend; null at top', () => {
    expect(nextTierFor(0, tiers)?.name).toBe('Silver');
    expect(nextTierFor(50000, tiers)?.name).toBe('Gold');
    expect(nextTierFor(100000, tiers)).toBeNull();
    expect(nextTierFor(0, undefined)).toBeNull();
  });
});

describe('loyalty tier config persistence + validation', () => {
  const base = { enabled: true, earnRatePerIDR: 1000, redeemBlockPoints: 100, redeemBlockIDR: 10000 };

  it('persists tiers, stored sorted by minSpendIDR asc', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.loyalty.updateConfig, {
      ...base,
      tiers: [
        { name: 'Gold', minSpendIDR: 100000, earnMultiplier: 2 },
        { name: 'Silver', minSpendIDR: 50000, earnMultiplier: 1.5 },
      ],
    });
    const cfg = await asOwner.query(api.loyalty.getConfig, {});
    expect(cfg.tiers).toEqual([
      { name: 'Silver', minSpendIDR: 50000, earnMultiplier: 1.5 },
      { name: 'Gold', minSpendIDR: 100000, earnMultiplier: 2 },
    ]);
  });

  it('rejects earnMultiplier < 1', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.loyalty.updateConfig, {
        ...base,
        tiers: [{ name: 'Gold', minSpendIDR: 100000, earnMultiplier: 0.5 }],
      })
    ).rejects.toThrow();
  });

  it('rejects earnMultiplier > 10', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.loyalty.updateConfig, {
        ...base,
        tiers: [{ name: 'Gold', minSpendIDR: 100000, earnMultiplier: 11 }],
      })
    ).rejects.toThrow();
  });

  it('rejects negative minSpendIDR', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.loyalty.updateConfig, {
        ...base,
        tiers: [{ name: 'Gold', minSpendIDR: -1, earnMultiplier: 2 }],
      })
    ).rejects.toThrow();
  });

  it('rejects duplicate minSpendIDR thresholds', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.loyalty.updateConfig, {
        ...base,
        tiers: [
          { name: 'Gold', minSpendIDR: 100000, earnMultiplier: 2 },
          { name: 'Plat', minSpendIDR: 100000, earnMultiplier: 3 },
        ],
      })
    ).rejects.toThrow('Ambang tier tidak boleh sama.');
  });
});

describe('loyalty earn multiplier at checkout', () => {
  async function earnOnSale(t: ReturnType<typeof convexTest>, totalSpentIDR: number) {
    const { asOwner, cashierId, shiftId, itemId } = await setupSale(t);
    await asOwner.mutation(api.loyalty.updateConfig, {
      enabled: true,
      earnRatePerIDR: 1000,
      redeemBlockPoints: 100,
      redeemBlockIDR: 10000,
      tiers: [{ name: 'Gold', minSpendIDR: 100000, earnMultiplier: 2 }],
    });
    const customerId = await asOwner.mutation(api.customers.create, {
      name: 'C',
      phone: '08120000009',
    });
    // Seed the customer's pre-order lifetime spend directly.
    await t.run((ctx) => ctx.db.patch(customerId as Id<'customers'>, { totalSpentIDR }));
    const res = await asOwner.mutation(api.orders.createCashSale, {
      clientId: `earn-${totalSpentIDR}`,
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      customerId,
      cashTenderedIDR: 100000,
      createdAtClient: 1700000000000,
    });
    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    const customer = await t.run((ctx) => ctx.db.get(customerId as Id<'customers'>));
    return {
      asOwner,
      orderId: res.orderId,
      customerId: customerId as Id<'customers'>,
      earned: order?.pointsEarned ?? 0,
      balance: customer?.pointsBalance ?? 0,
    };
  }

  it('customer at/above threshold earns 2× pointsEarned', async () => {
    const t = convexTest(schema, modules);
    // base: 50000 / 1000 = 50 points; ×2 = 100.
    const r = await earnOnSale(t, 100000);
    expect(r.earned).toBe(100);
    expect(r.balance).toBe(100);
  });

  it('customer below threshold earns 1×', async () => {
    const t = convexTest(schema, modules);
    const r = await earnOnSale(t, 99999);
    expect(r.earned).toBe(50);
    expect(r.balance).toBe(50);
  });

  it('void reverses the multiplied pointsEarned exactly', async () => {
    const t = convexTest(schema, modules);
    const r = await earnOnSale(t, 100000); // earns 100; pre-order balance was 0
    expect(r.balance).toBe(100);
    await r.asOwner.mutation(api.orders.voidSale, { orderId: r.orderId });
    const customer = await t.run((ctx) => ctx.db.get(r.customerId));
    expect(customer?.pointsBalance).toBe(0);
  });
});
