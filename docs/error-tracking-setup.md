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
