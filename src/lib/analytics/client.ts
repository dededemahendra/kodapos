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
import type { CaptureResult, PostHog } from 'posthog-js';
import { isCustomerSurface, isTrackedHost, scrubExceptionProperties } from './policy';

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

/**
 * First-party by default. Ad blockers list us.i.posthog.com, and a blocked
 * request does not merely cost a pageview: capture_exceptions installs by
 * fetching /static/exception-autocapture.js at runtime, so a blocked assets
 * request disables error tracking with no console error anywhere.
 *
 * The default lives here rather than only in the Cloudflare env var because the
 * proxy should be a property of this repo, the same reason the capture_* flags
 * below are pinned instead of deferring to remote config. VITE_POSTHOG_HOST
 * remains an override for pointing a build somewhere else.
 */
function host(): string {
  const configured = import.meta.env.VITE_POSTHOG_HOST;
  return configured !== undefined && configured !== '' ? configured : '/relay';
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

/**
 * The last thing that runs before any event leaves the browser. Returning null
 * drops the event.
 *
 * Scoped to `$exception` because that is the only event whose payload this app
 * does not author — see scrubExceptionProperties in policy.ts for what is
 * redacted and why. Every other event is built by hand here or in track.ts and
 * needs no laundering on the way out.
 *
 * The customer-surface drop is not redundant with the identical check in
 * capture() below, and not redundant with the provider refusing to init on
 * those routes either. Init is what those two gates cover, and init only
 * happens once: a staff tablet that opened /dashboard and then navigated to
 * /display is still running this client, because it is one SPA session. An
 * exception thrown on that route is the one event that could reach PostHog
 * from a screen a cafe customer is looking at, and it arrives through the SDK's
 * own error handler rather than through capture(), so this is the only place
 * that can stop it.
 */
function scrubOutgoing(event: CaptureResult | null): CaptureResult | null {
  if (!event || event.event !== '$exception') return event;
  if (typeof window !== 'undefined' && isCustomerSurface(window.location.pathname)) return null;
  return { ...event, properties: scrubExceptionProperties(event.properties ?? {}) };
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
      // api_host is now a first-party path, which takes posthog-js off its
      // cloud-host fast path: its requestRouter regex-tests api_host and, on a
      // miss, resolves every endpoint (assets AND ui) against our origin. The
      // relay route handles assets; ui has no server side to handle, so it is
      // named explicitly here or the toolbar and the issue links embedded in
      // error-tracking alerts resolve to kodapos.app/relay and 404.
      ui_host: 'https://us.posthog.com',
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
      // The second signal opted into, and the reason `before_send` below exists.
      // Left at `false`, PostHog's Error Tracking product has nothing to show:
      // no $exception event is ever emitted, so every uncaught error and every
      // unhandled rejection in production is invisible.
      //
      // Spelled out as an object rather than `true` because the three sub-keys
      // are not equally safe and `true` would silently accept whatever the SDK
      // defaults to next. Unhandled errors and rejections are the signal error
      // tracking exists for and carry a stack we own. Console errors are the
      // leak: `console.error(order)` serializes a whole document, and no
      // pattern-based scrub separates a customer's name from a word. It stays
      // pinned off for the same reason autocapture and heatmaps do above.
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
      capture_heatmaps: false,
      capture_dead_clicks: false,
      disable_surveys: true,
      rageclick: false,
      respect_dnt: true,
      // localStorage rather than localStorage+cookie: the published privacy
      // policy states we set no third-party tracking cookies.
      persistence: 'localStorage',
      before_send: scrubOutgoing,
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

/**
 * Reports an error that autocapture structurally cannot see.
 *
 * `capture_exceptions` above hooks window.onerror and unhandledrejection, and
 * neither fires for an error thrown during React rendering: React catches it,
 * routes it to the nearest error boundary, and reports it via console.error,
 * which is pinned off. So without this call every crash that renders the root
 * errorComponent — the ones a user actually notices, because the screen is
 * replaced by "Terjadi kesalahan" — is the exact class of error that never
 * reaches PostHog.
 *
 * Goes through posthog.captureException rather than capture('$exception') so
 * the SDK parses the stack into $exception_list the same way autocapture does,
 * which is what makes these group with, and symbolicate like, everything else.
 * before_send still scrubs the result.
 */
export function captureError(error: unknown): void {
  client?.captureException(error);
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
