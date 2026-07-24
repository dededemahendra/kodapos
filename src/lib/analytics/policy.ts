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

export function buildSuperProperties(input: { locale: string; appVersion: string }): {
  locale: string;
  app_version: string;
  surface: 'public';
} {
  return { locale: input.locale, app_version: input.appVersion, surface: 'public' };
}
