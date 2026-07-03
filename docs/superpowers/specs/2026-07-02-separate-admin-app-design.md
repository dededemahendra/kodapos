# Separate Platform-Admin App — Design

**Date:** 2026-07-02
**Status:** Approved (brainstorm), pending implementation plan

## Problem

The platform super-admin surface (`/admin/users`) currently lives **inside the
tenant POS app** (`src/routes/_pos/admin/users.tsx`), rendered in the same
`_pos` shell as a cafe's register, with the same sidebar chrome. Operator
tooling is mixed into the tenant experience: an operator uses the same login,
the same UI shell, and the same URL space as a cafe owner. We want the platform
admin to be a **separate app**: its own subdomain (`admin.kodapos.app`), its own
operator sign-in, and its own UI, cleanly isolated from the cafe-facing product.

## Goals

- Operators reach the admin at **`admin.kodapos.app`**, with an admin-only UI
  (no cafe POS chrome).
- Operators have a **separate sign-in** and are a distinct account class from
  cafe (tenant) users, with a hard boundary both ways.
- Reuse the **same Convex backend** and the existing `convex/admin.ts`
  functions and `isPlatformAdmin` schema flag.
- Minimal new infrastructure.

## Non-Goals

- A second build target / second Cloudflare Worker / second CI pipeline. (One
  Worker serves both hosts; a physical bundle/deploy split is a future option,
  not part of this work.)
- Physically isolated operator credentials (a hand-rolled `operators` auth
  table). Isolation is **logical**, enforced by flags + host gates on top of
  Convex Auth's vetted primitives.
- Changing the admin feature set. `admin.listUsers`, `setPlatformAdmin`,
  `setDeactivated`, `fixOutletAccess`, etc. are reused as-is.

## Approach

**One Cloudflare Worker, host-based routing, Approach A operator auth.** Chosen
over a two-Worker "true separate deploy" (meaningful infra, awkward dual
TanStack Start entries) and over hand-rolled operator credentials (security
risk). Host-routing delivers everything user-visible — separate subdomain,
separate login, separate UI — on one deploy and one bundle.

## Architecture

### 1. Routing & shell

- New pathless layout group **`_admin`** (`src/routes/_admin.tsx`) with its own
  root chrome: an operator top bar + admin nav, **no** cafe POS sidebar.
- Route moves / additions (all under one TanStack router, so admin paths must
  **not collide** with any tenant path — `/` and `/signin` are taken, hence the
  admin-specific names below):
  - `src/routes/_pos/admin/users.tsx` → **`src/routes/_admin/users.tsx`**
    (served as `/users` on the admin host; `/users` is free tenant-side).
  - **`src/routes/_admin/overview.tsx`** — admin landing (`/overview`).
  - **`src/routes/_admin/login.tsx`** — operator sign-in (`/login`; tenant uses
    `/signin`).
  - On the admin host, the tenant home `/` (which the router matches to
    `_public/index`) is redirected to `/overview` by the `_public` host gate.
- **Host gate.** A pure helper `resolveHostApp(host: string): 'admin' | 'tenant'`
  (`src/lib/host.ts`) returns `'admin'` when the hostname's first label is
  `admin` (e.g. `admin.kodapos.app`, and `admin.localhost` for local dev, which
  browsers resolve to 127.0.0.1), otherwise `'tenant'`. This is the single
  source of truth for host → app, used identically on server and client.
  - **Enforcement is per-layout `beforeLoad`**, not a global switch: `_admin.tsx`
    asserts `resolveHostApp(host) === 'admin'` and otherwise redirects to the
    tenant root (`/`); `_pos.tsx` and `_public.tsx` assert `=== 'tenant'` and
    otherwise redirect to the admin root (`/` on the admin host). Each layout
    reads the SSR request host server-side (via the request headers TanStack
    Start exposes) and `window.location.host` on the client.
  - Net effect: on `admin.kodapos.app` only `_admin/*` render (`/` → admin
    landing); on the tenant host only `_public/*` + `_pos/*` render.
- The existing `/admin/users` nav entry, command-palette entry, and
  `platformAdmin` permission wiring in the tenant app are **removed** (the admin
  no longer lives in the tenant shell).

### 2. Operator auth (Approach A)

- **Operator = a `users` row with `isPlatformAdmin: true`**, never linked to any
  cafe/business. Operators are **provisioned, not self-signup**: seeded via the
  existing `admin.grantPlatformAdminByEmail` bootstrap mutation or an operator
  invite; the account must already be a platform admin to get in.
- **Admin sign-in** (`_admin/login`, at `/login`) uses emailed-code auth
  (reusing the existing `ResendOTP` provider). After the code verifies, gates on
  `isPlatformAdmin === true`; if false, it **immediately signs the user out** and
  shows "Not authorized." There is **no onboarding/cafe-creation path** on the
  admin host.
- **Hard boundary, both directions:**
  - A tenant user who authenticates on the admin host → "Not authorized"
    (not an operator).
  - An operator account is barred from tenant flows: tenant onboarding /
    cafe-creation rejects `isPlatformAdmin` accounts, so an operator can never
    also become a cafe owner.
- Magic-link / code emails issued from the admin host use the **admin host
  origin** so the link returns to `admin.kodapos.app`.

### 3. Backend (reuse)

- `convex/admin.ts` and `requirePlatformAdmin` are unchanged — every admin
  function already gates on `isPlatformAdmin`, and the schema flags
  (`isPlatformAdmin`, `deactivatedAt`) already exist.
- Add a small guard barring `isPlatformAdmin` accounts from tenant
  cafe-creation / onboarding mutations (the tenant→operator boundary above).

### 4. Deploy / infra

- **One Worker, one build.** Add `admin.kodapos.app` as a **custom domain** on
  the existing Worker in the Cloudflare dashboard. No second Workers Builds
  project, no second `wrangler` config, no new env vars.

## Data Flow

1. Browser → `admin.kodapos.app/...` → the single Worker (SSR).
2. `__root` `beforeLoad` resolves `resolveHostApp(host) === 'admin'` and admits
   only `_admin/*`.
3. Unauthenticated → `_admin/login` (operator emailed-code sign-in).
4. On verify → gate on `isPlatformAdmin`; pass → admin landing, fail → sign out
   + "Not authorized".
5. Admin pages call the existing `admin.*` Convex functions on the shared
   deployment, each gated by `requirePlatformAdmin`.

## Error Handling

- Admin host, authenticated non-operator → sign out + "Not authorized" page.
- Admin host, unauthenticated → operator sign-in.
- Tenant host requesting `_admin/*` → redirect to tenant root (`/`).
- Admin host requesting a tenant route → redirect to admin root (`/`).
- Operator attempting tenant cafe-creation → rejected by the backend guard.

## Testing

- **Unit:** `resolveHostApp` (host → `'admin' | 'tenant'`, incl. localhost/dev
  host handling); the operator sign-in gate (admin vs non-admin outcomes); the
  tenant-onboarding guard rejecting operator accounts.
- **Reuse:** existing `tests/convex/admin.test.ts` backend coverage.

## Trade-offs

- **Logical, not physical, auth isolation** — operators and tenants share the
  `users` table; the boundary is enforced by the `isPlatformAdmin` flag + host
  gates rather than separate credential storage. Accepted for reusing Convex
  Auth security and avoiding hand-rolled auth.
- **Single bundle/deploy** — no physical deploy separation. Splitting into a
  second Worker later is possible without changing the routing/auth model.

## Open Questions

None outstanding. Dev-host handling is resolved: the admin app is reachable
locally at `http://admin.localhost:5173` (first label `admin` → `'admin'`), the
tenant app at `http://localhost:5173`, using the same `resolveHostApp` rule as
production.
