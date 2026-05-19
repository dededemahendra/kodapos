# kodapos Phase 0 — Foundations Week Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the kodapos technical foundation by shipping a deployable, authenticated "hello user" app on TanStack Start + Convex + Cloudflare Pages + shadcn/ui, before committing to any Phase 1+ feature work.

**Architecture:** Single-package TanStack Start app at the repo root. Convex backend in `convex/`. shadcn/ui primitives in `src/components/ui/`. Tailwind v4 with centralized tokens. Lingui for i18n. Sentry + PostHog wired minimally. Deploys to Cloudflare Pages via the official Vinxi Cloudflare adapter. Convex Cloud hosts the backend (not on Cloudflare; the standard pattern).

**Tech Stack:** TanStack Start (Vite + Vinxi), TanStack Router, TanStack Query (non-Convex fetches only), React 19, Convex + Convex Auth, shadcn/ui, Tailwind v4, Lucide icons, Lingui, Sentry, PostHog, Biome, Vitest, Playwright, pnpm, GitHub Actions, Cloudflare Pages, Wrangler.

**Phasing context:** This plan is **Phase 0 only** (per spec §7.2). Subsequent phase plans (Phase 1 internal alpha → Phase 4 paid GA) will be written **after** Phase 0 completes — Phase 0 is a cut-bait gate; if the stack has a showstopper, Phase 1+ plans built on it would be wasted effort.

**Exit criteria for Phase 0** (must all be true to proceed):

1. App deploys to Cloudflare Pages and responds to requests from Indonesia (or via a Jakarta-region VPN).
2. Convex Auth sign-up + sign-in flow works end-to-end on the deployed app.
3. An authenticated Convex query returns data to the deployed UI without errors.
4. WebSocket latency from a Jakarta client to Convex is acceptable (<300ms p50 on a warm connection).
5. Build, typecheck, lint, unit tests, and one E2E test all pass in CI.
6. No discovered showstoppers in TanStack Start / Cloudflare / Convex integration. If a showstopper IS found, document the cut-bait decision in Task 27 and halt Phase 1+ planning pending a stack revision.

**Notes on conventions:**

- Run all commands from the repo root (`/Users/dedemahendra/Developer/Workspace/kodapos`).
- Package manager is `pnpm`. Install via `npm i -g pnpm@9` if not present.
- Commit messages use Conventional Commits (`feat:`, `chore:`, `test:`, `ci:`, etc.) for consistency.
- When a step says "verify" without explicit assertion code, look for the described outcome (file exists, dev server starts, build succeeds). Failing verification = stop and diagnose; do not proceed.
- The repo already has one commit (the V1 design spec) on `main`. All Phase 0 work commits to `main` directly; we'll start using feature branches in Phase 1.

---

## Task 1: Initialize repo skeleton

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`
- Create: `package.json`
- Create: `.npmrc`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build artifacts
dist/
.output/
.vinxi/
.tanstack/
.wrangler/

# Environment files (never commit secrets)
.env
.env.local
.env.*.local

# Editor / OS
.DS_Store
.idea/
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Test artifacts
coverage/
test-results/
playwright-report/
playwright/.cache/

# Convex
convex/_generated/

# Misc
*.tsbuildinfo
```

- [ ] **Step 2: Create `.env.example`**

```dotenv
# Convex
CONVEX_DEPLOYMENT=
VITE_CONVEX_URL=

# Sentry (Phase 0: leave blank to disable; populate before deploy)
VITE_SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# PostHog (Phase 0: leave blank to disable)
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://app.posthog.com

# Cloudflare Pages (populated by `wrangler login`)
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
```

- [ ] **Step 3: Create `README.md`**

```markdown
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
```

- [ ] **Step 4: Create `package.json`**

```json
{
  "name": "kodapos",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.14.4",
  "scripts": {
    "dev": "vinxi dev",
    "build": "vinxi build",
    "start": "vinxi start",
    "convex:dev": "convex dev",
    "convex:deploy": "convex deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "typecheck": "tsc --noEmit",
    "lingui:extract": "lingui extract",
    "lingui:compile": "lingui compile"
  },
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  }
}
```

- [ ] **Step 5: Create `.npmrc`**

```ini
enable-pre-post-scripts=true
strict-peer-dependencies=false
auto-install-peers=true
```

- [ ] **Step 6: Verify**

Run: `ls -la`
Expected: `.gitignore`, `.env.example`, `README.md`, `package.json`, `.npmrc`, `docs/` all present.

- [ ] **Step 7: Commit**

```bash
git add .gitignore .env.example README.md package.json .npmrc
git commit -m "chore: initialize repo skeleton"
```

---

## Task 2: Bootstrap TanStack Start application

**Files:**
- Create: `app.config.ts`
- Create: `tsconfig.json`
- Create: `src/router.tsx`
- Create: `src/client.tsx`
- Create: `src/ssr.tsx`
- Create: `src/routes/__root.tsx`
- Create: `src/routes/index.tsx`

- [ ] **Step 1: Install TanStack Start core deps**

Run:
```bash
pnpm add @tanstack/react-start @tanstack/react-router @tanstack/react-query react@^19 react-dom@^19
pnpm add -D @tanstack/router-plugin @tanstack/router-devtools vinxi vite @vitejs/plugin-react @types/react @types/react-dom typescript
```

Expected: deps install cleanly, `pnpm-lock.yaml` created.

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "~/*": ["./src/*"],
      "convex/*": ["./convex/*"]
    }
  },
  "include": ["src", "convex", "tests", "app.config.ts"],
  "exclude": ["node_modules", "dist", ".output", ".vinxi"]
}
```

- [ ] **Step 3: Create `app.config.ts`**

```typescript
import { defineConfig } from '@tanstack/react-start/config';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  vite: {
    plugins: [
      tsconfigPaths(),
      TanStackRouterVite({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
      }),
    ],
  },
  server: {
    preset: 'cloudflare-pages',
  },
});
```

Run: `pnpm add -D vite-tsconfig-paths`

- [ ] **Step 4: Create `src/router.tsx`**

```typescript
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
```

- [ ] **Step 5: Create `src/client.tsx`**

```typescript
import { hydrateRoot } from 'react-dom/client';
import { StartClient } from '@tanstack/react-start';
import { createRouter } from './router';

const router = createRouter();
hydrateRoot(document, <StartClient router={router} />);
```

- [ ] **Step 6: Create `src/ssr.tsx`**

```typescript
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server';
import { createRouter } from './router';

export default createStartHandler({ createRouter })(defaultStreamHandler);
```

- [ ] **Step 7: Create `src/routes/__root.tsx`**

```typescript
import {
  Outlet,
  ScrollRestoration,
  createRootRoute,
} from '@tanstack/react-router';
import { Meta, Scripts } from '@tanstack/react-start';
import type { ReactNode } from 'react';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'kodapos' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <Meta />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Create `src/routes/index.tsx`**

```typescript
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <main style={{ padding: 32, fontFamily: 'system-ui, sans-serif' }}>
      <h1>kodapos</h1>
      <p>Phase 0 foundations week.</p>
    </main>
  );
}
```

- [ ] **Step 9: Verify dev server boots**

Run: `pnpm dev`

Expected: Vinxi prints a URL (typically `http://localhost:3000`). Open it; page shows "kodapos" + "Phase 0 foundations week." Stop with Ctrl+C.

If the dev server fails to start, **this is a Phase 0 showstopper signal** — document the failure mode and consult Task 27 cut-bait criteria before patching forward.

- [ ] **Step 10: Commit**

```bash
git add app.config.ts tsconfig.json src package.json pnpm-lock.yaml
git commit -m "feat: bootstrap TanStack Start application"
```

---

## Task 3: Install Tailwind v4 + design tokens

**Files:**
- Create: `src/styles/globals.css`
- Modify: `app.config.ts`
- Modify: `src/routes/__root.tsx`

- [ ] **Step 1: Install Tailwind v4**

Run:
```bash
pnpm add -D tailwindcss@^4 @tailwindcss/vite
```

- [ ] **Step 2: Wire the Tailwind Vite plugin into `app.config.ts`**

Replace the file with:

```typescript
import { defineConfig } from '@tanstack/react-start/config';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: {
    plugins: [
      tsconfigPaths(),
      tailwindcss(),
      TanStackRouterVite({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
      }),
    ],
  },
  server: {
    preset: 'cloudflare-pages',
  },
});
```

- [ ] **Step 3: Create `src/styles/globals.css` with the kodapos token set**

```css
@import "tailwindcss";

@theme {
  /* Brand */
  --color-brand-50:  #e8f7f0;
  --color-brand-100: #c8eadb;
  --color-brand-200: #94d8b9;
  --color-brand-300: #5cc394;
  --color-brand-400: #2eaf73;
  --color-brand-500: #169a5d;
  --color-brand-600: #117c4b;
  --color-brand-700: #0d5e39;
  --color-brand-800: #084027;
  --color-brand-900: #042818;

  /* Semantic */
  --color-success: var(--color-brand-500);
  --color-warning: #d97706;
  --color-danger:  #dc2626;
  --color-info:    #2563eb;

  /* Surface */
  --color-bg:      #ffffff;
  --color-surface: #f7f8f9;
  --color-border:  #e5e7eb;
  --color-fg:      #0f172a;
  --color-fg-muted:#475569;

  /* Type scale */
  --font-sans: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

  /* Radius */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
}

:root {
  color-scheme: light dark;
  font-family: var(--font-sans);
  background: var(--color-bg);
  color: var(--color-fg);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:      #0b1220;
    --color-surface: #131c30;
    --color-border:  #1f2a44;
    --color-fg:      #f1f5f9;
    --color-fg-muted:#94a3b8;
  }
}

html, body { margin: 0; padding: 0; min-height: 100vh; }

/* Counter density mode (POS routes will set this) */
[data-density="compact"] {
  --kodapos-touch: 48px;
}
[data-density="comfortable"] {
  --kodapos-touch: 40px;
}
```

- [ ] **Step 4: Import the stylesheet from the root route**

Replace `src/routes/__root.tsx` with:

```typescript
import {
  Outlet,
  ScrollRestoration,
  createRootRoute,
} from '@tanstack/react-router';
import { Meta, Scripts } from '@tanstack/react-start';
import type { ReactNode } from 'react';
import globalsCss from '~/styles/globals.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'kodapos' },
    ],
    links: [{ rel: 'stylesheet', href: globalsCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <Meta />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Replace home page with a Tailwind-styled version**

Replace `src/routes/index.tsx` with:

```typescript
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-brand-600">kodapos</h1>
      <p className="text-fg-muted mt-2">Phase 0 — foundations week.</p>
      <div className="mt-6 p-4 rounded-md bg-surface border border-[var(--color-border)]">
        Tailwind v4 verified.
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Verify Tailwind compiles and is applied**

Run: `pnpm dev`
Expected: home page renders with green "kodapos" header and styled card.

- [ ] **Step 7: Commit**

```bash
git add app.config.ts src/styles src/routes package.json pnpm-lock.yaml
git commit -m "feat: install Tailwind v4 and design tokens"
```

---

## Task 4: Initialize shadcn/ui + Lucide

**Files:**
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Create: `src/components/ui/button.tsx`

- [ ] **Step 1: Install shadcn dependencies**

Run:
```bash
pnpm add class-variance-authority clsx tailwind-merge lucide-react
pnpm add -D @types/node
```

- [ ] **Step 2: Create `components.json`** (shadcn config)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "~/components",
    "utils": "~/lib/utils",
    "ui": "~/components/ui",
    "lib": "~/lib",
    "hooks": "~/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 3: Create `src/lib/utils.ts`** (the `cn` helper)

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Add the Button component** (vendored, not installed via CLI to keep this plan deterministic)

Create `src/components/ui/button.tsx`:

```typescript
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '~/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-brand-600 text-white hover:bg-brand-700',
        destructive: 'bg-[var(--color-danger)] text-white hover:opacity-90',
        outline: 'border border-[var(--color-border)] bg-transparent hover:bg-surface',
        ghost: 'hover:bg-surface',
        link: 'text-brand-600 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-12 px-6 text-base',
        pos: 'h-12 px-5 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { buttonVariants };
```

Run: `pnpm add @radix-ui/react-slot`

- [ ] **Step 5: Smoke-test Button + Lucide on the home page**

Replace `src/routes/index.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { Coffee, Sparkles } from 'lucide-react';
import { Button } from '~/components/ui/button';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <header className="flex items-center gap-3">
        <Coffee className="size-8 text-brand-600" />
        <h1 className="text-3xl font-bold text-brand-600">kodapos</h1>
      </header>
      <p className="text-fg-muted mt-2">Phase 0 — foundations week.</p>

      <section className="mt-6 flex gap-3">
        <Button>
          <Sparkles className="size-4" /> Default
        </Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button size="pos">Bayar</Button>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Verify**

Run: `pnpm dev`
Expected: home page renders with a coffee icon, four button variants visible and clickable.

- [ ] **Step 7: Commit**

```bash
git add components.json src/lib src/components package.json pnpm-lock.yaml src/routes
git commit -m "feat: initialize shadcn/ui with Button + Lucide"
```

---

## Task 5: Set up route groups (public, pos)

**Files:**
- Create: `src/routes/(public)/_layout.tsx`
- Create: `src/routes/(public)/index.tsx`
- Delete: `src/routes/index.tsx` (replaced by `(public)/index.tsx`)
- Create: `src/routes/(pos)/_layout.tsx`
- Create: `src/routes/(pos)/dashboard.tsx`

- [ ] **Step 1: Delete the old root index route**

Run: `rm src/routes/index.tsx`

- [ ] **Step 2: Create `src/routes/(public)/_layout.tsx`**

(File-system routing in TanStack Router uses `_layout` files as pathless layouts. Files in a `(group)` directory don't appear in the URL.)

```typescript
import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(public)/_layout')({
  component: PublicLayout,
});

function PublicLayout() {
  return (
    <div data-density="comfortable">
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 3: Create `src/routes/(public)/index.tsx`**

```typescript
import { createFileRoute, Link } from '@tanstack/react-router';
import { Coffee } from 'lucide-react';
import { Button } from '~/components/ui/button';

export const Route = createFileRoute('/(public)/_layout/')({
  component: PublicHome,
});

function PublicHome() {
  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <header className="flex items-center gap-3">
        <Coffee className="size-8 text-brand-600" />
        <h1 className="text-3xl font-bold text-brand-600">kodapos</h1>
      </header>
      <p className="text-fg-muted mt-2">
        AI-native POS untuk kafe & QSR Indonesia.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link to="/signin">Masuk</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/signup">Daftar</Link>
        </Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Create `src/routes/(pos)/_layout.tsx`**

```typescript
import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(pos)/_layout')({
  component: PosLayout,
});

function PosLayout() {
  return (
    <div data-density="compact" className="min-h-screen bg-surface">
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 5: Create `src/routes/(pos)/dashboard.tsx`** (placeholder authenticated landing page)

```typescript
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(pos)/_layout/dashboard')({
  component: Dashboard,
});

function Dashboard() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-fg-muted mt-2">
        Placeholder — replaced by hello-user query after Task 13.
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Verify route tree generation**

Run: `pnpm dev`

Expected:
- Visiting `/` shows the public home page.
- Visiting `/dashboard` shows the POS placeholder.
- The route tree file `src/routeTree.gen.ts` is regenerated automatically by the TanStack Router Vite plugin.

If a route fails to compile, the plugin will surface the error in the dev server output.

- [ ] **Step 7: Commit**

```bash
git add src/routes
git commit -m "feat: set up (public) and (pos) route groups"
```

---

## Task 6: Initialize Convex backend

**Files:**
- Create: `convex/schema.ts`
- Auto-generated: `convex/_generated/*`, `.env.local` (Convex CLI writes these)

- [x] **Step 1: Install Convex**

Run:
```bash
pnpm add convex
```

- [x] **Step 2: Initialize the Convex project**

Run: `pnpm dlx convex@latest dev --once --configure=new`

When prompted:
- Login to Convex (browser-based).
- Choose a project name: `kodapos-dev`.
- Accept defaults for team / deployment names.

Expected: the CLI creates `convex/` directory with `_generated/`, writes `.env.local` containing `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL`.

- [x] **Step 3: Create the starter `convex/schema.ts`**

This is a minimal schema for Phase 0 — only enough to support the auth + hello query. The full schema from spec §2 lands in Phase 1.

```typescript
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';

export default defineSchema({
  ...authTables,

  // Minimal Phase 0 cafes table — used only to verify the auth → query path.
  // Full §2 domain model lands in Phase 1.
  cafes: defineTable({
    name: v.string(),
    ownerUserId: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_owner', ['ownerUserId']),
});
```

- [x] **Step 4: Install Convex Auth**

Run: `pnpm add @convex-dev/auth @auth/core`

- [x] **Step 5: Verify schema validates**

Run (in a separate terminal): `pnpm convex:dev`

Expected: Convex CLI watches the schema, applies it, and prints a "Convex functions ready" line. No schema errors.

Stop with Ctrl+C if you want to free the terminal, but the CLI works fine running continuously.

- [x] **Step 6: Add `.env.local` to gitignore awareness**

`.env.local` is already gitignored by Task 1. Confirm with: `git status`
Expected: `.env.local` does NOT appear in the untracked list.

- [x] **Step 7: Commit**

```bash
git add convex/schema.ts package.json pnpm-lock.yaml
git commit -m "feat: initialize Convex backend with Phase 0 schema"
```

---

## Task 7: Wire Convex client into TanStack Start

**Files:**
- Create: `src/lib/convex.ts`
- Modify: `src/routes/__root.tsx`
- Create: `.env.example` already has the var; create `.env.local` from it locally
- Modify: `package.json` (add `dev:all` script for convenience)

- [x] **Step 1: Install the Convex React client**

Run: `pnpm add convex`  (already installed in Task 6 — this is a no-op check)

- [x] **Step 2: Create `src/lib/convex.ts`**

```typescript
import { ConvexReactClient } from 'convex/react';

const url = import.meta.env.VITE_CONVEX_URL;
if (!url) {
  throw new Error(
    'VITE_CONVEX_URL is not set. Run `pnpm convex:dev` once to generate .env.local.'
  );
}

export const convex = new ConvexReactClient(url);
```

- [x] **Step 3: Wrap the root with `ConvexProvider`**

Update `src/routes/__root.tsx`:

```typescript
import {
  Outlet,
  ScrollRestoration,
  createRootRoute,
} from '@tanstack/react-router';
import { Meta, Scripts } from '@tanstack/react-start';
import type { ReactNode } from 'react';
import { ConvexProvider } from 'convex/react';
import globalsCss from '~/styles/globals.css?url';
import { convex } from '~/lib/convex';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'kodapos' },
    ],
    links: [{ rel: 'stylesheet', href: globalsCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <ConvexProvider client={convex}>
        <Outlet />
      </ConvexProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <Meta />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

- [x] **Step 4: Add a `dev:all` script** to run Vite + Convex side-by-side

Modify `package.json` scripts (add the one new line shown):

```json
{
  "scripts": {
    "dev": "vinxi dev",
    "dev:all": "concurrently -k -n vite,convex \"pnpm dev\" \"pnpm convex:dev\"",
    "build": "vinxi build",
    "start": "vinxi start",
    "convex:dev": "convex dev",
    "convex:deploy": "convex deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "typecheck": "tsc --noEmit",
    "lingui:extract": "lingui extract",
    "lingui:compile": "lingui compile"
  }
}
```

Run: `pnpm add -D concurrently`

- [x] **Step 5: Verify**

Run: `pnpm dev:all`

Expected: both Vite and Convex start. Open `http://localhost:3000`. Page renders. Browser DevTools → Network → WS shows an open WebSocket to your `convex.cloud` deployment. Stop with Ctrl+C.

- [x] **Step 6: Commit**

```bash
git add src/lib/convex.ts src/routes/__root.tsx package.json pnpm-lock.yaml
git commit -m "feat: wire Convex React client into root layout"
```

---

## Task 8: Configure Convex Auth (email/password)

**Files:**
- Create: `convex/auth.config.ts`
- Create: `convex/auth.ts`
- Create: `convex/http.ts`
- Modify: `convex/schema.ts` (already includes `authTables` from Task 6 — verify only)
- Modify: `src/routes/__root.tsx` (swap `ConvexProvider` for `ConvexAuthProvider`)

- [ ] **Step 1: Create `convex/auth.config.ts`**

```typescript
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: 'convex',
    },
  ],
};
```

- [ ] **Step 2: Create `convex/auth.ts`** with Password provider

```typescript
import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
```

- [ ] **Step 3: Create `convex/http.ts`** so Convex Auth's HTTP routes are exposed

```typescript
import { httpRouter } from 'convex/server';
import { auth } from './auth';

const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
```

- [ ] **Step 4: Set Convex env vars**

Run:
```bash
pnpm dlx convex@latest env set SITE_URL http://localhost:3000
pnpm dlx convex@latest env set JWT_PRIVATE_KEY "$(pnpm dlx @convex-dev/auth@latest --keygen 2>/dev/null | tail -n1)"
```

If `--keygen` isn't available in the version you install, generate manually:
```bash
pnpm dlx node -e "import('crypto').then(c => c.generateKeyPair('rsa', {modulusLength: 2048, publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}}, (e,_,priv) => console.log(priv)))"
```
Then `pnpm dlx convex@latest env set JWT_PRIVATE_KEY '<that pem>'`.

Verify with: `pnpm dlx convex@latest env list` — both `SITE_URL` and `JWT_PRIVATE_KEY` should appear.

- [ ] **Step 5: Install the Convex Auth React client + swap the provider**

Run: `pnpm add @convex-dev/auth`  (already installed in Task 6 — no-op)

Replace `src/routes/__root.tsx`:

```typescript
import {
  Outlet,
  ScrollRestoration,
  createRootRoute,
} from '@tanstack/react-router';
import { Meta, Scripts } from '@tanstack/react-start';
import type { ReactNode } from 'react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import globalsCss from '~/styles/globals.css?url';
import { convex } from '~/lib/convex';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'kodapos' },
    ],
    links: [{ rel: 'stylesheet', href: globalsCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <ConvexAuthProvider client={convex}>
        <Outlet />
      </ConvexAuthProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <Meta />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Verify Convex picks up the auth functions**

The Convex CLI watcher (from `pnpm convex:dev`) should re-deploy automatically. Look for "Updated functions" log lines that include `auth:signIn`, `auth:signOut`, `http`.

- [ ] **Step 7: Commit**

```bash
git add convex/auth.config.ts convex/auth.ts convex/http.ts src/routes/__root.tsx
git commit -m "feat: configure Convex Auth with Password provider"
```

---

## Task 9: Write the `hello` Convex query (TDD with convex-test)

**Files:**
- Create: `convex/users.ts`
- Create: `tests/convex/users.test.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install testing dependencies**

Run:
```bash
pnpm add -D vitest convex-test @edge-runtime/vm
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } },
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Write the failing test**

Create `tests/convex/users.test.ts`:

```typescript
import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from '../../convex/schema';
import { modules } from '../../convex/_generated/modules';

describe('users.hello', () => {
  it('returns null when not authenticated', async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(({ runQuery }: any) =>
      runQuery('users:hello' as any, {})
    );
    expect(result).toBeNull();
  });

  it('returns a greeting for an authenticated user', async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: 'user_test_1', name: 'Warren' });
    // Seed a users row matching the auth subject:
    await asUser.run(async (ctx) => {
      await ctx.db.insert('users', {
        // authTables.users has a free-form shape; this matches @convex-dev/auth's expectations
        name: 'Warren',
        email: 'warren@example.com',
      } as any);
    });
    const greeting = await asUser.query('users:hello' as any, {});
    expect(greeting).toMatch(/Halo, Warren/);
  });
});
```

- [ ] **Step 4: Run the test and verify it fails**

Run: `pnpm test`

Expected: both tests fail with errors indicating `users:hello` is not defined. (The first one may pass trivially if `runQuery` returns undefined for unknown functions — that's fine; the second will definitely fail.)

- [ ] **Step 5: Implement `convex/users.ts`**

```typescript
import { query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';

export const hello = query({
  args: {},
  returns: { type: 'union', members: [{ type: 'string' }, { type: 'null' }] } as never,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const name = (user as { name?: string }).name ?? 'kawan';
    return `Halo, ${name}!`;
  },
});
```

> **Note on `returns`:** the `returns` validator above is illustrative; Convex's argument/return validation API uses `v` from `convex/values`. If your installed Convex version requires the typed form, replace with `returns: v.union(v.string(), v.null())` and `import { v } from 'convex/values'`. Use whichever form your installed Convex accepts; the handler logic is what the tests verify.

If the strict-validator form is required, the full file becomes:

```typescript
import { v } from 'convex/values';
import { query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';

export const hello = query({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const name = (user as { name?: string }).name ?? 'kawan';
    return `Halo, ${name}!`;
  },
});
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `pnpm test`
Expected: both tests pass. The second test asserts the function looks up the seeded user and returns `Halo, Warren!`.

If a test still fails because of `convex-test` shape differences between Convex versions, adjust the seed shape to match `authTables.users` for your version — the principle (authenticated → greeting; unauthenticated → null) is what matters.

- [ ] **Step 7: Commit**

```bash
git add convex/users.ts tests/convex vitest.config.ts package.json pnpm-lock.yaml
git commit -m "feat(convex): add users.hello query with tests"
```

---

## Task 10: Build sign-up page

**Files:**
- Create: `src/routes/(public)/signup.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/label.tsx`

- [ ] **Step 1: Add the Input + Label primitives**

Create `src/components/ui/input.tsx`:

```typescript
import * as React from 'react';
import { cn } from '~/lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      'flex h-10 w-full rounded-md border border-[var(--color-border)] bg-bg px-3 py-2 text-sm placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = 'Input';
```

Create `src/components/ui/label.tsx`:

```typescript
import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';
import { cn } from '~/lib/utils';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-sm font-medium leading-none', className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;
```

Run: `pnpm add @radix-ui/react-label`

- [ ] **Step 2: Create the sign-up page**

`src/routes/(public)/signup.tsx`:

```typescript
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { useState, type FormEvent } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

export const Route = createFileRoute('/(public)/_layout/signup')({
  component: SignupPage,
});

function SignupPage() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await signIn('password', {
        flow: 'signUp',
        email: String(fd.get('email') ?? ''),
        password: String(fd.get('password') ?? ''),
        name: String(fd.get('name') ?? ''),
      });
      navigate({ to: '/dashboard' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mendaftar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 p-6 rounded-lg border border-[var(--color-border)] bg-bg"
      >
        <h1 className="text-2xl font-bold">Daftar</h1>
        <div className="space-y-2">
          <Label htmlFor="name">Nama</Label>
          <Input id="name" name="name" required autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Memproses…' : 'Daftar'}
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm dev:all`. Visit `/signup`. Form renders, validation works, submitting a new email creates an account and navigates to `/dashboard`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui src/routes/(public)/signup.tsx package.json pnpm-lock.yaml
git commit -m "feat(auth): add sign-up page"
```

---

## Task 11: Build sign-in page + sign-out action

**Files:**
- Create: `src/routes/(public)/signin.tsx`
- Modify: `src/routes/(pos)/dashboard.tsx` (call hello + add sign-out button)
- Modify: `src/routes/(pos)/_layout.tsx` (auth guard redirect)

- [ ] **Step 1: Create the sign-in page**

`src/routes/(public)/signin.tsx`:

```typescript
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { useState, type FormEvent } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

export const Route = createFileRoute('/(public)/_layout/signin')({
  component: SigninPage,
});

function SigninPage() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await signIn('password', {
        flow: 'signIn',
        email: String(fd.get('email') ?? ''),
        password: String(fd.get('password') ?? ''),
      });
      navigate({ to: '/dashboard' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email atau password salah.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 p-6 rounded-lg border border-[var(--color-border)] bg-bg"
      >
        <h1 className="text-2xl font-bold">Masuk</h1>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Memproses…' : 'Masuk'}
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Add an auth guard to the POS layout**

Update `src/routes/(pos)/_layout.tsx`:

```typescript
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { Authenticated, Unauthenticated, AuthLoading } from 'convex/react';

export const Route = createFileRoute('/(pos)/_layout')({
  component: PosLayout,
});

function PosLayout() {
  return (
    <div data-density="compact" className="min-h-screen bg-surface">
      <AuthLoading>
        <div className="p-6 text-fg-muted">Memuat sesi…</div>
      </AuthLoading>
      <Unauthenticated>
        <SignedOutRedirect />
      </Unauthenticated>
      <Authenticated>
        <Outlet />
      </Authenticated>
    </div>
  );
}

function SignedOutRedirect() {
  // Imperative redirect after first paint; avoids race with router during hydration.
  if (typeof window !== 'undefined') {
    window.location.replace('/signin');
  }
  return null;
}
```

- [ ] **Step 3: Update the dashboard to call `hello` and offer sign-out**

Replace `src/routes/(pos)/dashboard.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from 'convex/_generated/api';
import { Button } from '~/components/ui/button';

export const Route = createFileRoute('/(pos)/_layout/dashboard')({
  component: Dashboard,
});

function Dashboard() {
  const { signOut } = useAuthActions();
  const greeting = useQuery(api.users.hello);

  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button
          variant="outline"
          onClick={() => {
            signOut().then(() => {
              window.location.replace('/');
            });
          }}
        >
          Keluar
        </Button>
      </header>
      <section className="p-4 rounded-md bg-bg border border-[var(--color-border)]">
        {greeting === undefined ? (
          <p className="text-fg-muted">Memuat…</p>
        ) : greeting === null ? (
          <p className="text-fg-muted">Belum login.</p>
        ) : (
          <p className="text-lg">{greeting}</p>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Verify end-to-end**

Run: `pnpm dev:all`

1. Visit `/signup`, create an account → redirected to `/dashboard` → see `Halo, <name>!`.
2. Click "Keluar" → redirected to `/`.
3. Visit `/signin`, sign back in → dashboard shows greeting again.
4. Visit `/dashboard` while signed out → bounced to `/signin`.

- [ ] **Step 5: Commit**

```bash
git add src/routes
git commit -m "feat(auth): sign-in, sign-out, and authenticated dashboard with hello query"
```

---

## Task 12: Configure Lingui i18n

**Files:**
- Create: `lingui.config.ts`
- Create: `src/locales/id/messages.po`
- Create: `src/locales/en/messages.po`
- Create: `src/lib/i18n.ts`
- Modify: `src/routes/__root.tsx`
- Modify: `src/routes/(public)/index.tsx` (use `<Trans>`)

- [ ] **Step 1: Install Lingui**

Run:
```bash
pnpm add @lingui/core @lingui/react
pnpm add -D @lingui/cli @lingui/vite-plugin @lingui/macro babel-plugin-macros
```

- [ ] **Step 2: Create `lingui.config.ts`**

```typescript
import type { LinguiConfig } from '@lingui/conf';

const config: LinguiConfig = {
  locales: ['id', 'en'],
  sourceLocale: 'id',
  fallbackLocales: { default: 'id' },
  catalogs: [
    {
      path: '<rootDir>/src/locales/{locale}/messages',
      include: ['src'],
    },
  ],
  format: 'po',
};

export default config;
```

- [ ] **Step 3: Add the Lingui Vite plugin** to `app.config.ts`

Replace `app.config.ts`:

```typescript
import { defineConfig } from '@tanstack/react-start/config';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';
import { lingui } from '@lingui/vite-plugin';

export default defineConfig({
  vite: {
    plugins: [
      tsconfigPaths(),
      tailwindcss(),
      lingui(),
      TanStackRouterVite({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
      }),
    ],
  },
  server: {
    preset: 'cloudflare-pages',
  },
});
```

- [ ] **Step 4: Create `src/lib/i18n.ts`**

```typescript
import { i18n } from '@lingui/core';
import { messages as idMessages } from '~/locales/id/messages';
import { messages as enMessages } from '~/locales/en/messages';

i18n.load({ id: idMessages, en: enMessages });
i18n.activate('id');

export { i18n };
```

- [ ] **Step 5: Create empty PO catalogs**

`src/locales/id/messages.po`:

```po
msgid ""
msgstr ""
"POT-Creation-Date: 2026-05-14\n"
"MIME-Version: 1.0\n"
"Content-Type: text/plain; charset=utf-8\n"
"Language: id\n"
```

`src/locales/en/messages.po`:

```po
msgid ""
msgstr ""
"POT-Creation-Date: 2026-05-14\n"
"MIME-Version: 1.0\n"
"Content-Type: text/plain; charset=utf-8\n"
"Language: en\n"
```

- [ ] **Step 6: Wrap root in `I18nProvider`**

Update `src/routes/__root.tsx`:

```typescript
import {
  Outlet,
  ScrollRestoration,
  createRootRoute,
} from '@tanstack/react-router';
import { Meta, Scripts } from '@tanstack/react-start';
import type { ReactNode } from 'react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { I18nProvider } from '@lingui/react';
import globalsCss from '~/styles/globals.css?url';
import { convex } from '~/lib/convex';
import { i18n } from '~/lib/i18n';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'kodapos' },
    ],
    links: [{ rel: 'stylesheet', href: globalsCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <I18nProvider i18n={i18n}>
        <ConvexAuthProvider client={convex}>
          <Outlet />
        </ConvexAuthProvider>
      </I18nProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <Meta />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Use `<Trans>` on the public home page**

Replace `src/routes/(public)/index.tsx`:

```typescript
import { createFileRoute, Link } from '@tanstack/react-router';
import { Coffee } from 'lucide-react';
import { Trans } from '@lingui/react/macro';
import { Button } from '~/components/ui/button';

export const Route = createFileRoute('/(public)/_layout/')({
  component: PublicHome,
});

function PublicHome() {
  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <header className="flex items-center gap-3">
        <Coffee className="size-8 text-brand-600" />
        <h1 className="text-3xl font-bold text-brand-600">kodapos</h1>
      </header>
      <p className="text-fg-muted mt-2">
        <Trans>AI-native POS untuk kafe & QSR Indonesia.</Trans>
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link to="/signin">
            <Trans>Masuk</Trans>
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/signup">
            <Trans>Daftar</Trans>
          </Link>
        </Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 8: Extract and compile catalogs**

Run:
```bash
pnpm lingui:extract
pnpm lingui:compile
```

Expected: both `src/locales/id/messages.po` and `src/locales/en/messages.po` now contain the extracted strings. Compiled JS catalogs (`messages.js` / `messages.ts`) are written alongside.

- [ ] **Step 9: Verify**

Run: `pnpm dev:all`. Visit `/`. Page renders correctly with Bahasa strings (Lingui falls back to source-locale strings when EN catalogs are empty).

- [ ] **Step 10: Commit**

```bash
git add lingui.config.ts src/locales src/lib/i18n.ts src/routes app.config.ts package.json pnpm-lock.yaml
git commit -m "feat(i18n): configure Lingui with ID source locale"
```

---

## Task 13: Configure Biome (lint + format)

**Files:**
- Create: `biome.json`

- [x] **Step 1: Install Biome**

Run: `pnpm add -D --save-exact @biomejs/biome@^2`

- [x] **Step 2: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignore": [
      "node_modules",
      "dist",
      ".output",
      ".vinxi",
      "src/routeTree.gen.ts",
      "convex/_generated",
      "src/locales/**/*.po",
      "src/locales/**/messages.js",
      "src/locales/**/messages.ts"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "warn",
        "useImportType": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      },
      "correctness": {
        "noUnusedVariables": "warn",
        "useExhaustiveDependencies": "warn"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "es5",
      "semicolons": "always",
      "arrowParentheses": "always"
    }
  }
}
```

- [x] **Step 3: Verify lint runs clean (or fix what it surfaces)**

Run: `pnpm lint`
Expected: zero errors. Warnings are acceptable for Phase 0 if they're in generated or stylistic areas. If errors exist, run `pnpm lint:fix` and re-verify; remaining errors must be addressed manually.

- [x] **Step 4: Verify format runs idempotently**

Run: `pnpm format && git diff --quiet`
Expected: exit code 0 (no diff after format).

- [x] **Step 5: Commit**

```bash
git add biome.json package.json pnpm-lock.yaml
git commit -m "chore: configure Biome lint + format"
```

---

## Task 14: Add the first useful unit test (money formatter) via TDD

**Files:**
- Create: `src/lib/money.ts`
- Create: `src/lib/money.test.ts`

This task introduces a small, real utility we'll use throughout Phase 1+ — IDR formatting. It also exercises Vitest end-to-end.

- [ ] **Step 1: Write the failing tests**

`src/lib/money.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatIDR, parseIDR, computeChange } from './money';

describe('formatIDR', () => {
  it('formats whole rupiah with id-ID thousands separators', () => {
    expect(formatIDR(0)).toBe('Rp 0');
    expect(formatIDR(1_000)).toBe('Rp 1.000');
    expect(formatIDR(1_250_000)).toBe('Rp 1.250.000');
  });

  it('rejects non-integer inputs by throwing', () => {
    expect(() => formatIDR(1.5 as unknown as number)).toThrow(/integer/i);
  });
});

describe('parseIDR', () => {
  it('parses formatted IDR strings back to integer', () => {
    expect(parseIDR('Rp 1.250.000')).toBe(1_250_000);
    expect(parseIDR('1.250.000')).toBe(1_250_000);
    expect(parseIDR('1250000')).toBe(1_250_000);
  });

  it('throws on garbage input', () => {
    expect(() => parseIDR('abc')).toThrow();
  });
});

describe('computeChange', () => {
  it('returns the positive difference when tendered exceeds total', () => {
    expect(computeChange({ totalIDR: 35_000, tenderedIDR: 50_000 })).toBe(15_000);
  });

  it('returns zero when tendered exactly equals total', () => {
    expect(computeChange({ totalIDR: 50_000, tenderedIDR: 50_000 })).toBe(0);
  });

  it('throws when tendered is less than total', () => {
    expect(() =>
      computeChange({ totalIDR: 50_000, tenderedIDR: 40_000 })
    ).toThrow(/insufficient/i);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test`
Expected: all tests fail with "Cannot find module" or similar — the `money.ts` file doesn't exist yet.

- [ ] **Step 3: Implement `src/lib/money.ts`**

```typescript
const FORMATTER = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatIDR(amount: number): string {
  if (!Number.isInteger(amount)) {
    throw new Error(`formatIDR requires an integer, got ${amount}`);
  }
  // Intl produces "Rp1.250.000" (no space). Normalize to "Rp 1.250.000".
  return FORMATTER.format(amount).replace(/^Rp\s?/, 'Rp ');
}

export function parseIDR(input: string): number {
  const cleaned = input.replace(/[Rp\s.]/g, '');
  if (!/^\d+$/.test(cleaned)) {
    throw new Error(`parseIDR could not parse: ${JSON.stringify(input)}`);
  }
  return Number.parseInt(cleaned, 10);
}

export function computeChange(params: {
  totalIDR: number;
  tenderedIDR: number;
}): number {
  const { totalIDR, tenderedIDR } = params;
  if (!Number.isInteger(totalIDR) || !Number.isInteger(tenderedIDR)) {
    throw new Error('computeChange requires integer IDR amounts');
  }
  if (tenderedIDR < totalIDR) {
    throw new Error('insufficient tender');
  }
  return tenderedIDR - totalIDR;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/money.ts src/lib/money.test.ts
git commit -m "feat(money): add IDR formatter/parser/change helpers with tests"
```

---

## Task 15: Set up Playwright + write a smoke E2E

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Install Playwright**

Run:
```bash
pnpm add -D @playwright/test
pnpm dlx playwright install --with-deps chromium
```

- [ ] **Step 2: Create `playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev:all',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Write the smoke spec**

`tests/e2e/smoke.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';

test('public home renders and links to sign-in / sign-up', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'kodapos' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Masuk/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Daftar/ })).toBeVisible();
});

test('sign-up → dashboard → sign-out flow', async ({ page }) => {
  const email = `e2e+${Date.now()}@kodapos.test`;
  const password = 'Sa{ngat-Aman-123';

  await page.goto('/signup');
  await page.getByLabel('Nama').fill('E2E User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /Daftar/ }).click();

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await expect(page.getByText(/Halo, E2E User/)).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: /Keluar/ }).click();
  await expect(page).toHaveURL('/');
});
```

- [ ] **Step 4: Run the E2E and verify pass**

Run: `pnpm test:e2e`
Expected: both tests pass. Playwright auto-starts `pnpm dev:all`, runs the tests, shuts down.

**If the auth tests fail** with errors about Convex env or signup not persisting: confirm `JWT_PRIVATE_KEY` and `SITE_URL` were set in Task 8 step 4, and that `pnpm convex:dev` has deployed `auth` and `users.hello`.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e package.json pnpm-lock.yaml
git commit -m "test(e2e): add Playwright smoke covering signup/dashboard/signout"
```

---

## Task 16: Wire Sentry (frontend) + Convex error logging

**Files:**
- Create: `src/lib/sentry.ts`
- Modify: `src/client.tsx`
- Modify: `src/ssr.tsx`
- Modify: `convex/users.ts` (Sentry capture wrapper helper)
- Create: `convex/lib/withSentry.ts`

- [ ] **Step 1: Install Sentry**

Run: `pnpm add @sentry/react`

- [ ] **Step 2: Create `src/lib/sentry.ts`**

```typescript
import * as Sentry from '@sentry/react';

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // Phase 0: keep it skippable when DSN isn't set
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration()],
    environment: import.meta.env.MODE,
  });
}

export function setUserContext(userId: string | null, email?: string | null) {
  if (!userId) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: userId, email: email ?? undefined });
}
```

- [ ] **Step 3: Initialize on the client**

Update `src/client.tsx`:

```typescript
import { hydrateRoot } from 'react-dom/client';
import { StartClient } from '@tanstack/react-start';
import { createRouter } from './router';
import { initSentry } from './lib/sentry';

initSentry();

const router = createRouter();
hydrateRoot(document, <StartClient router={router} />);
```

(SSR-side Sentry on Cloudflare Workers requires `@sentry/cloudflare`; skip for Phase 0. The frontend Sentry catches the vast majority of useful errors. Workers-side Sentry can be added in Phase 1 if needed.)

- [ ] **Step 4: Add a Convex action/query wrapper that captures errors centrally**

Create `convex/lib/withSentry.ts`:

```typescript
// Convex doesn't run @sentry/node natively on its runtime, but we still
// want a consistent error-logging seam. Until/unless we add the Convex
// Sentry integration, this helper logs structured errors that Convex's
// own log pipeline can ship to Sentry via the upcoming Convex Logs
// integration. For Phase 0 it's just a console-based seam.
export function logConvexError(fnName: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(
    JSON.stringify({
      level: 'error',
      fn: fnName,
      message,
      stack,
      at: new Date().toISOString(),
    })
  );
}
```

(This is intentionally light — Phase 1 will replace it with the official Convex Sentry integration once we evaluate it on real traffic.)

- [ ] **Step 5: Verify**

Sentry will only initialize if `VITE_SENTRY_DSN` is set. Run `pnpm dev` and confirm:
- Without DSN set: no errors, no Sentry network calls.
- With DSN set in `.env.local`: visit `/`, trigger an intentional error in DevTools (`throw new Error('test')` in console after page load), confirm it shows in Sentry.

(Skipping the DSN-set verification step is acceptable for Phase 0 internal testing — the deploy task will exercise it.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/sentry.ts src/client.tsx convex/lib package.json pnpm-lock.yaml
git commit -m "feat(observability): wire Sentry frontend + Convex error logging seam"
```

---

## Task 17: Wire PostHog (analytics)

**Files:**
- Create: `src/lib/posthog.ts`
- Modify: `src/client.tsx`

- [ ] **Step 1: Install PostHog**

Run: `pnpm add posthog-js`

- [ ] **Step 2: Create `src/lib/posthog.ts`**

```typescript
import posthog from 'posthog-js';

export function initPostHog() {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST ?? 'https://app.posthog.com';
  if (!key) return;
  posthog.init(key, {
    api_host: host,
    capture_pageview: 'history_change',
    persistence: 'localStorage+cookie',
  });
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (!import.meta.env.VITE_POSTHOG_KEY) return;
  posthog.capture(event, properties);
}

export function identify(distinctId: string, properties?: Record<string, unknown>) {
  if (!import.meta.env.VITE_POSTHOG_KEY) return;
  posthog.identify(distinctId, properties);
}
```

- [ ] **Step 3: Initialize on the client**

Update `src/client.tsx`:

```typescript
import { hydrateRoot } from 'react-dom/client';
import { StartClient } from '@tanstack/react-start';
import { createRouter } from './router';
import { initSentry } from './lib/sentry';
import { initPostHog } from './lib/posthog';

initSentry();
initPostHog();

const router = createRouter();
hydrateRoot(document, <StartClient router={router} />);
```

- [ ] **Step 4: Verify**

PostHog only initializes when the env var is set. With the key blank, no network calls are made (verify in DevTools Network tab).

- [ ] **Step 5: Commit**

```bash
git add src/lib/posthog.ts src/client.tsx package.json pnpm-lock.yaml
git commit -m "feat(observability): wire PostHog analytics"
```

---

## Task 18: Configure Cloudflare Pages deployment

**Files:**
- Create: `wrangler.toml`
- Modify: `app.config.ts` (confirm `cloudflare-pages` preset; already set in Task 2)
- Create: `.gitignore` entry verification (`.wrangler/` already added in Task 1)

- [ ] **Step 1: Install Wrangler**

Run: `pnpm add -D wrangler`

- [ ] **Step 2: Authenticate with Cloudflare**

Run: `pnpm dlx wrangler login`

Expected: a browser window opens; authorize. The CLI prints "Successfully logged in." Your `~/.wrangler/config/default.toml` is updated.

- [ ] **Step 3: Create `wrangler.toml`**

```toml
name = "kodapos"
compatibility_date = "2026-05-01"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = ".output/public"

[vars]
# Public env vars (safe to ship in client bundle). Sensitive vars must
# be set via `wrangler pages secret put <NAME>` instead.

[[kv_namespaces]]
binding = "FEATURE_FLAGS"
id = "<created in step 4 below>"
preview_id = "<created in step 4 below>"
```

- [ ] **Step 4: Create the KV namespace for feature flags**

Run:
```bash
pnpm dlx wrangler kv namespace create FEATURE_FLAGS
pnpm dlx wrangler kv namespace create FEATURE_FLAGS --preview
```

Expected: each command prints an `id` (and `preview_id`). Copy those values into `wrangler.toml`, replacing the placeholders in step 3.

- [ ] **Step 5: Verify build produces the Cloudflare Pages output**

Run: `pnpm build`

Expected:
- Build succeeds.
- `.output/public/` directory exists with `_worker.js`, `index.html`, and asset files.
- No type errors.

If the build fails with a Workers-incompatible API error: **flag this as a potential Phase 0 showstopper** and consult Task 27.

- [ ] **Step 6: Commit**

```bash
git add wrangler.toml package.json pnpm-lock.yaml
git commit -m "ci: configure Cloudflare Pages deployment"
```

---

## Task 19: First deploy to Cloudflare Pages (preview)

**Files:** (no new files — runtime deploy only)

- [ ] **Step 1: Deploy production-mode Convex backend**

Run: `pnpm convex:deploy --cmd-url-env-var-name=VITE_CONVEX_URL`

Expected: the CLI provisions a production Convex deployment, prints the production deployment URL, and updates `.env.local` or environment.

Capture the production `VITE_CONVEX_URL` for the Cloudflare deploy.

- [ ] **Step 2: Set production-mode auth env vars on Convex**

Run:
```bash
pnpm dlx convex@latest env set SITE_URL https://kodapos.pages.dev --prod
pnpm dlx convex@latest env set JWT_PRIVATE_KEY "<same key as Task 8 Step 4>" --prod
```

(`kodapos.pages.dev` is the default Cloudflare Pages preview URL. Replace if you've configured a custom domain.)

- [ ] **Step 3: Deploy to Cloudflare Pages**

Run:
```bash
VITE_CONVEX_URL=<prod-url-from-step-1> pnpm build
pnpm dlx wrangler pages deploy .output/public --project-name=kodapos
```

Expected: Wrangler uploads assets, deploys the Worker, prints `https://<hash>.kodapos.pages.dev` URL.

- [ ] **Step 4: Bind production env vars to Pages**

Run:
```bash
pnpm dlx wrangler pages secret put VITE_CONVEX_URL --project-name=kodapos
# Paste the production Convex URL when prompted

# Sentry + PostHog: only if you have DSN/key for Phase 0
pnpm dlx wrangler pages secret put VITE_SENTRY_DSN --project-name=kodapos
pnpm dlx wrangler pages secret put VITE_POSTHOG_KEY --project-name=kodapos
```

- [ ] **Step 5: Trigger a re-deploy with bound env vars**

Run:
```bash
pnpm build
pnpm dlx wrangler pages deploy .output/public --project-name=kodapos
```

(The first deploy was a smoke test; this one picks up the secret bindings.)

- [ ] **Step 6: Verify the deployed app**

In a browser, visit the printed URL.

1. Public home renders.
2. Click "Daftar", create an account with a fresh email.
3. Confirm `/dashboard` shows `Halo, <name>!`.
4. Sign out, sign back in.
5. Open DevTools → Network → WS. The Convex WebSocket should be open and exchanging messages.

- [ ] **Step 7: Commit deployment notes** (not a code commit — a doc commit)

Create `docs/superpowers/plans/2026-05-14-phase-0-deploy-notes.md`:

```markdown
# Phase 0 Deploy Notes

**First successful Cloudflare Pages deploy:** <date/time>

**URL:** <hash>.kodapos.pages.dev
**Convex deployment:** <name>

## Validation

- Public home renders ✓
- Signup → dashboard → hello query returns greeting ✓
- Signout returns to home ✓
- Re-signin works ✓

## Notes / surprises

(record anything that took unexpected effort)
```

Run:
```bash
git add docs/superpowers/plans/2026-05-14-phase-0-deploy-notes.md
git commit -m "docs: record first Cloudflare Pages deploy"
```

---

## Task 20: Validate Indonesian latency

**Files:** (no code changes)

This is the empirical leg of the cut-bait decision. Spec §3.4 acknowledges Convex's nearest region is US/EU; we need to verify the WebSocket round-trip from a Jakarta client is acceptable.

- [ ] **Step 1: Run from Jakarta, or simulate via VPN**

Option A — if you (or a friend) can run a browser from Jakarta: open the deployed URL, sign in, open DevTools → Network → WS. Inspect the WebSocket frames. Measure response time on the first query after sign-in.

Option B — VPN: configure a Cloudflare WARP+ or commercial VPN exit in Indonesia (Jakarta if available). Then repeat the above.

- [ ] **Step 2: Capture three numbers**

1. **HTTP TTFB** from Jakarta to Cloudflare Pages: should be <100ms (Cloudflare Jakarta POP).
2. **WebSocket open-handshake duration** from Jakarta to Convex Cloud: measure from "Switching Protocols" 101 to first message exchange.
3. **First-query latency** (the `users.hello` query): time from `useQuery` mounting to result. Subsequent queries reuse the open WebSocket and should be much faster.

- [ ] **Step 3: Compare against the exit criterion**

Spec exit criterion: WebSocket latency p50 <300ms from Jakarta on a warm connection.

- If you measure <300ms p50: ✓ pass. Proceed.
- If 300–600ms: ⚠ marginal. Document and proceed to Task 27 to decide whether to invest in the V2 Cloudflare-edge mutation proxy earlier than planned.
- If >600ms consistently: ✗ likely showstopper for high-frequency counter use. Halt and consult Task 27.

- [ ] **Step 4: Append latency measurements to deploy notes**

Edit `docs/superpowers/plans/2026-05-14-phase-0-deploy-notes.md`, add a section:

```markdown
## Latency from Indonesia (or Jakarta-VPN proxy)

- HTTP TTFB (CF Jakarta → CF origin): <number> ms
- WebSocket open: <number> ms
- First `users.hello` query: <number> ms
- Subsequent query p50: <number> ms

Verdict: ✓ pass / ⚠ marginal / ✗ fail
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-05-14-phase-0-deploy-notes.md
git commit -m "docs: record latency measurements from Indonesian client"
```

---

## Task 21: Add CI workflow (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the CI workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Unit tests
        run: pnpm test

  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    # E2E needs a Convex deployment; skip unless secrets are configured.
    if: ${{ vars.RUN_E2E == 'true' }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm dlx playwright install --with-deps chromium

      - name: Run E2E
        env:
          VITE_CONVEX_URL: ${{ secrets.E2E_CONVEX_URL }}
          CONVEX_DEPLOY_KEY: ${{ secrets.E2E_CONVEX_DEPLOY_KEY }}
        run: pnpm test:e2e
```

- [ ] **Step 2: Push and observe**

Run:
```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow"
```

(Don't push yet — there's no remote. If the repo is added to GitHub later, this workflow activates automatically.)

- [ ] **Step 3: (Optional) Add a GitHub remote and push**

If you want CI to run now:
```bash
gh repo create kodapos --private --source=. --remote=origin
git push -u origin main
```

After push, check GitHub → Actions tab. The `check` job should run and pass. The `e2e` job will be skipped until `RUN_E2E=true` variable + secrets are configured.

---

## Task 22: Verify typecheck passes for the full repo

**Files:** (no new files)

A defensive sweep: ensure the codebase typechecks cleanly before declaring Phase 0 done.

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`

Expected: exit code 0. If errors surface, fix them before continuing. Common Phase 0 type issues:

- `convex/_generated/api` import path mismatch — re-run `pnpm convex:dev --once` to regenerate.
- TanStack Router type-augmentation missing — confirm the `declare module '@tanstack/react-router'` block in `src/router.tsx` (Task 2 Step 4) is present.
- Lingui macro types — if Biome's `useImportType` complains about `@lingui/react/macro`, add `// biome-ignore lint/style/useImportType: macro` above the import.

- [ ] **Step 2: Run lint + format check**

Run: `pnpm lint && pnpm format && git diff --quiet`

Expected: lint passes; format produces no diff. If diff appears, commit it:

```bash
git add -A
git commit -m "chore: apply Biome formatter"
```

- [ ] **Step 3: Commit any type fixes**

```bash
git add -A
git commit -m "chore: clean up type errors discovered in Phase 0 sweep" --allow-empty-message
```

(Only commit if there are actual changes — omit otherwise.)

---

## Task 23: Run the full test suite

**Files:** (no new files)

- [ ] **Step 1: Run unit tests**

Run: `pnpm test`
Expected: all unit + Convex tests pass.

- [ ] **Step 2: Run E2E tests locally**

Run: `pnpm test:e2e`
Expected: both smoke tests pass against the dev server.

- [ ] **Step 3: Capture the test count + pass status**

Note the test counts (e.g., "9 passed, 0 failed") for the Task 27 sign-off document.

---

## Task 24: Add an authenticated query for the cafe (smoke test of multi-tenant pattern)

**Files:**
- Modify: `convex/cafes.ts` (new)
- Modify: `tests/convex/cafes.test.ts` (new)
- Modify: `src/routes/(pos)/dashboard.tsx` (display cafe name if exists)

This task exercises the multi-tenant `cafeId` pattern that Phase 1 will rely on. If this works cleanly with Convex Auth's `getAuthUserId`, the Phase 1 schema rollout will be straightforward.

- [ ] **Step 1: Write the failing test**

Create `tests/convex/cafes.test.ts`:

```typescript
import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from '../../convex/schema';
import { modules } from '../../convex/_generated/modules';

describe('cafes.createForOwner / cafes.mine', () => {
  it('creates a cafe owned by the authenticated user and returns it', async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: 'user_test_create', name: 'Owner' });

    // Seed the auth user row so getAuthUserId returns something
    const userId = await asUser.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Owner',
        email: 'owner@example.com',
      } as any);
    });
    const asThatUser = t.withIdentity({ subject: String(userId), name: 'Owner' });

    await asThatUser.mutation('cafes:createForOwner' as any, { name: 'Kopi Senja' });
    const list = await asThatUser.query('cafes:mine' as any, {});

    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Kopi Senja');
    expect(list[0].ownerUserId).toBe(userId);
  });

  it('returns an empty list when no cafe is owned', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        name: 'Empty Owner',
        email: 'empty@example.com',
      } as any);
    });
    const asThatUser = t.withIdentity({ subject: String(userId) });
    const list = await asThatUser.query('cafes:mine' as any, {});
    expect(list).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test`
Expected: tests fail — `cafes:createForOwner` and `cafes:mine` don't exist.

- [ ] **Step 3: Implement `convex/cafes.ts`**

```typescript
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';

export const createForOwner = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('not authenticated');
    const id = await ctx.db.insert('cafes', {
      name,
      ownerUserId: userId,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query('cafes')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
      .collect();
  },
});
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm test`
Expected: both cafes tests pass alongside the existing users + money tests.

- [ ] **Step 5: Surface "create cafe" on the dashboard**

Replace `src/routes/(pos)/dashboard.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useState, type FormEvent } from 'react';
import { api } from 'convex/_generated/api';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

export const Route = createFileRoute('/(pos)/_layout/dashboard')({
  component: Dashboard,
});

function Dashboard() {
  const { signOut } = useAuthActions();
  const greeting = useQuery(api.users.hello);
  const cafes = useQuery(api.cafes.mine);
  const createCafe = useMutation(api.cafes.createForOwner);
  const [submitting, setSubmitting] = useState(false);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    try {
      await createCafe({ name: String(fd.get('name') ?? '') });
      e.currentTarget.reset();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button
          variant="outline"
          onClick={() => {
            signOut().then(() => window.location.replace('/'));
          }}
        >
          Keluar
        </Button>
      </header>

      <section className="p-4 rounded-md bg-bg border border-[var(--color-border)]">
        {greeting === undefined ? (
          <p className="text-fg-muted">Memuat…</p>
        ) : greeting === null ? (
          <p className="text-fg-muted">Belum login.</p>
        ) : (
          <p className="text-lg">{greeting}</p>
        )}
      </section>

      <section className="p-4 rounded-md bg-bg border border-[var(--color-border)] space-y-3">
        <h2 className="font-semibold">Kafe Saya</h2>
        {cafes === undefined ? (
          <p className="text-fg-muted">Memuat…</p>
        ) : cafes.length === 0 ? (
          <p className="text-fg-muted">Belum ada kafe.</p>
        ) : (
          <ul className="list-disc pl-5">
            {cafes.map((c) => (
              <li key={c._id}>{c.name}</li>
            ))}
          </ul>
        )}

        <form onSubmit={onCreate} className="flex items-end gap-2 pt-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="name">Nama Kafe</Label>
            <Input id="name" name="name" required />
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? '…' : 'Buat'}
          </Button>
        </form>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Verify end-to-end**

Run: `pnpm dev:all`. Sign in. On the dashboard, create a cafe; it appears in the list. Reload the page; the cafe persists.

- [ ] **Step 7: Commit**

```bash
git add convex/cafes.ts tests/convex/cafes.test.ts src/routes/(pos)/dashboard.tsx
git commit -m "feat(cafes): authenticated create/list mutation + query"
```

---

## Task 25: Final dev-experience polish

**Files:**
- Modify: `.vscode/settings.json` (optional, repo-shared editor settings)
- Modify: `.vscode/extensions.json` (optional, recommended extensions)
- Modify: `README.md` (update with current run instructions)

- [ ] **Step 1: Create `.vscode/extensions.json`**

```json
{
  "recommendations": [
    "biomejs.biome",
    "bradlc.vscode-tailwindcss",
    "ms-playwright.playwright",
    "vitest.explorer",
    "lingui.vscode-lingui",
    "Cloudflare.wrangler-vscode"
  ]
}
```

- [ ] **Step 2: Create `.vscode/settings.json`**

```json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "files.exclude": {
    "**/.output": true,
    "**/.vinxi": true,
    "**/node_modules": true,
    "**/.wrangler": true
  }
}
```

- [ ] **Step 3: Refresh `README.md` with current commands**

Replace `README.md`:

```markdown
# kodapos

AI-native SaaS POS for Indonesian counter-only cafes and QSRs.

## Status

Phase 0 — Foundations complete. See `docs/superpowers/plans/2026-05-14-phase-0-foundations.md`.

## Stack

TanStack Start · Convex · shadcn/ui · Tailwind v4 · Lingui · Cloudflare Pages · Biome · Vitest · Playwright

## Development

```bash
pnpm install

# Two terminals:
pnpm dev          # Vite dev server (http://localhost:3000)
pnpm convex:dev   # Convex backend

# Or one terminal:
pnpm dev:all
```

## Quality gates

```bash
pnpm typecheck
pnpm lint
pnpm test         # Vitest unit tests
pnpm test:e2e     # Playwright E2E
pnpm build        # Production Cloudflare Pages build
```

## Deploy

```bash
pnpm convex:deploy
pnpm build
pnpm dlx wrangler pages deploy .output/public --project-name=kodapos
```

## Documentation

- Design spec: `docs/superpowers/specs/2026-05-14-kodapos-v1-design.md`
- Phase 0 plan: `docs/superpowers/plans/2026-05-14-phase-0-foundations.md`
- Phase 0 deploy notes: `docs/superpowers/plans/2026-05-14-phase-0-deploy-notes.md`
```

- [ ] **Step 4: Commit**

```bash
git add .vscode README.md
git commit -m "chore: editor config + refresh README for end-of-Phase-0"
```

---

## Task 26: Confirm exit criteria

**Files:** (no new files; produces decisions for Task 27)

This is the verify-the-verifier task: a manual walkthrough of the six exit criteria from the plan header.

- [ ] **Step 1: Criterion 1 — Deploys to Cloudflare Pages, responds from Indonesia**

Open the deployed `<hash>.kodapos.pages.dev` URL. ✓ if HTTP 200, page renders, no SSR/hydration errors in console.

- [ ] **Step 2: Criterion 2 — Convex Auth signup + signin works on the deployed app**

Sign up with a fresh email; sign out; sign back in. ✓ if all three succeed.

- [ ] **Step 3: Criterion 3 — Authenticated query returns data to deployed UI**

After sign-in, the deployed dashboard shows `Halo, <name>!`. ✓.

- [ ] **Step 4: Criterion 4 — Latency from Jakarta**

Refer to Task 20 measurements. ✓ if WebSocket query p50 <300ms. ⚠ if 300–600ms. ✗ if >600ms.

- [ ] **Step 5: Criterion 5 — Quality gates pass**

Run locally:
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build
```
✓ if all five exit code 0.

- [ ] **Step 6: Criterion 6 — No discovered showstoppers**

Reflect on the 25 tasks. List anything that was a surprise, fragile, or required workarounds. ✓ if list is empty or items are minor; flag for Task 27 if items are structural.

---

## Task 27: Cut-bait decision document

**Files:**
- Create: `docs/superpowers/plans/2026-05-14-phase-0-results.md`

The Phase 0 deliverable — a written verdict on whether to proceed to Phase 1 plan, revise the stack, or stop.

- [ ] **Step 1: Write the results document**

`docs/superpowers/plans/2026-05-14-phase-0-results.md`:

```markdown
# Phase 0 Results — Cut-Bait Decision

**Date completed:** <YYYY-MM-DD>
**Repo state at decision:** <git rev-parse HEAD>

## Exit criteria

| # | Criterion | Status | Notes |
|---|---|---|---|
| 1 | Deploys to Cloudflare Pages, responds from Indonesia | ✓ / ⚠ / ✗ | <details> |
| 2 | Convex Auth signup + signin works end-to-end on deploy | ✓ / ⚠ / ✗ | <details> |
| 3 | Authenticated query returns data on deployed UI | ✓ / ⚠ / ✗ | <details> |
| 4 | Jakarta WebSocket query p50 <300ms | ✓ / ⚠ / ✗ | <Task 20 numbers> |
| 5 | Quality gates pass (lint, typecheck, test, e2e, build) | ✓ / ⚠ / ✗ | <test counts> |
| 6 | No discovered showstoppers | ✓ / ⚠ / ✗ | <list> |

## What surprised me

(Free-form list of any task that took longer than expected, any compatibility issue, any workaround. Future-you will thank present-you for being specific here.)

## What I'd change in Phase 1

(Tooling tweaks, project structure decisions, anything we'd revisit now that we've seen the integrated stack work.)

## Verdict

**One of:**

- **PROCEED to Phase 1 planning.** All criteria pass. Stack is validated. Phase 1 plan can be written next session.
- **PROCEED WITH NOTES.** Most criteria pass; <specific concerns> documented for Phase 1 to address (e.g., latency marginal — schedule edge-proxy in V2 reasonable as planned).
- **REVISE STACK.** Specific component is unworkable; replace before Phase 1. Replacement is: <specific component> → <replacement>. Rationale: <why>.
- **STOP.** Stack is not viable for Indonesian-cafe POS. Returning to brainstorm for sector/stack reconsideration.

## Next step

(One sentence. Either: "Invoke writing-plans skill for Phase 1." OR "Update spec docs/superpowers/specs/2026-05-14-kodapos-v1-design.md to reflect <change>." OR "Halt; user to decide direction.")
```

- [ ] **Step 2: Fill in the template based on Tasks 19, 20, 23, 26**

Replace every `<placeholder>` and pick exactly one verdict.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-05-14-phase-0-results.md
git commit -m "docs: Phase 0 results + cut-bait decision"
```

- [ ] **Step 4: If verdict is PROCEED**

Reply to the user with the verdict and request Phase 1 plan authoring:

> Phase 0 complete. Exit criteria summary: [pass/marginal/fail counts]. Verdict: PROCEED [WITH NOTES] / REVISE / STOP. Ready to author Phase 1 plan when you are.

- [ ] **Step 5: If verdict is REVISE or STOP**

Do not begin Phase 1 planning. The user decides next step.

---

## Self-Review Notes (for the plan author)

Spec coverage check against `docs/superpowers/specs/2026-05-14-kodapos-v1-design.md` §7.2 Phase 0:

> "Deploy a 'hello world' TanStack Start app to Cloudflare Pages with Convex Auth + one Convex query. Validate the deployment story. Cut bait on the stack now if Cloudflare/TanStack-Start has a showstopper — never later."

| Spec phrase | Task |
|---|---|
| "hello world TanStack Start app" | Tasks 2–5 |
| "Cloudflare Pages" | Tasks 18, 19 |
| "Convex Auth" | Task 8 |
| "one Convex query" | Tasks 9, 24 |
| "Validate the deployment story" | Tasks 19, 20, 26 |
| "Cut bait on the stack now if showstopper" | Task 27 |

Additional foundations added (justified by spec sections beyond §7.2):

- shadcn/ui + Tailwind v4 (spec §5.1) — Task 3, 4, 10
- Lingui i18n (spec §5.5) — Task 12
- Biome (no spec section; standard tooling) — Task 13
- Sentry (spec §5.6) — Task 16
- PostHog (spec §5.6) — Task 17
- Vitest/Playwright (spec §7.1) — Tasks 9, 14, 15
- Money helper (spec §2.7, §5.1, §5.5) — Task 14
- Multi-tenant cafe query (spec §3.3 "tenant isolation") — Task 24
- CI workflow (spec §7.1 implicit) — Task 21

Placeholder scan: searched for `TBD`, `TODO`, `FIXME`, `<placeholder>` in this document. The instances of `<...>` are intentional fill-in values for runtime artifacts (deploy URLs, dates, version-specific KV namespace IDs, latency measurements) that cannot be known until execution. Each is accompanied by the command or process that produces the real value.

Type / name consistency check:

- `formatIDR`, `parseIDR`, `computeChange` — defined Task 14, not referenced elsewhere in Phase 0.
- `users.hello` / `cafes.createForOwner` / `cafes.mine` — defined and tested in Tasks 9 and 24; consumed by dashboard in Tasks 11 and 24.
- `i18n`, `convex`, `initSentry`, `initPostHog` — defined Tasks 7, 12, 16, 17; consumed by root layout / client entry.

No type or name inconsistencies surfaced.

---

## Addendum A — TanStack Start API translations (discovered during Task 2 execution)

**Recorded:** 2026-05-15
**Context:** The plan was written against an older Vinxi/Nitro-era surface of TanStack Start. The version installed during Task 2 (`@tanstack/react-start@1.167.65`) uses a Vite-native architecture. Task 2 succeeded — dev server runs, page renders — but the plan's references to obsolete files and imports need translation when executing subsequent tasks. **This addendum is the authoritative translation table for Tasks 3–27.** Where it conflicts with earlier sections, the addendum wins.

### A.1 Translation table

| Plan reference | Actual current API |
|---|---|
| `app.config.ts` (with `defineConfig` from `@tanstack/react-start/config`) | `vite.config.ts` (with `tanstackStart()` from `@tanstack/react-start/plugin/vite`) |
| `src/client.tsx` | Does not exist; plugin handles client hydration automatically |
| `src/ssr.tsx` | Does not exist; plugin handles SSR automatically |
| `Meta, Scripts` from `@tanstack/react-start` | `HeadContent, Scripts` from `@tanstack/react-router` |
| `createRouter()` export in `src/router.tsx` | `getRouter()` export (plugin's `RouterEntry` requires this name) |
| `declare module '@tanstack/react-router'` | `declare module '@tanstack/react-start'` |
| `server: { preset: 'cloudflare-pages' }` in app config | Cloudflare adapter is configured inside `tanstackStart()` options in Task 18 (specifics to be discovered empirically — see A.4) |
| Dev server URL `http://localhost:3000` | `http://localhost:5173` (Vite default; corrected 2026-05-19 during Task 7 — earlier "5175" was an observation from a host with port collisions) |
| `dev: "vinxi dev"` script | `dev: "vite dev"` |
| `build: "vinxi build"` script | `build: "vite build"` |
| `start: "vinxi start"` script | `start: "node .output/server/index.mjs"` (auto-set by Task 2; verify build output in Task 18) |

### A.2 Where module-scope initialization (Sentry, PostHog) goes

Task 16 (Sentry) and Task 17 (PostHog) call for `initSentry()` / `initPostHog()` in `src/client.tsx`. Since that file doesn't exist:

- **Init in `src/router.tsx` at module scope** (top of file, before `getRouter()` is defined). The router module is imported on the client side during hydration, so module-scope side effects run there exactly once. They will also run on the server during SSR — that is fine for these two libraries: Sentry has SSR-safe init, and PostHog's init early-returns when its key isn't set.
- If a future stricter "client-only" boundary is needed, wrap the init calls in `if (typeof window !== 'undefined') { ... }`.

### A.3 Where Vite plugins (Tailwind, Lingui) attach

Task 3 (Tailwind) and Task 12 (Lingui) call for editing `app.config.ts` to add the `tailwindcss()` and `lingui()` plugins:

- **Add them to `vite.config.ts`'s `plugins` array** instead, alongside the existing `tsconfigPaths()`, `tanstackStart()`, `viteReact()` entries.
- Order matters in Vite plugin pipelines. The implementer's Task 2 ordering is `[tsconfigPaths, tanstackStart, viteReact]`. New plugin placement:
  - **Tailwind** (`@tailwindcss/vite`): insert after `tanstackStart()` and before `viteReact()`. Tailwind needs to see component source after TanStack Start has transformed it.
  - **Lingui** (`@lingui/vite-plugin`): insert before `viteReact()` so its macro transforms run before React's. Suggested order: `[tsconfigPaths, tanstackStart, lingui, tailwindcss, viteReact]`.

### A.4 Cloudflare deploy story (Task 18) — verify empirically

The plan's Task 18 assumes the Vinxi `cloudflare-pages` preset produces `.output/public/`. Reality with the Vite-native plugin is unconfirmed. When executing Task 18:

1. **First**: run `pnpm build` with no Cloudflare config and inspect the output. Look for either `.output/public/` (if TanStack Start's Vite plugin still uses Nitro under the hood) or `dist/` (if it's pure Vite).
2. **Second**: consult the current TanStack Start documentation for Cloudflare deployment (the API has been migrating; the official docs are the source of truth at execution time).
3. **Third**: if `tanstackStart()` accepts a `target` or `adapter` option for Cloudflare, set it there. Otherwise, the deploy may need `@cloudflare/vite-plugin` or `@tanstack/start-adapter-cloudflare` (verify which package is current).
4. **Fourth**: `wrangler pages deploy <actual-output-dir>` — pass whichever directory the build produced.

Treat Task 18 as a small investigation task, not a deterministic recipe.

### A.5 Playwright config (Task 15)

Use `baseURL: 'http://localhost:5173'`. The `webServer.url` in `playwright.config.ts` should match: `'http://localhost:5173'`. (Corrected 2026-05-19 during Task 7 verification — Vite's actual default is 5173.)

### A.6 Cleanup: remove unused `vinxi` dep

The Task 2 implementer installed `vinxi@0.5.11` as a dev dep but it's no longer used. **Remove during Task 22's typecheck/lint sweep**:

```bash
pnpm remove vinxi
```

Verify nothing else references it: `grep -r vinxi --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" src/ tests/ *.{json,ts,md}` should return zero hits (excluding this addendum and the plan/spec docs).

### A.7 The `start` script

The current `start: "node .output/server/index.mjs"` will only work if `pnpm build` produces that path. If Task 18 reveals a different output structure, update the `start` script then. Until then it's untested.

### A.8 What did NOT change

These plan details remain accurate:

- All Convex code (`convex/*`) — unchanged; not affected by TanStack Start API migration.
- Convex Auth wiring patterns — unchanged.
- shadcn/ui, Tailwind tokens, design system — unchanged (the only difference is *where* the Vite plugin attaches).
- Lingui macro usage and message catalogs — unchanged.
- Sentry/PostHog package APIs themselves — unchanged; only the init location moves.
- Biome, Vitest, Playwright configs at the file level — unchanged.
- Tests, TDD pattern, commit pattern — unchanged.

### A.9 Route group filenames (discovered during Task 5 execution)

**Discovered:** 2026-05-15, `@tanstack/router-generator@1.166.42`.

The plan uses `(group)/_layout.tsx` + `(group)/_layout/<route>.tsx` for pathless layout grouping. **This syntax does not work with the current router-generator** — both `_layout.tsx` files strip their group prefix and resolve to `routePath=""`, which the generator rejects with: *"Invalid route path `""` was found — root routes must be defined via `__root.tsx`"* (GitHub tanstack/router#4227).

The functionally equivalent layout the generator does accept:

| Plan path | Actual path |
|---|---|
| `src/routes/(public)/_layout.tsx` | `src/routes/_public.tsx` |
| `src/routes/(public)/_layout/index.tsx` | `src/routes/_public/index.tsx` |
| `src/routes/(public)/_layout/signup.tsx` | `src/routes/_public/signup.tsx` |
| `src/routes/(public)/_layout/signin.tsx` | `src/routes/_public/signin.tsx` |
| `src/routes/(pos)/_layout.tsx` | `src/routes/_pos.tsx` |
| `src/routes/(pos)/_layout/dashboard.tsx` | `src/routes/_pos/dashboard.tsx` |

Same URLs (`/`, `/signup`, `/signin`, `/dashboard`), same layout nesting, same Outlet wiring. Only the filenames change.

When `createFileRoute('/(public)/_layout')` appears in plan text, use `createFileRoute('/_public')`. Similarly `createFileRoute('/(public)/_layout/signup')` → `createFileRoute('/_public/signup')`. The route tree generator infers the layout relationship from the matching filename `_public.tsx` and directory `_public/`.

### A.10 How to use this addendum

When dispatching an implementer subagent for any task numbered 3 or higher, include the relevant rows from §A.1, §A.9 (and any future additions) in the prompt's "Notes" section, with a one-line cue like:

> "Apply Addendum A translations to any file references that diverge from current reality. Specifically for this task: [list the relevant translations]."

This avoids hand-rewriting 27 task sections in place while keeping the plan a live, accurate document.
