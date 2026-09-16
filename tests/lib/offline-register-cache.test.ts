import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetForTests,
  DB_NAME,
  isUsable,
  load,
  type RegisterSnapshot,
  save,
} from '~/lib/offline/register-cache';

const DAY = 24 * 60 * 60 * 1000;

const snapshot = (): Omit<RegisterSnapshot, 'writtenAt'> =>
  ({
    items: [{ _id: 'item1' }],
    categories: [{ _id: 'cat1' }],
    modifierGroups: [{ _id: 'mg1' }],
    modifierOptions: [{ _id: 'mo1' }],
    variants: [{ _id: 'var1' }],
    priceCategories: [{ _id: 'pc1' }],
    promos: [{ _id: 'promo1' }],
    settings: { _id: 'settings1' },
    shift: { _id: 'shift1' },
    staff: [{ _id: 'staff1' }],
  }) as never;

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

  it('rejects a snapshot dated in the future', () => {
    // A hand-set clock or a dead RTC battery can leave writtenAt ahead of
    // `now`. Without this guard, `now - writtenAt` goes negative and stays
    // under the bound forever — the snapshot would never expire.
    expect(isUsable({ writtenAt: 1000 } as never, 0)).toBe(false);
  });
});

describe('save / load', () => {
  afterEach(async () => {
    await _resetForTests();
    await Promise.race([
      deleteDB(DB_NAME).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
  });

  it('returns null when nothing has been saved', async () => {
    expect(await load()).toBeNull();
  });

  it('round-trips a saved snapshot, stamped with writtenAt', async () => {
    const before = Date.now();
    await save(snapshot());
    const loaded = await load();
    expect(loaded).not.toBeNull();
    expect(loaded).toMatchObject(snapshot());
    expect(loaded?.writtenAt).toBeGreaterThanOrEqual(before);
    expect(loaded?.writtenAt).toBeLessThanOrEqual(Date.now());
  });
});
