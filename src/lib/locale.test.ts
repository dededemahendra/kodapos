import { describe, expect, it } from 'vitest';
import { LOCALES, normalizeLocale } from '~/lib/locale';

describe('normalizeLocale', () => {
  it('passes through supported locales', () => {
    expect(normalizeLocale('id')).toBe('id');
    expect(normalizeLocale('en')).toBe('en');
  });
  // Pinned to the literal rather than DEFAULT_LOCALE: the point of this test is
  // to catch an accidental flip of the default, which an assertion against the
  // constant itself could never do. Indonesian is the default deliberately —
  // the marketing site is indexed in Indonesian (og:locale id_ID, lang="id").
  it("falls back to the default ('id') for unknown/empty values", () => {
    expect(normalizeLocale('fr')).toBe('id');
    expect(normalizeLocale(null)).toBe('id');
    expect(normalizeLocale(undefined)).toBe('id');
    expect(normalizeLocale('')).toBe('id');
  });
  it('exposes the supported locales with labels, English first', () => {
    expect(LOCALES.map((l) => l.value)).toEqual(['en', 'id']);
    expect(LOCALES.find((l) => l.value === 'id')?.label).toBe('Indonesia');
  });
});
