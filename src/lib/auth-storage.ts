import type { TokenStorage } from '@convex-dev/auth/react';

const REMEMBER_ME_KEY = 'kodapos.rememberMe';

/**
 * Persist the remember-me preference. When ON, Convex Auth tokens live in
 * `localStorage` (survive a browser restart); when OFF, in `sessionStorage`
 * (cleared when the tab/browser closes). Call this BEFORE `signIn`.
 */
export function setRememberMe(remember: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REMEMBER_ME_KEY, remember ? '1' : '0');
}

// Opt-in: defaults to FALSE when the flag is absent, so a fresh visitor on a
// shared register is NOT remembered unless they explicitly tick the box.
function remembering(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(REMEMBER_ME_KEY) === '1';
}

/**
 * A `TokenStorage` adapter for `ConvexAuthProvider` that routes token writes to
 * `localStorage` (remember-me ON) or `sessionStorage` (OFF), and reads back
 * preferring a live session token over a remembered one. A token never lingers
 * in both stores. All operations are SSR-guarded.
 */
export const authStorage: TokenStorage = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    if (remembering()) {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
      window.localStorage.removeItem(key);
    }
  },
  removeItem(key: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};
