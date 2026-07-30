import { describe, expect, it } from 'vitest';
import { resolveRelayTarget } from '../../src/lib/analytics/relay';

describe('resolveRelayTarget', () => {
  // The whole reason this proxy exists. posthog-js fetches
  // /static/exception-autocapture.js at runtime to install capture_exceptions;
  // if this resolves to the ingestion host it 404s and error tracking silently
  // never runs, which is indistinguishable from "no crashes happened".
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
  });
});
