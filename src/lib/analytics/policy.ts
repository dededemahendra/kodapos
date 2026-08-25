/**
 * Pure tracking decisions: no SDK, no React, no side effects.
 *
 * Everything decidable lives here rather than in the provider because the test
 * environment is edge-runtime and Vitest only collects `*.test.ts`, so there is
 * no way to test a `.tsx` component in this repo. Keeping the logic pure is what
 * makes the privacy-critical rules testable at all.
 */

/**
 * Slice 1 tracks the marketing surface only, expressed as an allowlist rather
 * than a blocklist. Default-deny means a route added next week is untracked
 * until someone deliberately adds it, which is the correct failure direction
 * for privacy.
 *
 * It also excludes, without having to name them:
 *   /order/$token  cafe end-customers, who have no relationship with kodapos
 *                  and never agreed to anything
 *   /menu-board    an unattended TV that would emit pageviews all day
 *   /display       the customer-facing second screen, same reasoning
 */
const MARKETING_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/signin',
  '/signup',
  '/changelog',
  '/privacy',
  '/terms',
  '/fitur',
  '/fitur/pesanan',
]);

export function shouldTrackPath(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return MARKETING_PATHS.has(path);
}

/**
 * The allowlist above only gates pageviews. `initAnalytics` itself runs on
 * mount on every route, so with a key configured, opening `/order/<token>`,
 * `/menu-board` or `/display` still loads posthog-js, writes a persistent
 * distinct_id into that device's localStorage and sends a request to
 * PostHog carrying its IP, even though no event is ever emitted. That
 * satisfies the letter of "no PII" but not the reason these paths are
 * excluded in the first place: cafe end-customers have no relationship
 * with this company and never agreed to anything.
 *
 * This can't be folded back into an allowlist on the init effect, because
 * Google sign-in returns to `/` and only reaches `/dashboard` after the
 * router has already navigated there, so the "should analytics be running
 * at all" decision has to be a deny-check independent of where the
 * marketing allowlist happens to end.
 */
const CUSTOMER_SURFACES = ['/order', '/menu-board', '/display'];

export function isCustomerSurface(pathname: string): boolean {
  return CUSTOMER_SURFACES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Analytics runs on the production domain and nowhere else.
 *
 * `VITE_POSTHOG_KEY` is set in the Cloudflare dashboard, and Vite inlines it at
 * build time into every build produced from that environment. Without this
 * check the key alone would decide, so a developer running `pnpm dev` with the
 * key present, and every Cloudflare preview deployment of every branch, would
 * emit into the production PostHog project. That corrupts the funnel this slice
 * exists to measure with sessions that are not customers.
 *
 * Exact match against a Set, like MARKETING_PATHS above and for the same
 * reason: a suffix test (`endsWith('kodapos.app')`) would accept
 * `kodapos.app.attacker.example`, and default-deny means a new host is inert
 * until someone deliberately adds it here.
 */
const TRACKED_HOSTS: ReadonlySet<string> = new Set(['kodapos.app', 'www.kodapos.app']);

export function isTrackedHost(hostname: string): boolean {
  return TRACKED_HOSTS.has(hostname.toLowerCase());
}

/**
 * Registration is implicit in the passwordless flow: the account is created on
 * the first successful verify, so the client cannot distinguish it from a
 * returning sign-in. Inferring it from the age of the user document is a
 * heuristic and is recorded as one in the design doc. A verify delayed past
 * this window is misclassified as a returning sign-in.
 */
export const NEW_ACCOUNT_WINDOW_MS = 60_000;

export function isNewAccount(accountAgeMs: number): boolean {
  return accountAgeMs >= 0 && accountAgeMs < NEW_ACCOUNT_WINDOW_MS;
}

/**
 * Exception autocapture (client.ts, `capture_exceptions`) is the only capture
 * path in this app whose payload we do not author. A `$pageview` carries a URL
 * we control and a `track()` call carries properties someone wrote by hand, but
 * an Error's message is whatever threw it: a Convex validation failure quoting
 * the offending field, a fetch error with a query string in it, a hand-written
 * `throw new Error(\`no customer for ${phone}\`)`. On this POS those values are
 * customer emails and phone numbers, and the published privacy policy commits
 * to keeping exactly those out of PostHog.
 *
 * Names are NOT covered here and this is not pretending otherwise: no pattern
 * separates a customer's name from an ordinary English word. What keeps names
 * out is `capture_console_errors: false` in client.ts, which closes the one
 * path that would ship a whole serialized order or customer record.
 *
 * Deliberately over-eager on digits: an 8+ digit run is redacted whether it is
 * a phone number, an order total, or a millisecond timestamp. Losing a number
 * from an error message costs some debugging context; leaking one costs the
 * promise above, and only one of those is recoverable.
 */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Runs of 8 or more digits, tolerating the separators Indonesian numbers are
// written with: +62 812-3456-7890, (0361) 123456, 081234567890. The optional
// leading `(` is matched as part of the number rather than left behind, so an
// area code in parentheses is redacted whole instead of becoming `([number]`.
// Applied AFTER EMAIL_RE so an address containing digits is already gone and
// cannot be half-matched into `[email]`-shaped debris.
const LONG_NUMBER_RE = /\+?\(?\d[\d\s().-]{6,}\d/g;

export function scrubExceptionText(text: string): string {
  return text.replace(EMAIL_RE, '[email]').replace(LONG_NUMBER_RE, '[number]');
}

/** One entry of posthog-js's `$exception_list`; only `value` is of interest. */
type ExceptionEntry = { value?: unknown };

/**
 * Returns a copy of a `$exception` event's properties with the free-form text
 * redacted. Pure, so the privacy-critical half of error tracking stays testable
 * (see the module header: the provider and the SDK wrapper are `.tsx`/untestable
 * in this repo, this file is not).
 *
 * `$exception_list[].value` is the field that actually matters. posthog-js
 * builds that list from the thrown value, and PostHog derives the issue title,
 * the fingerprint and `$exception_message` from it server side, so scrubbing
 * the list is what changes what gets stored and displayed.
 *
 * `$exception_message` is scrubbed too even though the native autocapture path
 * never sets it: only the SDK's Sentry bridge does. Nothing here uses that
 * bridge today, and covering it costs one branch rather than a silent bypass
 * the day someone turns it on.
 *
 * Stack frames are left alone on purpose. They carry function names and bundle
 * URLs, which are our own code, and they are the entire reason source maps get
 * uploaded; redacting digits there would mangle line and column numbers.
 */
export function scrubExceptionProperties(
  properties: Record<string, unknown>
): Record<string, unknown> {
  const scrubbed = { ...properties };
  const list = scrubbed.$exception_list;

  if (Array.isArray(list)) {
    scrubbed.$exception_list = list.map((entry: unknown) => {
      if (entry === null || typeof entry !== 'object') return entry;
      const { value } = entry as ExceptionEntry;
      if (typeof value !== 'string') return entry;
      return { ...entry, value: scrubExceptionText(value) };
    });
  }

  if (typeof scrubbed.$exception_message === 'string') {
    scrubbed.$exception_message = scrubExceptionText(scrubbed.$exception_message);
  }

  return scrubbed;
}

export function buildSuperProperties(input: { locale: string; appVersion: string }): {
  locale: string;
  app_version: string;
  surface: 'public';
} {
  return { locale: input.locale, app_version: input.appVersion, surface: 'public' };
}
