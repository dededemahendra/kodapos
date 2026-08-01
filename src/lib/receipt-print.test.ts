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

  it('prints the price category name on its own line when the order carries one', () => {
    const text = decode(
      buildReceiptBytes(
        { ...order, priceCategoryName: 'Turis' },
        cafe,
        { widthChars: 32, orderNumber: 'INV-1A2B' }
      )
    );
    expect(text).toContain('Turis');
  });

  // Regression guard: most receipts have no price category. This must print
  // byte-for-byte identical to the pre-price-categories output, captured here
  // as a fixed reference so an unrelated change can't silently add a blank line.
  it('is byte-identical to before when the order has no price category', () => {
    const bytes = buildReceiptBytes(order, cafe, { widthChars: 32, orderNumber: 'INV-1A2B' });
    // prettier-ignore
    const expected = new Uint8Array([27,64,27,97,1,27,69,1,29,33,17,75,111,112,105,32,84,101,115,116,10,29,33,0,27,69,0,49,53,47,49,49,47,50,48,50,51,44,32,48,54,58,49,51,58,50,48,10,67,97,115,104,105,101,114,58,32,68,101,119,105,10,79,114,100,101,114,32,35,73,78,86,45,49,65,50,66,10,27,97,0,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,10,50,120,32,76,97,116,116,101,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,82,112,32,53,48,46,48,48,48,10,49,120,32,84,111,97,115,116,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,82,112,32,50,48,46,48,48,48,10,32,32,43,32,69,120,116,114,97,32,99,104,101,101,115,101,10,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,10,83,117,98,116,111,116,97,108,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,82,112,32,55,48,46,48,48,48,10,84,97,120,32,49,49,37,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,82,112,32,55,46,55,48,48,10,27,69,1,84,79,84,65,76,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,82,112,32,55,55,46,55,48,48,10,27,69,0,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,45,10,80,97,105,100,58,32,67,97,115,104,32,32,32,32,32,32,32,32,32,32,32,32,32,82,112,32,55,55,46,55,48,48,10,27,97,1,27,100,1,84,104,97,110,107,32,121,111,117,10,27,100,3,29,86,0]);
    expect(bytes).toEqual(expected);
  });
});
