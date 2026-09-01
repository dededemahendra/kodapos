import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import type { ReplayPayload } from 'convex/lib/replay';
import { useConvex } from 'convex/react';
import type { FunctionArgs } from 'convex/server';
import { useEffect, useRef } from 'react';
import { useConnectionState } from './connectivity';
import type { QueuedSale } from './outbox';
import { list, recordAttempt, remove } from './outbox';

export type ReplayResult = { posted: number; deadLettered: string[] };

const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Drain the outbox oldest-first. Sales that can still be posted go out in
 * the order they were rung, and a genuine post failure stops the drain so
 * later sales don't jump ahead of it. An entry already at `maxAttempts` can
 * never post (the modifier-inclusive `unitPriceIDR` assertion in
 * `createReplayedCashSale` is one way a payload ends up permanently
 * unpostable — see the warning in `outbox.ts`'s `QueuedSale` doc comment),
 * so it is SKIPPED rather than left blocking every sale behind it forever:
 * ordering only matters among sales that can still land. It stays in the
 * outbox — reported via `deadLettered` — for a later task to surface to the
 * owner.
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
      continue;
    }
    try {
      await deps.post(sale.payload);
      await deps.remove(sale.clientId);
      posted += 1;
    } catch (error) {
      // Not swallowed: a stuck queue needs to be diagnosable. This is a
      // genuine post failure (as opposed to a dead letter above), so the
      // loop still stops here — later sales must not jump ahead of one that
      // may yet succeed on the next drain.
      console.error('[offline] replay: post failed, will retry on next drain', {
        clientId: sale.clientId,
        error,
      });
      await deps.recordAttempt(sale.clientId);
      break;
    }
  }

  return { posted, deadLettered };
}

/**
 * Builds the mutation's real argument object from the client-side payload.
 *
 * Deliberately an object literal (spread + per-field id casts) assigned to
 * an explicitly-typed return, not a single `payload as ReplayArgs`
 * assertion. A bare assertion only checks that the two types are
 * "comparable" — TypeScript permits asserting to a type that has EXTRA
 * required properties the source doesn't have, so `payload as ReplayArgs`
 * would still compile clean even after a new required argument is added to
 * `createReplayedCashSale`, and then dead-letter every queued sale at
 * runtime the first time it actually posts. Returning an object literal
 * against an explicit return type makes TypeScript check every property the
 * target type requires is actually present in the literal, so a missing one
 * fails `tsc` instead.
 */
function toReplayArgs(
  payload: ReplayPayload
): FunctionArgs<typeof api.orders.createReplayedCashSale> {
  // promoId/priceCategoryId destructured out before spreading `rest`, same
  // reason as `variantId` below: `exactOptionalPropertyTypes` rejects an
  // untyped `string | undefined` field sitting alongside a conditionally
  // re-added, properly-cast one of the same name.
  const { promoId, priceCategoryId, ...rest } = payload;
  return {
    ...rest,
    shiftId: rest.shiftId as Id<'shifts'>,
    cashierId: rest.cashierId as Id<'cafeStaff'>,
    ...(promoId !== undefined ? { promoId: promoId as Id<'promotions'> } : {}),
    ...(priceCategoryId !== undefined
      ? { priceCategoryId: priceCategoryId as Id<'priceCategories'> }
      : {}),
    lines: rest.lines.map((line) => {
      // Destructure variantId out before spreading `rest`: leaving it in
      // would keep its untyped `string | undefined` shape alongside the
      // conditionally-added, properly-cast `variantId` below, which
      // `exactOptionalPropertyTypes` also rejects.
      const { variantId, ...rest } = line;
      return {
        ...rest,
        menuItemId: rest.menuItemId as Id<'menuItems'>,
        modifierOptionIds: rest.modifierOptionIds as Id<'modifierOptions'>[],
        ...(variantId !== undefined ? { variantId: variantId as Id<'menuItemVariants'> } : {}),
      };
    }),
  };
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
    // `run` never rejects (every branch is caught below), so neither
    // `void run()` nor the `setInterval` tick below it can produce an
    // unhandled rejection — including when `list()`/`recordAttempt()`
    // reject, which `outbox.ts` does deliberately on the IndexedDB
    // `blocked` path.
    const run = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const result = await drain({
          list,
          remove,
          recordAttempt,
          post: async (payload) => {
            await convex.mutation(api.orders.createReplayedCashSale, toReplayArgs(payload));
          },
        });
        if (result.deadLettered.length > 0) {
          // No toast/log surface exists yet for the cashier or owner; a
          // console warning at least makes a stuck queue discoverable
          // instead of silently blocking nothing (dead letters are skipped,
          // not head-of-line blocking) while still going unnoticed forever.
          console.warn(
            '[offline] replay: sale(s) stuck past max attempts, needs manual attention',
            result.deadLettered
          );
        }
      } catch (error) {
        console.error('[offline] replay: drain failed', error);
      } finally {
        running.current = false;
      }
    };
    void run();
    const id = setInterval(run, 30_000);
    return () => clearInterval(id);
  }, [state, convex]);
}
