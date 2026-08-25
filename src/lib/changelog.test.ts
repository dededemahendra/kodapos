import { describe, expect, it } from 'vitest';
import type { ChangelogEntry } from './changelog';
import { CHANGELOG, LATEST_CHANGE, latestOf } from './changelog';

const parse = (v: string) => v.split('.').map(Number);

/** Compares dotted versions numerically: 1.10 is newer than 1.9. */
function compareVersions(a: string, b: string): number {
  const [aa, bb] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const diff = (aa[i] ?? 0) - (bb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

describe('CHANGELOG', () => {
  it('is not stale: the newest entry is no older than the last shipped release', () => {
    // The sidebar card shows LATEST_CHANGE. If this fails, a user-facing
    // release shipped without an entry here and every owner is being shown a
    // months-old "what's new".
    expect(LATEST_CHANGE.date >= '2026-08-22').toBe(true);
  });

  it('picks the newest entry even when the list is not sorted', () => {
    // The point of the fix. Asserting against CHANGELOG itself proves nothing
    // here: it is already newest-first, so CHANGELOG[0] would satisfy it too.
    const entry = (version: string, date: string): ChangelogEntry => ({
      version,
      date,
      title: { id: version, en: version },
      summary: { id: version, en: version },
    });
    const unsorted = [
      entry('1.0', '2026-01-01'),
      entry('1.2', '2026-03-01'), // newest, deliberately not at index 0
      entry('1.1', '2026-02-01'),
    ];

    expect(latestOf(unsorted).version).toBe('1.2');
  });

  it('surfaces an entry appended to the end of the list', () => {
    // The failure mode the old CHANGELOG[0] had: appending is the natural
    // instinct, and it silently left the card on the previous release.
    const appended = [
      ...CHANGELOG,
      {
        version: '99.0',
        date: '2099-01-01',
        title: { id: 'baru', en: 'new' },
        summary: { id: 'baru', en: 'new' },
      },
    ];

    expect(latestOf(appended).version).toBe('99.0');
  });

  it('exposes the entry with the newest date as LATEST_CHANGE', () => {
    expect(LATEST_CHANGE).toBe(latestOf(CHANGELOG));
  });

  it('stays ordered newest-first, so /changelog renders a correct timeline', () => {
    const dates = CHANGELOG.map((e) => e.date);
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  });

  it('has a unique, descending version per entry', () => {
    const versions = CHANGELOG.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([...versions].sort((a, b) => compareVersions(b, a)));
  });

  it('carries both locales for every entry', () => {
    for (const entry of CHANGELOG) {
      expect(entry.title.id, `title.id for v${entry.version}`).toBeTruthy();
      expect(entry.title.en, `title.en for v${entry.version}`).toBeTruthy();
      expect(entry.summary.id, `summary.id for v${entry.version}`).toBeTruthy();
      expect(entry.summary.en, `summary.en for v${entry.version}`).toBeTruthy();
    }
  });
});
