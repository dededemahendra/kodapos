/**
 * Carries the auth method across a sign-in attempt.
 *
 * Google sign-in leaves the page and returns by redirect, so no handler in
 * signin.tsx observes its success. The provider fires auth_completed on the
 * auth transition instead, and reads the method from here.
 *
 * sessionStorage rather than localStorage: this is scoped to one attempt in one
 * tab, and must not outlive the browser session.
 *
 * The stored value carries a timestamp and expires after TTL_MS. Without
 * that, a user who starts an attempt, abandons it, and later reaches an
 * authenticated route in the same tab (e.g. a stale magic-link tab, or
 * signing in some other way) would have that leftover value picked up and
 * reported as a completion that never happened.
 */
import type { AuthMethod } from './events';

const KEY = 'kodapos.analytics.authMethod';
const VALID: readonly AuthMethod[] = ['otp', 'password', 'google'];

/** Comfortably longer than any real sign-in, including reading an emailed code. */
const TTL_MS = 10 * 60 * 1000;

type StoredMethod = { method: AuthMethod; storedAt: number };

export function rememberAuthMethod(method: AuthMethod): void {
  if (typeof window === 'undefined') return;
  const entry: StoredMethod = { method, storedAt: Date.now() };
  window.sessionStorage.setItem(KEY, JSON.stringify(entry));
}

/**
 * Reads and clears, so a later sign-in is never misattributed to this
 * method. Also rejects (and still clears) an entry older than TTL_MS, or one
 * that isn't a well-formed { method, storedAt } record.
 */
export function takeAuthMethod(): AuthMethod | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(KEY);
  window.sessionStorage.removeItem(KEY);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('method' in parsed) ||
    !('storedAt' in parsed)
  ) {
    return null;
  }
  const { method, storedAt } = parsed as { method: unknown; storedAt: unknown };
  if (typeof storedAt !== 'number' || !Number.isFinite(storedAt)) return null;
  if (!VALID.includes(method as AuthMethod)) return null;
  if (Date.now() - storedAt > TTL_MS) return null;

  return method as AuthMethod;
}
