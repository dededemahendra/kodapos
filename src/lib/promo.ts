import { formatIDR } from '~/lib/money';

export type PromoType = 'percent' | 'fixed';

// Display string for a promo's value: "20%" for percent, "Rp 10.000" for fixed.
export function formatPromoValue(type: PromoType, value: number): string {
  return type === 'percent' ? `${value}%` : formatIDR(value);
}
