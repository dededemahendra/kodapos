# Multi-outlet v1 — Design

**Date:** 2026-06-21
**Status:** Approved design, pending implementation plan
**Scope:** Let one business own and operate multiple outlets, with owner + manager
logins, an outlet switcher, and consolidated cross-outlet reporting.

---

## 1. Summary

Today kodapos is single-tenant per **cafe**: `cafeId` scopes all 36 domain tables,
and `requireOwnerCafe(ctx)` resolves *the* one cafe for the authenticated owner
(`.first()` by `ownerUserId`, ~230 call sites). A "cafe" already carries only
single-location attributes (address, hours, timezone, tax, QRIS, logo), so **a
cafe is already an outlet**.

Multi-outlet v1 therefore does **not** require an `outletId` migration across every
table. Instead it adds a **business** grouping above cafes, a **membership** layer
(owner / manager Convex Auth accounts), an **active-outlet** resolution that
replaces the one-cafe-per-owner assumption, an **outlet switcher**, and
**consolidated reporting**.

### Decisions locked in

- **Independent outlets** — each outlet keeps its own menu, customers, loyalty,
  staff, and inventory (today's per-cafe isolation is unchanged).
- **Managers with subset access** — a business has multiple logins: the owner
  (all outlets) and managers (a granted subset).
- **Server-resolved active outlet** (Approach 1) — the active outlet is stored
  server-side and resolved by one auth helper, so the ~230 existing call sites are
  untouched. (Rejected: passing `cafeId` through every call; owner-only without a
  membership model.)
- **Stock transfer deferred to v2.**

---

## 2. Goals / Non-goals

### Goals (v1)
1. A business can have N outlets (cafes).
2. The owner can switch between, operate, and report across all their outlets.
3. The owner can invite **managers** (their own logins) with access to a subset of
   outlets.
4. Consolidated cross-outlet reporting (per-outlet breakdown + totals).
5. Existing single-cafe owners are migrated transparently with zero UX change.

### Non-goals (v2+)
- Stock transfer between outlets (needs cross-catalog ingredient matching).
- Shared menu / customers / loyalty across outlets.
- A single user belonging to multiple businesses.
- Fine-grained per-action manager permissions (v1: a manager is an outlet admin
  for their assigned outlets).

---

## 3. Current state (findings)

- **Cafe == outlet.** `cafes` + `cafeSettings` carry only single-location fields;
  no business-level field exists.
- **`cafeId` is the universal tenant key** on 36 tables; all data is already
  per-cafe isolated. No cross-cafe queries exist.
- **One-cafe-per-owner is app-enforced, not schema-enforced.** `requireOwnerCafe`
  uses `.first()` by `ownerUserId`; `createForOwner` is idempotent (returns the
  existing cafe). The schema permits multiple cafes per owner.
- **No client-side outlet selection** exists. `cafeId` is always resolved
  server-side from the authed user. (`active-cashier` localStorage is PIN-cashier
  selection, unrelated.)
- **Staff are per-cafe** (`cafeStaff`, role owner/cashier, PIN). No cross-cafe
  staff. Register operation uses PIN cashiers.

---

## 4. Data model

### New tables

```
businesses
  name: string
  ownerUserId: Id<'users'>
  createdAt: number
  index by_owner ['ownerUserId']

businessMembers           // a Convex Auth account's membership in a business
  businessId: Id<'businesses'>
  userId: Id<'users'>
  role: 'owner' | 'manager'
  createdAt: number
  index by_business ['businessId']
  index by_user ['userId']

businessInvites           // pending manager invite (before they have an account)
  businessId: Id<'businesses'>
  email: string           // normalized lowercase
  role: 'manager'
  cafeIds: Id<'cafes'>[]   // outlets to grant on acceptance
  createdAt: number
  index by_email ['email']
  index by_business ['businessId']

memberOutletAccess        // which outlets a MANAGER may access (owner = all)
  businessMemberId: Id<'businessMembers'>
  cafeId: Id<'cafes'>
  createdAt: number
  index by_member ['businessMemberId']
  index by_cafe ['cafeId']

activeOutlet              // the outlet a user is currently operating (1 per user)
  userId: Id<'users'>
  cafeId: Id<'cafes'>
  updatedAt: number
  index by_user ['userId']
```

### Changed table

```
cafes
  + businessId: Id<'businesses'>
  + index by_business ['businessId']
  (ownerUserId retained; all other fields unchanged)
```

**Invariants**
- Every `cafe` belongs to exactly one `business`.
- A user has at most one `businessMembers` row (v1: one business per user).
- The business owner has a `businessMembers` row with `role: 'owner'`.
- Owners implicitly access all outlets in their business (no `memberOutletAccess`
  rows). Managers access only their `memberOutletAccess` outlets.

---

## 5. Auth resolution (the central change)

Rename/repurpose `requireOwnerCafe` → **`requireActiveOutlet(ctx)`**, returning a
**superset** of today's shape so the ~230 existing destructures of `{ cafeId }`
keep working unchanged:

```
requireActiveOutlet(ctx) -> { userId, cafeId, businessId, role }
  1. userId = getAuthUserId(ctx)            // throw if unauthenticated
  2. member = businessMembers by_user(userId).first()   // throw if none
  3. accessible =
       role === 'owner'  -> cafes by_business(member.businessId)
       role === 'manager'-> memberOutletAccess by_member(member._id) -> cafeIds
  4. active = activeOutlet by_user(userId)
       if active and active.cafeId in accessible -> cafeId = active.cafeId
       else cafeId = accessible[0]   // ephemeral default (helper never writes)
       if accessible is empty -> throw 'no outlet access'
  5. return { userId, cafeId, businessId: member.businessId, role }
```

`requireActiveOutlet` runs in both queries and mutations, so it **never writes**.
The default (first accessible outlet) is computed per call; only the explicit
`setActiveOutlet` mutation (§6) persists the choice.

Add **`requireBusinessOwner(ctx)`** (role === 'owner') for owner-only operations:
manage members, add/remove outlets, business-level settings.

**Compatibility:** existing call sites use the returned `cafeId` exactly as before;
the helper now guarantees the cafeId is one the user may access. New fields are
additive.

**Performance:** the helper does ~2–3 extra reads (membership, access, active
outlet) per call. Acceptable; revisit with a request-scoped memo if needed.

---

## 6. Outlet switcher + active outlet

- **`myOutlets` query** → `[{ cafeId, name, isActive }]` for the switcher (the
  user's accessible outlets).
- **`setActiveOutlet({ cafeId })` mutation** → validate the user may access
  `cafeId`, upsert `activeOutlet`. Convex reactivity re-runs every active-outlet
  query, re-scoping the whole app to the new outlet.
- **`createOutlet({ name })` mutation** (owner only) → insert a `cafe` under the
  business + owner `cafeStaff` row (mirroring `createForOwner`'s per-cafe setup),
  then the owner configures it through the existing settings/onboarding screens.

**UI**
- An **outlet switcher** in the sidebar header next to the brand mark: a dropdown
  of accessible outlets; selecting one calls `setActiveOutlet`.
- Owner-only **"Add outlet"** entry in the switcher.
- An **"All outlets"** entry → the consolidated dashboard (§8), read-only across
  outlets. Per-outlet operations require selecting a specific outlet.

---

## 7. Membership & managers

- **Invite:** owner calls `inviteManager({ email, cafeIds })` → upsert
  `businessInvites` (normalized email). Owner-only.
- **Acceptance:** mirror the existing post-auth bootstrap (the signup flow already
  calls `createForOwner` after auth). The client calls an `acceptPendingInvites`
  mutation after sign-in; it checks `businessInvites by_email(user.email)`, and for
  each pending invite creates `businessMembers (role: 'manager')` +
  `memberOutletAccess` rows for `cafeIds`, then deletes the invite. Idempotent and
  safe to retry. (v1: if the user already has a membership, the invite is left
  pending and surfaced to the owner — one business per user.)
- **Members UI** (owner): list members + pending invites; invite; assign/unassign
  outlets for a manager; revoke a member (deletes membership + access rows).
- **Manager scope:** within an assigned outlet a manager has owner-like back-office
  capability (reports, menu, settings, inventory, etc.). Register operation still
  uses per-outlet **PIN cashiers** (`cafeStaff`) — unchanged. A manager who works a
  register is given a `cafeStaff` PIN at that outlet like any cashier.
- **No-access state:** an authenticated user with no membership and no invite sees
  a "no access / contact the owner" screen (not the onboarding flow).

---

## 8. Consolidated reporting

- New **business-level queries** (e.g. `reports.businessOverview({ range })`):
  resolve accessible outlets (owner: all; manager: subset), run the existing
  per-cafe report computation for each, and return **per-outlet rows + combined
  totals**. v1 metrics: revenue, orders, average order value, items sold (the
  existing overview set), per outlet and summed.
- **UI:** the "All outlets" dashboard shows a KPI summary (combined) and a
  per-outlet comparison table. Reuses existing chart/stat components.
- Existing per-outlet reports are unchanged (they run against the active outlet).

---

## 9. Migration / backward compatibility

- **Backfill migration** (idempotent): for each existing `cafe` lacking a
  `businessId`: create a `business` (`ownerUserId = cafe.ownerUserId`,
  `name = cafe.name`), set `cafe.businessId`, create a `businessMembers` owner row,
  and seed `activeOutlet` for the owner to that cafe. Skip cafes already migrated.
- **`createForOwner` evolves:** creating a user's first cafe also creates the
  business + owner membership (so new signups land in the new model).
- **Schema rollout:** add `businessId` as optional, run the backfill, then treat it
  as required in code (all new cafes set it). Use the project's Convex migration
  pattern.
- **Existing single-cafe owners:** zero UX change — the switcher shows one outlet,
  active = that outlet, everything resolves as before.

---

## 10. Testing

Convex tests:
- `requireActiveOutlet`: owner all-access; manager subset; default-to-first;
  access-denied for a non-accessible active outlet; throws with no membership.
- `setActiveOutlet`: rejects an outlet the user can't access; upserts correctly.
- `createOutlet` / `createForOwner`: business + membership created; idempotency.
- Invite → accept: membership + access created from a pending invite; one-business
  guard.
- `requireBusinessOwner`: managers rejected from owner-only ops.
- Consolidated reporting: aggregation equals the sum of per-outlet computations.
- Migration backfill: idempotent; every cafe ends with a business + owner member +
  seeded active outlet.
- **Regression:** existing per-cafe tests stay green (helper still returns
  `cafeId`).

---

## 11. Build sequence (for the implementation plan)

1. **Schema + migration** — new tables, `cafes.businessId`, backfill, evolve
   `createForOwner`. Existing app keeps working (single outlet each).
2. **Active-outlet resolution** — `requireActiveOutlet` + `requireBusinessOwner`;
   swap the helper at the 230 call sites (mechanical rename, superset return).
3. **Outlet switcher** — `myOutlets`, `setActiveOutlet`, `createOutlet`, switcher
   UI + "Add outlet".
4. **Membership & managers** — invites, accept-on-auth hook, members UI, no-access
   state, owner-only gating.
5. **Consolidated reporting** — business-level queries + "All outlets" dashboard.

Each step is independently shippable and leaves the app green.

---

## 12. Open questions

None blocking. Deferred to v2: stock transfer, shared catalog/loyalty,
multi-business users, granular manager permissions.
