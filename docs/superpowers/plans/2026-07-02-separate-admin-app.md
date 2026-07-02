# Separate Platform-Admin App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the platform-admin surface out of the tenant POS shell into its own host-routed app at `admin.kodapos.app`, with operator-only sign-in, on the same Cloudflare Worker and Convex backend.

**Architecture:** One Worker serves both hosts. A pure `resolveHostApp(host)` maps a hostname to `'admin' | 'tenant'`; each layout route (`_admin`, `_pos`, `_public`) gates on it client-side and redirects if it is on the wrong host. Admin routes live under an `_admin` layout at collision-free paths (`/overview`, `/login`, `/users`). Operators are `users` rows flagged `isPlatformAdmin`, provisioned (not self-signup); the admin app admits only them, and tenant cafe-creation rejects them.

**Tech Stack:** TanStack Start (file-based routing, SSR on Cloudflare Workers), Convex + `@convex-dev/auth`, React 19, Lingui i18n, Vitest, Biome.

## Global Constraints

- **No em-dash (`—`) or `--` in user-facing copy** (BI + en). Use commas/periods/parentheses.
- **New user-facing strings** must be wrapped in `<Trans>`/`` t`...` `` (source is Indonesian), then `pnpm lingui:extract` + fill the English `msgstr` + `pnpm lingui:compile`.
- **Route tree is generated + tracked:** after adding/removing/moving a route file, regenerate `src/routeTree.gen.ts` (run `pnpm dev` briefly) and commit it; CI fails if it is stale.
- **Convex codegen:** use `./node_modules/.bin/convex codegen` (npx is broken by a shell hook); commit the tracked `convex/_generated` files.
- **Empty states** use the shadcn `Empty` component (icon + heading + description).
- **Auth isolation is logical:** operators and tenants share the `users` table; the boundary is the `isPlatformAdmin` flag + host gates. Do NOT add a separate credential store.
- **Single Worker / single build:** no second `wrangler` config, no second CI. `admin.kodapos.app` is added as a custom domain in the Cloudflare dashboard (manual, out of code).
- Run `./node_modules/.bin/tsc --noEmit` and `pnpm test` locally before pushing; never push-then-poll CI.

---

### Task 1: `resolveHostApp` host helper

**Files:**
- Create: `src/lib/host.ts`
- Test: `src/lib/host.test.ts`

**Interfaces:**
- Produces: `resolveHostApp(host: string): 'admin' | 'tenant'` — returns `'admin'` when the hostname's first dot-separated label is exactly `admin` (case-insensitive), else `'tenant'`. Port suffixes (`:5173`) are ignored. `currentHostApp(): 'admin' | 'tenant'` — reads `window.location.host` on the client, returns `'tenant'` during SSR (`typeof window === 'undefined'`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/host.test.ts
import { describe, expect, it } from 'vitest';
import { resolveHostApp } from './host';

describe('resolveHostApp', () => {
  it("returns 'admin' for an admin.* host", () => {
    expect(resolveHostApp('admin.kodapos.app')).toBe('admin');
    expect(resolveHostApp('admin.localhost:5173')).toBe('admin');
    expect(resolveHostApp('ADMIN.kodapos.app')).toBe('admin');
  });

  it("returns 'tenant' for the tenant host and everything else", () => {
    expect(resolveHostApp('kodapos.app')).toBe('tenant');
    expect(resolveHostApp('www.kodapos.app')).toBe('tenant');
    expect(resolveHostApp('localhost:5173')).toBe('tenant');
    expect(resolveHostApp('')).toBe('tenant');
  });

  it("does not match a host that merely contains 'admin'", () => {
    expect(resolveHostApp('myadmin.kodapos.app')).toBe('tenant');
    expect(resolveHostApp('kodapos.app/admin')).toBe('tenant');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/lib/host.test.ts`
Expected: FAIL — cannot resolve `./host`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/host.ts
/**
 * Map a hostname to which app should serve it. The admin app owns any host
 * whose first dot-separated label is exactly `admin` (e.g. `admin.kodapos.app`,
 * and `admin.localhost` in dev). Everything else is the tenant POS app. This is
 * the single source of truth for host -> app, used identically on the server
 * (request host) and client (`window.location.host`).
 */
export type HostApp = 'admin' | 'tenant';

export function resolveHostApp(host: string): HostApp {
  const hostname = host.toLowerCase().split(':')[0] ?? '';
  const firstLabel = hostname.split('.')[0] ?? '';
  return firstLabel === 'admin' ? 'admin' : 'tenant';
}

/** Client-side current app; `'tenant'` during SSR (no `window`). */
export function currentHostApp(): HostApp {
  if (typeof window === 'undefined') return 'tenant';
  return resolveHostApp(window.location.host);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run src/lib/host.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/host.ts src/lib/host.test.ts
git commit -m "feat(admin): resolveHostApp host -> app helper"
```

---

### Task 2: Backend guard — bar operators from tenant cafe-creation

**Files:**
- Modify: `convex/cafes.ts` (the cafe-creation mutation used by onboarding — the one that inserts a `cafes` row for the signed-in user)
- Test: `tests/convex/admin.test.ts` (append a case)

**Interfaces:**
- Consumes: `requireActiveUser(ctx)` from `convex/lib/auth.ts` → `{ userId, user }` where `user.isPlatformAdmin?: boolean`.
- Produces: the cafe-creation mutation throws `Error('operators cannot own cafes')` when `user.isPlatformAdmin === true`.

- [ ] **Step 1: Identify the mutation**

Run: `grep -nE "export const (createCafe|create|setupCafe|createOutlet)" convex/cafes.ts`
Read the handler that creates a NEW cafe/business for the current user during onboarding (it calls `requireActiveUser` or `getAuthUserId` then inserts into `cafes`). Note its exact name for the steps below (referred to here as `createCafe`).

- [ ] **Step 2: Write the failing test**

```ts
// tests/convex/admin.test.ts (append inside the existing top-level describe or a new one)
import { convexTest } from 'convex-test';
import { expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
// NOTE: match the existing file's import style + auth-identity helper. Reuse the
// same `asUser(t, userId)` / withIdentity pattern already used in this file.

it('rejects cafe creation for a platform-admin (operator) account', async () => {
  const t = convexTest(schema);
  // Create a user row flagged as platform admin (operator), then act as them.
  const operatorId = await t.run(async (ctx) =>
    ctx.db.insert('users', { isPlatformAdmin: true }),
  );
  await expect(
    t
      .withIdentity({ subject: operatorId })
      // Use the SAME args the onboarding UI passes to createCafe.
      .mutation(api.cafes.createCafe, { name: 'Operator Cafe' }),
  ).rejects.toThrow('operators cannot own cafes');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/convex/admin.test.ts`
Expected: FAIL — the mutation currently allows the insert (no throw).

- [ ] **Step 4: Add the guard**

In `convex/cafes.ts`, at the very top of the cafe-creation handler (right after resolving the user), add:

```ts
const { userId, user } = await requireActiveUser(ctx);
// Operators (platform admins) are a separate account class and must never own a
// cafe; the tenant->operator boundary is enforced here (see the admin app spec).
if (user.isPlatformAdmin === true) {
  throw new Error('operators cannot own cafes');
}
```

If the handler currently calls `getAuthUserId(ctx)` directly, switch it to `requireActiveUser(ctx)` (already imported in this file) so `user` is available; keep the rest of the handler unchanged.

- [ ] **Step 5: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/convex/admin.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/cafes.ts tests/convex/admin.test.ts
git commit -m "feat(admin): bar operator accounts from creating cafes"
```

---

### Task 3: Admin chrome components

**Files:**
- Create: `src/components/admin/admin-shell.tsx`
- Create: `src/components/admin/admin-top-bar.tsx`

**Interfaces:**
- Consumes: `useAuthActions()` from `@convex-dev/auth/react` (`signOut`); `Link` from `@tanstack/react-router`.
- Produces:
  - `AdminTopBar(): JSX.Element` — a slim top bar: "kodapos admin" brand on the left, nav link to `/users`, and a sign-out button on the right.
  - `AdminShell({ children }: { children: ReactNode }): JSX.Element` — wraps `AdminTopBar` + a `<main className="mx-auto max-w-5xl p-6">{children}</main>` in a full-height column. No cafe sidebar.

- [ ] **Step 1: Write `AdminTopBar`**

```tsx
// src/components/admin/admin-top-bar.tsx
import { useAuthActions } from '@convex-dev/auth/react';
import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Button } from '~/components/ui/button';

export function AdminTopBar() {
  const { signOut } = useAuthActions();
  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6">
      <div className="flex items-center gap-6">
        <Link to="/overview" className="font-semibold">
          kodapos <span className="text-muted-foreground">admin</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link to="/users" className="hover:text-foreground">
            <Trans>Users</Trans>
          </Link>
        </nav>
      </div>
      <Button variant="outline" size="sm" onClick={() => void signOut()}>
        <Trans>Keluar</Trans>
      </Button>
    </header>
  );
}
```

- [ ] **Step 2: Write `AdminShell`**

```tsx
// src/components/admin/admin-shell.tsx
import type { ReactNode } from 'react';
import { AdminTopBar } from './admin-top-bar';

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AdminTopBar />
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/
git commit -m "feat(admin): admin shell + top bar chrome"
```

---

### Task 4: `_admin` layout — host gate + operator auth gate

**Files:**
- Create: `src/routes/_admin.tsx`

**Interfaces:**
- Consumes: `resolveHostApp`/`currentHostApp` from `~/lib/host` (Task 1); `AdminShell` from `~/components/admin/admin-shell` (Task 3); `api.admin.me` (returns `{ isPlatformAdmin: boolean } | null`); `Authenticated`/`Unauthenticated`/`AuthLoading` + `useQuery` from `convex/react`; `useAuthActions` from `@convex-dev/auth/react`.
- Produces: route `/_admin` — a pathless layout that (a) redirects to `/` when not on the admin host, (b) shows the operator sign-in surface when signed out, (c) admits only `isPlatformAdmin` users into `AdminShell`, signing out + showing "Not authorized" otherwise.

- [ ] **Step 1: Write the layout**

```tsx
// src/routes/_admin.tsx
import { useAuthActions } from '@convex-dev/auth/react';
import { Trans } from '@lingui/react/macro';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react';
import { useEffect } from 'react';
import { AdminShell } from '~/components/admin/admin-shell';
import { Button } from '~/components/ui/button';
import { LoadingCounter } from '~/components/ui/loading-counter';
import { currentHostApp } from '~/lib/host';

export const Route = createFileRoute('/_admin')({
  component: AdminLayout,
});

function AdminLayout() {
  // Host gate: the admin app only serves the admin host. On any other host,
  // bounce to the tenant root. Runs client-side (SSR has no window), matching
  // the app's existing client-redirect pattern (see _pos.tsx SignedOutRedirect).
  useEffect(() => {
    if (currentHostApp() !== 'admin') window.location.replace('/');
  }, []);
  if (currentHostApp() !== 'admin') return null;

  return (
    <>
      <AuthLoading>
        <LoadingCounter />
      </AuthLoading>
      <Unauthenticated>
        <Outlet />
      </Unauthenticated>
      <Authenticated>
        <OperatorGate />
      </Authenticated>
    </>
  );
}

// Only platform admins may enter. A non-operator who somehow authenticates is
// signed out and shown a terminal "not authorized" notice.
function OperatorGate() {
  const me = useQuery(api.admin.me, {});
  const { signOut } = useAuthActions();
  if (me === undefined) return <LoadingCounter />;
  if (me?.isPlatformAdmin !== true) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          <Trans>Akun ini tidak memiliki akses operator.</Trans>
        </p>
        <Button onClick={() => void signOut()}>
          <Trans>Keluar</Trans>
        </Button>
      </div>
    );
  }
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
```

- [ ] **Step 2: Verify `api.admin.me` return shape**

Run: `sed -n '58,68p' convex/admin.ts`
Confirm `me` returns an object with `isPlatformAdmin` (or `null`). If the field name differs, adjust `me?.isPlatformAdmin` accordingly in Step 1.

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors (route file compiles; `routeTree.gen.ts` is regenerated in Task 7 — a temporary "Route not in tree" type error here is expected and resolved there).

- [ ] **Step 4: Commit**

```bash
git add src/routes/_admin.tsx
git commit -m "feat(admin): _admin layout with host + operator gates"
```

---

### Task 5: Admin pages — move users, add overview + operator login

**Files:**
- Create: `src/routes/_admin/users.tsx` (moved body from `src/routes/_pos/admin/users.tsx`)
- Delete: `src/routes/_pos/admin/users.tsx`
- Create: `src/routes/_admin/overview.tsx`
- Create: `src/routes/_admin/login.tsx`

**Interfaces:**
- Consumes: `api.admin.listUsers`, `api.admin.fixOutletAccess`, `api.admin.setDeactivated`, `api.admin.setPlatformAdmin` (unchanged); `useAuthActions().signIn('resend-otp', ...)`; `OtpInput` from `~/components/auth/otp-input`.
- Produces: routes `/users`, `/overview`, `/login` under `_admin`.

- [ ] **Step 1: Move the users page**

Copy `src/routes/_pos/admin/users.tsx` to `src/routes/_admin/users.tsx`. Change ONLY the route id and drop the now-redundant in-page permission gate (the `_admin` layout already guarantees an operator):

```tsx
// top of src/routes/_admin/users.tsx
export const Route = createFileRoute('/_admin/users')({
  component: AdminUsersPage,
});
```

Remove the `usePermissions()` call and the `isPlatformAdmin ? {...} : 'skip'` guard on `listUsers` (query unconditionally, since the layout gate ensures an operator):

```tsx
const users = useQuery(api.admin.listUsers, { search });
```

Delete the `usePermissions` import and the `isLoading` early-return branch that depended on it. Keep everything else (table, confirm dialogs, mutations) identical.

- [ ] **Step 2: Delete the old route**

```bash
git rm src/routes/_pos/admin/users.tsx
```

- [ ] **Step 3: Write the overview page**

```tsx
// src/routes/_admin/overview.tsx
import { Trans } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/_admin/overview')({
  component: AdminOverview,
});

function AdminOverview() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">
        <Trans>Konsol operator</Trans>
      </h1>
      <p className="text-muted-foreground">
        <Trans>Kelola pengguna platform dan akses lintas outlet.</Trans>
      </p>
      <Link to="/users" className="text-primary underline">
        <Trans>Kelola pengguna</Trans>
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Write the operator login page**

Model it on the emailed-code (otp) branch of `src/routes/_public/signin.tsx`: an email field → `signIn('resend-otp', { email })` → `OtpInput` → `signIn('resend-otp', { email, code })`. On success, navigate to `/overview`. Do NOT include Google, password, reset, or remember-me. The `OperatorGate` (Task 4) rejects non-operators after sign-in, so this page needs no admin check itself.

```tsx
// src/routes/_admin/login.tsx
import { useAuthActions } from '@convex-dev/auth/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { AuthCard } from '~/components/auth/auth-card';
import { OtpInput } from '~/components/auth/otp-input';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { validateEmail } from '~/lib/auth-validation';

export const Route = createFileRoute('/_admin/login')({
  component: OperatorLogin,
});

function OperatorLogin() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const { t } = useLingui();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (validateEmail(email) !== null) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn('resend-otp', { email: email.trim() });
      setSent(true);
    } catch {
      setError(t`Tidak dapat mengirim kode.`);
    } finally {
      setSubmitting(false);
    }
  }

  async function onComplete(code: string) {
    setSubmitting(true);
    setError(null);
    try {
      await signIn('resend-otp', { email: email.trim(), code });
      navigate({ to: '/overview' });
    } catch {
      setError(t`Kode salah atau sudah kedaluwarsa.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title={<Trans>Masuk operator</Trans>}>
      {!sent ? (
        <form onSubmit={onSend}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t`nama@email.com`}
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Button type="submit" className="w-full" disabled={submitting || email.length === 0}>
              {submitting && <Spinner data-icon="inline-start" />}
              <Trans>Kirim kode</Trans>
            </Button>
          </FieldGroup>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            <Trans>Masukkan kode</Trans>
          </p>
          <OtpInput
            digits={8}
            onComplete={(code) => void onComplete(code)}
            errorMessage={error ?? undefined}
            disabled={submitting}
          />
        </div>
      )}
    </AuthCard>
  );
}
```

- [ ] **Step 5: Verify `AuthCard` / `OtpInput` / `validateEmail` signatures**

Run: `grep -nE "export (function|const) (AuthCard|OtpInput)" src/components/auth/*.tsx; grep -n "export function validateEmail" src/lib/auth-validation.ts`
Confirm `AuthCard` accepts a `title` prop, `OtpInput` accepts `{ digits, onComplete, errorMessage, disabled }`, and `validateEmail(value)` returns `MessageDescriptor | null`. Adjust the code above if a prop name differs.

- [ ] **Step 6: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors except the pending route-tree entries (resolved in Task 7).

- [ ] **Step 7: Commit**

```bash
git add src/routes/_admin/ src/routes/_pos/admin/users.tsx
git commit -m "feat(admin): move users page + add operator login and overview"
```

---

### Task 6: Tenant host gates + remove in-app admin nav

**Files:**
- Modify: `src/routes/_pos.tsx` (add host gate at top of `PosLayout`)
- Modify: `src/routes/_public.tsx` (add host gate)
- Modify: `src/components/app-shared.tsx:138-144` (remove the "Admin" nav section)

**Interfaces:**
- Consumes: `currentHostApp` from `~/lib/host`.
- Produces: on the admin host, `_pos` and `_public` redirect to `/overview`; the tenant sidebar/command-palette no longer show an Admin section.

- [ ] **Step 1: Gate `_public.tsx`**

Add to the top of the `_public` layout component (before its normal return):

```tsx
import { useEffect } from 'react';
import { currentHostApp } from '~/lib/host';
// ...
// On the admin host, the tenant routes (incl. the marketing home at `/`) must
// not render; send the operator to the admin landing.
useEffect(() => {
  if (currentHostApp() === 'admin') window.location.replace('/overview');
}, []);
if (currentHostApp() === 'admin') return null;
```

- [ ] **Step 2: Gate `_pos.tsx`**

Add the same guard at the top of `PosLayout` (before the `useQuery(api.cafes.myCafe)` call), importing `currentHostApp` and `useEffect` (already imported):

```tsx
useEffect(() => {
  if (currentHostApp() === 'admin') window.location.replace('/overview');
}, []);
if (currentHostApp() === 'admin') return null;
```

- [ ] **Step 3: Remove the in-app Admin nav section**

In `src/components/app-shared.tsx`, delete the nav group object that contains `{ title: msg\`Users\`, path: "/admin/users", ... requires: 'platformAdmin' }` (the `label: msg\`Admin\`` section around lines 138-144). Leave the `Permission | 'owner' | 'platformAdmin'` type union in place (still used by `permissions.ts`).

- [ ] **Step 4: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors except pending route-tree (Task 7). If removing the Admin section orphans the `ShieldCheck` import in `app-shared.tsx`, delete that import too.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_pos.tsx src/routes/_public.tsx src/components/app-shared.tsx
git commit -m "feat(admin): host-gate tenant layouts, drop in-app admin nav"
```

---

### Task 7: Regenerate route tree + i18n + full verification

**Files:**
- Modify: `src/routeTree.gen.ts` (generated)
- Modify: `src/locales/en/messages.po`, `src/locales/id/messages.po`

- [ ] **Step 1: Regenerate the route tree**

Run `pnpm dev` in the background until it logs `ready`, then stop it. Confirm the tree updated:

Run: `grep -c "_admin/users\|_admin/overview\|_admin/login" src/routeTree.gen.ts` → expect ≥ 3
Run: `grep -c "_pos/admin/users\|PosAdminUsers" src/routeTree.gen.ts` → expect `0`

- [ ] **Step 2: Extract + fill i18n**

Run: `pnpm lingui:extract`
Then open `src/locales/en/messages.po`, find each new `msgstr ""` from the admin files, and fill the English translation. Expected new source strings and their English:
- `Users` → `Users`
- `Keluar` → `Sign out`
- `Akun ini tidak memiliki akses operator.` → `This account does not have operator access.`
- `Konsol operator` → `Operator console`
- `Kelola pengguna platform dan akses lintas outlet.` → `Manage platform users and cross-outlet access.`
- `Kelola pengguna` → `Manage users`
- `Masuk operator` → `Operator sign-in`
- `Tidak dapat mengirim kode.` → `Could not send the code.`
- `Kode salah atau sudah kedaluwarsa.` → `Wrong or expired code.`
- `Masukkan kode` / `Kirim kode` / `nama@email.com` — reuse existing translations if already present.

Then run: `pnpm lingui:compile`

- [ ] **Step 3: Full local verification**

Run: `./node_modules/.bin/tsc --noEmit` → no errors
Run: `pnpm test` → all pass (Task 1 + Task 2 tests included)

- [ ] **Step 4: Manual smoke (browser)**

Run `pnpm dev`, then in a browser:
- `http://localhost:5173/` → tenant marketing home (unchanged).
- `http://localhost:5173/users` → redirected to `/` (tenant host does not serve admin routes).
- `http://admin.localhost:5173/` → redirected to `/overview`, which shows the operator sign-in (unauthenticated).
- `http://admin.localhost:5173/users` while signed out → operator sign-in.

- [ ] **Step 5: Commit**

```bash
git add src/routeTree.gen.ts src/locales/en/messages.po src/locales/id/messages.po
git commit -m "chore(admin): regenerate route tree + fill admin i18n"
```

---

### Task 8: Deploy note (manual, no code)

**Files:** none (documentation of the out-of-code step).

- [ ] **Step 1: Record the infra step**

After merge + deploy, in the Cloudflare dashboard add `admin.kodapos.app` as a **custom domain** on the existing `kodapos` Worker (Workers & Pages → the Worker → Settings → Domains & Routes → Add custom domain). No `wrangler.jsonc` change, no new Worker, no new env vars. Verify `https://admin.kodapos.app/` resolves to the operator sign-in and `https://kodapos.app/users` redirects to `/`.

---

## Self-Review

**Spec coverage:**
- Routing & shell → Tasks 3, 4, 5, 6 ✓
- Host gate (`resolveHostApp`, per-layout enforcement) → Tasks 1, 4, 6 ✓
- Operator auth (Approach A, provisioned, gate on `isPlatformAdmin`) → Tasks 4, 5 ✓
- Hard boundary (operators barred from cafes; tenant users rejected) → Tasks 2, 4 ✓
- Backend reuse → Tasks 4, 5 (no `admin.ts` change) ✓
- Deploy/infra (custom domain, one Worker) → Task 8 ✓
- Testing (`resolveHostApp`, operator gate, tenant-onboarding rejection) → Tasks 1, 2 (unit); gate behavior covered by the Task 6/7 manual smoke ✓

**Placeholder scan:** Task 2 leaves the exact mutation name to confirm via grep (Step 1) because the handler name must be read from the code; the guard code itself is complete. No other placeholders.

**Type consistency:** `resolveHostApp`/`currentHostApp` (Task 1) used verbatim in Tasks 4 and 6. `api.admin.me` shape confirmed in Task 4 Step 2 before use. Admin route paths (`/overview`, `/login`, `/users`) consistent across Tasks 4-7.
