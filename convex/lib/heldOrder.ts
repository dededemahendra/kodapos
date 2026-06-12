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
});

export { orderTypeValidator };
