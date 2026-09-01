import { computeOrderTotals } from 'convex/lib/pricing';
import { describe, expect, it } from 'vitest';
import {
  buildOfflineReceiptOrder,
  buildReplayPayload,
  changeIDROf,
  type OfflineSaleInput,
  type OfflineSaleLine,
  type RegisterCartLine,
  subtotalIDROf,
  toOfflineSaleLines,
} from '~/lib/offline/sale-payload';

// A latte with two paid modifiers, priced the way the register prices it:
// `modifier-picker-dialog.tsx` stores `basePrice + sum(priceAdjustmentIDR)` in
// the line's unitPriceIDR, which is the same convention `convex/lib/sale.ts`
// uses (`basePrice + modifierAdjustments`).
const BASE_PRICE = 25_000;
const EXTRA_SHOT = 5_000;
const OAT_MILK = 4_000;
const MODIFIER_INCLUSIVE_UNIT_PRICE = BASE_PRICE + EXTRA_SHOT + OAT_MILK; // 34_000

const line = (over: Partial<OfflineSaleLine> = {}): OfflineSaleLine => ({
  menuItemId: 'item1',
  nameSnapshot: 'Latte',
  qty: 2,
  unitPriceIDR: MODIFIER_INCLUSIVE_UNIT_PRICE,
  modifierOptionIds: ['opt1', 'opt2'],
  modifierLabels: [
    { groupName: 'Espresso', optionName: 'Extra shot', priceAdjustmentIDR: EXTRA_SHOT },
    { groupName: 'Susu', optionName: 'Oat', priceAdjustmentIDR: OAT_MILK },
  ],
  ...over,
});

const input = (over: Partial<OfflineSaleInput> = {}): OfflineSaleInput => {
  const lines = over.lines ?? [line()];
  const subtotalIDR = subtotalIDROf(lines);
  return {
    clientId: 'client-1',
    shiftId: 'shift1',
    cashierId: 'staff1',
    lines,
    orderType: 'dine_in',
    discountIDR: 0,
    serviceChargeIDR: 0,
    taxIDR: 0,
    totalIDR: subtotalIDR,
    cashTenderedIDR: subtotalIDR,
    createdAtClient: 1_700_000_000_000,
    ...over,
  };
};

function payloadOf(over: Partial<OfflineSaleInput> = {}) {
  const built = buildReplayPayload(input(over));
  if (!built.ok) throw new Error(`expected a payload, got rejection: ${built.reason}`);
  return built.payload;
}

describe('buildReplayPayload — the modifier-inclusive convention', () => {
  it('keeps the cart unit price as-is, modifiers already folded in', () => {
    // The single check this whole module exists for. The server asserts
    // lineTotalIDR === qty * unitPriceIDR per line, and its own convention
    // (convex/lib/sale.ts) is unitPriceIDR = basePrice + modifier adjustments.
    // A payload built from the bare base price would be rejected forever.
    const [built] = payloadOf().lines;
    expect(built?.unitPriceIDR).toBe(MODIFIER_INCLUSIVE_UNIT_PRICE);
    expect(built?.unitPriceIDR).not.toBe(BASE_PRICE);
  });

  it('derives lineTotalIDR from that same unit price, so the server assertion holds', () => {
    const [built] = payloadOf().lines;
    expect(built?.lineTotalIDR).toBe(2 * MODIFIER_INCLUSIVE_UNIT_PRICE);
    expect(built?.lineTotalIDR).toBe((built?.qty ?? 0) * (built?.unitPriceIDR ?? 0));
  });

  it('satisfies the server assertion on every line of a mixed cart', () => {
    const lines = [
      line(),
      line({ menuItemId: 'item2', qty: 1, unitPriceIDR: 18_000, modifierOptionIds: [] }),
      line({ menuItemId: 'item3', qty: 3, unitPriceIDR: 7_500, variantId: 'var1' }),
    ];
    for (const built of payloadOf({
      lines,
      totalIDR: subtotalIDROf(lines),
      cashTenderedIDR: subtotalIDROf(lines),
    }).lines) {
      expect(built.lineTotalIDR).toBe(built.qty * built.unitPriceIDR);
    }
  });

  it('carries the ids and names the replay mutation needs', () => {
    const payload = payloadOf({ promoId: 'promo1', priceCategoryId: 'pc1' });
    expect(payload.clientId).toBe('client-1');
    expect(payload.shiftId).toBe('shift1');
    expect(payload.cashierId).toBe('staff1');
    expect(payload.promoId).toBe('promo1');
    expect(payload.priceCategoryId).toBe('pc1');
    expect(payload.orderType).toBe('dine_in');
    expect(payload.lines[0]?.nameSnapshot).toBe('Latte');
    expect(payload.lines[0]?.modifierOptionIds).toEqual(['opt1', 'opt2']);
  });

  it('omits absent optional ids rather than sending undefined', () => {
    const payload = payloadOf();
    expect('promoId' in payload).toBe(false);
    expect('priceCategoryId' in payload).toBe(false);
    expect('variantId' in (payload.lines[0] ?? {})).toBe(false);
  });

  it('keeps the variant id when the line has one', () => {
    const payload = payloadOf({ lines: [line({ variantId: 'var1' })] });
    expect(payload.lines[0]?.variantId).toBe('var1');
  });
});

describe('buildReplayPayload — totals the server will re-check', () => {
  it('accepts totals produced by the shared pricing helper', () => {
    // computeOrderTotals is what the register itself uses, so the payload it
    // produces must satisfy the mutation's
    // total === subtotal - discount + serviceCharge + tax check.
    const lines = [line()];
    const subtotalIDR = subtotalIDROf(lines);
    const discountIDR = 5_000;
    const { serviceChargeIDR, taxIDR, totalIDR } = computeOrderTotals({
      subtotalIDR,
      discountIDR,
      serviceChargeEnabled: true,
      serviceChargePct: 5,
      taxEnabled: true,
      taxRatePct: 11,
    });
    const payload = payloadOf({
      lines,
      discountIDR,
      serviceChargeIDR,
      taxIDR,
      totalIDR,
      cashTenderedIDR: 100_000,
    });
    const subtotalFromPayload = payload.lines.reduce((s, l) => s + l.lineTotalIDR, 0);
    expect(
      subtotalFromPayload - payload.discountIDR + payload.serviceChargeIDR + payload.taxIDR
    ).toBe(payload.totalIDR);
  });

  it('refuses a total that does not match its own breakdown', () => {
    expect(buildReplayPayload(input({ totalIDR: 1, cashTenderedIDR: 1 }))).toEqual({
      ok: false,
      reason: 'totals_mismatch',
    });
  });

  it('refuses fractional money before it can persist as 2200.0000000000003', () => {
    expect(buildReplayPayload(input({ taxIDR: 2200.5 }))).toEqual({
      ok: false,
      reason: 'non_integer_money',
    });
  });

  it('refuses negative money', () => {
    expect(buildReplayPayload(input({ discountIDR: -1 }))).toEqual({
      ok: false,
      reason: 'non_integer_money',
    });
  });

  it('refuses a fractional unit price', () => {
    expect(buildReplayPayload(input({ lines: [line({ unitPriceIDR: 33_333.5 })] }))).toEqual({
      ok: false,
      reason: 'non_integer_money',
    });
  });

  it('refuses an empty cart', () => {
    expect(buildReplayPayload(input({ lines: [] }))).toEqual({ ok: false, reason: 'empty_cart' });
  });

  it('refuses a qty the server would reject', () => {
    for (const qty of [0, -1, 100, 1.5]) {
      expect(buildReplayPayload(input({ lines: [line({ qty })] })).ok).toBe(false);
    }
  });

  it('refuses tendering less than the total', () => {
    expect(buildReplayPayload(input({ cashTenderedIDR: 1_000 }))).toEqual({
      ok: false,
      reason: 'insufficient_cash',
    });
  });
});

describe('buildOfflineReceiptOrder', () => {
  const meta = { cashierName: 'Ayu', taxRatePct: 11 };

  it('prints the same money the payload queues', () => {
    const sale = input({ discountIDR: 4_000, taxIDR: 6_600, totalIDR: 70_600 });
    const receipt = buildOfflineReceiptOrder(sale, meta);
    const payload = payloadOf({
      discountIDR: 4_000,
      taxIDR: 6_600,
      totalIDR: 70_600,
      cashTenderedIDR: 100_000,
    });
    expect(receipt.subtotalIDR).toBe(subtotalIDROf(sale.lines));
    expect(receipt.totalIDR).toBe(payload.totalIDR);
    expect(receipt.lines[0]?.lineTotalIDR).toBe(payload.lines[0]?.lineTotalIDR);
  });

  it('keeps the modifier lines the cashier read out to the customer', () => {
    const receipt = buildOfflineReceiptOrder(input(), meta);
    expect(receipt.lines[0]?.modifiersSnapshot.map((m) => m.optionName)).toEqual([
      'Extra shot',
      'Oat',
    ]);
  });

  it('records the sale as a single cash payment', () => {
    const receipt = buildOfflineReceiptOrder(input(), meta);
    expect(receipt.payments).toEqual([{ method: 'cash', amountIDR: receipt.totalIDR }]);
  });

  it('omits the service charge block when none was charged', () => {
    const receipt = buildOfflineReceiptOrder(input(), meta);
    expect('serviceChargeIDR' in receipt).toBe(false);
  });

  it('includes the service charge with its owner-set name when there is one', () => {
    const sale = input({ serviceChargeIDR: 3_400, totalIDR: subtotalIDROf([line()]) + 3_400 });
    const receipt = buildOfflineReceiptOrder(sale, {
      ...meta,
      serviceChargeName: 'Biaya Layanan',
      serviceChargePct: 5,
    });
    expect(receipt.serviceChargeIDR).toBe(3_400);
    expect(receipt.serviceChargeName).toBe('Biaya Layanan');
    expect(receipt.serviceChargePct).toBe(5);
  });
});

describe('changeIDROf', () => {
  it('is the difference the cashier hands back', () => {
    expect(changeIDROf({ cashTenderedIDR: 100_000, totalIDR: 68_000 })).toBe(32_000);
  });

  it('never goes negative', () => {
    expect(changeIDROf({ cashTenderedIDR: 1_000, totalIDR: 68_000 })).toBe(0);
  });
});

describe('toOfflineSaleLines — the cart mapping itself', () => {
  // The seam the payload builder's tests cannot reach: `sale-payload`'s own
  // checks all start from an already-mapped line, so a mapping that handed over
  // a bare base price would satisfy every one of them and still dead-letter the
  // sale on replay. These tests cover the copy itself.
  const cartLine = (over: Partial<RegisterCartLine> = {}): RegisterCartLine => ({
    menuItemId: 'item1',
    nameSnapshot: 'Latte',
    qty: 2,
    // What modifier-picker-dialog puts on the line: base + every adjustment.
    unitPriceIDR: MODIFIER_INCLUSIVE_UNIT_PRICE,
    modifierOptionIds: ['opt1', 'opt2'],
    modifierLabels: [
      { groupName: 'Espresso', optionName: 'Extra shot', priceAdjustmentIDR: EXTRA_SHOT },
      { groupName: 'Susu', optionName: 'Oat', priceAdjustmentIDR: OAT_MILK },
    ],
    ...over,
  });

  it('carries the modifier-inclusive unit price across untouched', () => {
    const [mapped] = toOfflineSaleLines([cartLine()]);
    expect(mapped?.unitPriceIDR).toBe(MODIFIER_INCLUSIVE_UNIT_PRICE);
    // Not the base price, and not the base price with the modifiers added a
    // second time — the two ways this mapping could go wrong.
    expect(mapped?.unitPriceIDR).not.toBe(BASE_PRICE);
    expect(mapped?.unitPriceIDR).not.toBe(MODIFIER_INCLUSIVE_UNIT_PRICE + EXTRA_SHOT + OAT_MILK);
  });

  it('produces lines whose totals satisfy the server assertion once built', () => {
    const lines = toOfflineSaleLines([
      cartLine(),
      cartLine({ menuItemId: 'item2', qty: 1, unitPriceIDR: 18_000, modifierOptionIds: [] }),
      cartLine({ menuItemId: 'item3', qty: 3, unitPriceIDR: 7_500, variantId: 'var1' }),
    ]);
    const subtotalIDR = subtotalIDROf(lines);
    const built = buildReplayPayload(
      input({ lines, totalIDR: subtotalIDR, cashTenderedIDR: subtotalIDR })
    );
    if (!built.ok) throw new Error(`expected a payload, got rejection: ${built.reason}`);
    for (const l of built.payload.lines) {
      expect(l.lineTotalIDR).toBe(l.qty * l.unitPriceIDR);
    }
    // And the modifier-carrying line specifically: 2 x 34_000, not 2 x 25_000.
    expect(built.payload.lines[0]?.lineTotalIDR).toBe(2 * MODIFIER_INCLUSIVE_UNIT_PRICE);
  });

  it('keeps the name, ids and modifier labels the receipt needs', () => {
    const [mapped] = toOfflineSaleLines([cartLine({ variantId: 'var1', variantName: 'L' })]);
    expect(mapped?.nameSnapshot).toBe('Latte');
    expect(mapped?.menuItemId).toBe('item1');
    expect(mapped?.variantId).toBe('var1');
    expect(mapped?.variantName).toBe('L');
    expect(mapped?.modifierOptionIds).toEqual(['opt1', 'opt2']);
    expect(mapped?.modifierLabels.map((m) => m.optionName)).toEqual(['Extra shot', 'Oat']);
  });

  it('omits absent variant fields rather than mapping them to undefined', () => {
    const [mapped] = toOfflineSaleLines([cartLine()]);
    expect('variantId' in (mapped ?? {})).toBe(false);
    expect('variantName' in (mapped ?? {})).toBe(false);
  });

  it('does not alias the cart arrays it copies', () => {
    // The cart keeps being edited after a sale is queued; the queued payload
    // must not change underneath the outbox.
    const source = cartLine();
    const [mapped] = toOfflineSaleLines([source]);
    expect(mapped?.modifierOptionIds).not.toBe(source.modifierOptionIds);
    expect(mapped?.modifierLabels[0]).not.toBe(source.modifierLabels[0]);
  });

  it('maps an empty cart to an empty list', () => {
    expect(toOfflineSaleLines([])).toEqual([]);
  });
});
