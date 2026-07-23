import { describe, expect, it } from 'vitest';
import {
  buildSuperProperties,
  isCustomerSurface,
  isNewAccount,
  NEW_ACCOUNT_WINDOW_MS,
  shouldTrackPath,
} from '../../src/lib/analytics/policy';

describe('shouldTrackPath', () => {
  it('tracks the marketing pages', () => {
    for (const path of ['/', '/signin', '/signup', '/changelog', '/privacy', '/terms']) {
      expect(shouldTrackPath(path)).toBe(true);
    }
  });

  it('ignores a trailing slash', () => {
    expect(shouldTrackPath('/signin/')).toBe(true);
    expect(shouldTrackPath('/')).toBe(true);
  });

  // These three are the privacy-critical exclusions from the design doc.
  it('never tracks the cafe customer self-order page', () => {
    expect(shouldTrackPath('/order/477289968ce6e4948622c74c87048c94')).toBe(false);
    expect(shouldTrackPath('/order')).toBe(false);
  });

  it('never tracks the unattended customer screens', () => {
    expect(shouldTrackPath('/menu-board')).toBe(false);
    expect(shouldTrackPath('/display')).toBe(false);
  });

  it('does not track authenticated surfaces in this slice', () => {
    for (const path of ['/dashboard', '/cashier', '/reservations', '/kitchen', '/admin/users']) {
      expect(shouldTrackPath(path)).toBe(false);
    }
  });

  it('default-denies an unknown route', () => {
    expect(shouldTrackPath('/some-route-added-next-week')).toBe(false);
  });
});

describe('isNewAccount', () => {
  it('treats a just-created account as new', () => {
    expect(isNewAccount(0)).toBe(true);
    expect(isNewAccount(NEW_ACCOUNT_WINDOW_MS - 1)).toBe(true);
  });

  it('treats an older account as returning', () => {
    expect(isNewAccount(NEW_ACCOUNT_WINDOW_MS)).toBe(false);
    expect(isNewAccount(86_400_000)).toBe(false);
  });

  it('treats clock skew as returning rather than new', () => {
    expect(isNewAccount(-5_000)).toBe(false);
  });
});

describe('isCustomerSurface', () => {
  // Gates whether the SDK even initialises, independent of shouldTrackPath's
  // pageview allowlist: cafe end-customers must never load posthog-js at
  // all, not just be excluded from pageview events.
  it('flags the cafe customer self-order page, with or without a token', () => {
    expect(isCustomerSurface('/order/477289968ce6e4948622c74c87048c94')).toBe(true);
    expect(isCustomerSurface('/order')).toBe(true);
  });

  it('flags the unattended customer screens', () => {
    expect(isCustomerSurface('/menu-board')).toBe(true);
    expect(isCustomerSurface('/display')).toBe(true);
  });

  it('does not flag ordinary marketing or authenticated paths', () => {
    for (const path of ['/', '/signin', '/signup', '/dashboard', '/cashier']) {
      expect(isCustomerSurface(path)).toBe(false);
    }
  });
});

describe('buildSuperProperties', () => {
  it('emits snake_case keys and the public surface', () => {
    expect(buildSuperProperties({ locale: 'id', appVersion: '1.4.0' })).toEqual({
      locale: 'id',
      app_version: '1.4.0',
      surface: 'public',
    });
  });
});
