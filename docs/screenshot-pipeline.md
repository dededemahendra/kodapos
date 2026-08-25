# Screenshot pipeline

The marketing pages embed real product screenshots — populated tables, a
kitchen board with tickets, a reservation list, the public QR order page —
rather than mockups. Those images live in `public/shots/*.webp` and are
produced by `scripts/capture-shots.mjs`, driven off the shared manifest in
`scripts/lib/shots-manifest.mjs` (kept in sync with `src/lib/shots.ts`, which
the `<Shot>` component reads, by `tests/lib/shots.test.ts`).

This is a build tool, not a test. It never runs in CI, and it must never run
under `pnpm test:e2e` — "the image changed" is not an assertion failure, and
CI has no Playwright browsers installed for it. Images are regenerated
manually, by a human running `pnpm shots` locally, after a UI change visibly
affects one of the captured screens.

## Why a dedicated Convex deployment is required

`pnpm shots` calls `seed:run` with `purge: true`, which hard-deletes rows
across roughly 29 tables before writing back a deterministic, seeded demo
dataset. That is by design — the capture needs populated screens, not empty
states — but it means the pipeline is destructive to whatever deployment it
targets.

Per `CHANGELOG.md`, the deployed app **currently targets the DEV Convex
deployment** (the production cutover is still pending). If the pipeline ran
against whatever `CONVEX_DEPLOYMENT` happens to be configured, it would purge
the data behind the live site. So the pipeline refuses to run at all unless
the operator has explicitly allowlisted a dedicated deployment for it —
`scripts/lib/shots-env.mjs` enforces this as the very first thing the script
does, before any network or filesystem work, and there is deliberately no
default and no fallback.

**Never point this at the deployment the app is served from.** Provision (or
reuse) a Convex deployment that exists only for generating marketing
screenshots, and that you are comfortable having wiped on every run.

## Environment variables

- `CONVEX_DEPLOYMENT` — the deployment the local dev server (`pnpm convex:dev`
  / `pnpm dev:all`) is currently pointed at. Read the normal way, from
  `.env.local` (or wherever your Convex CLI setup puts it).
- `SHOTS_CONVEX_DEPLOYMENT` — the allowlist. Must be set to the exact same
  dedicated deployment name as `CONVEX_DEPLOYMENT` for the run to proceed. Set
  it only in your own shell/session when you intend to run the pipeline, not
  in a committed `.env` file.

If either is unset, or they don't match, `pnpm shots` exits immediately with
an explanatory error and does nothing.

Optional:

- `SHOTS_EMAIL` / `SHOTS_PASSWORD` — credentials used for the one-time signup
  that seeds the "Kopi Shots" demo owner account. Default to
  `shots@kodapos.test` / a fixed password if unset. The resulting session is
  cached at `node_modules/.cache/shots-state.json` so subsequent runs skip
  signup and onboarding.

## Prerequisites

1. Point your local Convex CLI at the dedicated shots deployment (e.g. via
   `npx convex dev --once` against that deployment, or however your `.env.local`
   selects it), so that `CONVEX_DEPLOYMENT` resolves to it.
2. Start the app against that deployment:

   ```bash
   pnpm dev:all
   ```

3. In a second shell, with `SHOTS_CONVEX_DEPLOYMENT` set to the same
   deployment name:

   ```bash
   SHOTS_CONVEX_DEPLOYMENT=<your-dedicated-deployment> pnpm shots
   ```

## What it does

1. Verifies the deployment allowlist (see above) before touching anything.
2. Confirms `http://localhost:5173` is reachable, failing fast with a
   reminder to run `pnpm dev:all` if not.
3. Signs in as the seeded demo owner (running the real signup + onboarding +
   PIN flow once, then reusing the cached session).
4. Looks up the demo cafe (`seed:cafeIdByName`) and re-seeds it
   deterministically (`seed:run` with `purge: true, seed: 12345, days: 60`),
   then looks up a table's public QR token (`seed:qrTokenForCafe`) for the
   `/order/:qrToken` shot.
5. For each theme (`light`, `dark`), opens a fresh browser context with the
   theme and locale pinned in `localStorage` before first paint, visits every
   route in the shared manifest, waits for its `waitFor` selector (data has
   painted, not just `networkidle`) and for web fonts to finish loading, then
   screenshots and re-encodes to WebP via `sharp`.
6. Writes `public/shots/<id>-<theme>.webp` for every manifest entry — 10 files
   for the current 5-shot manifest.

## Failure handling

A shot that fails (missing selector, navigation timeout, etc.) is logged and
skipped; the rest of the run continues. If anything failed, the script prints
a summary of the failures at the end and exits with a non-zero status — a
non-zero exit means at least one image was **not** regenerated, so check the
output before assuming `public/shots/` is fully up to date.

## Image size budget

Each WebP is checked against a 150KB budget after encoding. Going over budget
does not fail the run — it prints a warning so you can decide whether to trim
the underlying screen (fewer rows, a shorter list) before shipping it on a
marketing page.
