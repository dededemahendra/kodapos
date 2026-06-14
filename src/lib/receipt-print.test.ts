import type { ReceiptCafe, ReceiptOrder } from 'convex/lib/receipt';
import { describe, expect, it } from 'vitest';
import { buildReceiptBytes } from './receipt-print';

const cafe: ReceiptCafe = { name: 'Kopi Test' };

const order: ReceiptOrder = {
  lines: [
    { nameSnapshot: 'Latte', qty: 2, lineTotalIDR: 50000, modifiersSnapshot: [] },
    {
      nameSnapshot: 'Toast',
      qty: 1,
      lineTotalIDR: 20000,
      modifiersSnapshot: [{ optionName: 'Extra cheese', priceAdjustmentIDR: 0 }],
    },
  ],
  subtotalIDR: 70000,
  discountIDR: 0,
  taxIDR: 7700,
  taxRatePct: 11,
  totalIDR: 77700,
  payments: [{ method: 'cash', amountIDR: 77700 }],
  createdAtClient: 1_700_000_000_000,
  cashierName: 'Dewi',
};

/** Decode the Latin-1 bytes back to a string for content assertions. */
function decode(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

describe('buildReceiptBytes', () => {
  it('starts with the printer init command', () => {
    const bytes = buildReceiptBytes(order, cafe, { widthChars: 32 });
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
  });

  it('includes the cafe name, items, total and footer', () => {
    const text = decode(buildReceiptBytes(order, cafe, { widthChars: 48 }));
    expect(text).toContain('Kopi Test');
    expect(text).toContain('Latte');
    expect(text).toContain('Extra cheese');
    expect(text).toContain('TOTAL');
    expect(text).toContain('Rp 77.700');
    expect(text).toContain('Thank you');
  });

  it('prints the order number and VOID banner when given', () => {
    const text = decode(
      buildReceiptBytes(order, cafe, { widthChars: 32, orderNumber: 'INV-1A2B', voided: true })
    );
    expect(text).toContain('Order #INV-1A2B');
    expect(text).toContain('** VOID **');
  });

  it('emits a cut, and a drawer kick only when requested', () => {
    const without = buildReceiptBytes(order, cafe, { widthChars: 32 });
    const withKick = buildReceiptBytes(order, cafe, { widthChars: 32, drawerKick: true });
    const hasKick = (b: Uint8Array) =>
      Array.from(b).some((_, i) => b[i] === 0x1b && b[i + 1] === 0x70);
    const hasCut = (b: Uint8Array) =>
      Array.from(b).some((_, i) => b[i] === 0x1d && b[i + 1] === 0x56);
    expect(hasCut(without)).toBe(true);
    expect(hasKick(without)).toBe(false);
    expect(hasKick(withKick)).toBe(true);
  });
});
