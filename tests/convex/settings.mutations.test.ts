import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { DEFAULT_SETTINGS } from '../../convex/settings';

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

// ---------------------------------------------------------------------------
// updatePayment
// ---------------------------------------------------------------------------
describe('settings.updatePayment', () => {
  it('persists payment changes and get returns the new values', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    const newPayment = {
      ...DEFAULT_SETTINGS.payment,
      defaultMethod: 'qris_static' as const,
      cashRounding: 'nearest_500' as const,
      methods: {
        ...DEFAULT_SETTINGS.payment.methods,
        qrisStatic: true,
        card: true,
      },
    };

    await asOwner.mutation(api.settings.updatePayment, { payment: newPayment });

    const s = await asOwner.query(api.settings.get);
    expect(s.payment.defaultMethod).toBe('qris_static');
    expect(s.payment.cashRounding).toBe('nearest_500');
    expect(s.payment.methods.card).toBe(true);
    // unchanged fields stay intact
    expect(s.payment.serviceChargeEnabled).toBe(false);
    expect(s.payment.quickCashButtons).toEqual([20000, 50000, 100000]);
  });

  it('creates a new settings row if none exists', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    // No row yet — mutation should create one
    await asOwner.mutation(api.settings.updatePayment, {
      payment: DEFAULT_SETTINGS.payment,
    });

    const s = await asOwner.query(api.settings.get);
    expect(s.payment.defaultMethod).toBe('cash');
  });
});

// ---------------------------------------------------------------------------
// updateReceipt
// ---------------------------------------------------------------------------
describe('settings.updateReceipt', () => {
  it('persists receipt changes and get returns the new values', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    const newReceipt = {
      ...DEFAULT_SETTINGS.receipt,
      paperSize: '58mm' as const,
      autoPrint: true,
    };

    await asOwner.mutation(api.settings.updateReceipt, { receipt: newReceipt });

    const s = await asOwner.query(api.settings.get);
    expect(s.receipt.paperSize).toBe('58mm');
    expect(s.receipt.autoPrint).toBe(true);
    // unchanged fields stay intact
    expect(s.receipt.showLogo).toBe(true);
    expect(s.receipt.printCopies).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// updateTaxPayment
// ---------------------------------------------------------------------------
describe('settings.updateTaxPayment', () => {
  it('updates cafe tax fields and settings extras', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await asOwner.mutation(api.settings.updateTaxPayment, {
      taxRatePct: 12,
      taxEnabled: false,
      taxName: 'PPN',
      taxInclusive: true,
      npwp: '01.234.567.8-901.000',
    });

    const s = await asOwner.query(api.settings.get);
    expect(s.taxRatePct).toBe(12);
    expect(s.taxEnabled).toBe(false);
    expect(s.taxName).toBe('PPN');
    expect(s.taxInclusive).toBe(true);
    expect(s.npwp).toBe('01.234.567.8-901.000');
  });

  it('trims whitespace from taxName and npwp', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await asOwner.mutation(api.settings.updateTaxPayment, {
      taxRatePct: 10,
      taxEnabled: true,
      taxName: '  PB1  ',
      taxInclusive: false,
      npwp: '  12.345  ',
    });

    const s = await asOwner.query(api.settings.get);
    expect(s.taxName).toBe('PB1');
    expect(s.npwp).toBe('12.345');
  });

  it('stores npwp as undefined when blank string passed', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await asOwner.mutation(api.settings.updateTaxPayment, {
      taxRatePct: 10,
      taxEnabled: true,
      taxName: 'PB1',
      taxInclusive: false,
      npwp: '   ',
    });

    const s = await asOwner.query(api.settings.get);
    expect(s.npwp).toBeUndefined();
  });

  it('rejects taxRatePct > 100 with a /pajak/i error', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await expect(
      asOwner.mutation(api.settings.updateTaxPayment, {
        taxRatePct: 150,
        taxEnabled: true,
        taxName: 'PPN',
        taxInclusive: false,
      })
    ).rejects.toThrow(/pajak/i);
  });

  it('rejects negative taxRatePct with a /pajak/i error', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await expect(
      asOwner.mutation(api.settings.updateTaxPayment, {
        taxRatePct: -1,
        taxEnabled: true,
        taxName: 'PPN',
        taxInclusive: false,
      })
    ).rejects.toThrow(/pajak/i);
  });
});

// ---------------------------------------------------------------------------
// connectIntegration / disconnectIntegration
// ---------------------------------------------------------------------------
describe('settings.connectIntegration / disconnectIntegration', () => {
  it('connectIntegration adds an entry with connected:true', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await asOwner.mutation(api.settings.connectIntegration, { key: 'gofood' });

    const s = await asOwner.query(api.settings.get);
    expect(s.integrations).toHaveLength(1);
    const first = s.integrations.at(0)!;
    expect(first.key).toBe('gofood');
    expect(first.connected).toBe(true);
  });

  it('connecting the same key again does NOT duplicate the entry', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await asOwner.mutation(api.settings.connectIntegration, { key: 'gofood' });
    await asOwner.mutation(api.settings.connectIntegration, { key: 'gofood' });

    const s = await asOwner.query(api.settings.get);
    expect(s.integrations).toHaveLength(1);
    expect(s.integrations.at(0)!.key).toBe('gofood');
  });

  it('disconnectIntegration removes the entry', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await asOwner.mutation(api.settings.connectIntegration, { key: 'gofood' });
    await asOwner.mutation(api.settings.disconnectIntegration, { key: 'gofood' });

    const s = await asOwner.query(api.settings.get);
    expect(s.integrations).toHaveLength(0);
  });

  it('connecting multiple keys keeps each entry distinct', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await asOwner.mutation(api.settings.connectIntegration, { key: 'gofood' });
    await asOwner.mutation(api.settings.connectIntegration, {
      key: 'grabfood',
      config: { merchantId: 'abc123' },
    });

    const s = await asOwner.query(api.settings.get);
    expect(s.integrations).toHaveLength(2);

    const grabfood = s.integrations.find((i) => i.key === 'grabfood');
    expect(grabfood?.config).toEqual({ merchantId: 'abc123' });

    // disconnect one, the other stays
    await asOwner.mutation(api.settings.disconnectIntegration, { key: 'gofood' });
    const s2 = await asOwner.query(api.settings.get);
    expect(s2.integrations).toHaveLength(1);
    expect(s2.integrations.at(0)!.key).toBe('grabfood');
  });

  it('disconnecting a key that does not exist is a no-op', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    // Should not throw
    await asOwner.mutation(api.settings.disconnectIntegration, { key: 'nonexistent' });

    const s = await asOwner.query(api.settings.get);
    expect(s.integrations).toHaveLength(0);
  });
});
