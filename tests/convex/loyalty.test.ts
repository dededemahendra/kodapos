import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
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
