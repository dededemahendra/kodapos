import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    store.set('kodapos.analytics.authMethod', 'carrier_pigeon');
    expect(takeAuthMethod()).toBeNull();
  });
});
