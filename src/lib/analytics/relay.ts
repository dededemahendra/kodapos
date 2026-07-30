/**
 * Pure upstream resolution for the PostHog relay: no fetch, no Request, no
 * route imports. Same reasoning as policy.ts — vitest runs in edge-runtime and
 * only collects `*.test.ts`, so logic that has to be right has to be pure.
 *
 * Two upstreams, not one. posthog-js resolves every endpoint through a
 * requestRouter whose `region` getter regex-tests api_host against the known
 * PostHog cloud hosts. A custom api_host fails that test, so the router stops
 * splitting hosts and resolves endpointFor('assets', ...) against our origin
 * too. us-assets.i.posthog.com is not chosen because the ingestion host would
 * 404 those paths, it does not, us.i.posthog.com dual-serves /static/* today.
 * It is chosen because it is the CDN-backed host PostHog documents and
 * intends for static assets, and matching PostHog's own topology is a design
 * this repo can keep relying on, rather than an undocumented dual-serving
 * behavior that could stop working at any time with no warning here.
 */

/** Events, flags, remote config. */
const API_UPSTREAM = 'https://us.i.posthog.com';

/** Versioned extension scripts: exception-autocapture, web-vitals, toolbar. */
const ASSETS_UPSTREAM = 'https://us-assets.i.posthog.com';

export const RELAY_PREFIX = '/relay';

export type RelayTarget = {
  url: string;
  /** Static extension scripts are immutable and versioned; ingestion is not. */
  cacheable: boolean;
};

/**
 * A strict allowlist of the characters PostHog's own endpoints actually use.
 * Anything else is rejected rather than escaped, because the failure direction
 * that matters here is "refused a legitimate path" (visible in verification),
 * not "forwarded a crafted one" (a live SSRF).
 */
const SAFE_PATH = /^\/[A-Za-z0-9._~/-]*$/;

function isSafeSuffix(suffix: string): boolean {
  if (!SAFE_PATH.test(suffix)) return false;
  // `/relay/` (empty suffix, bare '/') has no PostHog endpoint behind it; it
  // would otherwise resolve to the bare upstream origin. Rejection is meant to
  // be the default here, not merely the outcome for inputs that look hostile.
  if (suffix === '/') return false;
  // `//host` is protocol-relative; `..` escapes the prefix. Neither can reach
  // another host through the URL construction below, but both indicate a
  // caller probing for one, so refuse instead of silently normalizing.
  if (suffix.startsWith('//')) return false;
  if (suffix.includes('..')) return false;
  return true;
}

export function resolveRelayTarget(pathname: string, search = ''): RelayTarget | null {
  if (!pathname.startsWith(`${RELAY_PREFIX}/`)) return null;

  // Keeps the leading slash: '/relay/e/' -> '/e/'.
  const suffix = pathname.slice(RELAY_PREFIX.length);
  if (!isSafeSuffix(suffix)) return null;

  // Not the whole assets surface: endpointFor('assets', '/array/<token>/config')
  // and '/array/<token>/config.js' (posthog-js's remote-config fetch) also
  // resolve through this same requestRouter path but are deliberately left
  // routed to the API upstream below, because it is unverified that the
  // assets host serves them and getting that wrong would break remote config
  // silently. /static/* is the one assets path confirmed safe to move.
  const cacheable = suffix.startsWith('/static/');

  // Built through URL against a fixed base. The pathname setter cannot change
  // the host, so the origin is structurally ours to choose, not the caller's.
  const url = new URL(cacheable ? ASSETS_UPSTREAM : API_UPSTREAM);
  url.pathname = suffix;
  url.search = search;

  return { url: url.toString(), cacheable };
}
