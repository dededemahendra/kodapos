import { describe, expect, it } from 'vitest';
import { LOCALES, normalizeLocale } from '~/lib/locale';

describe('normalizeLocale', () => {
  it('passes through supported locales', () => {
    expect(normalizeLocale('id')).toBe('id');
    expect(normalizeLocale('en')).toBe('en');
  });
  it('falls back to the default (en) for unknown/empty values', () => {
    expect(normalizeLocale('fr')).toBe('en');
    expect(normalizeLocale(null)).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
    expect(normalizeLocale('')).toBe('en');
  });
  it('exposes the supported locales with labels, English first', () => {
    expect(LOCALES.map((l) => l.value)).toEqual(['en', 'id']);
    expect(LOCALES.find((l) => l.value === 'id')?.label).toBe('Indonesia');
  });
});
