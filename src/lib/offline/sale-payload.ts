import type { OrderType } from 'convex/lib/orderType';
import type { ReceiptOrder } from 'convex/lib/receipt';
import type { ReplayPayload } from 'convex/lib/replay';

/**
 * One cart line as the register holds it, narrowed to what a queued sale needs.
 * Mirrors `CartLine` (`src/components/sale/cart-reducer.ts`) with plain string
 * ids, because the payload is serialized to device storage long before it
 * reaches Convex.
 *
 * `unitPriceIDR` is MODIFIER-INCLUSIVE: the base (or variant) price with every
 * modifier adjustment already folded in, exactly as the cart stores it and
 * exactly as `convex/lib/sale.ts` computes it (`basePrice +
 * modifierAdjustments`). `buildReplayPayload` derives `lineTotalIDR` from this
 * number and nothing else, so the server's per-line `lineTotalIDR === qty *
 * unitPriceIDR` assertion holds by construction. Passing a bare base price here
 * and accounting for modifiers separately would dead-letter every modified sale
 * on replay — cash already in the drawer that can never post.
 */
export type OfflineSaleLine = {
  menuItemId: string;
  nameSnapshot: string;
  variantId?: string | undefined;
  variantName?: string | undefined;
  qty: number;
  /** Modifier-inclusive unit price. See the type doc above. */
  unitPriceIDR: number;
  modifierOptionIds: readonly string[];
  modifierLabels: readonly {
    groupName: string;
    optionName: string;
    priceAdjustmentIDR: number;
  }[];
};

export type OfflineSaleInput = {
  clientId: string;
  shiftId: string;
  cashierId: string;
  lines: readonly OfflineSaleLine[];
  orderType: OrderType;
  promoId?: string | undefined;
  priceCategoryId?: string | undefined;
  /** Every discount the till applied, promo + manual, folded into one number:
   *  `replayArgs` has no separate manual-discount field and the server records a
   *  replayed sale's money exactly as it was rung. */
  discountIDR: number;
  serviceChargeIDR: number;
  taxIDR: number;
  totalIDR: number;
  cashTenderedIDR: number;
  createdAtClient: number;
};

/**
 * Why a sale could not be turned into a queueable payload. Codes, not
 * sentences: the copy shown to the cashier is Indonesian and lives in the
 * component, and this module has no lingui runtime.
 */
export type OfflineSaleRejection =
  | 'empty_cart'
  | 'invalid_qty'
  | 'non_integer_money'
  | 'totals_mismatch'
  | 'insufficient_cash';

export type BuiltOfflineSale =
  | { ok: true; payload: ReplayPayload }
  | { ok: false; reason: OfflineSaleRejection };

/** Money is integer IDR end to end; a fraction would fail the server's assertIDR. */
function isWholeIDR(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

/** The single definition of a line's total. Never accepted from a caller. */
export function lineTotalIDR(line: { qty: number; unitPriceIDR: number }): number {
  return line.qty * line.unitPriceIDR;
}

export function subtotalIDROf(lines: readonly { qty: number; unitPriceIDR: number }[]): number {
  return lines.reduce((sum, line) => sum + lineTotalIDR(line), 0);
}

/**
 * Build the `ReplayPayload` the outbox stores for a cash sale rung offline.
 *
 * Every check here mirrors one the server runs in `orders.createReplayedCashSale`
 * (integer money, per-line `lineTotalIDR === qty * unitPriceIDR`, and
 * `totalIDR === subtotal - discount + serviceCharge + tax`). A payload that
 * would fail those must be refused at the till, while the customer is still
 * standing there and the sale can be rung another way — not queued, printed,
 * and then dead-lettered hours later with the cash already in the drawer.
 */
export function buildReplayPayload(input: OfflineSaleInput): BuiltOfflineSale {
  if (input.lines.length === 0) return { ok: false, reason: 'empty_cart' };

  for (const line of input.lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 99) {
      return { ok: false, reason: 'invalid_qty' };
    }
    if (!isWholeIDR(line.unitPriceIDR)) return { ok: false, reason: 'non_integer_money' };
  }

  const money = [
    input.discountIDR,
    input.serviceChargeIDR,
    input.taxIDR,
    input.totalIDR,
    input.cashTenderedIDR,
  ];
  if (money.some((n) => !isWholeIDR(n))) return { ok: false, reason: 'non_integer_money' };

  const subtotalIDR = subtotalIDROf(input.lines);
  const expectedTotalIDR = subtotalIDR - input.discountIDR + input.serviceChargeIDR + input.taxIDR;
  if (expectedTotalIDR !== input.totalIDR) return { ok: false, reason: 'totals_mismatch' };
  if (input.cashTenderedIDR < input.totalIDR) return { ok: false, reason: 'insufficient_cash' };

  return {
    ok: true,
    payload: {
      clientId: input.clientId,
      shiftId: input.shiftId,
      cashierId: input.cashierId,
      lines: input.lines.map((line) => ({
        menuItemId: line.menuItemId,
        qty: line.qty,
        modifierOptionIds: [...line.modifierOptionIds],
        ...(line.variantId !== undefined ? { variantId: line.variantId } : {}),
        nameSnapshot: line.nameSnapshot,
        // The cart's modifier-inclusive unit price, used verbatim, with the
        // line total derived from it. These two numbers can never disagree.
        unitPriceIDR: line.unitPriceIDR,
        lineTotalIDR: lineTotalIDR(line),
      })),
      ...(input.promoId !== undefined ? { promoId: input.promoId } : {}),
      ...(input.priceCategoryId !== undefined ? { priceCategoryId: input.priceCategoryId } : {}),
      discountIDR: input.discountIDR,
      serviceChargeIDR: input.serviceChargeIDR,
      taxIDR: input.taxIDR,
      totalIDR: input.totalIDR,
      cashTenderedIDR: input.cashTenderedIDR,
      createdAtClient: input.createdAtClient,
      orderType: input.orderType,
    },
  };
}

/**
 * The receipt for a queued sale, built from the same cart snapshot as the
 * payload so the paper in the customer's hand and the row in the outbox can
 * never describe different money. There is no server order to read from: the
 * sale exists only on this device until it replays.
 */
export function buildOfflineReceiptOrder(
  input: OfflineSaleInput,
  meta: {
    cashierName: string;
    serviceChargeName?: string | undefined;
    serviceChargePct?: number | undefined;
    taxRatePct: number;
    priceCategoryName?: string | undefined;
  }
): ReceiptOrder {
  return {
    lines: input.lines.map((line) => ({
      nameSnapshot: line.nameSnapshot,
      qty: line.qty,
      lineTotalIDR: lineTotalIDR(line),
      modifiersSnapshot: line.modifierLabels.map((m) => ({
        groupName: m.groupName,
        optionName: m.optionName,
        priceAdjustmentIDR: m.priceAdjustmentIDR,
      })),
      ...(line.variantName !== undefined ? { variantName: line.variantName } : {}),
    })),
    subtotalIDR: subtotalIDROf(input.lines),
    discountIDR: input.discountIDR,
    ...(input.serviceChargeIDR > 0
      ? {
          serviceChargeIDR: input.serviceChargeIDR,
          ...(meta.serviceChargeName !== undefined
            ? { serviceChargeName: meta.serviceChargeName }
            : {}),
          ...(meta.serviceChargePct !== undefined
            ? { serviceChargePct: meta.serviceChargePct }
            : {}),
        }
      : {}),
    taxIDR: input.taxIDR,
    taxRatePct: meta.taxRatePct,
    totalIDR: input.totalIDR,
    payments: [{ method: 'cash', amountIDR: input.totalIDR }],
    createdAtClient: input.createdAtClient,
    cashierName: meta.cashierName,
    orderType: input.orderType,
    ...(meta.priceCategoryName !== undefined ? { priceCategoryName: meta.priceCategoryName } : {}),
  };
}

/** Change owed on a queued cash sale. Never negative: tendering is gated above. */
export function changeIDROf(input: { cashTenderedIDR: number; totalIDR: number }): number {
  return Math.max(0, input.cashTenderedIDR - input.totalIDR);
}
