# PostHog reverse proxy

**Date:** 2026-07-30
**Status:** designed, not built
**Slice:** 1 of 3 in the observability follow-up (proxy → client/Worker logs → Convex logs)

## Problem

PostHog ingestion is direct, with no proxy in front of it. Requests go to
`us.i.posthog.com`, which is on every mainstream ad-blocker list. Two things
follow, and the second is the one that actually motivates this work.

**Marketing traffic is undercounted.** Known and accepted since slice 1, but the
cost is no longer theoretical: production saw 18 `$pageview` events from 10
people in the 30 days to 2026-07-30. At that volume, losing a third of visitors
to blocking is the difference between a funnel and noise.

**Error tracking silently does not run for blocked users.** This is new as of
PR #165 and was not considered when the "no proxy" trade was originally made.
`capture_exceptions` does not run inside the main bundle. posthog-js calls
`loadExternalDependency(instance, 'exception-autocapture')`, which fetches
`/static/exception-autocapture.js` from the **assets** host at runtime. If that
fetch is blocked, exception capture never installs. There is no console error
and no failed event, so the failure is indistinguishable from "no crashes
happened". `$web_vitals` loads the same way.

So the proxy is not only a marketing-analytics nicety. It is what makes the
error tracking shipped in #165 work for users who run a blocker.

## Decision

**A server route in the app, at `/relay`, forwarding to two upstreams.**

```
browser ──▶ kodapos.app/relay/*  ──▶  Worker route
                                       ├─ /relay/static/*  ──▶ us-assets.i.posthog.com
                                       └─ everything else  ──▶ us.i.posthog.com
```

The route is a TanStack Start server route matching `/relay/*` as a splat, and
is the first server route in this codebase; `src/routes/` currently holds only
page routes. The exact server-route API is version-specific (`@tanstack/react-start`
1.167.65), so the implementation should confirm it against the installed package
rather than assume a shape from memory.

Two upstreams are required, not one. posthog-js resolves every endpoint through
a `requestRouter` whose `region` getter regex-tests `api_host` against
`https://(app|us|us-assets)(\.i)?\.posthog\.com`. A custom `api_host` fails that
test, so the router stops splitting hosts and resolves `endpointFor('assets', …)`
against our origin too. A proxy that forwards everything to `us.i.posthog.com`
therefore 404s the extension scripts and disables exception capture, which is
the exact failure this slice exists to prevent.

### Why not the alternatives

**A Cloudflare dashboard rule** (Origin Rule or a separate Worker route) needs no
application code, but puts load-bearing routing in dashboard state. `client.ts`
already argues against this for config flags: they are pinned explicitly rather
than left `undefined` because otherwise "the central guarantee would have been
dashboard state rather than a property of the repo". Routing deserves the same
treatment. It is also invisible to code review, undiscoverable by the next
reader, and cannot be exercised by `pnpm dev` or vitest.

**PostHog's managed reverse proxy** is a paid add-on requiring a CNAME on a
subdomain. A subdomain is easier for blockers to classify than a same-origin
path, and it adds a vendor dependency to fix a vendor problem.

### What this does not do

Blockers increasingly match on path patterns, and `/ingest/`, `/e/` and
anything containing `analytics`, `track`, `collect` or `posthog` are already
represented on filter lists. `/relay` is chosen because it is mundane and
app-shaped. This is mitigation with a shelf life, not a permanent fix, and it
should not be described as one.

## Client changes

`src/lib/analytics/client.ts`:

- `host()` default flips from `https://us.i.posthog.com` to `/relay`. The
  default changes in code rather than only in the Cloudflare env var, for the
  same reason the approach was chosen: the proxy is a property of the repo.
  `VITE_POSTHOG_HOST` stays as an override escape hatch.
- Add `ui_host: 'https://us.posthog.com'` to the init config. Without it,
  toolbar links and the issue deep links embedded in error-tracking alerts
  resolve against `/relay` and break.

A relative `api_host` is safe here: `isAnalyticsEnabled()` already requires
`typeof window !== 'undefined'`, so the SDK never initializes during SSR where a
relative URL would have no base.

## Security: this must not become an open proxy

The one part of this design that is security-critical. A proxy that builds its
upstream URL from the incoming path lets any caller fetch arbitrary hosts
through the Worker (SSRF).

Requirements:

- The upstream URL is constructed from a **fixed base constant** plus a
  validated path suffix. Caller input never contributes a scheme, host, or
  authority.
- Path traversal (`..`), protocol-relative paths (`//evil.example`), and
  absolute URLs in the path position are rejected, not normalized and forwarded.
- Anything not matching the two known upstream shapes is rejected with a 404
  rather than forwarded.

Rejection is the default; forwarding is the special case.

## Header handling

**Strip `Cookie` on the way out.** Requests to `/relay` are now same-origin, so
the browser attaches kodapos.app session cookies automatically. Forwarding those
to PostHog would hand a third party our session cookies. This is a privacy
regression the proxy *introduces* and direct ingestion never had, so it is the
single most important header rule here.

**Forward the client IP** as `X-Forwarded-For`, sourced from Cloudflare's
`CF-Connecting-IP`. Without it, the Worker's IP is the origin and every event
geolocates to a Cloudflare datacenter. The captured data already carries
`$geoip_*` properties, so this preserves existing behavior rather than
introducing new collection.

**Preserve** the query string (`?v=`, `?ip=`, compression params) and
`Content-Encoding`, since posthog-js may compress bodies via `CompressionStream`.

**Do not forward** hop-by-hop headers.

## Caching

- `/relay/static/*` is immutable and version-stamped, so it is edge-cacheable.
  Cached extension scripts also mean a blocked-and-unblocked population share
  the same fast path.
- Ingestion endpoints must never be cached. A cached `POST` response would
  silently drop events.

## Failure modes

- **Upstream non-2xx:** pass the status through unchanged. The proxy reports what
  PostHog said; it does not translate or swallow.
- **Upstream unreachable:** return a 502 from the route. It must not throw into
  the SSR error boundary, because an analytics failure must never render an
  error page over the POS.
- **Misrouted `/static/*`:** the dangerous one, because it is silent. Covered by
  unit tests rather than by runtime detection.

## Testing

The path-to-upstream decision is a **pure function** living beside `policy.ts`,
tested the same way. This follows the existing constraint that vitest runs in
`edge-runtime` with no DOM, so all decidable logic lives in pure modules rather
than in route handlers.

Cases:

- `/relay/static/exception-autocapture.js` resolves to the assets upstream.
- `/relay/e/`, `/relay/i/v0/e/`, `/relay/flags` resolve to the api upstream.
- `..` traversal is rejected.
- A protocol-relative or absolute URL in the path is rejected.
- An unknown shape is rejected rather than defaulted to an upstream.

Plus an init-config test asserting `api_host` and `ui_host`, extending the
existing init-config test that already pins `capture_pageview`,
`capture_pageleave`, `capture_performance`, `autocapture` and
`disable_capture_url_hashes`.

## Verification after deploy

Analytics cannot be verified from localhost by design (the `TRACKED_HOSTS` gate),
and automated browsers cannot verify it either: posthog-js `capture()` calls
`_is_bot()` before any logging, hook or network call, and Playwright and the
devtools MCP trip that predicate. So verification is by fetching the deployed
artifacts plus one ordinary-browser check.

1. `curl https://kodapos.app/relay/static/exception-autocapture.js` returns 200
   and JavaScript, not HTML. This is the check that proves error tracking still
   installs.
2. The deployed entry chunk contains the `/relay` api_host and the
   `us.posthog.com` ui_host.
3. From a real browser on kodapos.app, an event POST to `/relay/…` returns 2xx
   and the event lands in PostHog with a plausible `$geoip_country_code` rather
   than a datacenter location. The geoip check is what proves `X-Forwarded-For`
   is wired.

## Out of scope

- **Client and Worker logs**, and **Convex logs**: slices 2 and 3. Both should
  inherit this proxy rather than adding their own ingestion path.
- **The privacy policy.** PostHog remains the same sub-processor receiving the
  same data; only the network path changes. `docs/error-tracking-setup.md` gains
  a note describing the proxy and the two upstreams.
- **Feature flags**, which would also be un-blocked by this proxy but are a
  separate product decision.

## Related

- `docs/error-tracking-setup.md`
- `docs/superpowers/specs/2026-07-23-posthog-analytics-design.md`
- PR #159 (analytics slice 1), PR #165 (error tracking)
