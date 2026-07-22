import type { TokenStorage } from '@convex-dev/auth/react';

/**
 * A `TokenStorage` adapter for `ConvexAuthProvider` that persists Convex Auth
 * tokens in `localStorage`, so a signed-in session survives a tab or browser
 * close (the user is not asked to sign in again on the next visit). An
 * unattended shared register is protected by the idle PIN auto-lock
 * (`useAutoLock`), not by dropping the session on close. All operations are
 * SSR-guarded.
 */
export const authStorage: TokenStorage = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    // Prefer localStorage; fall back to sessionStorage so a session created
    // before this change (when tokens lived in sessionStorage) is not force
    // signed-out on first load after the update.
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
    // Clear any legacy sessionStorage copy so a token never lingers in both.
    window.sessionStorage.removeItem(key);
  },
  removeItem(key: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};
