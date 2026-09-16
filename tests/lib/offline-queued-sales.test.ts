import { describe, expect, it } from 'vitest';
import type { QueuedSale } from '~/lib/offline/outbox';
import {
  isDeadLettered,
  MAX_REPLAY_ATTEMPTS,
  partitionQueued,
  queuedCashTotalIDR,
  queuedForShift,
} from '~/lib/offline/queued-sales';

function sale(over: {
  clientId: string;
  attempts?: number;
  totalIDR?: number;
  cashTenderedIDR?: number;
  shiftId?: string;
  queuedAt?: number;
}): QueuedSale {
  return {
    clientId: over.clientId,
    queuedAt: over.queuedAt ?? 1,
    attempts: over.attempts ?? 0,
    payload: {
      clientId: over.clientId,
      shiftId: over.shiftId ?? 'shift-1',
      cashierId: 'cashier-1',
      lines: [],
      discountIDR: 0,
      serviceChargeIDR: 0,
      taxIDR: 0,
      totalIDR: over.totalIDR ?? 20000,
      cashTenderedIDR: over.cashTenderedIDR ?? over.totalIDR ?? 20000,
      createdAtClient: 1,
    },
  };
}

describe('isDeadLettered', () => {
  it('flips exactly at the attempt cap replay.drain skips on', () => {
    expect(isDeadLettered(sale({ clientId: 'a', attempts: MAX_REPLAY_ATTEMPTS - 1 }))).toBe(false);
    expect(isDeadLettered(sale({ clientId: 'a', attempts: MAX_REPLAY_ATTEMPTS }))).toBe(true);
    expect(isDeadLettered(sale({ clientId: 'a', attempts: MAX_REPLAY_ATTEMPTS + 1 }))).toBe(true);
  });
});

describe('partitionQueued', () => {
  it('separates the two halves and preserves outbox order', () => {
    const rows = [
      sale({ clientId: 'a', attempts: 0 }),
      sale({ clientId: 'b', attempts: MAX_REPLAY_ATTEMPTS }),
      sale({ clientId: 'c', attempts: 2 }),
      sale({ clientId: 'd', attempts: MAX_REPLAY_ATTEMPTS + 3 }),
    ];
    const { pending, deadLettered } = partitionQueued(rows);
    expect(pending.map((s) => s.clientId)).toEqual(['a', 'c']);
    expect(deadLettered.map((s) => s.clientId)).toEqual(['b', 'd']);
  });
});

describe('queuedForShift', () => {
  it('keeps only the sales rung into the given shift', () => {
    const rows = [
      sale({ clientId: 'a', shiftId: 'shift-1' }),
      sale({ clientId: 'b', shiftId: 'shift-2' }),
    ];
    expect(queuedForShift(rows, 'shift-1').map((s) => s.clientId)).toEqual(['a']);
    expect(queuedForShift(rows, 'shift-3')).toEqual([]);
  });
});

describe('queuedCashTotalIDR', () => {
  it('sums the order totals, not what was tendered', () => {
    // The change went back to the customer; only the total stays in the drawer.
    const rows = [
      sale({ clientId: 'a', totalIDR: 20000, cashTenderedIDR: 50000 }),
      sale({ clientId: 'b', totalIDR: 15000, cashTenderedIDR: 15000 }),
    ];
    expect(queuedCashTotalIDR(rows)).toBe(35000);
  });

  it('counts dead-lettered sales too', () => {
    // That cash is physically in the drawer whether or not the sale will ever
    // post; excluding it would report a phantom overage at close.
    const rows = [
      sale({ clientId: 'a', totalIDR: 20000 }),
      sale({ clientId: 'b', totalIDR: 30000, attempts: MAX_REPLAY_ATTEMPTS }),
    ];
    expect(queuedCashTotalIDR(rows)).toBe(50000);
  });

  it('is 0 for an empty outbox', () => {
    expect(queuedCashTotalIDR([])).toBe(0);
  });
});
