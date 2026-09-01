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
});
