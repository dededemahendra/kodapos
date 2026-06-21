# kodapos

AI-native SaaS POS for Indonesian cafes and quick-service restaurants.

## Status

**Early access.** The full point-of-sale and the professional feature set are
shipped, alongside a marketing site, bilingual legal pages, and SEO. Deploys to
Cloudflare Workers (currently pointing at the dev Convex deployment). Core
features are free during early access; paid plans are announced before it ends.

## Features

**Sales & payments** — cart, order types (dine-in / takeaway / pickup), held
orders, split & multi-tender, cash and QRIS (static + dynamic via Xendit),
receipts (print / email / WhatsApp), shifts with cash reconciliation, void &
refunds.

**Menu & inventory** — categories, items with images and barcodes, modifier
groups, variants; recipes, ingredients, event-sourced stock movements, purchase
orders, suppliers, waste tracking, and stock-take.

**Operations** — tables & floor plan, reservations, kitchen display (KDS),
QR self-ordering, customer-facing display, time clock & schedules, staff roles
and permissions with PIN entry.

**Customers & loyalty** — customer directory, loyalty points and tiers, rewards,
gift cards.

**Reports & AI** — sales, products, payments, margin, expenses, and P&L reports;
rule-based demand forecasting with restock suggestions; AI insights, Q&A, and
chat grounded in the cafe's data (bring-your-own AI key).

**Platform** — bilingual (Bahasa Indonesia / English), light & dark themes,
responsive, full-screen register / tables / kitchen modes, animated onboarding
wizard, marketing landing site, legal pages framed around UU PDP, and SEO
(Open Graph, JSON-LD, sitemap).

## Stack

TanStack Start · Convex · Convex Auth · shadcn/ui · Tailwind v4 · Motion · Lingui 6 · Biome · Vitest · Playwright

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
pnpm lingui:extract    # update .po catalogs (then fill the en translations)
pnpm lingui:compile    # for production builds (Vite plugin compiles on-the-fly in dev)
```

## Deploy

Continuous deploy to **Cloudflare Workers** via Cloudflare Workers Builds
(dashboard Git integration) on push to `main`. It currently targets the dev
Convex deployment; runtime env vars are configured in the Cloudflare dashboard.

Manual deploy:

```bash
pnpm convex:deploy   # push Convex functions
pnpm deploy          # vite build + wrangler deploy
```

## Documentation

- Design spec: `docs/superpowers/specs/2026-05-14-kodapos-v1-design.md`
- Pro-POS roadmap: `docs/superpowers/ROADMAP-pro-pos.md`
- Plans & specs: `docs/superpowers/`
