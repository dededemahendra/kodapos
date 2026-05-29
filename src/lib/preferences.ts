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
