import { describe, expect, it } from 'vitest';
import { cartReducer, initialCart, type CartState } from '../../src/components/sale/cart-reducer';

function stateWith(lines: CartState['lines']): CartState {
  return { ...initialCart, lines };
}

const baseLine = {
  lineKey: 'k1',
  menuItemId: 'item1' as never,
  nameSnapshot: 'Espresso',
  qty: 2,
  unitPriceIDR: 18000,
  modifierOptionIds: [] as never[],
  modifierLabels: [],
};

describe('cartReducer reprice', () => {
  it('updates an item line to the new price', () => {
    const next = cartReducer(stateWith([baseLine]), {
      type: 'reprice',
      prices: { items: { item1: 30000 }, variants: {}, modifiers: {} },
    });
    expect(next.lines[0]!.unitPriceIDR).toBe(30000);
    // Quantity and identity must survive: repricing is not re-adding.
    expect(next.lines[0]!.qty).toBe(2);
    expect(next.lines[0]!.lineKey).toBe('k1');
  });

  it('prices a variant line from the variant, never the item', () => {
    const line = { ...baseLine, variantId: 'var1' as never, unitPriceIDR: 25000 };
    const next = cartReducer(stateWith([line]), {
      type: 'reprice',
      prices: { items: { item1: 99000 }, variants: { var1: 40000 }, modifiers: {} },
    });
    expect(next.lines[0]!.unitPriceIDR).toBe(40000);
  });

  it('adds resolved modifier adjustments on top of the base', () => {
    const line = {
      ...baseLine,
      modifierOptionIds: ['opt1'] as never[],
      modifierLabels: [{ groupName: 'Susu', optionName: 'Oat', priceAdjustmentIDR: 5000 }],
      unitPriceIDR: 23000,
    };
    const next = cartReducer(stateWith([line]), {
      type: 'reprice',
      prices: { items: { item1: 30000 }, variants: {}, modifiers: { opt1: 9000 } },
    });
    expect(next.lines[0]!.unitPriceIDR).toBe(39000);
    expect(next.lines[0]!.modifierLabels[0]!.priceAdjustmentIDR).toBe(9000);
  });

  // A line whose item is missing from the new data is left ALONE rather than
  // zeroed or dropped. Dropping it loses a customer's order silently.
  it('leaves a line untouched when its item is not in the new prices', () => {
    const next = cartReducer(stateWith([baseLine]), {
      type: 'reprice',
      prices: { items: {}, variants: {}, modifiers: {} },
    });
    expect(next.lines[0]!.unitPriceIDR).toBe(18000);
    expect(next.lines).toHaveLength(1);
  });

  it('does not touch promo, discount or order type', () => {
    const state = { ...stateWith([baseLine]), manualDiscount: { type: 'fixed' as const, value: 5000 } };
    const next = cartReducer(state, {
      type: 'reprice',
      prices: { items: { item1: 30000 }, variants: {}, modifiers: {} },
    });
    expect(next.manualDiscount).toEqual({ type: 'fixed', value: 5000 });
  });
});
