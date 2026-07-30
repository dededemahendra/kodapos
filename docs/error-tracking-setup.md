# Error tracking source maps

PostHog exception autocapture is enabled in `src/lib/analytics/client.ts`. The
production bundle is minified, so without source maps every stack trace in Error
Tracking reads as `t.a is not a function` at `chunk-abc.js:1:40213`.

`vite.config.ts` sets `sourcemap: true` on the **client environment only**
(`environments.client.build`, not the top level, which would also emit maps for
the workerd/SSR bundle that nothing ever reads). The resulting `.map` files are
**served publicly** from `kodapos.app` along with the rest of `dist/client`.
PostHog fetches each one over HTTP, following the `sourceMappingURL` comment
Vite appends to every chunk.

There is nothing to configure. No API key, no CLI, no upload step, no
environment variables, on any branch.

## The trade-off, stated plainly

Publishing the maps publishes the source. Anyone can open devtools on
`kodapos.app`, or just request a `.map` URL directly, and read the complete
unminified frontend: every component, every price and rounding rule, every
client-side check. This was chosen deliberately over the alternative below.

It does not expose anything that was already secret from a security standpoint,
because the frontend bundle was always shipped to the browser and could always
be deobfuscated with effort. Maps remove the effort. Server-side logic in
`convex/` is unaffected and is not part of `dist/client`.

Nothing secret should ever live in frontend source regardless. Keys belong in
the Convex deployment or the Cloudflare dashboard, never in `src/`.

## If this is ever revisited

The private alternative is uploading the maps to PostHog at build time and
deleting them before deploy, so traces stay readable while the source stays
closed. That needs, in `scripts/cf-deploy.mjs`:

1. `@posthog/cli` as a devDependency.
2. `posthog-cli sourcemap inject --directory dist/client`, then
   `posthog-cli sourcemap upload --directory dist/client --delete-after`,
   both passed matching `--release-name` / `--release-version`.
3. A recursive sweep deleting any surviving `*.map` under `dist/client`, run
   unconditionally as the final step. Preview branches, an unset key and a
   failed upload all skip the upload, and any map that survives is the whole
   source published anyway.
4. In the **Cloudflare** dashboard: `POSTHOG_CLI_API_KEY` (a **personal** API
   key with `error tracking write` + `organization read`) and
   `POSTHOG_CLI_PROJECT_ID` = `525294`. `POSTHOG_CLI_HOST` is optional and
   defaults to `https://us.posthog.com`, which is correct for this project.

The public `phc_` project key **cannot** be used for this. It is an
ingestion-only write key; symbol set upload goes to
`/api/environments/:id/error_tracking/symbol_sets/`, an authenticated
management endpoint, and returns 401 for a project key.

Only `dist/client` is ever relevant either way. `dist/server` is the workerd
bundle, and posthog-js only initializes in a browser, so nothing server-side
emits `$exception`.

## Ingestion goes through /relay

PostHog is served first-party from `kodapos.app/relay/*`, not directly from
`us.i.posthog.com`. `src/routes/relay.$.ts` forwards to two upstreams:

| Path | Upstream | Why |
|---|---|---|
| `/relay/static/*` | `us-assets.i.posthog.com` | Versioned extension scripts (`exception-autocapture`, `web-vitals`, toolbar) |
| everything else, including `/relay/array/*` (remote config) | `us.i.posthog.com` | Event ingestion, flags, remote config |

`/static/*` is not the entire set of paths posthog-js resolves through
`endpointFor('assets', ...)`. Remote config (`/array/<token>/config` and
`/array/<token>/config.js`) also resolves through `assets`, but is deliberately
kept on the ingestion upstream: it is unverified that the CDN-backed assets
host serves `/array/`, and getting that wrong would break remote config
silently. `/static/*` is the one assets path confirmed to work there.

**REQUIRED DEPLOY STEP:** `VITE_POSTHOG_HOST` must be unset (or removed
entirely) in the Cloudflare Workers Builds dashboard for this project.
`client.ts` only falls back to `/relay` when the variable is unset or empty; a
value left over from before this proxy existed (`https://us.i.posthog.com`)
silently overrides the default, and the deploy ships a live, unused `/relay`
route while ingestion continues to go directly to PostHog, unprotected from ad
blockers, exactly as if this proxy had never shipped.

Two upstreams are required, not one, but not because the ingestion host 404s
`/static/*`. It does not: `us.i.posthog.com` dual-serves those paths today, so
routing everything through one upstream would still work right now. The split
exists because `us-assets.i.posthog.com` is the CDN-backed host PostHog
documents and intends for static assets, and matching PostHog's own topology
is a design this repo can keep relying on, rather than depending on
undocumented dual-serving behavior that could stop working at any time with no
warning here.

The route forwards request headers by allowlist. This is load-bearing: `/relay`
is same-origin, so the browser attaches kodapos.app session cookies to every
ingestion request, and a denylist that forgot `cookie` would forward them to
PostHog. It also forwards `cf-connecting-ip` as `x-forwarded-for` and the
visitor's `user-agent`, without which every event geolocates to a Cloudflare
datacenter and carries the Worker's user-agent instead of the visitor's; both
preserve what direct ingestion already sent rather than collecting anything
new.

This is mitigation with a shelf life, not a fix. Blockers increasingly match on
path patterns, and `/ingest/` and `/e/` are already on filter lists. `/relay`
was chosen for being mundane rather than for being permanent.
