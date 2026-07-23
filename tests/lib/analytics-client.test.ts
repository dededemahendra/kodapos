import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAnalyticsEnabled } from '../../src/lib/analytics/client';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isAnalyticsEnabled', () => {
  // The whole integration is env-gated. With no key configured, posthog-js is
  // never imported and no request is made, which is what keeps CI and the
  // existing suite unaffected and what lets this slice ship to production inert.
  //
  // The env is stubbed rather than read: a developer following the manual
  // verification checklist has a real key in .env.local, Vite loads that into
  // the test run, and a test asserting the ambient value would fail on their
  // machine while passing in CI.
  it('is disabled when no key is configured', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    expect(isAnalyticsEnabled()).toBe(false);
  });

  it('is disabled during SSR even when a key is configured', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    const original = globalThis.window;
    // biome-ignore lint/suspicious/noExplicitAny: deleting a global for an SSR simulation
    delete (globalThis as any).window;
    expect(isAnalyticsEnabled()).toBe(false);
    if (original !== undefined) {
      // biome-ignore lint/suspicious/noExplicitAny: restoring the deleted global
      (globalThis as any).window = original;
    }
  });
});
