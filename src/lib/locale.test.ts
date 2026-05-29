import { describe, expect, it } from 'vitest';
import { LOCALES, normalizeLocale } from '~/lib/locale';

describe('normalizeLocale', () => {
  it('passes through supported locales', () => {
    expect(normalizeLocale('id')).toBe('id');
    expect(normalizeLocale('en')).toBe('en');
  });
  it('falls back to id for unknown/empty values', () => {
    expect(normalizeLocale('fr')).toBe('id');
    expect(normalizeLocale(null)).toBe('id');
    expect(normalizeLocale(undefined)).toBe('id');
    expect(normalizeLocale('')).toBe('id');
  });
  it('exposes the supported locales with labels', () => {
    expect(LOCALES.map((l) => l.value)).toEqual(['id', 'en']);
    expect(LOCALES.find((l) => l.value === 'id')?.label).toBe('Indonesia');
  });
});
