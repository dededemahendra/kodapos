import 'fake-indexeddb/auto';
import { deleteDB, openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  _resetForTests,
  _setVersionForTests,
  DB_NAME,
  enqueue,
  list,
  recordAttempt,
  remove,
  size,
} from '~/lib/offline/outbox';

const payload = (n: number) =>
  ({
    shiftId: `shift${n}`,
    cashierId: `cashier${n}`,
    lines: [],
    cashTenderedIDR: 1000 * n,
    totalIDR: 1000 * n,
    createdAtClient: n,
  }) as never;

describe('outbox', () => {
  beforeEach(async () => {
    await _resetForTests();
  });

  // The blocked-open test below deliberately lets a version bump complete
  // in the background (that's the fix under test: a late-arriving
  // connection gets closed, not leaked) — but the schema version it
  // upgrades to is real and persists in the shared fake-indexeddb
  // registry. Delete the whole database after every test so version state
  // never leaks into a test appended later. `_resetForTests()` first
  // closes this module's own connection, since an open connection would
  // block the delete the same way it blocks an open; the delete itself is
  // bounded so a real regression (a leaked, still-open connection)
  // reports as a clean test failure instead of hanging the whole suite.
  afterEach(async () => {
    await _resetForTests();
    await Promise.race([
      deleteDB(DB_NAME).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
  });

  it('returns queued sales in FIFO order', async () => {
    await enqueue({ clientId: 'a', payload: payload(1), queuedAt: 100 });
    await enqueue({ clientId: 'b', payload: payload(2), queuedAt: 200 });
    expect((await list()).map((s) => s.clientId)).toEqual(['a', 'b']);
  });

  it('survives a fresh connection to the same database', async () => {
    await enqueue({ clientId: 'a', payload: payload(1), queuedAt: 100 });
    await _resetForTests({ keepData: true });
    expect(await size()).toBe(1);
  });

  it('remove deletes only the named entry', async () => {
    await enqueue({ clientId: 'a', payload: payload(1), queuedAt: 100 });
    await enqueue({ clientId: 'b', payload: payload(2), queuedAt: 200 });
    await remove('a');
    expect((await list()).map((s) => s.clientId)).toEqual(['b']);
  });

  it('enqueue is idempotent on clientId', async () => {
    await enqueue({ clientId: 'a', payload: payload(1), queuedAt: 100 });
    await enqueue({ clientId: 'a', payload: payload(1), queuedAt: 100 });
    expect(await size()).toBe(1);
  });

  it('recordAttempt increments the attempt counter', async () => {
    await enqueue({ clientId: 'a', payload: payload(1), queuedAt: 100 });
    await recordAttempt('a');
    await recordAttempt('a');
    expect((await list())[0]?.attempts).toBe(2);
  });

  it('recordAttempt is race-safe under concurrent calls', async () => {
    await enqueue({ clientId: 'a', payload: payload(1), queuedAt: 100 });
    const concurrency = 5;
    await Promise.all(Array.from({ length: concurrency }, () => recordAttempt('a')));
    expect((await list())[0]?.attempts).toBe(concurrency);
  });

  it('rejects a blocked open, then closes the late connection instead of leaking it', async () => {
    // Simulate a stale tab that never closed its connection at the old
    // schema version, the way a multi-tab register would during a deploy.
    const stale = await openDB(DB_NAME, 1);
    _setVersionForTests(2);
    await expect(size()).rejects.toThrow(/blocked/i);

    // The stale tab finally closes. idb doesn't cancel the earlier open
    // just because we gave up waiting on it — it resolves late with a
    // real, live connection nobody holds a reference to any more. If it
    // isn't closed there, it leaks: permanently open, blocking every
    // later version bump forever, including the one below.
    stale.close();

    // Let fake-indexeddb's queued tasks (upgrade, success, our
    // close-on-late-arrival handling) actually run before checking the
    // outcome — without making any further open attempts of our own in
    // the meantime. A fresh attempt here would just queue up behind the
    // still-in-flight one and turn a clean pass/fail into a pileup of
    // competing requests.
    for (let i = 0; i < 25; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Exactly one more attempt, at a version higher than either
    // connection. If the late connection leaked, it's still open and
    // blocks this; if it was closed, this resolves cleanly.
    _setVersionForTests(3);
    await expect(size()).resolves.toBe(0);
  });
});
