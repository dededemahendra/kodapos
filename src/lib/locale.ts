export type Locale = 'id' | 'en';

export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'id', label: 'Indonesia' },
];

export const DEFAULT_LOCALE: Locale = 'en';
const STORAGE_KEY = 'kodapos.locale';

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === 'id' || value === 'en' ? value : DEFAULT_LOCALE;
}

/** Browser-only read; returns DEFAULT_LOCALE on the server. */
export function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    return normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function storeLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore (private mode, etc.) */
  }
}
