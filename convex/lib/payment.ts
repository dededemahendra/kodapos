import type { Doc } from '../_generated/dataModel';

export type PayMethod = 'cash' | 'qris_static' | 'qris_dynamic';

/** Per-method collected amounts for an order, uniform across single/split/legacy. */
export function methodTotals(order: Doc<'orders'>): { method: PayMethod; amountIDR: number }[] {
  if (order.paymentBreakdown && order.paymentBreakdown.length > 0) return order.paymentBreakdown;
  // legacy / pre-breakdown order: derive from the single headline method.
  const m = order.paymentMethod;
  if (m === 'split') {
    // buildOrder always writes a breakdown for splits, so this is unreachable in
    // normal flow. If it ever happens, the order's amount would silently drop out
    // of cash reconciliation + reports — log loudly so the data gap is detectable
    // rather than producing a phantom drawer shortfall with no signal.
    console.error(`methodTotals: split order ${order._id} has no paymentBreakdown`);
    return [];
  }
  return [{ method: m, amountIDR: order.totalIDR }];
}

export function cashCollectedIDR(order: Doc<'orders'>): number {
  return methodTotals(order)
    .filter((t) => t.method === 'cash')
    .reduce((s, t) => s + t.amountIDR, 0);
}
