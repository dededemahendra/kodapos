# Phase 0 Results — Cut-Bait Decision (PARTIAL)

**Date completed:** 2026-05-20 (partial — deploy-dependent criteria not yet measured)
**Repo state at decision:** `4a4cf1a` (commit `refactor(cafes): add return validators per Convex guidelines`)

## Scope of this sign-off

Phase 0's plan has 27 tasks. This document records the state of the **local-only** quality gates and feature surfaces. Tasks 16–21 (Sentry, PostHog, Cloudflare Pages config, first deploy, Jakarta latency, GitHub Actions CI) were **explicitly deferred** in this session — each requires external accounts, credentials, or a remote that aren't set up yet. The four exit criteria that depend on a live deployment cannot be evaluated until that work is done. Until then, treat this as a checkpoint, not a verdict.

## Exit criteria

| # | Criterion | Status | Notes |
|---|---|---|---|
| 1 | Deploys to Cloudflare Pages, responds from Indonesia | ⏸ deferred | Task 18 (wrangler config) not run — needs `wrangler login` + KV namespace creation. Task 19 (first deploy) blocked on 18. |
| 2 | Convex Auth signup + signin works end-to-end on deploy | ⏸ deferred (locally ✓) | The path is wired and unit-tested. `convex/auth.{config,ts}`, `convex/http.ts`, root-level `<ConvexAuthProvider>`, sign-up + sign-in routes, dashboard guard, and sign-out all in place. Headless Playwright confirms `/signup` and `/signin` render and that `/dashboard` signed-out bounces to `/signin`. Full sign-up → dashboard → sign-out cycle is the env-gated `RUN_AUTH_E2E=1 pnpm test:e2e` flow — not run here to avoid seeding dev Convex with throwaway users. End-to-end against a deployed URL waits on Criterion 1. |
| 3 | Authenticated query returns data on deployed UI | ⏸ deferred (locally ✓) | `users.hello` and `cafes.{createForOwner,mine}` are written, return-validated, and covered by `convex-test` (2 + 4 cases respectively). Dashboard renders `Halo, <name>!` and the "Kafe Saya" section. Deployed-UI validation waits on Criterion 1. |
| 4 | Jakarta WebSocket query p50 <300 ms | ⏸ deferred | Task 20 (latency probe) needs a deployed URL. No measurement taken. |
| 5 | Quality gates pass (lint, typecheck, test, e2e, build) | ◐ partial ✓ | `pnpm lint` ✓ (51 files clean); `pnpm typecheck` ✓; `pnpm test` ✓ (3 files / 13 tests — 2 users + 7 money + 4 cafes); `pnpm test:e2e` ✓ (1 passed, 1 skipped — auth flow gated). **`pnpm build` not run** — Cloudflare Pages target is part of Task 18 and per Addendum §A.4 the actual output path is unverified. |
| 6 | No discovered showstoppers | ◐ none on the local stack | Several real friction points listed under **What surprised me** — none structural. Cloudflare deploy is still a known-unknown per Addendum §A.4; counts as a deferred risk, not a discovered showstopper. |

**Summary:** 0 ✗, 0 ⚠, 2 ◐ partial, 4 ⏸ deferred. The local half of Phase 0 is green. The deployed half is unmeasured.

## What surprised me

Captured during execution; each has a corresponding Addendum entry. The pattern is the same in each case: the plan was written against a 2024–early-2026 snapshot of the stack and most of these libraries shipped breaking changes since.

- **TanStack Start migrated off Vinxi/Nitro.** The plan's `app.config.ts` + Vinxi preset is gone. The current path is Vite-native via `@tanstack/react-start/plugin/vite`, with all plugins attached to `vite.config.ts`. Captured in Addendum §A.1 / §A.3 (pre-existing from Task 2; just confirmed during this session).
- **Route group filenames are `_pos` / `_public`, not `(pos)` / `(public)`.** Surfaces in every route file. Addendum §A.9 (pre-existing).
- **`convex-test`'s default module discovery breaks under pnpm.** Auto-discovery's `import.meta.glob` resolves relative to the hoisted pnpm package location, three `..` segments shy of the project root. Fix: pass `modules` explicitly from the test file. Addendum §A.12 (pre-existing from Task 9).
- **Lingui 6 + Vite 8 macro pipeline is a different shape than the plan.** Three breakages stacked: `format: 'po'` is gone (need `formatter()` from `@lingui/format-po`), `babel-plugin-macros` indirection is gone (use `@lingui/babel-plugin-lingui-macro` directly), and `@vitejs/plugin-react@6` dropped the `babel` option entirely so macros need a separate `@rolldown/plugin-babel` pass with `linguiTransformerBabelPreset()`. SSR errored loudly with `Cannot find package 'babel-plugin-macros'` until the babel pass was wired. Captured this session in Addendum §A.13.
- **`tsconfig.json baseUrl` is a hard TS 6/7 error**, not a deprecation warning. Pre-existing in the repo at session start (committed in Task 2). Removed; `paths` works fine without it under `moduleResolution: "Bundler"`.
- **`@vitejs/plugin-react@6` accepts no `babel` option.** Dropped in v6 in favor of Oxc/Rolldown JSX transform. Anything that needs Babel (Lingui macros, React Compiler) now needs its own `@rolldown/plugin-babel` entry.
- **Lingui `compileNamespace: 'es'` in config does not switch output.** Has to be `--namespace es` on the CLI. Output is then `messages.mjs`, not `messages.js`. The Vite plugin's runtime `.po` interceptor sidesteps this entirely for dev.
- **`pnpm convex:dev` doesn't auto-codegen unless it's running.** When adding `convex/cafes.ts` in this session, `api.cafes.*` didn't resolve until I ran `pnpm exec convex codegen` manually. Worth noting in future sessions.

## What I'd change in Phase 1

- **Decide the auth-E2E story before deploy.** Today `RUN_AUTH_E2E=1 pnpm test:e2e` seeds the dev Convex deployment with throwaway users. CI (Task 21) needs an ephemeral Convex deployment per branch, or a cleanup hook. Same concern bites local manual testing.
- **Defer `wrangler.toml` until the build is understood.** Per Addendum §A.4 the Cloudflare output path is unverified. Run `pnpm build`, inspect what lands, then write the deploy config. The plan's recipe assumes `.output/public/` which may not be where Vite-native TanStack Start emits.
- **Adopt the shadcn skill earlier.** The shadcn skill (installed mid-session) enforces forms-via-`Field`/`FieldGroup` + `Spinner`-for-loading conventions. Doing the sign-up page twice was avoidable.
- **Convex AI guidelines should drive `convex/cafes.ts`'s `.collect()`.** Acceptable for Phase 0, but Phase 1 should switch to `.take(n)` or pagination on any query that can return more than a small bounded list. Already noted in the audit.
- **Set up an ephemeral Convex preview deployment before Task 18.** Task 19 will be much smoother if there's a non-production Convex backend to point the first Cloudflare deploy at.

## Verdict

**PROCEED WITH NOTES — pending the deploy half of Phase 0.**

The stack is validated for everything we can validate locally: auth, queries, multi-tenant isolation pattern, i18n, testing, lint, typecheck. None of the surprises were structural; all were captured in Addendum entries so the next session doesn't re-learn them.

The deploy half (Tasks 18–20) is the actual cut-bait gate. Until `pnpm build` produces a working artifact, `wrangler pages deploy` succeeds, and Jakarta latency comes in under 300 ms p50, the original cut-bait question is unanswered. **Do not start Phase 1 feature work until Tasks 18–20 are done.**

## Next step

Pick one before any Phase 1 work begins:

1. **Run Tasks 18–20.** User does `wrangler login` interactively; I do the rest. Outcome converts this partial sign-off into a full one.
2. **Or commit to a different deploy target** (e.g., Convex's hosting or a different edge provider) and rewrite Tasks 18–20 against that target before deploying.

Either way the next session ends with a measured number for Criterion 4 and a deployed URL for Criteria 1–3.
