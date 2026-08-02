// src/components/sale/cart-reducer.test.ts
import { describe, expect, it } from 'vitest';
import type { Id } from 'convex/_generated/dataModel';
import { cartReducer, initialCart, subtotalOf, type CartLine, type CartState } from './cart-reducer';

const item = 'item-1' as unknown as Id<'menuItems'>;
const item2 = 'item-2' as unknown as Id<'menuItems'>;
const optA = 'opt-a' as unknown as Id<'modifierOptions'>;

function lineFor(menuItemId: Id<'menuItems'>, qty: number, modOptionIds: Id<'modifierOptions'>[] = []): Omit<CartLine, 'lineKey'> {
  return {
    menuItemId,
    nameSnapshot: 'Espresso',
    qty,
    unitPriceIDR: 18000,
    modifierOptionIds: modOptionIds,
    modifierLabels: [],
  };
}

describe('cartReducer', () => {
  it('addLine into empty cart for a no-modifier item creates one line qty 1', () => {
    const state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 1), lineKey: 'k1' });
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]?.qty).toBe(1);
  });

  it('addLine again for the same no-modifier item bumps qty on the existing line', () => {
    let state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 1), lineKey: 'k1' });
    state = cartReducer(state, { type: 'addLine', line: lineFor(item, 1), lineKey: 'k2' });
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]?.qty).toBe(2);
  });

  it('addLine for the same item WITH modifiers always creates a new line', () => {
    let state = cartReducer(initialCart, {
      type: 'addLine',
      line: lineFor(item, 1, [optA]),
      lineKey: 'k1',
    });
    state = cartReducer(state, {
      type: 'addLine',
      line: lineFor(item, 1, [optA]),
      lineKey: 'k2',
    });
    expect(state.lines).toHaveLength(2);
  });

  it('incrementQty bumps qty and caps at 99', () => {
    let state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 98), lineKey: 'k1' });
    state = cartReducer(state, { type: 'incrementQty', lineKey: 'k1' });
    expect(state.lines[0]?.qty).toBe(99);
    state = cartReducer(state, { type: 'incrementQty', lineKey: 'k1' });
    expect(state.lines[0]?.qty).toBe(99);
  });

  it('decrementQty decreases qty', () => {
    let state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 3), lineKey: 'k1' });
    state = cartReducer(state, { type: 'decrementQty', lineKey: 'k1' });
    expect(state.lines[0]?.qty).toBe(2);
  });

  it('decrementQty at qty 1 removes the line', () => {
    let state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 1), lineKey: 'k1' });
    state = cartReducer(state, { type: 'decrementQty', lineKey: 'k1' });
    expect(state.lines).toHaveLength(0);
  });

  it('removeLine removes the line by lineKey', () => {
    let state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 1), lineKey: 'k1' });
    state = cartReducer(state, { type: 'addLine', line: lineFor(item2, 1), lineKey: 'k2' });
    state = cartReducer(state, { type: 'removeLine', lineKey: 'k1' });
    expect(state.lines.map((l) => l.lineKey)).toEqual(['k2']);
  });

  it('clearCart empties the lines array', () => {
    let state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 1), lineKey: 'k1' });
    state = cartReducer(state, { type: 'clearCart' });
    expect(state.lines).toHaveLength(0);
  });

  it('subtotalOf sums qty * unitPriceIDR across lines', () => {
    let state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 2), lineKey: 'k1' });
    state = cartReducer(state, { type: 'addLine', line: lineFor(item2, 1, [optA]), lineKey: 'k2' });
    expect(subtotalOf(state)).toBe(2 * 18000 + 1 * 18000);
  });
});

describe('cartReducer — promo', () => {
  const promo = {
    _id: 'promo_1' as unknown as import('convex/_generated/dataModel').Id<'promotions'>,
    name: 'Diskon Kopi',
    type: 'percent' as const,
    value: 20,
  };

  it('initialCart has no promo', () => {
    expect(initialCart.promo).toBeNull();
  });

  it('setPromo stores the promo', () => {
    const next = cartReducer(initialCart, { type: 'setPromo', promo });
    expect(next.promo).toEqual(promo);
  });

  it('setPromo with null clears the promo', () => {
    const withPromo = cartReducer(initialCart, { type: 'setPromo', promo });
    const cleared = cartReducer(withPromo, { type: 'setPromo', promo: null });
    expect(cleared.promo).toBeNull();
  });

  it('clearCart resets lines and promo', () => {
    const withPromo = cartReducer(initialCart, { type: 'setPromo', promo });
    const cleared = cartReducer(withPromo, { type: 'clearCart' });
    expect(cleared.lines).toEqual([]);
    expect(cleared.promo).toBeNull();
  });
});

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
