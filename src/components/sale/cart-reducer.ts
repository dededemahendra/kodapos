// src/components/sale/cart-reducer.ts
import type { Id } from 'convex/_generated/dataModel';

export type CartLineModifier = {
  groupName: string;
  optionName: string;
  priceAdjustmentIDR: number;
};

export type CartLine = {
  lineKey: string;
  menuItemId: Id<'menuItems'>;
  nameSnapshot: string;
  qty: number;
  unitPriceIDR: number;
  modifierOptionIds: Array<Id<'modifierOptions'>>;
  modifierLabels: CartLineModifier[];
};

export type CartPromo = {
  _id: Id<'promotions'>;
  name: string;
  type: 'percent' | 'fixed';
  value: number;
};

export type CartState = { lines: CartLine[]; promo: CartPromo | null };

export type CartAction =
  | { type: 'addLine'; line: Omit<CartLine, 'lineKey'>; lineKey: string }
  | { type: 'incrementQty'; lineKey: string }
  | { type: 'decrementQty'; lineKey: string }
  | { type: 'removeLine'; lineKey: string }
  | { type: 'clearCart' }
  | { type: 'setPromo'; promo: CartPromo | null };

export const initialCart: CartState = { lines: [], promo: null };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'addLine': {
      const incoming = action.line;
      // De-dup only when the line has NO modifiers and an existing line of the
      // same item also has no modifiers. With modifiers, always push a new line
      // because the cashier might intend different selections.
      if (incoming.modifierOptionIds.length === 0) {
        const idx = state.lines.findIndex(
          (l) => l.menuItemId === incoming.menuItemId && l.modifierOptionIds.length === 0
        );
        if (idx !== -1) {
          const existing = state.lines[idx];
          if (existing === undefined) return state;
          const merged = { ...existing, qty: Math.min(99, existing.qty + incoming.qty) };
          const lines = [...state.lines];
          lines[idx] = merged;
          return { ...state, lines };
        }
      }
      return { ...state, lines: [...state.lines, { ...incoming, lineKey: action.lineKey }] };
    }
    case 'incrementQty': {
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.lineKey === action.lineKey ? { ...l, qty: Math.min(99, l.qty + 1) } : l
        ),
      };
    }
    case 'decrementQty': {
      const line = state.lines.find((l) => l.lineKey === action.lineKey);
      if (!line) return state;
      if (line.qty <= 1) {
        return { ...state, lines: state.lines.filter((l) => l.lineKey !== action.lineKey) };
      }
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.lineKey === action.lineKey ? { ...l, qty: l.qty - 1 } : l
        ),
      };
    }
    case 'removeLine': {
      return { ...state, lines: state.lines.filter((l) => l.lineKey !== action.lineKey) };
    }
    case 'setPromo': {
      return { ...state, promo: action.promo };
    }
    case 'clearCart': {
      return { lines: [], promo: null };
    }
  }
}

export function subtotalOf(state: CartState): number {
  return state.lines.reduce((sum, l) => sum + l.qty * l.unitPriceIDR, 0);
}
