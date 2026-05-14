# kodapos

AI-native SaaS POS for Indonesian counter-only cafes and QSRs.

## Status

Phase 0 — Foundations Week. Validating stack viability before feature work.

## Stack

TanStack Start · Convex · shadcn/ui · Tailwind v4 · Cloudflare Pages

## Development

```bash
pnpm install
pnpm dev              # Vite dev server on http://localhost:3000
pnpm convex:dev       # Convex backend (separate terminal)
pnpm test             # Vitest unit tests
pnpm test:e2e         # Playwright E2E
pnpm lint             # Biome lint
pnpm format           # Biome format
pnpm typecheck        # TypeScript no-emit check
pnpm build            # Production build for Cloudflare Pages
```

## Documentation

- Design spec: `docs/superpowers/specs/2026-05-14-kodapos-v1-design.md`
- Implementation plans: `docs/superpowers/plans/`
