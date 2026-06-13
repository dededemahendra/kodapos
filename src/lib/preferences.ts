import { useState } from 'react';

export type Density = 'compact' | 'comfortable';

export const DEFAULT_DENSITY: Density = 'compact';

const DENSITY_KEY = 'kodapos.density';

function isValidDensity(value: string | null | undefined): value is Density {
  return value === 'compact' || value === 'comfortable';
}

/** Browser-only read; returns DEFAULT_DENSITY on the server. */
export function getDensity(): Density {
  if (typeof window === 'undefined') return DEFAULT_DENSITY;
  try {
    const stored = window.localStorage.getItem(DENSITY_KEY);
    return isValidDensity(stored) ? stored : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}

export function storeDensity(density: Density): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DENSITY_KEY, density);
  } catch {
    /* ignore (private mode, etc.) */
  }
}

/** Sets document.documentElement.dataset.density; guarded for SSR. */
export function applyDensity(density: Density): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.density = density;
}

// ---------------------------------------------------------------------------
// Theme (light / dark / system) — browser-only, SSR-safe
// ---------------------------------------------------------------------------

export type Theme = 'light' | 'dark' | 'system';

export const DEFAULT_THEME: Theme = 'system';

const THEME_KEY = 'kodapos.theme';

function isValidTheme(value: string | null | undefined): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Browser-only read; returns DEFAULT_THEME on the server. */
export function getTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isValidTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function storeTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore (private mode, etc.) */
  }
}

/** Toggles the `.dark` class on <html>; guarded for SSR. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

// ---------------------------------------------------------------------------
// Date / time format readers (browser-only, SSR-safe)
// ---------------------------------------------------------------------------

export type DateFormatPref = 'dmy-short' | 'dmy-numeric' | 'iso';
export type TimeFormatPref = '24' | '12';

const DEFAULT_DATE_FORMAT: DateFormatPref = 'dmy-short';
const DEFAULT_TIME_FORMAT: TimeFormatPref = '24';

function isValidDateFormat(v: string | null | undefined): v is DateFormatPref {
  return v === 'dmy-short' || v === 'dmy-numeric' || v === 'iso';
}

function isValidTimeFormat(v: string | null | undefined): v is TimeFormatPref {
  return v === '24' || v === '12';
}

/** Browser-only read; returns DEFAULT_DATE_FORMAT on the server. */
export function getDateFormat(): DateFormatPref {
  if (typeof window === 'undefined') return DEFAULT_DATE_FORMAT;
  try {
    const stored = window.localStorage.getItem('kodapos.dateFormat');
    return isValidDateFormat(stored) ? stored : DEFAULT_DATE_FORMAT;
  } catch {
    return DEFAULT_DATE_FORMAT;
  }
}

/** Browser-only read; returns DEFAULT_TIME_FORMAT on the server. */
export function getTimeFormat(): TimeFormatPref {
  if (typeof window === 'undefined') return DEFAULT_TIME_FORMAT;
  try {
    const stored = window.localStorage.getItem('kodapos.timeFormat');
    return isValidTimeFormat(stored) ? stored : DEFAULT_TIME_FORMAT;
  } catch {
    return DEFAULT_TIME_FORMAT;
  }
}

// ---------------------------------------------------------------------------
// Changelog card dismissal (browser-only, SSR-safe)
// ---------------------------------------------------------------------------

const CHANGELOG_DISMISSED_KEY = 'kodapos.changelogDismissed';

/** The latest changelog version the user dismissed, or null. */
export function getDismissedChangelog(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(CHANGELOG_DISMISSED_KEY);
  } catch {
    return null;
  }
}

export function storeDismissedChangelog(version: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHANGELOG_DISMISSED_KEY, version);
  } catch {
    /* ignore (private mode, etc.) */
  }
}

// ---------------------------------------------------------------------------
// Auto-lock idle timeout (browser-only, SSR-safe)
// ---------------------------------------------------------------------------

/**
 * Minutes of inactivity before the register auto-locks back to the PIN screen.
 * `0` means disabled. Read fresh from localStorage so a change in settings
 * takes effect on the next activity tick without a reload.
 */
export function getAutoLockMinutes(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem('kodapos.autoLock');
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------

/**
 * Small typed localStorage hook. Key is namespaced as `kodapos.<key>`.
 * Falls back to `fallback` when the key is absent or localStorage is unavailable.
 */
export function usePreference<T extends string>(
  key: string,
  fallback: T,
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return fallback;
    try {
      return (window.localStorage.getItem(`kodapos.${key}`) as T) ?? fallback;
    } catch {
      return fallback;
    }
  });

  const set = (v: T) => {
    setValue(v);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(`kodapos.${key}`, v);
      } catch {
        /* ignore (private mode, quota exceeded, etc.) */
      }
    }
  };

  return [value, set];
}

/**
 * Boolean variant of `usePreference`. Stores the string `'true'` or `'false'`.
 */
export function useBoolPreference(
  key: string,
  fallback: boolean,
): [boolean, (v: boolean) => void] {
  const [raw, setRaw] = usePreference<'true' | 'false'>(
    key,
    fallback ? 'true' : 'false',
  );

  const set = (v: boolean) => setRaw(v ? 'true' : 'false');

  return [raw === 'true', set];
}
