import type { api } from 'convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import { type IDBPDatabase, openDB } from 'idb';

/**
 * Everything the register needs to ring a cash sale from cached data while
 * offline: the current menu, its modifiers and variants, active promos, the
 * cafe's settings, the open shift, and staff. Written in one snapshot so a
 * read never mixes prices from two different points in time.
 *
 * Derived from the query's own return type rather than re-declared as
 * `Doc<...>`, because `settings` and `staff` are deliberately NOT whole
 * documents: `convex/offline.ts` projects away the payment-provider
 * credentials on the settings row and the PIN hash + wage on staff rows, and
 * this cache is written to disk. Deriving keeps the two from drifting back
 * apart, and a re-widened field here would fail typecheck instead of quietly
 * persisting a secret.
 */
export type RegisterSnapshot = NonNullable<
  FunctionReturnType<typeof api.offline.registerSnapshot>
> & {
  writtenAt: number;
};

export const DB_NAME = 'kodapos-register';
const STORE = 'register';
const KEY = 'current';
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
            database.createObjectStore(STORE);
          }
        },
        // Fires when an older connection (a stale tab left open through a
        // schema bump) is still around, so this open can never proceed.
        // Left unhandled, idb's promise simply never settles — and because
        // we cache it in `dbPromise`, every later save/load call would hang
        // forever with no error surfaced anywhere. Reject instead, so a
        // real error reaches the caller.
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

/** Overwrite the cached snapshot with a fresh read, stamped with the current time. */
export async function save(snapshot: Omit<RegisterSnapshot, 'writtenAt'>): Promise<void> {
  const d = await db();
  const withTimestamp: RegisterSnapshot = { ...snapshot, writtenAt: Date.now() };
  await d.put(STORE, withTimestamp, KEY);
}

/** The most recently cached snapshot, or `null` if nothing has been saved yet. */
export async function load(): Promise<RegisterSnapshot | null> {
  const d = await db();
  const snapshot = (await d.get(STORE, KEY)) as RegisterSnapshot | undefined;
  return snapshot ?? null;
}

export const MAX_SNAPSHOT_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * A snapshot older than a day is refused. The bound is a judgement call about
 * what a realistic outage looks like, not a derived number — revisit once
 * there is field data. Refusing is the safe direction: the cashier can write a
 * manual receipt, but a sale rung at a stale price is a silent loss.
 */
export function isUsable(snapshot: RegisterSnapshot | null, now: number): boolean {
  if (!snapshot) return false;
  const age = now - snapshot.writtenAt;
  // A future-dated writtenAt (a hand-set clock, a dead RTC battery) would
  // otherwise make `age` negative, which is always < MAX_SNAPSHOT_AGE_MS —
  // the snapshot would never expire. Treat it the same as too-old: refuse.
  if (age < 0) return false;
  return age < MAX_SNAPSHOT_AGE_MS;
}

/** Test-only. Forces the schema version, to simulate a version bump for blocked/blocking tests. */
export function _setVersionForTests(v: number): void {
  version = v;
}

/** Test-only. Drops the cached connection, optionally wiping the stored snapshot. */
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
