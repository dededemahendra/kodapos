import type { QueuedSale } from './outbox';

/**
 * How many failed post attempts before a queued sale is considered permanently
 * unpostable. Single source of truth: `replay.drain` skips entries at or past
 * it, and the reconciliation view lists exactly the same entries as dead
 * letters. If the two ever disagreed, a sale would be either invisibly stuck
 * or reported as lost while still retrying.
 */
export const MAX_REPLAY_ATTEMPTS = 5;

/**
 * A queued sale that has burned every retry. It is NOT removed from the outbox
 * — the cash was collected and someone has to key the sale in by hand, so the
 * record must survive until a person deals with it.
 */
export function isDeadLettered(sale: QueuedSale, max = MAX_REPLAY_ATTEMPTS): boolean {
  return sale.attempts >= max;
}

/**
 * Split the outbox into sales still on their way and sales that will never
 * post. Both halves keep the order `list()` returned them in (oldest first).
 */
export function partitionQueued(
  sales: readonly QueuedSale[],
  max = MAX_REPLAY_ATTEMPTS
): { pending: QueuedSale[]; deadLettered: QueuedSale[] } {
  const pending: QueuedSale[] = [];
  const deadLettered: QueuedSale[] = [];
  for (const sale of sales) {
    if (isDeadLettered(sale, max)) deadLettered.push(sale);
    else pending.push(sale);
  }
  return { pending, deadLettered };
}

/** The queued sales rung into one shift. */
export function queuedForShift(sales: readonly QueuedSale[], shiftId: string): QueuedSale[] {
  return sales.filter((sale) => sale.payload.shiftId === shiftId);
}

/**
 * One queued sale as `shifts.close` wants it declared: the id the server can
 * check against posted orders, plus what the till took for it.
 *
 * Deliberately per-sale rather than a pre-summed total. The outbox snapshot a
 * screen holds is up to a poll interval old, so a sale can replay between the
 * snapshot and the close mutation; only the ids let the server drop the ones
 * that already landed instead of counting them twice.
 */
export type QueuedSaleDeclaration = { clientId: string; totalIDR: number };

export function toQueuedDeclarations(sales: readonly QueuedSale[]): QueuedSaleDeclaration[] {
  return sales.map((sale) => ({ clientId: sale.clientId, totalIDR: sale.payload.totalIDR }));
}

/**
 * Cash the drawer physically holds for the given queued sales.
 *
 * `totalIDR`, not `cashTenderedIDR`: the change was handed back, so what stays
 * in the till is the order total. Dead-lettered sales are deliberately NOT
 * excluded by this function — that cash is in the drawer whether or not the
 * sale will ever reach the server, and an expected-cash figure that skipped it
 * would report a phantom overage.
 */
export function queuedCashTotalIDR(sales: readonly QueuedSale[]): number {
  return sales.reduce((sum, sale) => sum + sale.payload.totalIDR, 0);
}
