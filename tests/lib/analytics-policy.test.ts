import { describe, expect, it } from 'vitest';
import {
  buildSuperProperties,
  isCustomerSurface,
  isNewAccount,
  isTrackedHost,
  NEW_ACCOUNT_WINDOW_MS,
  shouldTrackPath,
} from '../../src/lib/analytics/policy';

describe('isTrackedHost', () => {
  // The key now lives in the Cloudflare dashboard, so every build that ships
  // carries it: local dev, branch previews and production all become live
  // trackers unless the host itself is checked. Real product data must not be
  // polluted by developer sessions, and a preview URL must never write to the
  // production project.
  it('tracks the production domain', () => {
    expect(isTrackedHost('kodapos.app')).toBe(true);
    expect(isTrackedHost('www.kodapos.app')).toBe(true);
  });

  it('does not track local development', () => {
    expect(isTrackedHost('localhost')).toBe(false);
    expect(isTrackedHost('127.0.0.1')).toBe(false);
    expect(isTrackedHost('0.0.0.0')).toBe(false);
  });

  it('does not track Cloudflare preview deployments', () => {
    expect(isTrackedHost('kodapos.workers.dev')).toBe(false);
    expect(isTrackedHost('a1b2c3-kodapos.dede.workers.dev')).toBe(false);
  });

  // Exact match, never a suffix or prefix test. `endsWith('kodapos.app')` would
  // accept an attacker-controlled `kodapos.app.example.com`, and
  // `includes('kodapos.app')` is worse still.
  it('does not track lookalike hosts', () => {
    expect(isTrackedHost('kodapos.app.example.com')).toBe(false);
    expect(isTrackedHost('notkodapos.app')).toBe(false);
    expect(isTrackedHost('staging.kodapos.app')).toBe(false);
    expect(isTrackedHost('')).toBe(false);
  });
});

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
