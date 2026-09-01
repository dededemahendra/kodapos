import { api } from 'convex/_generated/api';
import type { ReplayPayload } from 'convex/lib/replay';
import { useConvex } from 'convex/react';
import { useEffect, useRef } from 'react';
import { useConnectionState } from './connectivity';
import type { QueuedSale } from './outbox';
import { list, recordAttempt, remove } from './outbox';

export type ReplayResult = { posted: number; deadLettered: string[] };

const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Drain the outbox oldest-first, stopping at the first failure so sales post
 * in the order they were rung. An entry is removed only after the server
 * confirms it; `clientId` dedup makes a retry harmless, so erring toward
 * retrying is always safer than erring toward dropping.
 */
export async function drain(deps: {
  list: () => Promise<QueuedSale[]>;
  remove: (clientId: string) => Promise<void>;
  recordAttempt: (clientId: string) => Promise<void>;
  post: (payload: ReplayPayload) => Promise<void>;
  maxAttempts?: number;
}): Promise<ReplayResult> {
  const max = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const queued = await deps.list();
  let posted = 0;
  const deadLettered: string[] = [];

  for (const sale of queued) {
    if (sale.attempts >= max) {
      deadLettered.push(sale.clientId);
      break;
    }
    try {
      await deps.post(sale.payload);
      await deps.remove(sale.clientId);
      posted += 1;
    } catch {
      await deps.recordAttempt(sale.clientId);
      break;
    }
  }

  return { posted, deadLettered };
}

/**
 * Drains the outbox on every offline→online transition, and retries on an
 * interval while online in case a drain stopped partway. Guarded by a ref so
 * two drains never run concurrently — concurrent drains would post the same
 * sale twice, which `clientId` dedup would absorb, but the wasted round-trips
 * and reordering are worth avoiding.
 */
export function useReplayOnReconnect(): void {
  const convex = useConvex();
  const state = useConnectionState();
  const running = useRef(false);

  useEffect(() => {
    if (state !== 'online') return;
    const run = async () => {
      if (running.current) return;
      running.current = true;
      try {
        await drain({
          list,
          remove,
          recordAttempt,
          post: async (payload) => {
            await convex.mutation(api.orders.createReplayedCashSale, payload as never);
          },
        });
      } finally {
        running.current = false;
      }
    };
    void run();
    const id = setInterval(run, 30_000);
    return () => clearInterval(id);
  }, [state, convex]);
}
