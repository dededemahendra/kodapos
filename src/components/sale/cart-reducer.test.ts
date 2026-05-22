// src/components/sale/cart-reducer.test.ts
import { describe, expect, it } from 'vitest';
import type { Id } from 'convex/_generated/dataModel';
import { cartReducer, initialCart, subtotalOf, type CartLine } from './cart-reducer';

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
