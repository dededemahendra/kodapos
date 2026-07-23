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

export async function initAnalytics(superProps: Record<string, string>): Promise<void> {
  if (!isAnalyticsEnabled() || client) return;
  const { default: posthog } = await import('posthog-js');
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
    // localStorage rather than localStorage+cookie: the published privacy
    // policy states we set no third-party tracking cookies.
    persistence: 'localStorage',
  });
  posthog.register(superProps);
  client = posthog;
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
