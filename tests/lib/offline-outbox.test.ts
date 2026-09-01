import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
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

  it('rejects instead of hanging when a stale connection blocks a version bump', async () => {
    // Simulate a stale tab that never closed its connection at the old
    // schema version, the way a multi-tab register would during a deploy.
    const stale = await openDB(DB_NAME, 1);
    _setVersionForTests(2);
    try {
      await expect(size()).rejects.toThrow(/blocked/i);
    } finally {
      stale.close();
      _setVersionForTests(1);
    }
  });
});
