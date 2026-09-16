import { useEffect, useState } from 'react';
import { list, type QueuedSale } from './outbox';

/** Re-read interval. An IndexedDB read of a handful of rows is cheap, and the
 *  outbox has no change notification to subscribe to. */
const POLL_MS = 3_000;

export type QueuedSalesState = {
  sales: QueuedSale[];
  /** False until the first successful read. Distinguishes "nothing queued"
   *  from "we have not looked yet" — the two must not render the same on a
   *  screen that adds this money to an expected-cash figure. */
  loaded: boolean;
  /** Set when the outbox could not be read at all (IndexedDB blocked by
   *  another tab mid-upgrade). The caller has to say so rather than imply an
   *  empty queue. */
  error: boolean;
};

/**
 * The device outbox, polled.
 *
 * Deliberately keeps the last good snapshot when a read fails: flashing an
 * empty list would read as "everything synced" on screens whose whole job is
 * to report sales that have not synced.
 */
export function useQueuedSales(active = true): QueuedSalesState {
  const [state, setState] = useState<QueuedSalesState>({
    sales: [],
    loaded: false,
    error: false,
  });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const read = () => {
      list()
        .then((sales) => {
          if (!cancelled) setState({ sales, loaded: true, error: false });
        })
        .catch(() => {
          if (!cancelled) setState((prev) => ({ ...prev, error: true }));
        });
    };
    read();
    const id = setInterval(read, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active]);

  return state;
}
