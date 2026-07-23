import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rememberAuthMethod, takeAuthMethod } from '../../src/lib/analytics/auth-method';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
});

const KEY = 'kodapos.analytics.authMethod';
const TEN_MINUTES_MS = 10 * 60 * 1000;

describe('auth method handoff', () => {
  it('round-trips a remembered method', () => {
    rememberAuthMethod('google');
    expect(takeAuthMethod()).toBe('google');
  });

  it('consumes the value so a later sign-in is not misattributed', () => {
    rememberAuthMethod('otp');
    expect(takeAuthMethod()).toBe('otp');
    expect(takeAuthMethod()).toBeNull();
  });

  it('returns null when nothing was remembered', () => {
    expect(takeAuthMethod()).toBeNull();
  });

  it('rejects a value that is not a known method', () => {
    store.set(KEY, 'carrier_pigeon');
    expect(takeAuthMethod()).toBeNull();
  });

  describe('expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns the method when read well within the TTL window', () => {
      rememberAuthMethod('password');
      vi.advanceTimersByTime(TEN_MINUTES_MS - 1);
      expect(takeAuthMethod()).toBe('password');
    });

    it('is still valid at exactly the TTL boundary', () => {
      rememberAuthMethod('password');
      vi.advanceTimersByTime(TEN_MINUTES_MS);
      expect(takeAuthMethod()).toBe('password');
    });

    it('returns null once the entry is older than the TTL window', () => {
      rememberAuthMethod('password');
      vi.advanceTimersByTime(TEN_MINUTES_MS + 1);
      expect(takeAuthMethod()).toBeNull();
    });

    it('still consumes the entry when it is rejected as expired', () => {
      rememberAuthMethod('otp');
      vi.advanceTimersByTime(TEN_MINUTES_MS + 1);
      expect(takeAuthMethod()).toBeNull();
      expect(store.has(KEY)).toBe(false);
    });

    it('rejects a malformed (unparseable) stored entry', () => {
      store.set(KEY, '{not valid json');
      expect(takeAuthMethod()).toBeNull();
      expect(store.has(KEY)).toBe(false);
    });

    it('rejects a well-formed JSON entry missing the expected shape', () => {
      store.set(KEY, JSON.stringify({ method: 'google' }));
      expect(takeAuthMethod()).toBeNull();
    });
  });
});
