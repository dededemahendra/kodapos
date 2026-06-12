import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';

/** Full, non-null payload of the public per-table menu query. */
export type PublicMenu = NonNullable<FunctionReturnType<typeof api.public.menuForTable>>;

export type MenuItem = PublicMenu['items'][number];
export type MenuItemVariant = MenuItem['variants'][number];
export type MenuModifierGroup = MenuItem['modifierGroups'][number];
export type MenuPricing = PublicMenu['pricing'];

/**
 * One lean local cart line for the public order page. This is intentionally NOT
 * the staff cart reducer — the public surface owns its own minimal state. Prices
 * here are DISPLAY-only previews; the server re-prices every line on submit.
 */
export type CartLine = {
  /** Stable per-line key (groups the same item+variant+modifiers selection). */
  key: string;
  menuItemId: Id<'menuItems'>;
  name: string;
  qty: number;
  /** Client-computed preview: (variant ?? item) base + Σ option adjustments. */
  unitPriceIDR: number;
  variantId?: Id<'menuItemVariants'>;
  variantName?: string;
  modifierOptionIds: Id<'modifierOptions'>[];
  modifierLabels: string[];
};

/** What the picker sheet emits when the customer confirms an item. */
export type PickResult = {
  menuItemId: Id<'menuItems'>;
  name: string;
  qty: number;
  unitPriceIDR: number;
  variantId?: Id<'menuItemVariants'>;
  variantName?: string;
  modifierOptionIds: Id<'modifierOptions'>[];
  modifierLabels: string[];
};

/** Build a stable cart-line key from the item + variant + sorted option ids. */
export function cartLineKey(
  menuItemId: string,
  variantId: string | undefined,
  modifierOptionIds: string[]
): string {
  return [menuItemId, variantId ?? '', [...modifierOptionIds].sort().join('+')].join('|');
}
