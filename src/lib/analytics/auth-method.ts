/**
 * Carries the auth method across a sign-in attempt.
 *
 * Google sign-in leaves the page and returns by redirect, so no handler in
 * signin.tsx observes its success. The provider fires auth_completed on the
 * auth transition instead, and reads the method from here.
 *
 * sessionStorage rather than localStorage: this is scoped to one attempt in one
 * tab, and must not outlive the browser session.
 */
import type { AuthMethod } from './events';

const KEY = 'kodapos.analytics.authMethod';
const VALID: readonly AuthMethod[] = ['otp', 'password', 'google'];

export function rememberAuthMethod(method: AuthMethod): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(KEY, method);
}

/** Reads and clears, so a later sign-in is never misattributed to this method. */
export function takeAuthMethod(): AuthMethod | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(KEY);
  window.sessionStorage.removeItem(KEY);
  return VALID.includes(raw as AuthMethod) ? (raw as AuthMethod) : null;
}
