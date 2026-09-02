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

export const DB_NAME = 'kodapos-offline';
const STORE = 'outbox';
const DEFAULT_VERSION = 1;
/** Mutable so tests can force a version bump to exercise the blocked/blocking path. */
let version = DEFAULT_VERSION;

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    // Tracks whether `opening` has already settled via `blocked()` below,
    // so the raw open's eventual success/error — which idb keeps waiting
    // for even after we've given up on it — can be told apart from a
    // still-live first attempt.
    let settled = false;
    const opening = new Promise<IDBPDatabase>((resolve, reject) => {
      const openPromise = openDB(DB_NAME, version, {
        upgrade(database) {
          if (!database.objectStoreNames.contains(STORE)) {
            const store = database.createObjectStore(STORE, { keyPath: 'clientId' });
            store.createIndex('by_queuedAt', 'queuedAt');
          }
        },
        // Fires when an older connection (a stale tab left open through a
        // schema bump) is still around, so this open can never proceed.
        // Left unhandled, idb's promise simply never settles — and because
        // we cache it in `dbPromise`, every later enqueue/list/size call
        // would hang forever with no error surfaced anywhere. Reject
        // instead, so a real error reaches the caller.
        blocked(currentVersion, blockedVersion) {
          settled = true;
          reject(
            new Error(
              `IndexedDB "${DB_NAME}" open blocked: a connection at v${currentVersion} is ` +
                `still open, preventing v${blockedVersion}. Close other tabs/windows of this ` +
                'app and retry.'
            )
          );
        },
        // Fires on THIS connection, once successfully open, when a newer
        // version is requested elsewhere while we're still open. Close
        // ourselves so we don't become the stale connection that blocks
        // the other tab.
        blocking() {
          openPromise.then((instance) => instance.close()).catch(() => {});
        },
      });
      // The underlying open keeps running even after `blocked()` rejects
      // `opening` above — idb doesn't cancel it, it just waits for the
      // stale connection to eventually close. If that happens, this
      // resolves late with a real, live `IDBPDatabase` that nothing is
      // waiting for any more. Left alone, that connection leaks — open
      // forever, never stored anywhere, blocking every future version
      // bump. Close it instead of dropping it.
      openPromise.then(
        (instance) => {
          if (settled) {
            instance.close();
            return;
          }
          settled = true;
          resolve(instance);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          reject(error);
        }
      );
    });
    // Don't cache a rejected open — let the next call retry from scratch.
    dbPromise = opening.catch((error: unknown) => {
      dbPromise = null;
      throw error;
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

/**
 * Read and write in a single `readwrite` transaction. Two concurrent
 * `recordAttempt` calls for the same `clientId` would otherwise both read
 * `attempts: n` from separate transactions and the second `put` would
 * clobber the first, silently under-counting and pushing dead-lettering
 * later than intended. (`enqueue`'s similar get-then-put is fine as-is:
 * `put` there is keyed by `clientId`, so a racing duplicate still collapses
 * to one record and no sale is lost.)
 */
export async function recordAttempt(clientId: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const existing = (await store.get(clientId)) as QueuedSale | undefined;
  if (existing) {
    await store.put({ ...existing, attempts: existing.attempts + 1 });
  }
  await tx.done;
}

/** Test-only. Forces the schema version, to simulate a version bump for blocked/blocking tests. */
export function _setVersionForTests(v: number): void {
  version = v;
}

/** Test-only. Drops the cached connection, optionally wiping stored rows. */
export async function _resetForTests(opts: { keepData?: boolean } = {}): Promise<void> {
  version = DEFAULT_VERSION;
  if (!opts.keepData) {
    const d = await db().catch(() => null);
    await d?.clear(STORE);
  }
  const d = dbPromise ? await dbPromise.catch(() => null) : null;
  d?.close();
  dbPromise = null;
}
