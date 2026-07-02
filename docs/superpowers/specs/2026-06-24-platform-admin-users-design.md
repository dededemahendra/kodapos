# Platform Super-Admin — User Management

**Date:** 2026-06-24
**Status:** Approved design
**Branch:** `feat/platform-admin-users`

## Problem

The app is multi-tenant (businesses → cafes → users) but has no operator-level
view of users across tenants. Concretely, owners whose data predates the
multi-outlet backfill hit "no outlet access" and there is no in-app way to
inspect or repair them — the only fix today is running `backfillBusinesses`
from the CLI. There is also no way to deactivate a user or grant operator
rights. This adds a platform super-admin surface for the operator.

## Scope

- Operator-only (cross-tenant) page to list, search, and manage all users.
- Actions: fix outlet access, deactivate/reactivate, grant/revoke admin.
- **Out of scope (deferred):** impersonation/login-as. Security-sensitive,
  its own build.

## Access model

- Add two optional fields to the `users` table (extending the Convex Auth
  `authTables.users` definition): `isPlatformAdmin: boolean`,
  `deactivatedAt: number`.
- New helper in `convex/lib/auth.ts`:
  `requirePlatformAdmin(ctx)` → resolves the auth user; throws
  `not authenticated` with no identity and `not a platform admin` unless
  `user.isPlatformAdmin === true`. Returns `{ userId, user }`.
- **Bootstrap:** the first admin is set by hand in the Convex dashboard
  (`isPlatformAdmin = true`). All subsequent admin grants happen in the UI.

## Backend — `convex/admin.ts`

Every function gated by `requirePlatformAdmin`.

- `listUsers({ search?: string }) → UserRow[]`
  Each row joins a user with:
  - `name`, `email`, `_id`, `isPlatformAdmin`, `deactivatedAt`
  - owned cafes (names) + business membership + role
  - `accessHealth`: `'ok' | 'no_outlet'` — `no_outlet` when the user owns at
    least one cafe but `resolveOutletAccess` yields zero accessible cafes, OR
    owns cafes with no `businessId`/`businessMembers` row (pre-backfill state).
  Search filters by name/email substring (case-insensitive). No pagination in
  v1; revisit if user count grows large.

- `fixOutletAccess({ userId }) → { fixed: boolean }`
  Per-user version of `backfillBusinesses`: for each of the user's cafes with
  no `businessId`, create a `businesses` row, patch the cafe, insert the
  `owner` `businessMembers` row if missing, and a default `activeOutlet` if
  missing. Idempotent — running twice is a no-op.

- `setDeactivated({ userId, deactivated: boolean }) → null`
  Sets/clears `deactivatedAt`. Guard: throws if `userId` is the caller
  (can't lock yourself out).

- `setPlatformAdmin({ userId, isAdmin: boolean }) → null`
  Sets/clears `isPlatformAdmin`. Guards: can't revoke yourself; can't revoke
  the last remaining admin.

- `me() → { isPlatformAdmin: boolean }` (or extend an existing identity query)
  Lightweight query the shell uses to decide whether to show the Admin nav.

## Enforcing deactivation

`requireActiveOutlet` (the shared ~230-callsite gate in `convex/lib/auth.ts`)
gains one check after resolving the user: if `user.deactivatedAt` is set,
throw `account deactivated`. This single choke point locks a deactivated user
out of all tenant operations without touching Convex Auth internals. The auth
session itself is not revoked; the user simply can reach no data.

## Frontend — `/admin/users`

- New route `src/routes/_pos/admin/users.tsx` (under the existing `_pos`
  shell). A `route.tsx` parent if a section grows later; single page for v1.
- Nav: new group **"Admin"** in `navGroups` (`src/components/app-shared.tsx`)
  with one item → `/admin/users`, gated by a new `requires: 'platformAdmin'`
  value. The shell's permission resolver learns `platformAdmin` from the
  `me()`-style query. Hidden for non-admins.
- Page UI:
  - Search box (filters server-side via `listUsers` arg).
  - Table: Name, Email, Cafes, Role, Status badge (`active` /
    `deactivated`, plus a `no outlet` warning chip when
    `accessHealth === 'no_outlet'`).
  - Row actions via existing `RowActions`:
    - **Fix access** — shown only when `accessHealth === 'no_outlet'`.
    - **Deactivate / Reactivate**.
    - **Make admin / Remove admin**.
  - Destructive actions (deactivate, remove admin) confirm via the existing
    `ConfirmDialog`. Success/error via `~/lib/toast`.
  - Loading: `Spinner`. Empty search result: shadcn `Empty`
    (icon + heading + description), matching `members.tsx`.

## Conventions

- **English-only.** The admin UI is operator-facing; copy is plain English,
  not added to the i18n catalog. The single nav label uses the existing
  `msg` macro with English text for consistency with the nav array's type.
- No em-dash / `--` in any copy (existing rule).
- Commit `src/routeTree.gen.ts` after adding the route.
- Run `convex codegen` and commit `_generated` changes.
- Local CI (`pnpm typecheck`, tests, `lingui:compile`) before push.

## Testing

- `convex/admin.test.ts` (or existing convex test harness):
  - `requirePlatformAdmin` throws for non-admin and unauthenticated.
  - `listUsers` flags a pre-backfill owner as `no_outlet`.
  - `fixOutletAccess` makes that owner `ok` and is idempotent.
  - `setDeactivated` rejects self-deactivation; sets the flag.
  - `requireActiveOutlet` throws `account deactivated` for a deactivated user.
  - `setPlatformAdmin` rejects revoking the last admin / self.

## Risks / notes

- Extending `authTables.users` requires defining the `users` table explicitly
  in `schema.ts` rather than relying solely on the spread. Verify Convex Auth
  still recognizes it (standard customization pattern).
- `listUsers` is unpaginated; fine at current scale (~hundreds), flagged for
  later.
