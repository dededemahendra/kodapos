import { i18n } from '@lingui/core';
import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatDate,
  formatDayKey,
  formatIDR,
  formatRelative,
} from '~/lib/formater';

describe('formatter (locale-aware)', () => {
  it('keeps IDR currency regardless of locale', () => {
    i18n.activate('en');
    expect(formatIDR(1234567)).toContain('Rp');
    i18n.activate('id');
    expect(formatIDR(1234567)).toContain('Rp');
  });
  it('formats month names per active locale', () => {
    // May: Indonesian short = "Mei", English short = "May" — distinguishable.
    i18n.activate('id');
    expect(formatDate('2026-05-13', 'day-month')).toMatch(/Mei/);
    i18n.activate('en');
    expect(formatDate('2026-05-13', 'day-month')).toMatch(/May/);
  });
});

describe('formatDayKey (timezone-stable)', () => {
  it('renders the calendar day from the key, not the browser timezone', () => {
    // Key encodes the intended day; output must be the 2nd regardless of tz.
    i18n.activate('id');
    expect(formatDayKey('2026-01-02')).toMatch(/2\s*Jan/);
    i18n.activate('en');
    expect(formatDayKey('2026-01-02')).toMatch(/Jan\s*2/);
  });
  it('returns the raw key when it is malformed', () => {
    expect(formatDayKey('not-a-date')).toBe('not-a-date');
  });
});

describe('formatCount (locale-aware grouping)', () => {
  it('groups thousands per active locale', () => {
    i18n.activate('id');
    expect(formatCount(1234)).toBe('1.234');
    i18n.activate('en');
    expect(formatCount(1234)).toBe('1,234');
  });
});

describe('formatRelative', () => {
  it('renders sub-minute differences as "now", not "this minute"', () => {
    i18n.activate('en');
    const out = formatRelative(Date.now() - 5_000);
    expect(out).toBe('now');
  });
});
