import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function seedOwner(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
  });
  await t
    .withIdentity({ subject: `${userId}|test_session` })
    .mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return userId;
}

describe('settings.get', () => {
  it('returns full defaults when no settings row exists', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    const s = await asOwner.query(api.settings.get);

    expect(s.payment.defaultMethod).toBe('cash');
    expect(s.payment.methods.cash).toBe(true);
    expect(s.payment.methods.qrisDynamic).toBe(false);
    expect(s.payment.cashRounding).toBe('none');
    expect(s.payment.quickCashButtons).toEqual([20000, 50000, 100000]);
    expect(s.payment.serviceChargeEnabled).toBe(false);

    expect(s.receipt.paperSize).toBe('80mm');
    expect(s.receipt.fontSize).toBe('normal');
    expect(s.receipt.autoPrint).toBe(false);
    expect(s.receipt.printCopies).toBe(1);
    expect(s.receipt.showLogo).toBe(true);

    expect(s.integrations).toEqual([]);
    expect(s.taxName).toBe('PB1');
    expect(s.taxInclusive).toBe(false);

    expect(s.taxRatePct).toBe(11);
    expect(s.taxEnabled).toBe(true);
  });

  it('throws when not authenticated', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.settings.get)).rejects.toThrow(/not authenticated/i);
  });

  it('merges a stored settings row over defaults', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    const cafeId = await t.run(async (ctx) => {
      const cafe = await ctx.db
        .query('cafes')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
        .first();
      return cafe!._id;
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('cafeSettings', {
        cafeId,
        receipt: {
          showLogo: false,
          showAddress: true,
          showPhone: true,
          showCashier: true,
          showOrderNumber: true,
          showItemModifiers: true,
          showTaxBreakdown: true,
          paperSize: '58mm',
          fontSize: 'large',
          autoPrint: true,
          printCopies: 2,
          printerType: 'usb',
          openDrawer: true,
        },
        taxName: 'PPN',
        updatedAt: 0,
      });
    });

    const s = await asOwner.query(api.settings.get);
    expect(s.receipt.paperSize).toBe('58mm');
    expect(s.receipt.printCopies).toBe(2);
    expect(s.taxName).toBe('PPN');
    expect(s.payment.defaultMethod).toBe('cash');
  });

  it('returns npwp only when stored, passing through empty string', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    const cafeId = await t.run(async (ctx) => {
      const cafe = await ctx.db
        .query('cafes')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
        .first();
      return cafe!._id;
    });

    // No npwp stored → key absent on the result.
    const before = await asOwner.query(api.settings.get);
    expect(before.npwp).toBeUndefined();

    // Stored npwp (including empty string) → passed through.
    await t.run(async (ctx) => {
      await ctx.db.insert('cafeSettings', { cafeId, npwp: '', updatedAt: 0 });
    });
    const after = await asOwner.query(api.settings.get);
    expect(after.npwp).toBe('');
  });
});
