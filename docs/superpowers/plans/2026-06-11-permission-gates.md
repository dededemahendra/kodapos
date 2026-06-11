# UI Permission Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the `cafeStaff` permission flags (+ owner-only Settings) on the client — hide nav entries and guard routes/actions the active cashier lacks.

**Architecture:** A `staff.permissionsFor` query resolves the active cashier's role + flags; a `usePermissions` hook exposes `can(perm)`/`isOwner`/`isLoading`; a `<RequirePermission>` guard wraps route-group layouts + flat routes; the sidebar filters nav entries by a `requires` tag; the checkout discount action is gated. Client-side UI gating (auth stays the owner account).

**Tech Stack:** Convex (query), TanStack Start + React, Lingui, shadcn (Empty/Spinner), Vitest + convex-test.

**Spec:** `docs/superpowers/specs/2026-06-11-permission-gates-design.md`

**Branch:** `feat/permission-gates` (already created off `main`, spec committed).

**Conventions:**
- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; confirm `git status` clean.
- Do NOT run `convex codegen` (`staff` already registered; `permissionsFor` is a new export, no api.d.ts change). No new route → no `routeTree.gen.ts` change.
- New UI strings via Lingui; fill `en`.
- Small conventional commits per task.

---

## Task 1: `staff.permissionsFor` query

**Files:**
- Modify: `convex/staff.ts`
- Test: `tests/convex/staff.test.ts` (create if absent)

- [ ] **Step 1: Add `permissionsFor` to `convex/staff.ts`**

`permissionsValidator` (`{canVoid,canDiscount,canManageShift,canViewReports,canEditMenu}`) and `requireOwnerCafe` already exist in the file.
```ts
const ALL_TRUE = { canVoid: true, canDiscount: true, canManageShift: true, canViewReports: true, canEditMenu: true };
const ALL_FALSE = { canVoid: false, canDiscount: false, canManageShift: false, canViewReports: false, canEditMenu: false };

export const permissionsFor = query({
  args: { cashierId: v.id('cafeStaff') },
  returns: v.object({
    role: v.union(v.literal('owner'), v.literal('cashier')),
    permissions: permissionsValidator,
  }),
  handler: async (ctx, { cashierId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const staff = await ctx.db.get(cashierId);
    if (!staff || staff.cafeId !== cafeId) throw new Error('Kasir tidak ditemukan.');
    return {
      role: staff.role,
      permissions: staff.role === 'owner' ? ALL_TRUE : { ...ALL_FALSE, ...(staff.permissions ?? {}) },
    };
  },
});
```

- [ ] **Step 2: Tests `tests/convex/staff.test.ts`**

Inline-copy `setup()` from `orders.test.ts` (it creates an owner + a cashier `cashierId`). Read `setup()` to confirm `cashierId`'s role (it's created via `api.staff.create` → role `'cashier'`). Add:
```ts
describe('staff.permissionsFor', () => {
  it('owner gets all flags true', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    const ownerStaff = (await asOwner.query(api.staff.list, {})).find((s) => s.role === 'owner');
    const res = await asOwner.query(api.staff.permissionsFor, { cashierId: ownerStaff!._id });
    expect(res.role).toBe('owner');
    expect(res.permissions).toEqual({ canVoid: true, canDiscount: true, canManageShift: true, canViewReports: true, canEditMenu: true });
  });

  it('cashier gets only their set flags; rest false', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    await asOwner.mutation(api.staff.setPermissions, {
      id: cashierId,
      permissions: { canVoid: false, canDiscount: true, canManageShift: false, canViewReports: true, canEditMenu: false },
    });
    const res = await asOwner.query(api.staff.permissionsFor, { cashierId });
    expect(res.role).toBe('cashier');
    expect(res.permissions.canViewReports).toBe(true);
    expect(res.permissions.canDiscount).toBe(true);
    expect(res.permissions.canEditMenu).toBe(false);
  });

  it('a cashier with no permissions set is all-false', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    const res = await asOwner.query(api.staff.permissionsFor, { cashierId });
    expect(res.permissions.canViewReports).toBe(false);
  });
});
```
(Confirm `setup()` returns `cashierId`; confirm `api.staff.setPermissions` arg shape. Run `pnpm test tests/convex/staff.test.ts` → PASS.)

- [ ] **Step 3: Verify + commit**
`pnpm typecheck`, full `pnpm test`.
```bash
git add convex/staff.ts tests/convex/staff.test.ts
git commit -m "feat(staff): permissionsFor query (resolved role + flags)"
```

---

## Task 2: `usePermissions` hook + `RequirePermission` guard

**Files:**
- Create: `src/lib/permissions.ts`
- Create: `src/components/permission/require-permission.tsx`

- [ ] **Step 1: `src/lib/permissions.ts`**
```ts
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { useActiveCashier } from './active-cashier';

export type Permission = 'canVoid' | 'canDiscount' | 'canManageShift' | 'canViewReports' | 'canEditMenu';

export function usePermissions(): {
  can: (p: Permission) => boolean;
  isOwner: boolean;
  isLoading: boolean;
} {
  const { cashierId } = useActiveCashier();
  const data = useQuery(api.staff.permissionsFor, cashierId ? { cashierId } : 'skip');
  return {
    can: (p) => (data ? data.role === 'owner' || data.permissions[p] : false),
    isOwner: data?.role === 'owner',
    isLoading: cashierId !== null && data === undefined,
  };
}
```

- [ ] **Step 2: `src/components/permission/require-permission.tsx`**

Read `src/components/ui/empty.tsx` to confirm the exported parts (`Empty`, `EmptyHeader`, `EmptyMedia`, `EmptyTitle`, and whether `EmptyDescription` exists — if not, use a `<p>` for the description).
```tsx
import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '~/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import { type Permission, usePermissions } from '~/lib/permissions';

export function RequirePermission({
  perm, owner, children,
}: { perm?: Permission; owner?: boolean; children: ReactNode }) {
  const { can, isOwner, isLoading } = usePermissions();
  if (isLoading) {
    return <div className="flex justify-center py-12 text-muted-foreground"><Spinner /></div>;
  }
  const allowed = owner ? isOwner : perm ? can(perm) : true;
  if (!allowed) {
    return (
      <div className="p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Lock /></EmptyMedia>
            <EmptyTitle><Trans>Akses ditolak</Trans></EmptyTitle>
          </EmptyHeader>
          <p className="text-sm text-muted-foreground mb-3"><Trans>Anda tidak punya akses ke halaman ini.</Trans></p>
          <Button asChild variant="outline" size="sm"><Link to="/sale"><Trans>Kembali ke kasir</Trans></Link></Button>
        </Empty>
      </div>
    );
  }
  return <>{children}</>;
}
```

- [ ] **Step 3: Typecheck + commit**
`pnpm typecheck` (PASS).
```bash
git add src/lib/permissions.ts src/components/permission/require-permission.tsx
git commit -m "feat(staff): usePermissions hook + RequirePermission guard"
```

---

## Task 3: Nav filtering by permission

**Files:**
- Modify: `src/components/app-shared.tsx`
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Tag nav entries with `requires` in `app-shared.tsx`**

Import the type: `import type { Permission } from '~/lib/permissions';`. Extend the item type:
```ts
export type SidebarNavItem = {
  title: MessageDescriptor;
  path?: string;
  icon?: ReactNode;
  isActive?: boolean;
  subItems?: SidebarNavItem[];
  requires?: Permission | 'owner';
};
```
Tag entries in `navGroups` per the mapping:
- Operasional: `Dasbor` (`/dashboard`) → `requires: 'canViewReports'`; `Shift` (`/shifts`) → `'canViewReports'`. (Kasir, Riwayat: none.)
- Katalog: `Menu`, `Resep`, `Inventaris`, `Promo` → `requires: 'canEditMenu'` (on each top-level item; subItems inherit via the parent filter — see Step 2).
- Laporan: `Prediksi` (`/forecast`), `Laporan` (the reports parent) → `requires: 'canViewReports'`.
- Akun: `Pengaturan` → `requires: 'owner'`.
(Pelanggan/Loyalitas, footer links: none.)

- [ ] **Step 2: Filter in `app-sidebar.tsx`**

Add `import { usePermissions } from '~/lib/permissions';` and a filter applied before rendering:
```tsx
const { can, isOwner, isLoading } = usePermissions();
const allowed = (req?: SidebarNavItem['requires']) =>
  !req || isLoading || (req === 'owner' ? isOwner : can(req));
const visibleGroups = navGroups
  .map((g) => ({
    ...g,
    items: g.items.filter((it) => allowed(it.requires)),
  }))
  .filter((g) => g.items.length > 0);
// render visibleGroups instead of navGroups
```
While `isLoading`, `allowed` returns true (show everything; filter once known — avoids flicker). Items keep their `subItems` (a parent `requires` gates the whole subtree). Import `SidebarNavItem` type if needed for the param.

- [ ] **Step 3: Typecheck + commit**
`pnpm typecheck` (PASS).
```bash
git add src/components/app-shared.tsx src/components/app-sidebar.tsx
git commit -m "feat(staff): hide nav entries the active cashier can't access"
```

---

## Task 4: Route guards + checkout discount gate

**Files:**
- Modify: `src/routes/_pos/reports/route.tsx`, `menu/route.tsx`, `inventory/route.tsx`, `shift/route.tsx`, `settings/route.tsx`
- Modify: `src/routes/_pos/forecast.tsx`, `dashboard.tsx`, `shifts.tsx`, `recipes.tsx`, `suppliers.tsx`, `promos.tsx`
- Modify: `src/components/sale/cart-pane.tsx`

- [ ] **Step 1: Wrap the route-group layouts**

In each layout's component, wrap the rendered content with `<RequirePermission>`. For `reports/route.tsx`, wrap the inner content (keep the `RangePicker`/tabs inside the guard so the whole reports area is gated):
```tsx
import { RequirePermission } from '~/components/permission/require-permission';
// ReportsLayout return:
return (
  <RequirePermission perm="canViewReports">
    <main className="p-6">
      {/* existing PageHeader + RangePicker + tabs + <Outlet/> */}
    </main>
  </RequirePermission>
);
```
Do the same for: `menu/route.tsx` → `perm="canEditMenu"`; `inventory/route.tsx` → `perm="canEditMenu"`; `shift/route.tsx` → `perm="canManageShift"`; `settings/route.tsx` → `owner`. (Wrap each layout's top-level returned element.)

- [ ] **Step 2: Wrap the flat routes**

For each flat route's component, wrap its returned element with `<RequirePermission perm="...">`:
- `forecast.tsx`, `dashboard.tsx`, `shifts.tsx` → `perm="canViewReports"`
- `recipes.tsx`, `suppliers.tsx`, `promos.tsx` → `perm="canEditMenu"`
Example for `forecast.tsx`:
```tsx
import { RequirePermission } from '~/components/permission/require-permission';
// wrap the component's root return:
return <RequirePermission perm="canViewReports">{/* existing content */}</RequirePermission>;
```
If a route component has early returns (loading/empty), wrap at the OUTERMOST render — simplest is to rename the existing component to `XInner` and add a thin exported component that returns `<RequirePermission ...><XInner/></RequirePermission>`, wiring `Route.component` to the wrapper. Use whichever keeps hooks order stable (the wrapper approach is safest).

- [ ] **Step 3: Gate the checkout discount action in `cart-pane.tsx`**

Read `cart-pane.tsx` — it has `onAddPromo`/`onRemovePromo` and renders a promo/add affordance. Gate the **add-promo** control behind `canDiscount`:
```tsx
import { usePermissions } from '~/lib/permissions';
// inside CartPane:
const { can } = usePermissions();
// where the "add promo" button renders, guard it:
{can('canDiscount') ? (/* existing add-promo button */) : null}
```
(Leave an already-applied promo's display/remove visible; only gate the ability to ADD a discount. If removing should also be gated, gate both — but adding is the key action.) If the promo button lives in a different component, gate it there.

- [ ] **Step 4: Typecheck + commit**
`pnpm typecheck` (PASS), `pnpm test` (no regressions).
```bash
git add src/routes/_pos/reports/route.tsx src/routes/_pos/menu/route.tsx src/routes/_pos/inventory/route.tsx src/routes/_pos/shift/route.tsx src/routes/_pos/settings/route.tsx src/routes/_pos/forecast.tsx src/routes/_pos/dashboard.tsx src/routes/_pos/shifts.tsx src/routes/_pos/recipes.tsx src/routes/_pos/suppliers.tsx src/routes/_pos/promos.tsx src/components/sale/cart-pane.tsx
git commit -m "feat(staff): guard gated routes + checkout discount by permission"
```

---

## Task 5: i18n + final verification

**Files:**
- Modify: `src/locales/en/messages.po`, `src/locales/id/messages.po`

- [ ] **Step 1: Extract + fill `en`**
Run `pnpm lingui:extract`. Fill `en` for new strings: `Akses ditolak` → "Access denied", `Anda tidak punya akses ke halaman ini.` → "You don't have access to this page.", `Kembali ke kasir` → "Back to register". Do NOT leave any new `msgstr` empty.

- [ ] **Step 2: Compile + verify 0 missing**
`pnpm lingui:compile`, then `pnpm lingui:extract` again → `en` 0 missing.

- [ ] **Step 3: Full gate + commit**
```bash
pnpm typecheck && pnpm test && pnpm lingui:compile
git add src/locales/en/messages.po src/locales/id/messages.po
git commit -m "i18n(staff): translate permission-gate strings"
```

---

## Self-review notes (addressed)

- **Spec coverage:** `permissionsFor` (T1), `usePermissions` + `RequirePermission` (T2), nav filtering (T3), route guards on 5 layouts + 6 flat routes + checkout discount gate (T4), i18n (T5). The mapping table is implemented across T3 (nav) + T4 (guards).
- **Type consistency:** `Permission` type defined in `src/lib/permissions.ts` (T2) and reused by `app-shared.tsx` `requires` (T3) + `RequirePermission` (T2) + `useCan` calls (T4). `permissionsFor` return shape (`{role, permissions}`) consumed by `usePermissions` (T2).
- **Loading/flicker:** nav shows all while `isLoading` then filters; guards show a spinner while loading (no denied flash).
- **Hooks stability (T4):** flat-route wrapping uses the inner-component pattern so `useQuery`/hooks order stays stable across the guard.
- **Client-side only:** no server enforcement change; `canVoid` ungated (no UI); owner always passes via `role === 'owner'`.
