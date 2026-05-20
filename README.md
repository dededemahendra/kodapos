# kodapos

AI-native SaaS POS for Indonesian counter-only cafes and QSRs.

## Status

Phase 0 — Foundations: Tasks 1–15, 22–25 complete; observability (16–17), Cloudflare deploy (18–20), and CI (21) deferred. Auth, multi-tenant cafe pattern, Lingui i18n, and the quality-gate pipeline are working locally. See `docs/superpowers/plans/2026-05-14-phase-0-foundations.md` for per-task status and Addendum A for adaptations to the live stack.

## Stack

TanStack Start · Convex · Convex Auth · shadcn/ui · Tailwind v4 · Lingui 6 · Biome · Vitest · Playwright

## Development

```bash
pnpm install

# Two terminals:
pnpm dev          # Vite dev server (http://localhost:5173)
pnpm convex:dev   # Convex backend watcher

# Or one terminal:
pnpm dev:all
```

## Quality gates

```bash
pnpm typecheck                       # TypeScript no-emit
pnpm lint                            # Biome lint
pnpm format                          # Biome format
pnpm test                            # Vitest (Convex + unit)
pnpm test:e2e                        # Playwright home smoke
RUN_AUTH_E2E=1 pnpm test:e2e         # Adds the auth-flow E2E (creates a real Convex user)
```

## i18n

Strings live in `src/locales/{id,en}/messages.po`. Bahasa Indonesia is the source locale. After adding `<Trans>` macros:

```bash
pnpm lingui:extract    # update .po catalogs
pnpm lingui:compile    # for production builds (Vite plugin compiles on-the-fly in dev)
```

## Deploy

Cloudflare Pages deploy is wired up in Tasks 18–20 of the Phase 0 plan; not yet executed. When ready:

```bash
pnpm convex:deploy
pnpm build
pnpm dlx wrangler pages deploy .output/public --project-name=kodapos
```

## Documentation

- Design spec: `docs/superpowers/specs/2026-05-14-kodapos-v1-design.md`
- Phase 0 plan: `docs/superpowers/plans/2026-05-14-phase-0-foundations.md` (see Addendum A for stack adaptations)
