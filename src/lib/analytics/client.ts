/**
 * The only module in the app that touches posthog-js.
 *
 * Everything else goes through track.ts, so swapping providers or adding a
 * reverse proxy later changes this file alone.
 *
 * posthog-js is imported lazily and only when a key is configured. With the key
 * unset nothing is imported and no network request is made, so local dev, CI
 * and the existing test suite are completely unaffected. That is also what lets
 * this slice ship to production inert while the privacy policy is updated
 * separately.
 */
import type { PostHog } from 'posthog-js';

let client: PostHog | null = null;

function key(): string {
  return import.meta.env.VITE_POSTHOG_KEY ?? '';
}

function host(): string {
  return import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com';
}

export function isAnalyticsEnabled(): boolean {
  return typeof window !== 'undefined' && key().length > 0;
}

/**
 * Resolves `true` once the SDK is ready to capture and `false` if it never
 * will be for this session. Never rejects: the dynamic import goes over the
 * network with no reverse proxy in front of it, so an ad blocker or a flaky
 * connection failing that chunk is expected, not exceptional. Swallowing the
 * failure here means every caller gets a degrade-to-inert client for free
 * instead of an unhandled rejection, and `client` is only ever assigned once
 * `posthog.init` has actually run.
 */
export async function initAnalytics(superProps: Record<string, string>): Promise<boolean> {
  if (!isAnalyticsEnabled()) return false;
  if (client) return true;
  let posthog: PostHog;
  try {
    ({ default: posthog } = await import('posthog-js'));
  } catch {
    return false;
  }
  posthog.init(key(), {
    api_host: host(),
    // Explicit events only. The POS shows customer names, phone numbers and
    // order values; autocapture and session recording would scrape them.
    autocapture: false,
    disable_session_recording: true,
    // Pageviews are emitted by hand from the provider so the exclusion list in
    // policy.ts is enforced. PostHog's own automatic pageview would bypass it.
    capture_pageview: false,
    capture_pageleave: false,
    // The magic-link sign-in URL carries the email and one-time code in the
    // fragment (#email=&code=), and posthog-js captures URL fragments by
    // default. Without this, that fragment ends up in `$current_url` and in
    // `$initial_current_url` (a $set_once PERSON property set at identify()
    // time), permanently attaching a live sign-in code and an email address
    // to the person profile. This looks removable; it is load-bearing.
    disable_capture_url_hashes: true,
    // localStorage rather than localStorage+cookie: the published privacy
    // policy states we set no third-party tracking cookies.
    persistence: 'localStorage',
  });
  posthog.register(superProps);
  client = posthog;
  return true;
}

export function capture(name: string, props?: Record<string, unknown>): void {
  client?.capture(name, props);
}

export function capturePageview(path: string): void {
  client?.capture('$pageview', { $current_url: path });
}

export function identifyUser(distinctId: string, props: Record<string, unknown>): void {
  client?.identify(distinctId, props);
}

export function setGroup(type: string, groupKey: string, props: Record<string, unknown>): void {
  client?.group(type, groupKey, props);
}

/**
 * Clears the current identity. Called on sign-out and on cashier switch.
 *
 * This is a correctness requirement, not hygiene: the POS runs on shared
 * tablets with an explicit "Ganti kasir" flow, so without a reset every
 * subsequent cashier inherits the first one's distinct id and all per-user
 * figures become fiction.
 */
export function resetAnalytics(): void {
  client?.reset();
}
