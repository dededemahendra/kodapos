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
