import type { Doc } from '../_generated/dataModel';

export type PayMethod = 'cash' | 'qris_static' | 'qris_dynamic';

/** Per-method collected amounts for an order, uniform across single/split/legacy. */
export function methodTotals(order: Doc<'orders'>): { method: PayMethod; amountIDR: number }[] {
  if (order.paymentBreakdown && order.paymentBreakdown.length > 0) return order.paymentBreakdown;
  // legacy / pre-breakdown order: derive from the single headline method.
  const m = order.paymentMethod;
  if (m === 'split') return []; // a split must always have a breakdown; defensive
  return [{ method: m, amountIDR: order.totalIDR }];
}

export function cashCollectedIDR(order: Doc<'orders'>): number {
  return methodTotals(order)
    .filter((t) => t.method === 'cash')
    .reduce((s, t) => s + t.amountIDR, 0);
}
