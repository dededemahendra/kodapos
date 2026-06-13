import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import {
  buildReceiptHtml,
  buildReceiptText,
  formatIDR,
  type ReceiptCafe,
  type ReceiptOrder,
} from '../../convex/lib/receipt';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

const cafe: ReceiptCafe = {
  name: 'Kopi Senja',
  addressLine: 'Jl. Merdeka 1',
  phone: '0812000111',
};

function sampleOrder(overrides: Partial<ReceiptOrder> = {}): ReceiptOrder {
  return {
    lines: [
      {
        nameSnapshot: 'Latte',
        variantName: 'Large',
        qty: 2,
        lineTotalIDR: 50000,
        modifiersSnapshot: [
          { groupName: 'Milk', optionName: 'Oat milk', priceAdjustmentIDR: 5000 },
        ],
      },
      {
        nameSnapshot: 'Croissant',
        qty: 1,
        lineTotalIDR: 20000,
        modifiersSnapshot: [],
      },
    ],
    subtotalIDR: 70000,
    discountIDR: 0,
    serviceChargeIDR: 3500,
    serviceChargeName: 'Service',
    serviceChargePct: 5,
    taxIDR: 8085,
    taxRatePct: 11,
    totalIDR: 81585,
    payments: [{ method: 'cash', amountIDR: 81585 }],
    pointsEarned: 81,
    createdAtClient: 1700000000000,
    cashierName: 'Andi',
    orderType: 'dine_in',
    ...overrides,
  };
}

describe('formatIDR', () => {
  it('formats with Rp prefix and thousands separators, no decimals', () => {
    expect(formatIDR(81585)).toBe('Rp 81.585');
    expect(formatIDR(0)).toBe('Rp 0');
    expect(formatIDR(-50000)).toBe('-Rp 50.000');
  });
});

describe('buildReceiptText', () => {
  it('renders item names, totals labels, the formatted total IDR, and a footer', () => {
    const text = buildReceiptText(sampleOrder(), cafe);
    expect(text).toContain('Kopi Senja');
    expect(text).toContain('Latte');
    expect(text).toContain('Croissant');
    expect(text).toContain('Oat milk');
    expect(text).toContain('Large');
    expect(text).toContain('Subtotal');
    expect(text).toContain('Service');
    expect(text).toContain('Tax');
    expect(text).toContain('Total');
    expect(text).toContain(formatIDR(81585));
    expect(text).toContain('Cashier: Andi');
    expect(text).toContain('Points earned: +81');
    expect(text).toContain('Thank you');
  });

  it('includes a REFUNDED line when refundedIDR > 0', () => {
    const text = buildReceiptText(sampleOrder({ refundedIDR: 20000 }), cafe);
    expect(text).toContain('REFUNDED');
    expect(text).toContain(formatIDR(20000));
  });

  it('contains no em-dash and no double-hyphen', () => {
    const text = buildReceiptText(sampleOrder({ refundedIDR: 20000, discountIDR: 5000 }), cafe);
    expect(text).not.toContain('—');
    expect(text).not.toContain('--');
  });

  it('works with a null cafe', () => {
    const text = buildReceiptText(sampleOrder(), null);
    expect(text).toContain('Total');
    expect(text).not.toContain('—');
    expect(text).not.toContain('--');
  });
});

describe('buildReceiptHtml', () => {
  it('returns a table with the total and no em-dash or double-hyphen', () => {
    const html = buildReceiptHtml(sampleOrder(), cafe);
    expect(html).toContain('<table');
    expect(html).toContain('<td');
    expect(html).toContain(formatIDR(81585));
    expect(html).not.toContain('—');
    expect(html).not.toContain('--');
  });
});

describe('email.sendReceipt', () => {
  it('throws "Email belum dikonfigurasi" when RESEND_API_KEY is unset (a valid email, a seeded paid order)', async () => {
    // RESEND_API_KEY is not set in the test env, so the action degrades.
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' })
    );
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
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
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });

    await expect(
      asOwner.action(api.email.sendReceipt, { orderId: sale.orderId, to: 'guest@example.com' })
    ).rejects.toThrow(/belum dikonfigurasi/i);
  });

  it('rejects an invalid email address', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert('users', { name: 'Owner', email: 'o2@x.com' })
    );
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
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
    const sale = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-2',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });

    await expect(
      asOwner.action(api.email.sendReceipt, { orderId: sale.orderId, to: 'not-an-email' })
    ).rejects.toThrow(/tidak valid/i);
  });
});
