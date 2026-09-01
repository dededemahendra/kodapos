import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { isUsable } from '~/lib/offline/register-cache';

const DAY = 24 * 60 * 60 * 1000;

describe('isUsable', () => {
  it('rejects a null snapshot', () => {
    expect(isUsable(null, 0)).toBe(false);
  });

  it('accepts a snapshot written just now', () => {
    expect(isUsable({ writtenAt: 1000 } as never, 1000)).toBe(true);
  });

  it('accepts a snapshot just under 24 hours old', () => {
    expect(isUsable({ writtenAt: 0 } as never, DAY - 1)).toBe(true);
  });

  it('rejects a snapshot at or past 24 hours', () => {
    // Prices days out of date are worse than refusing the sale: the cashier
    // can fall back to a manual receipt, but a wrong price is a silent loss.
    expect(isUsable({ writtenAt: 0 } as never, DAY)).toBe(false);
  });
});
