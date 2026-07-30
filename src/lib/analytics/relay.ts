/**
 * Pure upstream resolution for the PostHog relay: no fetch, no Request, no
 * route imports. Same reasoning as policy.ts — vitest runs in edge-runtime and
 * only collects `*.test.ts`, so logic that has to be right has to be pure.
 *
 * Two upstreams, not one. posthog-js resolves every endpoint through a
 * requestRouter whose `region` getter regex-tests api_host against the known
 * PostHog cloud hosts. A custom api_host fails that test, so the router stops
 * splitting hosts and resolves endpointFor('assets', ...) against our origin
 * too. Forwarding everything to the ingestion host would 404 the extension
 * scripts and disable capture_exceptions, which is the thing this proxy exists
 * to protect.
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

  const cacheable = suffix.startsWith('/static/');

  // Built through URL against a fixed base. The pathname setter cannot change
  // the host, so the origin is structurally ours to choose, not the caller's.
  const url = new URL(cacheable ? ASSETS_UPSTREAM : API_UPSTREAM);
  url.pathname = suffix;
  url.search = search;

  return { url: url.toString(), cacheable };
}
