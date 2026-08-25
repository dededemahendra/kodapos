# Production Convex cutover

Deploys run on **Cloudflare Workers Builds** (dashboard Git integration) on push
to `main`. The build command is `pnpm cf:deploy`, which runs `convex deploy`
only on the production branch and a plain `pnpm build` everywhere else
(`scripts/cf-deploy.mjs`).

Today that deploy targets the **DEV** Convex deployment. This document is the
one-time cutover to a production deployment, and the standing reference for
which environment variable lives where.

## The thing to decide first: data does not come with you

A Convex production deployment is a **separate database**. Cutting over does not
copy cafes, orders, shifts, stock movements, or user accounts from dev — the
production deployment starts empty, and every existing account has to sign up
again.

- If the dev deployment holds only test data, cut over and let it start clean.
- If it holds anything real, export first and import into production between
  steps 2 and 3 below. Pass `--include-file-storage`, or menu-item images are
  left behind:

  ```bash
  npx convex export --path dev-snapshot.zip --include-file-storage
  npx convex import --prod dev-snapshot.zip
  ```

  Import into an empty deployment; it is not a merge.

## Step 1 — Create the production deployment and its auth keys

The production deployment is created by the Convex dashboard (Project →
Production). Convex Auth signs its own JWTs and needs a keypair generated per
deployment — the dev keys do not carry over:

```bash
npx @convex-dev/auth --prod
```

This writes `JWT_PRIVATE_KEY` and `JWKS` into the production environment.
`CONVEX_SITE_URL` and `CONVEX_CLOUD_URL` are set by Convex itself; never set
them by hand.

## Step 2 — Seed the production Convex environment

Set these on the **production** deployment (`npx convex env set --prod NAME value`,
or the dashboard). Nothing here is committed to the repo.

| Variable | Required | Notes |
|---|---|---|
| `RESEND_API_KEY` | Yes | All email: OTP sign-in codes, password reset, receipts, shift summaries, low-stock alerts. Without it those actions throw "Email belum dikonfigurasi". |
| `RESEND_FROM` | Yes in prod | A **verified** sender on your domain, e.g. `kodapos <noreply@kodapos.app>`. The default `onboarding@resend.dev` only delivers to the Resend account owner, so leaving it unset silently breaks sign-in for real users. |
| `SITE_URL` | Yes | `https://kodapos.app` — the frontend origin, used to build the tap-to-sign-in magic link and invite links. Do **not** point it at the `.convex.site` backend host. |
| `QRIS_WEBHOOK_SECRET` | Yes | Signing secret for the mock QRIS webhook route. There is no default: an unseeded deployment rejects every webhook (401), so a QRIS charge can never be marked paid. Generate one: `openssl rand -hex 32`. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | **No** — Google is hidden | The sign-in page is email-only, so production needs neither. If you re-enable the button ([auth setup](./auth-setup.md#google-oauth-app)), production also needs a **new authorized redirect URI** on the Google OAuth client: `https://<prod>.convex.site/api/auth/callback/google`. The dev URI keeps working for dev; add, don't replace. |

Verify before moving on:

```bash
npx convex env list --prod
```

## Step 3 — Point Cloudflare at production

In the Cloudflare dashboard, Workers → kodapos → Settings → Build:

1. Build command is `pnpm cf:deploy` (not `pnpm build` — a plain build never
   pushes Convex functions).
2. Replace `CONVEX_DEPLOY_KEY` with a **production** deploy key, generated from
   the Convex dashboard on the production deployment. This single variable is
   what makes `convex deploy` target production; the repo has no deployment
   name hardcoded.
3. `VITE_CONVEX_URL` is **not** set by hand — `cf-deploy.mjs` passes
   `--cmd-url-env-var-name VITE_CONVEX_URL`, so `convex deploy` injects the
   correct URL into the Vite build. A stale hand-set value would silently point
   the production frontend at dev.
4. `VITE_POSTHOG_KEY` — set to enable analytics. Analytics also requires the
   hostname to be in `TRACKED_HOSTS` (`src/lib/analytics/policy.ts`, currently
   `kodapos.app` / `www.kodapos.app`), so preview deploys stay inert.
   Leave `VITE_POSTHOG_HOST` unset — ingestion goes through the first-party
   `/relay` proxy.

## Step 4 — Deploy and verify

Push to `main` (or re-run the last build from the dashboard). The build log
should show `[cf-deploy] branch "main" is production — deploying Convex + building.`

Then walk the paths that depend on the variables above, because each one fails
in its own quiet way:

- [ ] Sign in with an emailed code — covers `RESEND_API_KEY` and `RESEND_FROM`.
- [ ] The sign-in email's tap-to-sign-in link opens `kodapos.app`, not
      `.convex.site` — covers `SITE_URL`.
- [ ] The sign-in card offers **email only** — no "Continue with Google". (The provider is still registered in `convex/auth.ts`; only the button is gone.)
- [ ] Complete onboarding and ring up one order.
- [ ] A QRIS dynamic charge settles — covers `QRIS_WEBHOOK_SECRET`.
- [ ] Email a receipt.
- [ ] PostHog receives events from `kodapos.app` (and not from a preview URL).

## Step 5 — Land the paperwork

Once production is live, drop the "currently targets the dev Convex deployment"
lines from `README.md` and the pending-cutover note in `CHANGELOG.md`.

## Local development after the cutover

Unchanged: `.env.local` still holds `CONVEX_DEPLOYMENT=dev:…` and `pnpm dev:all`
still runs against dev. The production deploy key lives only in Cloudflare.

One local change is needed for the QRIS mock flow, which no longer has a
built-in secret — seed the dev deployment once:

```bash
npx convex env set QRIS_WEBHOOK_SECRET "$(openssl rand -hex 32)"
```

The `RUN_AUTH_E2E` sale spec signs its webhook with `process.env.QRIS_WEBHOOK_SECRET`
and must be given the same value the target deployment holds.
