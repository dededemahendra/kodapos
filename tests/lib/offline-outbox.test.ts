import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetForTests, enqueue, list, recordAttempt, remove, size } from '~/lib/offline/outbox';

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
});
