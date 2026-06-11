# UI Permission Enforcement Design Spec

**Date:** 2026-06-11
**Branch:** `feat/permission-gates` (off `main`)

## Context

`cafeStaff.permissions` (`canVoid`, `canDiscount`, `canManageShift`,
`canViewReports`, `canEditMenu`; owner implicitly all) is stored and editable
(`settings/staff`) but **not enforced on the UI** — any active cashier can open
`/reports`, edit the menu, etc. This slice enforces those flags (plus owner-only
Settings) on the client: hide nav entries and guard routes/actions the active
cashier lacks.

This is **client-side UI gating**, not a hard security boundary: the Convex auth
principal is the cafe owner's account, and cashiers operate within that session
(`useActiveCashier` holds the active cashier id in `localStorage`). Server
mutations stay owner-authorized. That suits the single-owner-account POS model;
the permission flags govern what the person at the register can navigate/do.

## Decisions (from brainstorming)

1. Enforce the **5 existing flags** on their surfaces **and** gate Settings to
   `role === 'owner'` (no flag exists for it).
2. Hide nav entries the active cashier can't access; guard routes with an
   "access denied" panel; gate the checkout discount action.
3. `canVoid` has no UI yet → the flag/hook are ready but nothing is gated now.

## Mapping

| Permission | Surfaces |
|---|---|
| `canViewReports` | `/reports/*` (layout), `/forecast`, `/dashboard`, `/shifts` |
| `canEditMenu` | `/menu/*` (layout), `/inventory/*` (layout), `/recipes`, `/suppliers`, `/promos` |
| `canManageShift` | `/shift/*` (layout: open/close) |
| `canDiscount` | the promo-apply action at checkout |
| `canVoid` | (no UI yet — not gated) |
| `owner` (role) | `/settings/*` (layout) |
| ungated | `/sale`, `/history`, `/customers`, `/loyalty`, `/help`, `/docs`, `/pin` |

## Backend — `convex/staff.ts`

**`permissionsFor({ cashierId })`** (query, owner-gated): resolves the active
cashier's role + permissions for the current cafe.
```ts
returns: v.object({
  role: v.union(v.literal('owner'), v.literal('cashier')),
  permissions: v.object({ canVoid: v.boolean(), canDiscount: v.boolean(),
    canManageShift: v.boolean(), canViewReports: v.boolean(), canEditMenu: v.boolean() }),
}),
handler: requireOwnerCafe → get(cashierId), assert it belongs to cafeId;
  if role === 'owner' → all flags true;
  else → { ...allFalse, ...(staff.permissions ?? {}) }.
```
If the cashier id is missing/foreign → throw (or return all-false cashier); the
client only calls it with a valid active cashier.

## Frontend

### `src/lib/permissions.ts` (new)

```ts
export type Permission = 'canVoid' | 'canDiscount' | 'canManageShift' | 'canViewReports' | 'canEditMenu';

export function usePermissions(): {
  can: (p: Permission) => boolean;
  isOwner: boolean;
  isLoading: boolean;
};
```
Reads `useActiveCashier()` → if no active cashier, `isLoading` until one exists
(routes are already behind `PinGate`, so an active cashier is present on gated
pages). Calls `useQuery(api.staff.permissionsFor, cashierId ? { cashierId } : 'skip')`.
`can(p)` = `data ? (data.role === 'owner' || data.permissions[p]) : false`;
`isOwner = data?.role === 'owner'`; `isLoading = cashierId != null && data === undefined`.

### `src/components/permission/require-permission.tsx` (new)

```tsx
<RequirePermission perm="canViewReports">{children}</RequirePermission>
// or <RequirePermission owner>{children}</RequirePermission>
```
- `isLoading` → `<Spinner/>`.
- allowed (`owner` prop → `isOwner`; `perm` prop → `can(perm)`) → render children.
- else → an `AccessDenied` panel (icon + "Anda tidak punya akses ke halaman ini."
  + a link back to `/sale`). No redirect loop.

### Nav filtering

- Add `requires?: Permission | 'owner'` to `SidebarNavItem` (and treat a group as
  hidden when all its items are hidden) in `src/components/app-shared.tsx`; tag
  the nav entries per the mapping (the "Laporan" group items → `canViewReports`;
  "Katalog" items → `canEditMenu`; "Pengaturan" → `owner`; etc.).
- In `src/components/app-sidebar.tsx`, compute the active cashier's
  permissions via `usePermissions()` and filter `navGroups` (drop items/subItems
  whose `requires` the cashier lacks; drop a group that ends up empty) before
  passing to `NavGroup`. Show everything while `isLoading` (avoid flicker), filter
  once known.

### Route guards

Wrap the route-group **layouts** (`route.tsx`) where they exist:
- `reports/route.tsx` → `perm="canViewReports"`
- `menu/route.tsx`, `inventory/route.tsx` → `perm="canEditMenu"`
- `shift/route.tsx` → `perm="canManageShift"`
- `settings/route.tsx` → `owner`
And the flat routes per-component: `/forecast`, `/dashboard`, `/shifts` →
`canViewReports`; `/recipes`, `/suppliers`, `/promos` → `canEditMenu`.

### Checkout discount action

In the cart/sale promo control, hide or disable the "apply promo / discount"
affordance via `useCan('canDiscount')` (wrap the existing promo button). The
checkout itself stays available; only the discount action is gated.

## Testing

- **`staff.permissionsFor`** (convex-test): owner → all flags true; a cashier with
  `{ canViewReports: true }` → that flag true, others false; role resolved;
  rejects/handles a foreign cashier id; owner-scoped.
- Frontend (`usePermissions`, `RequirePermission`, nav filter) validated by
  typecheck; the permission-resolution branch is the testable core (covered via
  the query test).

## i18n

New Bahasa Indonesia strings (`Anda tidak punya akses ke halaman ini.`,
`Kembali ke kasir`, etc.); fill the `en` catalog.

## Conventions

- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`;
  confirm `git status` is clean before push.
- Do NOT run `convex codegen` — `staff` is already registered; `permissionsFor` is
  a new export in it, no `api.d.ts` change. No new route → no `routeTree.gen.ts`.
- Small conventional commits; PR → review → merge commit.

## Out of scope

- Server-side permission enforcement (auth is the owner account — not changed
  here); a `canManageSettings` flag (settings gated by role); a void UI;
  per-route audit of permission denials.
