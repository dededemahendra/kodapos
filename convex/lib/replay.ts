import { type Infer, v } from 'convex/values';
import { type OrderType, orderTypeValidator } from './orderType';

/**
 * Per-line price snapshot taken at the till. A replayed sale is recorded
 * exactly as it was rung — the customer already paid this amount and left —
 * so the server trusts these numbers instead of re-deriving them from item
 * docs that may have changed during the outage.
 */
export const replayLineSnapshot = v.object({
  menuItemId: v.id('menuItems'),
  qty: v.number(),
  modifierOptionIds: v.array(v.id('modifierOptions')),
  variantId: v.optional(v.id('menuItemVariants')),
  /** Name as printed on the receipt, used if the item is since archived. */
  nameSnapshot: v.string(),
  unitPriceIDR: v.number(),
  lineTotalIDR: v.number(),
});

export const replayArgs = {
  clientId: v.string(),
  shiftId: v.id('shifts'),
  cashierId: v.id('cafeStaff'),
  lines: v.array(replayLineSnapshot),
  promoId: v.optional(v.id('promotions')),
  discountIDR: v.number(),
  serviceChargeIDR: v.number(),
  taxIDR: v.number(),
  totalIDR: v.number(),
  cashTenderedIDR: v.number(),
  createdAtClient: v.number(),
  // NOTE: deliberately the shared union, not v.string(). `SaleArgs.orderType`
  // is `orderTypeValidator`, so a plain string would not survive `toSaleArgs`.
  orderType: v.optional(orderTypeValidator),
  priceCategoryId: v.optional(v.id('priceCategories')),
};

const replayArgsValidator = v.object(replayArgs);
/** The server-side, validated payload: real `Id`s, optionals already narrowed. */
export type ReplayArgs = Infer<typeof replayArgsValidator>;

/**
 * The shape the client-side outbox persists while offline. Ids are plain
 * strings here because the payload is serialized to device storage long before
 * it reaches Convex; the mutation's `replayArgs` validators re-narrow them.
 */
export type ReplayPayload = {
  clientId: string;
  shiftId: string;
  cashierId: string;
  lines: Array<{
    menuItemId: string;
    qty: number;
    modifierOptionIds: string[];
    variantId?: string;
    nameSnapshot: string;
    unitPriceIDR: number;
    lineTotalIDR: number;
  }>;
  promoId?: string;
  discountIDR: number;
  serviceChargeIDR: number;
  taxIDR: number;
  totalIDR: number;
  cashTenderedIDR: number;
  createdAtClient: number;
  orderType?: OrderType;
  priceCategoryId?: string;
};
