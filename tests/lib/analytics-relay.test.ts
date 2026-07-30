import { describe, expect, it } from 'vitest';
import { resolveRelayTarget } from '../../src/lib/analytics/relay';

describe('resolveRelayTarget', () => {
  // The whole reason this proxy exists. posthog-js fetches
  // /static/exception-autocapture.js at runtime to install capture_exceptions.
  // us.i.posthog.com actually dual-serves this path today, so a one-upstream
  // proxy would not 404 it; the assets host is still required because it is
  // the CDN-backed host PostHog documents and intends for static assets, and
  // matching PostHog's own topology is something this repo can keep relying
  // on, unlike an undocumented dual-serving behavior that could stop at any
  // time.
  it('routes extension scripts to the assets upstream', () => {
    expect(resolveRelayTarget('/relay/static/exception-autocapture.js')).toEqual({
      url: 'https://us-assets.i.posthog.com/static/exception-autocapture.js',
      cacheable: true,
    });
  });

  it('routes ingestion to the api upstream', () => {
    expect(resolveRelayTarget('/relay/e/')).toEqual({
      url: 'https://us.i.posthog.com/e/',
      cacheable: false,
    });
    expect(resolveRelayTarget('/relay/i/v0/e/')).toEqual({
      url: 'https://us.i.posthog.com/i/v0/e/',
      cacheable: false,
    });
    expect(resolveRelayTarget('/relay/flags')).toEqual({
      url: 'https://us.i.posthog.com/flags',
      cacheable: false,
    });
  });

  // posthog-js's remote-config fetch (endpointFor('assets', '/array/<token>/config'
  // or '/array/<token>/config.js')) is the one 'assets' path that does not
  // begin with /static/. It is deliberately left on the API upstream rather
  // than reclassified as cacheable: it is unverified that the assets host
  // serves /array/, and getting that wrong would break remote config
  // silently, so this pins the working fallback rather than leaving it as an
  // unexamined oversight.
  it('routes remote config to the api upstream, not the assets upstream', () => {
    expect(resolveRelayTarget('/relay/array/phc_test/config.js')).toEqual({
      url: 'https://us.i.posthog.com/array/phc_test/config.js',
      cacheable: false,
    });
  });

  it('preserves the query string', () => {
    expect(resolveRelayTarget('/relay/static/web-vitals.js', '?v=1.407.1')).toEqual({
      url: 'https://us-assets.i.posthog.com/static/web-vitals.js?v=1.407.1',
      cacheable: true,
    });
  });

  // A proxy that builds its upstream from caller input is an open proxy. These
  // must be rejected outright rather than normalized and forwarded.
  it('rejects traversal and host-injection attempts', () => {
    expect(resolveRelayTarget('/relay/../admin')).toBeNull();
    expect(resolveRelayTarget('/relay/static/../../etc/passwd')).toBeNull();
    expect(resolveRelayTarget('/relay//evil.example/path')).toBeNull();
    expect(resolveRelayTarget('/relay/https://evil.example')).toBeNull();
    expect(resolveRelayTarget('/relay/a\\b')).toBeNull();
  });

  it('rejects anything outside the relay prefix', () => {
    expect(resolveRelayTarget('/dashboard')).toBeNull();
    expect(resolveRelayTarget('/relay')).toBeNull();
    expect(resolveRelayTarget('')).toBeNull();
    // '/relay/' (empty suffix) has no PostHog endpoint behind it and would
    // otherwise resolve to the bare upstream origin. Rejection is meant to be
    // the default, not just the outcome for inputs that look hostile.
    expect(resolveRelayTarget('/relay/')).toBeNull();
  });
});
