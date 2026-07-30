import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAnalyticsEnabled } from '../../src/lib/analytics/client';

/**
 * isAnalyticsEnabled() gates on the hostname as well as the key, so any test
 * exercising the enabled path has to look like production. Restored in
 * afterEach so a leaked hostname cannot make another test pass for the wrong
 * reason.
 *
 * `pathname` is set explicitly rather than inherited from the spread: happy-dom
 * exposes location's fields as prototype getters, so `{ ...window.location }`
 * copies no own properties and every field this doesn't name lands as
 * undefined. before_send reads pathname, and a stub without one makes it throw
 * on a value that is always a string in a real browser.
 */
function stubHostname(hostname: string, pathname = '/'): void {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, hostname, pathname },
    configurable: true,
    writable: true,
  });
}

const realLocation = typeof window === 'undefined' ? undefined : window.location;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('posthog-js');
  vi.resetModules();
  if (realLocation !== undefined) {
    Object.defineProperty(window, 'location', {
      value: realLocation,
      configurable: true,
      writable: true,
    });
  }
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

  // The key is set in the Cloudflare dashboard, so it is present in local dev
  // and in every branch preview build too. The hostname is what keeps those
  // sessions out of the production PostHog project.
  it('is disabled on a non-production host even when a key is configured', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    stubHostname('localhost');
    expect(isAnalyticsEnabled()).toBe(false);
    stubHostname('a1b2c3-kodapos.dede.workers.dev');
    expect(isAnalyticsEnabled()).toBe(false);
  });

  it('is enabled on the production host with a key configured', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    stubHostname('kodapos.app');
    expect(isAnalyticsEnabled()).toBe(true);
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

describe('initAnalytics', () => {
  // Direct-to-PostHog with no reverse proxy in front of it means an ad
  // blocker failing the posthog-js chunk is a realistic case. initAnalytics
  // must degrade to inert (resolve false) instead of rejecting, so a caller
  // that only handles the resolved value never sees an unhandled rejection
  // and never mistakes a failed init for a ready client.
  it('resolves false instead of rejecting when the posthog-js import fails', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    stubHostname('kodapos.app');
    vi.doMock('posthog-js', () => {
      throw new Error('blocked');
    });
    vi.resetModules();
    const { initAnalytics } = await import('../../src/lib/analytics/client');
    await expect(initAnalytics({})).resolves.toBe(false);
  });

  // `client` is only assigned after the dynamic import resolves, so the
  // `if (client)` guard alone does not cover the in-flight window: two callers
  // landing in it would each import posthog-js and each call init/register,
  // double-initializing the SDK and duplicating super properties.
  //
  // Asserted as promise identity rather than `init` call counts on purpose.
  // Under vitest's SSR transform a mocked dynamic import resolves such that the
  // second caller never re-runs the post-await body, so a call-count assertion
  // passes with or without the memoization and proves nothing. Identity is the
  // memoization itself and does fail without it.
  it('shares one in-flight initialization between concurrent callers', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    stubHostname('kodapos.app');
    vi.doMock('posthog-js', () => ({ default: { init: vi.fn(), register: vi.fn() } }));
    vi.resetModules();
    const { initAnalytics } = await import('../../src/lib/analytics/client');

    const first = initAnalytics({});
    const second = initAnalytics({});

    expect(second).toBe(first);
    await expect(first).resolves.toBe(true);
  });

  // Locks the privacy-critical + reliability-critical init flags. $pageview
  // stays manual (allowlist enforcement), $pageleave is delegated to posthog so
  // its unload beacon actually lands single-page bounces, and web vitals is the
  // one performance signal opted into (network timing stays off — it carries
  // request URLs).
  it('initializes posthog with manual pageview, delegated pageleave, and web vitals', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    stubHostname('kodapos.app');
    const init = vi.fn();
    vi.doMock('posthog-js', () => ({ default: { init, register: vi.fn() } }));
    vi.resetModules();
    const { initAnalytics } = await import('../../src/lib/analytics/client');
    await initAnalytics({});

    const call = init.mock.calls[0];
    if (!call) throw new Error('posthog.init was not called');
    const config = call[1];
    expect(config.capture_pageview).toBe(false);
    expect(config.capture_pageleave).toBe(true);
    expect(config.capture_performance).toEqual({ web_vitals: true });
    expect(config.autocapture).toBe(false);
    expect(config.disable_capture_url_hashes).toBe(true);
  });

  // Error Tracking shows nothing at all unless $exception events are emitted,
  // and the three sub-keys are not equally safe: console errors serialize whole
  // documents (orders, customers) and no pattern-based scrub separates a name
  // from a word. Asserted as an exact object so `true` — which would accept
  // whatever the SDK defaults to next — cannot be substituted here.
  it('captures unhandled errors and rejections but never console errors', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    stubHostname('kodapos.app');
    const init = vi.fn();
    vi.doMock('posthog-js', () => ({ default: { init, register: vi.fn() } }));
    vi.resetModules();
    const { initAnalytics } = await import('../../src/lib/analytics/client');
    await initAnalytics({});

    const call = init.mock.calls[0];
    if (!call) throw new Error('posthog.init was not called');
    expect(call[1].capture_exceptions).toEqual({
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    });
  });
});

describe('before_send', () => {
  /** Returns the before_send hook posthog.init was configured with. */
  async function getBeforeSend() {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    stubHostname('kodapos.app');
    const init = vi.fn();
    vi.doMock('posthog-js', () => ({ default: { init, register: vi.fn() } }));
    vi.resetModules();
    const { initAnalytics } = await import('../../src/lib/analytics/client');
    await initAnalytics({});
    const call = init.mock.calls[0];
    if (!call) throw new Error('posthog.init was not called');
    const beforeSend = call[1].before_send;
    if (typeof beforeSend !== 'function') throw new Error('before_send was not configured');
    return beforeSend;
  }

  // The scrub itself is unit-tested in analytics-policy.test.ts. What this
  // covers is that it is actually wired into the SDK's send path: without
  // before_send, autocapture ships the raw message and every test over there
  // still passes.
  it('redacts a customer phone number out of an outgoing $exception', async () => {
    const beforeSend = await getBeforeSend();

    const result = beforeSend({
      event: '$exception',
      properties: { $exception_list: [{ type: 'Error', value: 'no customer for 081234567890' }] },
    });

    expect(result?.properties.$exception_list).toEqual([
      { type: 'Error', value: 'no customer for [number]' },
    ]);
  });

  // Init never runs on a customer surface, but init only happens once: a staff
  // tablet that opened /dashboard and then navigated to /display is still
  // running this client. An exception thrown there arrives through the SDK's
  // own error handler, not through capture(), so before_send is the only gate
  // left that can stop it.
  it('drops an exception thrown on a cafe-customer surface', async () => {
    const beforeSend = await getBeforeSend();
    stubHostname('kodapos.app', '/display');

    expect(beforeSend({ event: '$exception', properties: {} })).toBeNull();
  });

  // Every other event is built by hand here or in track.ts, so it must pass
  // through untouched rather than being reshaped by an exception-only scrub.
  it('passes non-exception events through unchanged', async () => {
    const beforeSend = await getBeforeSend();
    const event = { event: '$pageview', properties: { $current_url: 'https://kodapos.app/' } };

    expect(beforeSend(event)).toBe(event);
    expect(beforeSend(null)).toBeNull();
  });
});

describe('capturePageleave', () => {
  // The magic-link sign-in URL carries the email and one-time code in the
  // fragment. init() sets disable_capture_url_hashes to keep posthog-js from
  // recording it, but capturePageleave overrides $current_url explicitly, so it
  // has to strip the fragment itself or that protection is defeated for exactly
  // the page it matters most on. Origin, path and query are preserved.
  it('emits $pageleave for the given URL with the fragment stripped', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    stubHostname('kodapos.app');
    const capture = vi.fn();
    vi.doMock('posthog-js', () => ({
      default: { init: vi.fn(), register: vi.fn(), capture },
    }));
    vi.resetModules();
    const { initAnalytics, capturePageleave } = await import('../../src/lib/analytics/client');
    await initAnalytics({});

    capturePageleave('https://kodapos.app/signin?ref=x#email=a@b.com&code=123456');

    expect(capture).toHaveBeenCalledWith('$pageleave', {
      $current_url: 'https://kodapos.app/signin?ref=x',
      $host: 'kodapos.app',
      $pathname: '/signin',
    });
  });

  // No client until init resolves; a leave fired before that (or with analytics
  // disabled) must be an inert no-op, never a throw.
  it('is a no-op when analytics has not initialized', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    vi.resetModules();
    const { capturePageleave } = await import('../../src/lib/analytics/client');
    expect(() => capturePageleave('https://kodapos.app/')).not.toThrow();
  });
});
