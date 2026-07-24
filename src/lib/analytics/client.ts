/**
 * The only module in the app that touches posthog-js.
 *
 * Everything else goes through track.ts, so swapping providers or adding a
 * reverse proxy later changes this file alone.
 *
 * posthog-js is imported lazily and only when analytics is enabled, which takes
 * BOTH a configured key and the production hostname. With either missing,
 * nothing is imported and no network request is made, so CI and the existing
 * test suite are completely unaffected.
 *
 * The hostname half is what keeps local dev and Cloudflare preview deployments
 * out of the production project: the key is set in the Cloudflare dashboard, so
 * Vite inlines it into every build made from that environment, and the key
 * alone can no longer be the switch. See isTrackedHost in policy.ts.
 */
import type { PostHog } from 'posthog-js';
import { isCustomerSurface, isTrackedHost } from './policy';

let client: PostHog | null = null;
// Memoizes the in-flight init. `client` is only assigned once the dynamic
// import has resolved, so the `if (client)` guard leaves a window in which a
// second caller would import posthog-js and run init/register all over again,
// double-initializing the SDK. No caller can hit that today — the provider's
// `started` ref is set synchronously before the only call site — but this
// module is the app's single gatekeeper for posthog-js and should not depend
// on a ref held in another file for its own correctness.
let pending: Promise<boolean> | null = null;

function key(): string {
  return import.meta.env.VITE_POSTHOG_KEY ?? '';
}

function host(): string {
  return import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com';
}

/**
 * The single gate every other export and the provider defer to. The host check
 * lives here rather than at the call sites so that adding a new entry point
 * cannot forget it: `initAnalytics` returns false, the provider never mounts
 * the SDK, and the Convex identity subscription stays skipped.
 */
export function isAnalyticsEnabled(): boolean {
  return (
    typeof window !== 'undefined' && key().length > 0 && isTrackedHost(window.location.hostname)
  );
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
export function initAnalytics(superProps: Record<string, string>): Promise<boolean> {
  if (!isAnalyticsEnabled()) return Promise.resolve(false);
  if (client) return Promise.resolve(true);
  // A failed init stays memoized as `false` rather than being cleared for a
  // retry. That matches the contract above: false means "never will be for
  // this session", and the sole caller latches `started` anyway, so clearing
  // it would create a retry path that nothing actually drives.
  pending ??= start(superProps);
  return pending;
}

async function start(superProps: Record<string, string>): Promise<boolean> {
  // The try wraps the dynamic import AND the init/register calls below, not
  // just the import: a synchronous throw from posthog.init or
  // posthog.register happens after the `await`, and the doc comment above
  // (and the provider's bare `.then()`) depends on this function truly never
  // rejecting.
  try {
    const { default: posthog } = await import('posthog-js');
    posthog.init(key(), {
      api_host: host(),
      // Explicit events only. The POS shows customer names, phone numbers and
      // order values; autocapture and session recording would scrape them.
      autocapture: false,
      disable_session_recording: true,
      // Pageviews are emitted by hand from the provider so the allowlist in
      // policy.ts is enforced; PostHog's own automatic pageview would bypass it.
      capture_pageview: false,
      // Pageleave, by contrast, is delegated to posthog-js. It fires $pageleave
      // from posthog's own unload handler, which flushes via sendBeacon in the
      // same pagehide tick — the only reliable way to land the leave of a
      // single-page (bounce) session before the tab dies. A hand-rolled
      // pagehide capture cannot: posthog registers its unload flush at init, so
      // it runs BEFORE any listener we add and beacons the queue without our
      // late-queued event. posthog pairs this leave with our manual $pageview
      // through its PageViewManager (updated on every capture, manual included)
      // and honors disable_capture_url_hashes, so the sign-in fragment is still
      // stripped. Per-route leaves are still emitted by hand (see the provider);
      // posthog only auto-emits on unload + session rotation, never mid-SPA-nav,
      // so the two never double up.
      capture_pageleave: true,
      // The magic-link sign-in URL carries the email and one-time code in the
      // fragment (#email=&code=), and posthog-js captures URL fragments by
      // default. Without this, that fragment ends up in `$current_url` and in
      // `$initial_current_url` (a $set_once PERSON property set at identify()
      // time), permanently attaching a live sign-in code and an email address
      // to the person profile. This looks removable; it is load-bearing.
      disable_capture_url_hashes: true,
      // `autocapture: false` above only closes ONE automatic capture path. In
      // this SDK version capture_performance, capture_exceptions,
      // capture_heatmaps and capture_dead_clicks all default to `undefined`,
      // meaning "defer to whatever is configured in the PostHog dashboard UI",
      // and disable_surveys defaults to false. Left unset, the "explicit
      // events only" guarantee this whole module exists for is a toggle
      // someone can flip remotely, not a property of this repository.
      // Exception autocapture ships error messages and stack traces;
      // dead-click and heatmap payloads carry element text, which on the POS
      // is customer names and order lines; surveys can pop up unprompted on
      // an unattended in-cafe TV. Every one of these must stay pinned off.
      //
      // capture_performance is the one signal we opt INTO: { web_vitals: true }
      // emits $web_vitals (LCP/CLS/FCP/INP) — anonymous timing and layout numbers
      // with no element text or customer data. That is the only sub-key this SDK
      // version reads for enablement; network/resource timing is not captured
      // here (its only source, session recording's network payloads, is already
      // off via disable_session_recording above), so there is no extra flag to
      // pin — an explicit `network_timing: false` would be a dead no-op key.
      capture_performance: { web_vitals: true },
      capture_exceptions: false,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      disable_surveys: true,
      rageclick: false,
      respect_dnt: true,
      // localStorage rather than localStorage+cookie: the published privacy
      // policy states we set no third-party tracking cookies.
      persistence: 'localStorage',
    });
    posthog.register(superProps);
    client = posthog;
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-registers the super properties attached to every subsequent event.
 * A thin wrapper over posthog.register, no-op when the client is null
 * (analytics disabled, or the dynamic import hasn't resolved yet).
 *
 * Needed because `initAnalytics` only registers once, at init time, and
 * some super properties (locale) are not yet known at that point: they
 * come from a provider that mounts before its own effect has read the
 * stored value.
 */
export function registerSuperProperties(props: Record<string, string>): void {
  client?.register(props);
}

export function capture(name: string, props?: Record<string, unknown>): void {
  // Belt and suspenders alongside the provider's init gate: even if
  // something ever calls capture() from a cafe-customer surface, this
  // still refuses to emit for a person who never agreed to anything.
  if (typeof window !== 'undefined' && isCustomerSurface(window.location.pathname)) return;
  client?.capture(name, props);
}

export function capturePageview(): void {
  // No $current_url override: that discarded origin and query string and
  // made PostHog's URL breakdowns show a bare relative path. Now that
  // disable_capture_url_hashes is set above, posthog-js recording
  // window.location.href itself no longer leaks the magic-link fragment,
  // so nothing here needs to mask it anymore.
  client?.capture('$pageview');
}

/**
 * The leave half of a manual pageview. Emitted by hand, one per route change,
 * for the page being LEFT, so PostHog can pair it with the matching $pageview
 * and derive time-on-page and bounce rate.
 *
 * It takes the previous page's href explicitly instead of letting posthog-js
 * read window.location, because by the time the provider fires this the router
 * has already advanced the URL to the next page; a bare capture('$pageleave')
 * would stamp the leave with the wrong page and break the pairing.
 *
 * The hash is stripped for the exact reason disable_capture_url_hashes is set
 * in init(): the magic-link sign-in URL carries the email and one-time code in
 * the fragment, and overriding $current_url here would smuggle that fragment
 * straight back into the event that flag exists to keep out. Overriding all
 * three page props (not just $current_url) keeps this event's URL breakdowns
 * consistent with the $pageview posthog-js builds from window.location.
 */
export function capturePageleave(href: string): void {
  const url = new URL(href);
  client?.capture('$pageleave', {
    $current_url: `${url.origin}${url.pathname}${url.search}`,
    $host: url.host,
    $pathname: url.pathname,
  });
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
