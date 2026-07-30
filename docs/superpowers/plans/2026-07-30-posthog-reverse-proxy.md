# PostHog Reverse Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve PostHog ingestion and extension scripts from `kodapos.app/relay/*` so ad blockers stop silently disabling error tracking and web vitals.

**Architecture:** A single TanStack Start server route at `/relay/$` forwards to two upstreams: `/relay/static/*` to `us-assets.i.posthog.com` (versioned extension scripts) and everything else to `us.i.posthog.com` (ingestion). The path-to-upstream decision is a pure function in `src/lib/analytics/relay.ts`, unit tested like `policy.ts`. `client.ts` points `api_host` at `/relay` and adds `ui_host` so PostHog-hosted links still resolve.

**Tech Stack:** TanStack Start 1.167.65 (`createFileRoute` + `server.handlers`), Cloudflare Workers, posthog-js 1.407.1, vitest (edge-runtime).

## Global Constraints

- **Pure logic lives in `src/lib/analytics/`, not in route files.** Vitest runs in `edge-runtime` and only collects `*.test.ts`, so nothing testable may live in a `.tsx` or route module.
- **The upstream URL is built from a fixed base constant.** Caller input never contributes a scheme, host, or authority. Rejection is the default; forwarding is the special case.
- **Request headers are forwarded by allowlist, never by denylist.** An allowlist is what structurally guarantees `Cookie` is never forwarded.
- **`src/routeTree.gen.ts` is generated AND tracked.** Adding a route means committing the regenerated file, or CI typecheck fails even though local typecheck passes.
- **No em-dash (—) or `--` in user-facing copy.** Not applicable to code comments, which this plan uses freely.
- Verify with `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile` locally before pushing.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/analytics/relay.ts` (create) | Pure: which upstream a `/relay/*` path maps to, and whether it is cacheable. Security-critical validation. |
| `tests/lib/analytics-relay.test.ts` (create) | Unit tests for the above, including traversal and injection rejection. |
| `src/routes/relay.$.ts` (create) | The server route. Header allowlist, fetch, cache headers, 502 on upstream failure. |
| `src/routeTree.gen.ts` (modify, generated) | Regenerated to include the new route. |
| `src/lib/analytics/client.ts` (modify, ~line 34 and ~line 104) | `host()` default flips to `/relay`; `ui_host` added to init. |
| `tests/lib/analytics-client.test.ts` (modify) | Init-config assertions for `api_host` / `ui_host`. |
| `docs/error-tracking-setup.md` (modify) | Document the proxy and the two upstreams. |

---

### Task 1: Pure upstream resolution

**Files:**
- Create: `src/lib/analytics/relay.ts`
- Test: `tests/lib/analytics-relay.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RELAY_PREFIX: string` (`'/relay'`), `type RelayTarget = { url: string; cacheable: boolean }`, and `resolveRelayTarget(pathname: string, search?: string): RelayTarget | null`. Task 2 imports **only** `resolveRelayTarget`; the other two are exported for readability and future callers, so do not add unused imports in the route.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/analytics-relay.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/analytics-relay.test.ts`
Expected: FAIL, cannot resolve `../../src/lib/analytics/relay`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/analytics/relay.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/analytics-relay.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/relay.ts tests/lib/analytics-relay.test.ts
git commit -m "feat(analytics): resolve relay paths to the right PostHog upstream

posthog-js resolves endpointFor('assets') against api_host once api_host stops
matching the PostHog cloud host regex, so a one-upstream proxy would 404
/static/exception-autocapture.js and silently disable error tracking.

Kept pure and separate from the route for the same reason policy.ts is: this is
the half that has to be right, and edge-runtime vitest can only test pure code.
The path allowlist refuses anything outside PostHog's own URL shapes, because a
proxy that builds its upstream from caller input is an open proxy."
```

---

### Task 2: The relay server route

**Files:**
- Create: `src/routes/relay.$.ts`
- Modify: `src/routeTree.gen.ts` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: `resolveRelayTarget` from Task 1.
- Produces: the live `/relay/*` endpoint. Task 3 points the client at it.

**Note:** this is the first server route in the codebase; `src/routes/` currently holds only page routes. A route with `server.handlers` and no component is valid — it renders nothing and only answers requests.

- [ ] **Step 1: Write the route**

Create `src/routes/relay.$.ts`:

```ts
import { createFileRoute } from '@tanstack/react-router';
import { resolveRelayTarget } from '../lib/analytics/relay';

/**
 * Request headers are forwarded by ALLOWLIST, which is the point rather than a
 * style preference. Requests to /relay are same-origin, so the browser attaches
 * kodapos.app session cookies automatically. A denylist that forgot `cookie`
 * would hand our session cookies to a third party — a privacy regression this
 * proxy introduces and that direct ingestion never had. An allowlist cannot
 * forget.
 */
const FORWARDED_REQUEST_HEADERS = ['content-type', 'content-encoding', 'accept'];

export const Route = createFileRoute('/relay/$')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const incoming = new URL(request.url);
        const target = resolveRelayTarget(incoming.pathname, incoming.search);
        if (!target) return new Response('Not found', { status: 404 });

        const headers = new Headers();
        for (const name of FORWARDED_REQUEST_HEADERS) {
          const value = request.headers.get(name);
          if (value) headers.set(name, value);
        }

        // Without this every event geolocates to a Cloudflare datacenter
        // instead of the visitor, because the Worker is the origin PostHog
        // sees. The captured data already carries $geoip_* properties, so this
        // preserves existing behavior rather than collecting anything new.
        const clientIp = request.headers.get('cf-connecting-ip');
        if (clientIp) headers.set('x-forwarded-for', clientIp);

        // Buffered rather than streamed: analytics payloads are small, and a
        // streaming body would need `duplex: 'half'` and its platform caveats
        // for no benefit at this size.
        const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
        const body = hasBody ? await request.arrayBuffer() : undefined;

        let upstream: Response;
        try {
          upstream = await fetch(target.url, { method: request.method, headers, body });
        } catch {
          // Never rethrow. An analytics outage must not surface as an error
          // page over a register mid-sale.
          return new Response('Bad gateway', { status: 502 });
        }

        const responseHeaders = new Headers();
        const contentType = upstream.headers.get('content-type');
        if (contentType) responseHeaders.set('content-type', contentType);
        responseHeaders.set(
          'cache-control',
          // Extension scripts are version-stamped, so a long cache is safe and
          // means most loads never reach PostHog at all. Caching an ingestion
          // response would silently drop events.
          target.cacheable ? 'public, max-age=86400, immutable' : 'no-store',
        );

        return new Response(upstream.body, {
          status: upstream.status,
          headers: responseHeaders,
        });
      },
    },
  },
});
```

- [ ] **Step 2: Regenerate the route tree**

Run: `pnpm build`. The TanStack Router vite plugin rewrites `src/routeTree.gen.ts` as part of the build, and unlike `pnpm dev` it exits on its own rather than needing an interrupt.

Verify: `git diff --stat src/routeTree.gen.ts` shows the file changed and `grep -c "relay" src/routeTree.gen.ts` returns a non-zero count.

- [ ] **Step 3: Verify the whole suite and types still pass**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean, all tests pass (116+ files). The new route has no unit test of its own; its logic lives in Task 1 and is already covered.

- [ ] **Step 4: Commit**

```bash
git add src/routes/relay.\$.ts src/routeTree.gen.ts
git commit -m "feat(analytics): serve PostHog through a first-party /relay route

Headers go out by allowlist, not denylist. /relay is same-origin, so the browser
now attaches kodapos.app session cookies to every ingestion request; a denylist
that forgot 'cookie' would forward them to PostHog. An allowlist cannot forget.

Forwards cf-connecting-ip as x-forwarded-for, or the Worker becomes the origin
PostHog sees and every event geolocates to a datacenter. Static extension
scripts get a long immutable cache; ingestion gets no-store, since a cached POST
response drops events. Upstream failure returns 502 rather than throwing, so an
analytics outage never renders an error page over a register."
```

---

### Task 3: Point the client at the relay

**Files:**
- Modify: `src/lib/analytics/client.ts` (the `host()` function around line 34, and the `posthog.init` config around line 104)
- Modify: `tests/lib/analytics-client.test.ts` (add to the existing `describe('initAnalytics')` block)
- Modify: `docs/error-tracking-setup.md`

**Interfaces:**
- Consumes: the live `/relay` endpoint from Task 2.
- Produces: nothing further depends on this. It completes the slice.

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe('initAnalytics', ...)` block in `tests/lib/analytics-client.test.ts`, after the `captures unhandled errors and rejections` test:

```ts
  // Ingestion is first-party so blockers cannot silently disable it. This is
  // asserted rather than left to the Cloudflare env var on purpose: the proxy
  // is meant to be a property of this repo, the same argument the pinned
  // capture_* flags above are making.
  //
  // ui_host is not cosmetic. Once api_host stops matching PostHog's cloud host
  // regex, posthog-js resolves endpointFor('ui', ...) against api_host too, so
  // without this the toolbar and the issue deep links in error-tracking alerts
  // point at kodapos.app/relay and 404.
  it('sends ingestion through the first-party relay', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    vi.stubEnv('VITE_POSTHOG_HOST', '');
    stubHostname('kodapos.app');
    const init = vi.fn();
    vi.doMock('posthog-js', () => ({ default: { init, register: vi.fn() } }));
    vi.resetModules();
    const { initAnalytics } = await import('../../src/lib/analytics/client');
    await initAnalytics({});

    const call = init.mock.calls[0];
    if (!call) throw new Error('posthog.init was not called');
    expect(call[1].api_host).toBe('/relay');
    expect(call[1].ui_host).toBe('https://us.posthog.com');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/analytics-client.test.ts`
Expected: FAIL. `api_host` is `https://us.i.posthog.com` and `ui_host` is `undefined`.

- [ ] **Step 3: Change the default host**

In `src/lib/analytics/client.ts`, replace the `host()` function:

```ts
function host(): string {
  return import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com';
}
```

with:

```ts
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
```

- [ ] **Step 4: Add ui_host to the init config**

In the same file, in the `posthog.init` call, directly after the `api_host: host(),` line, add:

```ts
      // api_host is now a first-party path, which takes posthog-js off its
      // cloud-host fast path: its requestRouter regex-tests api_host and, on a
      // miss, resolves every endpoint (assets AND ui) against our origin. The
      // relay route handles assets; ui has no server side to handle, so it is
      // named explicitly here or the toolbar and the issue links embedded in
      // error-tracking alerts resolve to kodapos.app/relay and 404.
      ui_host: 'https://us.posthog.com',
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/analytics-client.test.ts`
Expected: PASS, including the pre-existing init-config and before_send tests.

- [ ] **Step 6: Document the proxy**

Append to `docs/error-tracking-setup.md`:

```markdown
## Ingestion goes through /relay

PostHog is served first-party from `kodapos.app/relay/*`, not directly from
`us.i.posthog.com`. `src/routes/relay.$.ts` forwards to two upstreams:

| Path | Upstream | Why |
|---|---|---|
| `/relay/static/*` | `us-assets.i.posthog.com` | Versioned extension scripts |
| everything else | `us.i.posthog.com` | Event ingestion, flags, remote config |

Two upstreams are required. `capture_exceptions` does not live in the main
bundle: posthog-js calls `loadExternalDependency('exception-autocapture')`,
which fetches `/static/exception-autocapture.js` at runtime. A proxy forwarding
everything to the ingestion host 404s that script and disables error tracking
with no error in any console. `$web_vitals` loads the same way.

The route forwards request headers by allowlist. This is load-bearing: `/relay`
is same-origin, so the browser attaches kodapos.app session cookies to every
ingestion request, and a denylist that forgot `cookie` would forward them to
PostHog. It also forwards `cf-connecting-ip` as `x-forwarded-for`, without which
every event geolocates to a Cloudflare datacenter.

This is mitigation with a shelf life, not a fix. Blockers increasingly match on
path patterns, and `/ingest/` and `/e/` are already on filter lists. `/relay`
was chosen for being mundane rather than for being permanent.
```

- [ ] **Step 7: Run the full local CI**

Run: `pnpm typecheck && pnpm test && pnpm lingui:compile`
Expected: all clean. Confirm `git status` shows no unexpected generated-file drift.

- [ ] **Step 8: Commit**

```bash
git add src/lib/analytics/client.ts tests/lib/analytics-client.test.ts docs/error-tracking-setup.md
git commit -m "feat(analytics): point ingestion at the first-party relay

api_host defaults to /relay in code, not only in the Cloudflare env var, for the
reason the capture_* flags are pinned rather than left to remote config: a
guarantee that lives in dashboard state is not a property of the repo.

ui_host has to be named explicitly now. Once api_host stops matching PostHog's
cloud-host regex, posthog-js resolves endpointFor('ui') against api_host too,
which would point the toolbar and the issue deep links in error-tracking alerts
at kodapos.app/relay."
```

---

## Post-merge verification

Analytics cannot be verified from localhost (the `TRACKED_HOSTS` gate) and cannot
be verified by any automated browser: posthog-js `capture()` calls `_is_bot()`
before any logging, hook, or network call, and Playwright and the chrome-devtools
MCP trip that predicate on all three of UA, `userAgentData.brands`, and
`navigator.webdriver`. So verification is by fetching deployed artifacts plus one
ordinary-browser check.

1. `curl -sI https://kodapos.app/relay/static/exception-autocapture.js` returns
   `200` with a JavaScript content type, not HTML. **This is the check that
   proves error tracking still installs.**
2. `curl -s https://kodapos.app | grep -o '/assets/index-[A-Za-z0-9_-]*\.js'`,
   then fetch that chunk and confirm it contains `/relay` and
   `us.posthog.com`.
3. From a real browser on kodapos.app, confirm in devtools that an ingestion
   POST goes to `kodapos.app/relay/...` and returns 2xx, then confirm in PostHog
   that the resulting event carries a plausible `$geoip_country_code` rather
   than a datacenter location. The geoip value is what proves `X-Forwarded-For`
   is wired.

If step 1 returns HTML, the route is not matching and the app is serving its SPA
fallback. If step 3 shows a datacenter country, the IP header is not being
forwarded.
