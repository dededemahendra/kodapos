/** Default service-charge line label when a cafe hasn't customized it. */
export const DEFAULT_SERVICE_CHARGE_NAME = 'Biaya Layanan';

export type PricingInput = {
  subtotalIDR: number;
  /** 0 today (promo engine unbuilt); kept so discount slots into the formula. */
  discountIDR?: number;
  serviceChargeEnabled: boolean;
  serviceChargePct: number;
  taxEnabled: boolean;
  taxRatePct: number;
};

export type PricingResult = {
  serviceChargeIDR: number;
  taxIDR: number;
  totalIDR: number;
};

/**
 * Discount amount in IDR for a promo applied to an order subtotal. Pure, so
 * `createCashSale` (authoritative) and the sale screen (preview) compute it
 * identically. Clamped to [0, subtotal] — a fixed promo never exceeds the
 * subtotal, so the discounted base floors at 0.
 */
export function promoDiscountIDR(
  type: 'percent' | 'fixed',
  value: number,
  subtotalIDR: number,
): number {
  const raw = type === 'percent' ? Math.round((subtotalIDR * value) / 100) : value;
  return Math.max(0, Math.min(raw, subtotalIDR));
}

/**
 * Subtotal (IDR) of the lines a promo's scope applies to. Pure, so both
 * `buildOrder` (authoritative) and the sale screen (preview) compute the
 * scoped base identically and never drift.
 *
 * - `order` / undefined → all lines.
 * - `item` → lines whose `menuItemId` is in `targetItemIds`.
 * - `category` → lines whose `categoryId` is in `targetCategoryIds`.
 *
 * Missing/empty targets (or no matching line) yield 0, so a scoped promo with
 * no cart match is still applicable but discounts nothing.
 */
export function scopedSubtotalIDR(
  lines: Array<{ menuItemId: string; categoryId: string; lineTotalIDR: number }>,
  scope: 'order' | 'item' | 'category' | undefined,
  targetItemIds?: readonly string[],
  targetCategoryIds?: readonly string[],
): number {
  if (scope === 'item') {
    const set = new Set(targetItemIds ?? []);
    return lines.reduce((sum, l) => (set.has(l.menuItemId) ? sum + l.lineTotalIDR : sum), 0);
  }
  if (scope === 'category') {
    const set = new Set(targetCategoryIds ?? []);
    return lines.reduce((sum, l) => (set.has(l.categoryId) ? sum + l.lineTotalIDR : sum), 0);
  }
  return lines.reduce((sum, l) => sum + l.lineTotalIDR, 0);
}

/**
 * Single source of truth for order totals. Pure (no ctx/React/convex-server
 * imports) so both `createCashSale` (server) and the sale screen (client) can
 * import it and never drift. PB1 tax is applied AFTER service charge.
 */
export function computeOrderTotals(input: PricingInput): PricingResult {
  const base = input.subtotalIDR - (input.discountIDR ?? 0);
  const serviceChargeIDR = input.serviceChargeEnabled
    ? Math.round((base * input.serviceChargePct) / 100)
    : 0;
  const taxIDR = input.taxEnabled
    ? Math.round(((base + serviceChargeIDR) * input.taxRatePct) / 100)
    : 0;
  return { serviceChargeIDR, taxIDR, totalIDR: base + serviceChargeIDR + taxIDR };
}
