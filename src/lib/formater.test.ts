import { i18n } from '@lingui/core';
import { describe, expect, it } from 'vitest';
import { formatDate, formatIDR } from '~/lib/formater';

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
