# Multi-outlet v1 — Manager back-office access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a manager owner-like **back-office** access for their assigned outlet (reports, menu, inventory, customers, and per-outlet settings: profile/tax/receipt/staff/general), while keeping business-level surfaces (the Members page, Add-outlet, and Settings → Integrations) owner-only.

**Architecture:** The server already scopes per-outlet back-office mutations with `requireActiveOutlet` (manager-allowed) and business-level ones with `requireBusinessOwner` (owner-only) — except the Integrations *config* mutations, which use `requireActiveOutlet` and must move to `requireBusinessOwner` to become genuinely owner-only. The rest is a client gating change: broaden `usePermissions().can()` so a signed-in business member (owner or manager) has back-office capability, relax the blanket `RequirePermission owner` on the `/settings` layout, and gate only the owner-only surfaces (Members + Integrations) per-item.

**Tech Stack:** Convex (mutation auth gates), convex-test + Vitest, React + TanStack Router, shadcn sidebar, Lingui i18n.

## Global Constraints

- **Decision (owner-only set):** Members page + Add-outlet + Settings→Integrations stay owner-only. Everything else in the back office is manager-allowed for their active outlet.
- **Do NOT touch sale-time payment flows:** `convex/payments/qrisDynamic.ts`'s `requireActiveOutlet` calls are the dynamic-QRIS *payment* path used by cashiers at sale time — leave them unchanged. Only the Integrations *config* mutations in `convex/settings.ts` change.
- **Do NOT gate the shared read:** `api.settings.get` is read by every settings page (profile/tax/receipt/integrations); leave it on `requireActiveOutlet`. (It returns connected-state, not raw provider secrets — those are server-only via `qrisDynamic.assertQrisConnected`.)
- **Convex function syntax:** new-style validators; read `convex/_generated/ai/guidelines.md` before editing Convex code.
- **`requireBusinessOwner(ctx)`** (Phase 2, `convex/lib/auth.ts`) returns `{ userId, cafeId, businessId, role:'owner' }` and throws `'owner access required'` for non-owners — so `const { cafeId } = await requireBusinessOwner(ctx)` is a drop-in for `requireActiveOutlet` where owner-only is wanted.
- **`usePermissions`** (`src/lib/permissions.ts`): `isOwner` = the business-member owner role (`myCafe.role === 'owner'`, set in Phase 4). `can(p)` currently falls back to `isAccountOwner` when no cashier is active.
- **Quality gate before every commit:** `pnpm typecheck` and `pnpm test` (currently 946 tests).
- **i18n (if any new copy):** Indonesian source via `<Trans>`; `pnpm lingui:extract` → fill English `msgstr` → `pnpm lingui:compile`. No em-dash/`--`. (This slice likely adds no new strings.)
- **No new automated tests for the client task** (no React test harness) — verified by typecheck + a manual visual gate.

---

### Task 1: Integrations config → owner-only (server)

**Files:**
- Modify: `convex/settings.ts` (the 5 integration config mutations: `connectIntegration`, `connectQrisProvider`, `connectWhatsapp`, `connectAi`, `disconnectIntegration`)
- Test: `tests/convex/integrations-auth.test.ts` (create)

**Interfaces:**
- Consumes: `requireBusinessOwner` (Phase 2).
- Produces: the 5 integration config mutations throw `'owner access required'` for a manager; an owner configures their active outlet's integrations as before. No signature/return changes.

- [ ] **Step 1: Write the failing test**

Create `tests/convex/integrations-auth.test.ts`. (Verify the exact arg shapes of `connectQrisProvider`/`disconnectIntegration` against `convex/settings.ts` before running — the calls below use the minimal documented args; adjust to the real validators.)

```typescript
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function seedOwnerWithManager(t: ReturnType<typeof convexTest>) {
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' }));
  const asOwner = t.withIdentity({ subject: `${ownerId}|test_session` });
  const cafeId = await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const businessId = (await t.run((ctx) => ctx.db.get(cafeId as Id<'cafes'>)))!.businessId as Id<'businesses'>;
  const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'm@x.com' }));
  const mgrMemberId = await t.run((ctx) =>
    ctx.db.insert('businessMembers', { businessId, userId: mgrUserId, role: 'manager', createdAt: 5 })
  );
  await t.run((ctx) =>
    ctx.db.insert('memberOutletAccess', { businessMemberId: mgrMemberId, cafeId: cafeId as Id<'cafes'>, createdAt: 5 })
  );
  const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });
  return { asOwner, asMgr };
}

describe('integration config is owner-only', () => {
  it('rejects a manager from disconnectIntegration', async () => {
    const t = convexTest(schema, modules);
    const { asMgr } = await seedOwnerWithManager(t);
    await expect(
      asMgr.mutation(api.settings.disconnectIntegration, { key: 'qris' })
    ).rejects.toThrow('owner access required');
  });

  it('allows the owner to connect a QRIS provider', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedOwnerWithManager(t);
    // Should NOT throw an auth error (it may succeed or fail on provider
    // validation, but never 'owner access required').
    await asOwner.mutation(api.settings.disconnectIntegration, { key: 'qris' });
  });
});
```

> The exact `key`/arg validators for `disconnectIntegration` (and the other four) are in `convex/settings.ts` — read them and make the test calls valid. The point of the test is the auth gate (manager rejected, owner not auth-rejected), so pick the cheapest valid mutation to assert it (`disconnectIntegration` is simplest). Add an owner+manager case for at least `disconnectIntegration`; the other four share the identical gate line, so one representative auth test plus a code check suffices.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/convex/integrations-auth.test.ts`
Expected: FAIL — the manager call currently succeeds (gate is `requireActiveOutlet`), so `rejects.toThrow('owner access required')` fails.

- [ ] **Step 3: Swap the gate in the 5 integration config mutations**

In `convex/settings.ts`, add `requireBusinessOwner` to the auth import (it currently imports `requireActiveOutlet`):

```typescript
import { requireActiveOutlet, requireBusinessOwner } from './lib/auth';
```

Then in EACH of the five handlers — `connectIntegration` (~line 321), `connectQrisProvider` (~341), `connectWhatsapp` (~370), `connectAi` (~402), `disconnectIntegration` (~427) — change the first line from:

```typescript
    const { cafeId } = await requireActiveOutlet(ctx);
```
to:
```typescript
    const { cafeId } = await requireBusinessOwner(ctx);
```

Do NOT change any other `requireActiveOutlet` call in `settings.ts` (the profile/tax/receipt/general mutations at lines ~138/245/256/284/304 stay manager-allowed) and do NOT touch `convex/payments/qrisDynamic.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/convex/integrations-auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: all green. Existing settings tests use an owner identity, so the gate swap doesn't break them.

- [ ] **Step 6: Commit**

```bash
git add convex/settings.ts tests/convex/integrations-auth.test.ts
git commit -m "feat(multi-outlet): integration config is owner-only (requireBusinessOwner)"
```

---

### Task 2: Manager back-office in the client (permissions + nav + page gates)

**Files:**
- Modify: `src/lib/permissions.ts` (broaden `can()` fallback to any business member)
- Modify: `src/components/app-shared.tsx` (Settings parent no longer `requires:'owner'`; tag Members + Integrations sub-items `requires:'owner'`)
- Modify: `src/components/app-sidebar.tsx` (filter `subItems` by their `requires`)
- Modify: `src/routes/_pos/settings/route.tsx` (drop the blanket `RequirePermission owner`)
- Modify: `src/routes/_pos/settings/integrations.tsx` (wrap page content in `RequirePermission owner`)
- Modify: `src/routes/_pos/settings/members.tsx` (wrap page content in `RequirePermission owner`)

**Interfaces:**
- Consumes: `usePermissions()` (`can`, `isOwner`); `RequirePermission` (`{ perm?, owner?, children }`); the nav `allowed()` helper.
- Produces: a manager sees the back-office nav (Dashboard/reports, menu, inventory, customers/loyalty) and the Settings group with profile/tax/receipt/staff/general — but NOT Members or Integrations; an owner sees everything (unchanged).

- [ ] **Step 1: Broaden `can()` to business members**

In `src/lib/permissions.ts`, the signed-in account is a business member (owner OR manager) whenever `myCafe` resolves. A member has owner-like back-office capability when no cashier is PIN-active. Change the fallback in `can` from `isAccountOwner` to a member check, leaving `isOwner` (the business-owner gate) as-is:

```typescript
  const cafe = useQuery(api.cafes.myCafe, {});
  const isAccountOwner = cafe?.role === 'owner';
  // A signed-in business member (owner OR manager) has owner-like back-office
  // capability for their active outlet. When a cashier is PIN-active, the
  // cashier's role/permissions still drive the operational register UI.
  const isAccountMember = cafe != null;
  return {
    can: (p) => (data ? data.role === 'owner' || data.permissions[p] : isAccountMember),
    isOwner: isAccountOwner || data?.role === 'owner',
    isLoading: cafe === undefined || (cashierId !== null && data === undefined),
  };
```

(Only the `can` fallback changes — `isAccountOwner` → `isAccountMember`. `isOwner` is untouched.)

- [ ] **Step 2: Re-tag the Settings nav so managers see it, but Members + Integrations stay owner-only**

In `src/components/app-shared.tsx`, in the `Pengaturan` (Settings) nav item: **remove** `requires: 'owner'` from the PARENT item, and add `requires: 'owner'` to the `Staf`? NO — only the owner-only sub-items. Update the `subItems` array so `Integrasi` and the `Tim` (Members) entries carry `requires: 'owner'`; the others (`Umum`, `Profil`, `Staf`, `Pajak & Pembayaran`, `Struk & Printer`) carry none:

```tsx
    {
      label: msg`Akun`,
      items: [
        {
          title: msg`Pengaturan`,
          icon: <Settings />,
          // (no `requires` here — managers reach per-outlet settings; owner-only
          // sub-items are gated individually below)
          subItems: [
            { title: msg`Umum`, path: "/settings/general" },
            { title: msg`Profil`, path: "/settings/profile" },
            { title: msg`Staf`, path: "/settings/staff" },
            { title: msg`Pajak & Pembayaran`, path: "/settings/tax" },
            { title: msg`Struk & Printer`, path: "/settings/receipt" },
            { title: msg`Integrasi`, path: "/settings/integrations", requires: 'owner' },
            { title: msg`Tim`, path: "/settings/members", requires: 'owner' },
          ],
        },
      ],
    },
```

(Confirm the `SidebarNavItem` type allows `requires` on sub-items — it is the same item type; `requires` is already an optional field on it. The exact current order of sub-items may differ; preserve it and only (a) drop the parent `requires` and (b) add `requires: 'owner'` to `Integrasi` and `Tim`.)

- [ ] **Step 3: Filter sub-items by their `requires` in the sidebar**

In `src/components/app-sidebar.tsx`, the current `visibleGroups` filters only top-level `items` by `allowed(it.requires)`. Extend it to also filter each item's `subItems`:

```tsx
	const visibleGroups = navGroups
		.map((g) => ({
			...g,
			items: g.items
				.filter((it) => allowed(it.requires))
				.map((it) =>
					it.subItems
						? { ...it, subItems: it.subItems.filter((s) => allowed(s.requires)) }
						: it
				),
		}))
		.filter((g) => g.items.length > 0);
```

(`allowed` already handles `requires === 'owner'` → `isOwner` and other perms → `can()`. The Settings parent now has no `requires` so it passes; its owner-only sub-items are dropped for managers.)

- [ ] **Step 4: Relax the settings layout guard; gate the two owner-only pages**

In `src/routes/_pos/settings/route.tsx`, remove the blanket owner gate so managers can reach per-outlet settings — render the `Outlet` without `RequirePermission owner`:

```tsx
function SettingsLayout() {
  return (
    <div className="p-6">
      <Outlet />
    </div>
  );
}
```

(Drop the now-unused `RequirePermission` import from this file.)

Then defend the two owner-only pages directly (the nav hides them from managers, but a manager could still type the URL; the server already rejects their writes, and these guards make the UI honest). In `src/routes/_pos/settings/members.tsx`, wrap the page's rendered content in `<RequirePermission owner>...</RequirePermission>` (import it from `~/components/permission/require-permission`). Do the same in `src/routes/_pos/settings/integrations.tsx`. Match the existing `RequirePermission` usage pattern (e.g. how `/dashboard` wraps with `perm="canViewReports"`), using the `owner` prop.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (Catches a dropped/needed import or a `requires` typo.)

- [ ] **Step 6: i18n (only if new strings were added)**

This task adds no new user-facing copy (it re-gates existing items/pages). If `RequirePermission owner`'s fallback renders any new string, run `pnpm lingui:extract`, fill English in `src/locales/en/messages.po`, and `pnpm lingui:compile`. Otherwise skip. (`RequirePermission` already exists and ships its own copy.)

- [ ] **Step 7: Visual verification (manual gate)**

In a running dev env:
- **As an owner:** the sidebar and Settings menu are unchanged — all sub-items incl. Integrasi + Tim visible; everything works.
- **As a manager** (invited via Phase 4, signed in, scoped to a granted outlet): the sidebar shows back-office (Dasbor/reports, menu, inventory, customers/loyalty) and the Settings menu with Umum/Profil/Staf/Pajak/Struk — but NOT Integrasi or Tim. Opening Profil/Tax/Receipt/Staff lets them view+edit their active outlet. Typing `/settings/members` or `/settings/integrations` directly shows the owner-only fallback (not the page). The outlet switcher shows only their granted outlets and no "Add outlet".
- Check light + dark.

- [ ] **Step 8: Commit**

```bash
git add src/lib/permissions.ts src/components/app-shared.tsx src/components/app-sidebar.tsx src/routes/_pos/settings/route.tsx src/routes/_pos/settings/members.tsx src/routes/_pos/settings/integrations.tsx
git commit -m "feat(multi-outlet): managers get back-office access; members + integrations stay owner-only"
```

---

## Self-Review

**Goal coverage:**
- Manager gets back-office (reports/menu/inventory/customers + per-outlet settings) → `can()` broadened (Task 2 Step 1) + Settings parent un-gated + sub-items filtered (Steps 2-3) + settings layout guard relaxed (Step 4). ✓
- Members + Integrations stay owner-only → sub-items tagged `requires:'owner'` (hidden in nav) + per-page `RequirePermission owner` (Step 4) + Integrations config server-gated with `requireBusinessOwner` (Task 1). ✓
- Add-outlet stays owner-only → unchanged (`OutletSwitcher` gates it on `isOwner`; `createOutlet` is `requireBusinessOwner`). ✓
- Owner experience unchanged → `isOwner` untouched; owners pass every gate as before. ✓

**Why no server changes beyond Integrations:** the per-outlet settings/menu/inventory mutations already use `requireActiveOutlet`, which resolves a manager's active outlet — so managers can already edit their outlet server-side; only the client was hiding it. Members mutations already use `requireBusinessOwner`. Only Integrations config was the gap (it used `requireActiveOutlet`), fixed in Task 1.

**Placeholder scan:** Task 1 has a concrete test with a verify-the-args note (the gate line is identical across the 5 mutations, so one representative auth test + the code change covers them). Task 2 is concrete edits with exact before/after.

**Type consistency:** `requires: 'owner'` is the existing `SidebarNavItem` field used by `allowed()`. `isAccountMember`/`can` changes are local to `permissions.ts`. `RequirePermission` `owner` prop matches its existing API.

**Risk / regression watch:** `can()` is consumed broadly. The only change is the no-cashier fallback (`isAccountOwner` → `isAccountMember`); owners are members too, so owner behavior is identical, and the operational register path (cashier active → `data` drives `can`) is unchanged. The full suite + the manual visual gate (owner unchanged; manager sees the right surfaces) are the safety net.

---

## Done

This completes the spec §7 manager-back-office intent deferred from Phase 4. With it, multi-outlet v1 fully matches the design: owners run the business and all outlets; managers operate and configure their assigned outlets' back office, but cannot manage members, add outlets, or change integrations.
