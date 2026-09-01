import { describe, expect, it, vi } from 'vitest';
import { drain } from '~/lib/offline/replay';

const entry = (clientId: string, attempts = 0) => ({
  clientId,
  payload: {} as never,
  queuedAt: 1,
  attempts,
});

describe('drain', () => {
  it('posts every queued sale and removes each on success', async () => {
    const remove = vi.fn(async (_clientId: string) => {});
    const res = await drain({
      list: async () => [entry('a'), entry('b')],
      remove,
      recordAttempt: async () => {},
      post: async () => {},
    });
    expect(res.posted).toBe(2);
    expect(remove.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });

  it('keeps an entry queued when posting fails', async () => {
    const remove = vi.fn(async () => {});
    const res = await drain({
      list: async () => [entry('a')],
      remove,
      recordAttempt: async () => {},
      post: async () => {
        throw new Error('network');
      },
    });
    expect(res.posted).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });

  it('stops at the first failure to preserve order', async () => {
    // Sales must post in the order they were rung; posting 'b' after 'a'
    // failed would reorder the day's takings.
    const post = vi.fn(async (_p: never) => {
      throw new Error('network');
    });
    await drain({
      list: async () => [entry('a'), entry('b')],
      remove: async () => {},
      recordAttempt: async () => {},
      post: post as never,
    });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('dead-letters an entry past maxAttempts instead of retrying forever', async () => {
    const remove = vi.fn(async () => {});
    const res = await drain({
      list: async () => [entry('a', 5)],
      remove,
      recordAttempt: async () => {},
      post: async () => {
        throw new Error('permanent');
      },
      maxAttempts: 5,
    });
    expect(res.deadLettered).toEqual(['a']);
    expect(remove).not.toHaveBeenCalled();
  });

  it('skips a dead-lettered entry and keeps draining the rest, in order', async () => {
    // The property `break`-on-dead-letter would have violated: one
    // permanently unpostable sale (e.g. the modifier-inclusive
    // unitPriceIDR mismatch outbox.ts warns about) must not head-of-line
    // block every later, still-postable sale on every future drain.
    const remove = vi.fn(async (_clientId: string) => {});
    // Always succeeds: 'stuck' is dead-lettered before post is ever called
    // for it, so this only ever has to post 'b' and 'c'.
    const post = vi.fn(async () => {});
    const res = await drain({
      list: async () => [entry('stuck', 5), entry('b'), entry('c')],
      remove,
      recordAttempt: async () => {},
      post,
      maxAttempts: 5,
    });
    expect(res.deadLettered).toEqual(['stuck']);
    expect(res.posted).toBe(2);
    expect(remove.mock.calls.map((c) => c[0])).toEqual(['b', 'c']);
    // 'stuck' was skipped, never handed to post — only the two postable
    // sales were, still in their original order.
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('still stops at a genuine failure that follows a dead letter', async () => {
    // Skipping dead letters must not be confused with skipping real
    // failures: ordering among postable sales still has to hold.
    const remove = vi.fn(async () => {});
    const post = vi.fn(async () => {
      throw new Error('network');
    });
    const res = await drain({
      list: async () => [entry('stuck', 5), entry('b'), entry('c')],
      remove,
      recordAttempt: async () => {},
      post,
      maxAttempts: 5,
    });
    expect(res.deadLettered).toEqual(['stuck']);
    expect(res.posted).toBe(0);
    // Only 'b' was attempted — the loop stopped there instead of also
    // trying 'c'.
    expect(post).toHaveBeenCalledTimes(1);
  });
});
