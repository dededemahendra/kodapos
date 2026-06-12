# kodapos Authorization Flow

kodapos has **two independent identity layers**. Confusing them is the #1 cause of
unexpected "Akses ditolak / Access denied" screens. Read this before touching anything
permission-related.

---

## The two identities

### 1. Account identity — the signed-in owner (JWT)
- Established at **`/signin`** via Better Auth (`@convex-dev/auth`).
- One per device/browser session.
- On the **server**, every Convex query/mutation calls `requireOwnerCafe(ctx)`
  (`convex/lib/auth.ts`), which resolves `getAuthUserId` → the `cafes` row owned by that
  user → `cafeId`. **This is the only thing the server trusts.**
- The avatar menu's "Pemilik" label and `cafes.myCafe` come from THIS layer.

### 2. Operating identity — the active cashier (PIN)
- Established at **`/pin`**: pick a staff member from `staff.list` → enter their 4-digit PIN
  (`staff.verifyPin`) → `setCashier(id)` stores it in **`localStorage`**
  (`kodapos.activeCashierId`, see `src/lib/active-cashier.ts`).
- Represents **who is physically operating the register right now** — which can differ from
  the account that's signed in (a shared register: the owner signs in once, cashiers PIN in
  and out through the shift).
- **Every client-side UI gate uses THIS layer**, not the account.

```
Sign in (JWT)  ─────────────►  Account = OWNER        → server access (requireOwnerCafe)
     │
     ▼
Pick staff + PIN (/pin)  ───►  Active cashier (localStorage)  → ALL client UI gates
                                role: 'owner' | 'cashier'
                                permissions: { canVoid, canDiscount,
                                  canManageShift, canViewReports, canEditMenu }
```

---

## How a client gate decides (the important part)

`src/lib/permissions.ts`:

```ts
const { cashierId } = useActiveCashier();                          // localStorage
const data = useQuery(api.staff.permissionsFor, { cashierId });    // THAT cashier's role
can(p)   = data ? (data.role === 'owner' || data.permissions[p]) : false
isOwner  = data?.role === 'owner'
isLoading = cashierId !== null && data === undefined
```

`staff.permissionsFor` (`convex/staff.ts`): an `owner` role gets **all** permissions
(`ALL_TRUE`); a `cashier` gets only the flags toggled on their staff row.

### The gate matrix

| Gate | Passes when | Used by |
|---|---|---|
| `<RequirePermission owner>` | active cashier **role === 'owner'** | all of `/settings/*` (`settings/route.tsx`) |
| `<RequirePermission perm="canEditMenu">` | `can('canEditMenu')` | menu, recipes, inventory, promos, gift cards, purchase orders, **barcode labels** |
| `<RequirePermission perm="canViewReports">` | `can('canViewReports')` | dashboard, reports, forecast, shifts, **accounting export**, **other income** |
| nav item `requires: 'owner' \| <perm>` | same as above (or shown while `isLoading`) | `src/components/app-sidebar.tsx` `allowed()` |

**Key consequence:** a `cashier` can be granted `canEditMenu` + `canViewReports` and see most
of the sidebar, **but never reach `/settings`** — only the owner *role* satisfies the `owner`
gate. No permission flag unlocks it.

---

## Why "Access denied" on /settings while signed in as owner

Symptom: full owner sidebar visible, avatar says "Pemilik", but `/settings/profile` shows
**Access denied**.

Cause: you are **signed in** as the owner (account/JWT), but the **active cashier** on this
register is a non-owner cashier (or a different staff). `RequirePermission owner` checks the
active cashier's role — which is `'cashier'` — so it denies. The sidebar still shows catalog/
report items because that cashier has the `canEditMenu`/`canViewReports` permission flags.

This is **by design** (a manager-override pattern: owner-only pages require the owner to be
the one PIN'd in, not merely the owner's account to be signed in on the device).

### Fix
Go to **`/pin`** → choose **"Pemilik"** (sorted to the top) → enter the owner PIN. The active
cashier becomes the owner row → `isOwner` true → settings unlocks. (Or avatar → **Keluar** to
clear the cashier, then sign in + PIN as owner.)

### Edge cases that also deny
- **No active cashier** (`cashierId === null`, e.g. fresh browser, cleared storage): `isOwner`
  is false and not loading → denied. → PIN in.
- **Stale cashier id** (the staff row was archived/deleted): `staff.permissionsFor` throws
  `'Kasir tidak ditemukan.'` → surfaces as an error, not this page. → re-PIN.

---

## The public (unauthenticated) layer — a third surface

QR self-order (`convex/public.ts`) is the **only** path with **no identity** at all:
- `menuForTable` / `submitSelfOrder` / `selfOrderStatus` resolve the cafe **only** from an
  unguessable per-table `qrToken` (a capability), **never** call `requireOwnerCafe`, expose
  only sellable menu data, and recompute all prices server-side.
- A self-order is just a *request*; it becomes a real order only through the **authenticated**
  `selfOrders.accept` → register flow. No public path touches stock/payment/kitchen.

```
Anonymous customer ──(qrToken)──► public.* (no auth, server-priced) ──► selfOrders 'new'
                                                                            │
Staff (account+cashier) ──► /self-orders queue ──► Accept ──► /sale (authenticated) ──► ring
```

---

## Server vs client — what actually protects data

- **The server is the security boundary.** Every owner function is `requireOwnerCafe`-gated;
  every `requireOwned(ctx, cafeId, id, ...)` re-checks cafe ownership. A cashier role on the
  client does **not** loosen this — even if a client gate were bypassed, the server still
  authorizes against the **account** (JWT) cafe.
- **Client gates (`RequirePermission`, nav `requires`) are UX, not security.** They keep a
  cashier from wandering into owner screens on a shared register. Note: most *data* on those
  screens is still `requireOwnerCafe`-gated server-side, so the client gate is a usability/
  role-separation layer, not the thing keeping data safe.

> Implication when adding a page: pick the gate by the *operating role* that should use it
> (`owner` for configuration, `canEditMenu`/`canViewReports` for catalog/reports), and ALWAYS
> back it with the matching server-side `requireOwnerCafe`/permission check — never rely on the
> client gate alone.

---

## Known UX rough edge (candidate fix)

The avatar menu labels you "Pemilik" (from the **account**) and links to **Pengaturan**, but
the link can dead-end on "Access denied" when the **active cashier** isn't the owner. The
denied page says "Contact the owner" — unhelpful when *you are* the owner operating as a
cashier. A better flow: detect (account-owner ∧ active-cashier ≠ owner) and offer a **"Switch
to owner"** action (→ `/pin`) instead of a dead-end, and/or label the avatar with the *active*
cashier, distinguishing "account: owner / operating as: {cashier}".
