import type { ReplayPayload } from 'convex/lib/replay';
import { type IDBPDatabase, openDB } from 'idb';

/**
 * A sale queued on the device while offline, awaiting replay to
 * `api.orders.createReplayedCashSale`.
 *
 * `payload` is a `ReplayPayload` (see `convex/lib/replay.ts`). Every line's
 * `unitPriceIDR` there is MODIFIER-INCLUSIVE — base price plus every
 * modifier adjustment already folded in — and the server asserts
 * `lineTotalIDR === qty * unitPriceIDR` on replay. A payload built from a
 * bare base price plus separate modifier amounts will fail that assertion
 * every time it is replayed: the sale is permanently stuck in the outbox,
 * money the register already collected but can never post. Whatever builds
 * this payload must fold modifiers into `unitPriceIDR` before it reaches
 * `enqueue`.
 */
export type QueuedSale = {
  clientId: string;
  payload: ReplayPayload;
  queuedAt: number;
  attempts: number;
};

const DB_NAME = 'kodapos-offline';
const STORE = 'outbox';
const VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          const store = database.createObjectStore(STORE, { keyPath: 'clientId' });
          store.createIndex('by_queuedAt', 'queuedAt');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Queue a sale for replay. Keyed by `clientId`, so enqueuing the same sale
 * twice (a double-tap, a re-render) stores one entry — mirroring the
 * server-side `by_cafe_clientId` dedup in `convex/lib/sale.ts`.
 */
export async function enqueue(sale: Omit<QueuedSale, 'attempts'>): Promise<void> {
  const d = await db();
  const existing = await d.get(STORE, sale.clientId);
  if (existing) return;
  await d.put(STORE, { ...sale, attempts: 0 });
}

/** Queued sales oldest-first. Replay must preserve the order they were rung. */
export async function list(): Promise<QueuedSale[]> {
  const d = await db();
  return (await d.getAllFromIndex(STORE, 'by_queuedAt')) as QueuedSale[];
}

export async function remove(clientId: string): Promise<void> {
  const d = await db();
  await d.delete(STORE, clientId);
}

export async function size(): Promise<number> {
  const d = await db();
  return await d.count(STORE);
}

export async function recordAttempt(clientId: string): Promise<void> {
  const d = await db();
  const existing = (await d.get(STORE, clientId)) as QueuedSale | undefined;
  if (!existing) return;
  await d.put(STORE, { ...existing, attempts: existing.attempts + 1 });
}

/** Test-only. Drops the cached connection, optionally wiping stored rows. */
export async function _resetForTests(opts: { keepData?: boolean } = {}): Promise<void> {
  if (!opts.keepData) {
    const d = await db();
    await d.clear(STORE);
  }
  const d = await dbPromise;
  d?.close();
  dbPromise = null;
}
