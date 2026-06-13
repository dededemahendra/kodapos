import { v } from 'convex/values';
import { orderTypeValidator } from './orderType';

export const heldLineValidator = v.object({
  menuItemId: v.id('menuItems'),
  nameSnapshot: v.string(),
  qty: v.number(),
  unitPriceIDR: v.number(),
  variantId: v.optional(v.id('menuItemVariants')),
  variantName: v.optional(v.string()),
  modifierOptionIds: v.array(v.id('modifierOptions')),
  modifierLabels: v.array(
    v.object({
      groupName: v.string(),
      optionName: v.string(),
      priceAdjustmentIDR: v.number(),
    })
  ),
});

export const heldPromoValidator = v.object({
  promoId: v.id('promotions'),
  name: v.string(),
  type: v.union(v.literal('percent'), v.literal('fixed')),
  value: v.number(),
  // Carry the promo's scope + targets through hold/recall so the recalled cart
  // previews the SCOPED subtotal (not the whole cart). Optional for back-compat
  // with pre-scope held orders.
  scope: v.optional(v.union(v.literal('order'), v.literal('item'), v.literal('category'))),
  targetItemIds: v.optional(v.array(v.id('menuItems'))),
  targetCategoryIds: v.optional(v.array(v.id('categories'))),
});

export { orderTypeValidator };
