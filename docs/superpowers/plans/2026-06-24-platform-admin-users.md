# Platform Super-Admin User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an operator-only page to list, search, and manage all users across every tenant, with actions to fix outlet access, deactivate/reactivate, and grant/revoke platform-admin.

**Architecture:** A new `isPlatformAdmin`/`deactivatedAt` flag pair on the Convex Auth `users` table, gated server functions in `convex/admin.ts` behind a `requirePlatformAdmin` helper, deactivation enforced at the shared `requireActiveOutlet` choke point, and a React page at `/admin/users` shown via a new `platformAdmin` nav permission.

**Tech Stack:** Convex (queries/mutations), `@convex-dev/auth`, convex-test + vitest, TanStack Router (file routes), React, shadcn/ui, Lingui (admin UI is English-only, not catalogued).

## Global Constraints

- No em-dash (—) or `--` in any user-facing copy (BI + en + receipt).
- Admin UI is **English-only**: plain English strings, NOT wrapped for i18n extraction. The single nav label may use the `msg` macro with English text to satisfy the nav array type.
- Empty/data states use the shadcn `Empty` component (icon + heading + description).
- Date selection / data viz use shadcn primitives (not relevant here, no dates/charts).
- Commit `src/routeTree.gen.ts` when adding a route.
- Run `./node_modules/.bin/convex codegen` and commit `_generated` changes (npx is broken by a shell hook).
- Run `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile` locally before any push.
- Conventional commits; merge (never squash) at PR time.

---

### Task 1: Schema fields + `requirePlatformAdmin` helper

**Files:**
- Modify: `convex/schema.ts:11` (override `users` table after `...authTables`)
- Modify: `convex/lib/auth.ts` (append `requirePlatformAdmin`)
- Test: `tests/convex/admin.test.ts` (create)

**Interfaces:**
- Produces: `requirePlatformAdmin(ctx: QueryCtx | MutationCtx): Promise<{ userId: Id<'users'>; user: Doc<'users'> }>` — throws `not authenticated` / `not a platform admin`.
- Produces: `users` table now carries `isPlatformAdmin?: boolean`, `deactivatedAt?: number`.

- [ ] **Step 1: Write the failing test**

Create `tests/convex/admin.test.ts`:

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

// Sign-in identity for a given inserted user id (mirrors the repo convention).
const as = (t: ReturnType<typeof convexTest>, userId: string) =>
  t.withIdentity({ subject: `${userId}|test_session` });

describe('requirePlatformAdmin via admin.listUsers gate', () => {
  it('rejects a non-admin caller', async () => {
    const t = convexTest(schema, modules);
    const uid = await t.run((ctx) => ctx.db.insert('users', { name: 'Reg', email: 'reg@x.com' }));
    await expect(as(t, uid).query(api.admin.listUsers, {})).rejects.toThrow('not a platform admin');
  });

  it('rejects an unauthenticated caller', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.admin.listUsers, {})).rejects.toThrow('not authenticated');
  });

  it('allows a platform admin', async () => {
    const t = convexTest(schema, modules);
    const uid = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Boss', email: 'boss@x.com', isPlatformAdmin: true })
    );
    const rows = await as(t, uid).query(api.admin.listUsers, {});
    expect(Array.isArray(rows)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/convex/admin.test.ts`
Expected: FAIL — `api.admin` does not exist / `isPlatformAdmin` not a valid field.

- [ ] **Step 3: Override the `users` table in `convex/schema.ts`**

Replace the `...authTables,` line (line 11) region with the spread plus an explicit `users` override carrying the two new optional fields (default Convex Auth fields reproduced exactly so auth keeps working):

```ts
export default defineSchema({
  ...authTables,

  // Override the Convex Auth users table to add platform-admin + deactivation.
  // Default fields reproduced verbatim from @convex-dev/auth so auth flows keep
  // working; only the last two fields are new.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    isPlatformAdmin: v.optional(v.boolean()),
    deactivatedAt: v.optional(v.number()),
  })
    .index('email', ['email'])
    .index('phone', ['phone']),
```

(Leave the existing `otpRateLimit` and the rest of the schema untouched below.)

- [ ] **Step 4: Append `requirePlatformAdmin` to `convex/lib/auth.ts`**

```ts
/**
 * Platform-operator gate. Resolves the signed-in user and asserts the
 * isPlatformAdmin flag. Cross-tenant: not scoped to any cafe/business.
 * Throws 'not authenticated' with no identity, 'not a platform admin' otherwise.
 */
export async function requirePlatformAdmin(
  ctx: QueryCtx | MutationCtx
): Promise<{ userId: Id<'users'>; user: Doc<'users'> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('not authenticated');
  }
  const user = await ctx.db.get(userId);
  if (!user || user.isPlatformAdmin !== true) {
    throw new Error('not a platform admin');
  }
  return { userId, user };
}
```

- [ ] **Step 5: Create a minimal `convex/admin.ts` so the test can resolve `api.admin.listUsers`**

```ts
import { v } from 'convex/values';
import { query } from './_generated/server';
import { requirePlatformAdmin } from './lib/auth';

export const listUsers = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    return [];
  },
});
```

- [ ] **Step 6: Regenerate Convex types**

Run: `./node_modules/.bin/convex codegen`
Expected: `convex/_generated/api.d.ts` now includes `admin`.

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm test tests/convex/admin.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add convex/schema.ts convex/lib/auth.ts convex/admin.ts convex/_generated tests/convex/admin.test.ts
git commit -m "feat(admin): users schema flags + requirePlatformAdmin gate"
```

---

### Task 2: `admin.listUsers` joins + `admin.me`

**Files:**
- Modify: `convex/admin.ts`
- Test: `tests/convex/admin.test.ts`

**Interfaces:**
- Consumes: `requirePlatformAdmin`, `resolveOutletAccess` from `convex/lib/auth.ts`.
- Produces: `listUsers({ search? })` returns `UserRow[]` where
  `UserRow = { _id: Id<'users'>, name: string | null, email: string | null, isPlatformAdmin: boolean, deactivated: boolean, role: 'owner' | 'manager' | null, cafeNames: string[], accessHealth: 'ok' | 'no_outlet' }`.
- Produces: `me()` returns `{ isPlatformAdmin: boolean }` (returns `false` when signed out, never throws).

- [ ] **Step 1: Write the failing test (append to `tests/convex/admin.test.ts`)**

```ts
describe('admin.listUsers joins', () => {
  it('flags a pre-backfill owner as no_outlet and finds by search', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Boss', email: 'boss@x.com', isPlatformAdmin: true })
    );
    // A legacy owner: owns a cafe with NO businessId / businessMembers row.
    const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Legacy', email: 'legacy@x.com' }));
    await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Old Cafe', ownerUserId: ownerId, createdAt: 1 })
    );

    const all = await as(t, adminId).query(api.admin.listUsers, {});
    const legacy = all.find((r) => r.email === 'legacy@x.com')!;
    expect(legacy.accessHealth).toBe('no_outlet');
    expect(legacy.cafeNames).toEqual(['Old Cafe']);

    const filtered = await as(t, adminId).query(api.admin.listUsers, { search: 'legacy' });
    expect(filtered.map((r) => r.email)).toEqual(['legacy@x.com']);
  });

  it('me() reports admin status and false when signed out', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Boss', email: 'boss@x.com', isPlatformAdmin: true })
    );
    expect(await as(t, adminId).query(api.admin.me, {})).toEqual({ isPlatformAdmin: true });
    expect(await t.query(api.admin.me, {})).toEqual({ isPlatformAdmin: false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/convex/admin.test.ts`
Expected: FAIL — `listUsers` returns `[]`; `api.admin.me` undefined.

- [ ] **Step 3: Implement `listUsers` and `me` in `convex/admin.ts`**

Replace the file body with:

```ts
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requirePlatformAdmin, resolveOutletAccess } from './lib/auth';

type UserRow = {
  _id: Id<'users'>;
  name: string | null;
  email: string | null;
  isPlatformAdmin: boolean;
  deactivated: boolean;
  role: 'owner' | 'manager' | null;
  cafeNames: string[];
  accessHealth: 'ok' | 'no_outlet';
};

async function buildRow(ctx: Parameters<typeof requirePlatformAdmin>[0], user: Doc<'users'>): Promise<UserRow> {
  const ownedCafes = await ctx.db
    .query('cafes')
    .withIndex('by_owner', (q) => q.eq('ownerUserId', user._id))
    .collect();
  const access = await resolveOutletAccess(ctx, user._id);
  const ownsCafes = ownedCafes.length > 0;
  // no_outlet: owns at least one cafe but resolves to zero accessible outlets
  // (the pre-backfill state the operator needs to repair).
  const accessHealth: 'ok' | 'no_outlet' =
    ownsCafes && (!access || access.accessibleCafeIds.length === 0) ? 'no_outlet' : 'ok';
  return {
    _id: user._id,
    name: user.name ?? null,
    email: user.email ?? null,
    isPlatformAdmin: user.isPlatformAdmin === true,
    deactivated: user.deactivatedAt != null,
    role: access?.role ?? null,
    cafeNames: ownedCafes.map((c) => c.name),
    accessHealth,
  };
}

export const listUsers = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    await requirePlatformAdmin(ctx);
    const users = await ctx.db.query('users').collect();
    const term = (search ?? '').trim().toLowerCase();
    const filtered = term
      ? users.filter(
          (u) =>
            (u.name ?? '').toLowerCase().includes(term) ||
            (u.email ?? '').toLowerCase().includes(term)
        )
      : users;
    return Promise.all(filtered.map((u) => buildRow(ctx, u)));
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { isPlatformAdmin: false };
    const user = await ctx.db.get(userId);
    return { isPlatformAdmin: user?.isPlatformAdmin === true };
  },
});
```

- [ ] **Step 4: Regenerate types**

Run: `./node_modules/.bin/convex codegen`

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test tests/convex/admin.test.ts`
Expected: PASS (all tasks so far).

- [ ] **Step 6: Commit**

```bash
git add convex/admin.ts convex/_generated tests/convex/admin.test.ts
git commit -m "feat(admin): listUsers joins (access health) and me query"
```

---

### Task 3: `admin.fixOutletAccess`

**Files:**
- Modify: `convex/admin.ts`
- Test: `tests/convex/admin.test.ts`

**Interfaces:**
- Consumes: `requirePlatformAdmin`.
- Produces: `fixOutletAccess({ userId: Id<'users'> }) → { fixed: boolean }`. Idempotent: wraps each businessId-less owned cafe in a `businesses` row, patches the cafe, inserts the `owner` `businessMembers` row if absent, and a default `activeOutlet` if absent. `fixed` is true when any write occurred.

- [ ] **Step 1: Write the failing test (append)**

```ts
describe('admin.fixOutletAccess', () => {
  it('repairs a pre-backfill owner and is idempotent', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Boss', email: 'boss@x.com', isPlatformAdmin: true })
    );
    const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Legacy', email: 'legacy@x.com' }));
    await t.run((ctx) => ctx.db.insert('cafes', { name: 'Old Cafe', ownerUserId: ownerId, createdAt: 1 }));

    const first = await as(t, adminId).mutation(api.admin.fixOutletAccess, { userId: ownerId });
    expect(first).toEqual({ fixed: true });

    const rows = await as(t, adminId).query(api.admin.listUsers, { search: 'legacy' });
    expect(rows[0].accessHealth).toBe('ok');
    expect(rows[0].role).toBe('owner');

    const second = await as(t, adminId).mutation(api.admin.fixOutletAccess, { userId: ownerId });
    expect(second).toEqual({ fixed: false });
  });

  it('rejects a non-admin caller', async () => {
    const t = convexTest(schema, modules);
    const uid = await t.run((ctx) => ctx.db.insert('users', { name: 'Reg', email: 'reg@x.com' }));
    await expect(
      as(t, uid).mutation(api.admin.fixOutletAccess, { userId: uid })
    ).rejects.toThrow('not a platform admin');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/convex/admin.test.ts`
Expected: FAIL — `api.admin.fixOutletAccess` undefined.

- [ ] **Step 3: Implement `fixOutletAccess` (append to `convex/admin.ts`)**

Add the `mutation` import (`import { mutation, query } from './_generated/server';`) and:

```ts
export const fixOutletAccess = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    await requirePlatformAdmin(ctx);
    const cafes = await ctx.db
      .query('cafes')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
      .collect();
    let fixed = false;
    const now = Date.now();
    for (const cafe of cafes) {
      let businessId = cafe.businessId ?? null;
      if (!businessId) {
        businessId = await ctx.db.insert('businesses', {
          name: cafe.name,
          ownerUserId: userId,
          createdAt: cafe.createdAt ?? now,
        });
        await ctx.db.patch(cafe._id, { businessId });
        fixed = true;
      }
      const member = await ctx.db
        .query('businessMembers')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .first();
      if (!member) {
        await ctx.db.insert('businessMembers', { businessId, userId, role: 'owner', createdAt: now });
        fixed = true;
      }
      const active = await ctx.db
        .query('activeOutlet')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .first();
      if (!active) {
        await ctx.db.insert('activeOutlet', { userId, cafeId: cafe._id, updatedAt: now });
        fixed = true;
      }
    }
    return { fixed };
  },
});
```

Note: `Date.now()` is allowed in Convex functions (this constraint only applies to Workflow scripts).

- [ ] **Step 4: Regenerate types**

Run: `./node_modules/.bin/convex codegen`

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test tests/convex/admin.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/admin.ts convex/_generated tests/convex/admin.test.ts
git commit -m "feat(admin): fixOutletAccess per-user backfill"
```

---

### Task 4: `admin.setDeactivated` + enforcement in `requireActiveOutlet`

**Files:**
- Modify: `convex/admin.ts`
- Modify: `convex/lib/auth.ts` (inside `requireActiveOutlet`)
- Test: `tests/convex/admin.test.ts`

**Interfaces:**
- Consumes: `requirePlatformAdmin`.
- Produces: `setDeactivated({ userId, deactivated: boolean }) → null`. Guard: throws `cannot deactivate yourself` when `userId` is the caller.
- Behavior change: `requireActiveOutlet` throws `account deactivated` when the user's `deactivatedAt` is set.

- [ ] **Step 1: Write the failing test (append)**

```ts
describe('admin.setDeactivated', () => {
  it('blocks self-deactivation', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Boss', email: 'boss@x.com', isPlatformAdmin: true })
    );
    await expect(
      as(t, adminId).mutation(api.admin.setDeactivated, { userId: adminId, deactivated: true })
    ).rejects.toThrow('cannot deactivate yourself');
  });

  it('deactivated user can no longer reach an outlet', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Boss', email: 'boss@x.com', isPlatformAdmin: true })
    );
    // A normal owner with a working cafe (created through the real flow).
    const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Op', email: 'op@x.com' }));
    await as(t, ownerId).mutation(api.cafes.createForOwner, { name: 'Kopi' });
    // Sanity: works before deactivation.
    expect(await as(t, ownerId).query(api.cafes.myCafe, {})).not.toBeNull();

    await as(t, adminId).mutation(api.admin.setDeactivated, { userId: ownerId, deactivated: true });
    // myCafe swallows the throw and returns null; a hard gate throws.
    await expect(as(t, ownerId).query(api.shifts.current, {})).rejects.toThrow('account deactivated');

    await as(t, adminId).mutation(api.admin.setDeactivated, { userId: ownerId, deactivated: false });
    await expect(as(t, ownerId).query(api.shifts.current, {})).resolves.toBeDefined();
  });
});
```

Note: verify `api.shifts.current` exists and calls `requireActiveOutlet`; if the export name differs, substitute any query that calls `requireActiveOutlet` directly and throws on `no outlet access` (grep `requireActiveOutlet` in `convex/shifts.ts`/`convex/orders.ts` to pick one).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/convex/admin.test.ts`
Expected: FAIL — `setDeactivated` undefined; no `account deactivated` throw.

- [ ] **Step 3: Add the deactivation check in `requireActiveOutlet` (`convex/lib/auth.ts`)**

Immediately after `const userId = await getAuthUserId(ctx);` and its null check inside `requireActiveOutlet`, add:

```ts
  const callerUser = await ctx.db.get(userId);
  if (callerUser?.deactivatedAt != null) {
    throw new Error('account deactivated');
  }
```

- [ ] **Step 4: Implement `setDeactivated` (append to `convex/admin.ts`)**

```ts
export const setDeactivated = mutation({
  args: { userId: v.id('users'), deactivated: v.boolean() },
  handler: async (ctx, { userId, deactivated }) => {
    const { userId: callerId } = await requirePlatformAdmin(ctx);
    if (userId === callerId) {
      throw new Error('cannot deactivate yourself');
    }
    await ctx.db.patch(userId, { deactivatedAt: deactivated ? Date.now() : undefined });
    return null;
  },
});
```

- [ ] **Step 5: Regenerate types**

Run: `./node_modules/.bin/convex codegen`

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm test tests/convex/admin.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add convex/admin.ts convex/lib/auth.ts convex/_generated tests/convex/admin.test.ts
git commit -m "feat(admin): setDeactivated + enforce at requireActiveOutlet"
```

---

### Task 5: `admin.setPlatformAdmin`

**Files:**
- Modify: `convex/admin.ts`
- Test: `tests/convex/admin.test.ts`

**Interfaces:**
- Consumes: `requirePlatformAdmin`.
- Produces: `setPlatformAdmin({ userId, isAdmin: boolean }) → null`. Guards: throws `cannot change your own admin status` when `userId` is the caller; throws `cannot remove the last admin` when revoking would leave zero admins.

- [ ] **Step 1: Write the failing test (append)**

```ts
describe('admin.setPlatformAdmin', () => {
  it('grants admin to another user', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Boss', email: 'boss@x.com', isPlatformAdmin: true })
    );
    const other = await t.run((ctx) => ctx.db.insert('users', { name: 'Op', email: 'op@x.com' }));
    await as(t, adminId).mutation(api.admin.setPlatformAdmin, { userId: other, isAdmin: true });
    expect(await as(t, other).query(api.admin.me, {})).toEqual({ isPlatformAdmin: true });
  });

  it('blocks changing your own status and removing the last admin', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Boss', email: 'boss@x.com', isPlatformAdmin: true })
    );
    await expect(
      as(t, adminId).mutation(api.admin.setPlatformAdmin, { userId: adminId, isAdmin: false })
    ).rejects.toThrow('cannot change your own admin status');

    const other = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'Op', email: 'op@x.com', isPlatformAdmin: true })
    );
    // Demote the only OTHER admin while the caller stays admin -> allowed.
    await as(t, adminId).mutation(api.admin.setPlatformAdmin, { userId: other, isAdmin: false });
    expect(await as(t, other).query(api.admin.me, {})).toEqual({ isPlatformAdmin: false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/convex/admin.test.ts`
Expected: FAIL — `setPlatformAdmin` undefined.

- [ ] **Step 3: Implement `setPlatformAdmin` (append to `convex/admin.ts`)**

```ts
export const setPlatformAdmin = mutation({
  args: { userId: v.id('users'), isAdmin: v.boolean() },
  handler: async (ctx, { userId, isAdmin }) => {
    const { userId: callerId } = await requirePlatformAdmin(ctx);
    if (userId === callerId) {
      throw new Error('cannot change your own admin status');
    }
    if (!isAdmin) {
      const admins = await ctx.db.query('users').collect();
      const adminCount = admins.filter((u) => u.isPlatformAdmin === true).length;
      if (adminCount <= 1) {
        throw new Error('cannot remove the last admin');
      }
    }
    await ctx.db.patch(userId, { isPlatformAdmin: isAdmin ? true : undefined });
    return null;
  },
});
```

- [ ] **Step 4: Regenerate types**

Run: `./node_modules/.bin/convex codegen`

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test tests/convex/admin.test.ts`
Expected: PASS (full file).

- [ ] **Step 6: Commit**

```bash
git add convex/admin.ts convex/_generated tests/convex/admin.test.ts
git commit -m "feat(admin): setPlatformAdmin with self + last-admin guards"
```

---

### Task 6: Frontend permission wiring (`platformAdmin`)

**Files:**
- Modify: `src/lib/permissions.ts` (extend `usePermissions` return)
- Modify: `src/components/app-shared.tsx:36` (extend `requires` union)
- Modify: `src/components/app-sidebar.tsx:28-29` (extend `allowed`)
- Modify: `src/components/command-palette.tsx:63-64` (extend `allowed`)

**Interfaces:**
- Consumes: `api.admin.me` query → `{ isPlatformAdmin: boolean }`.
- Produces: `usePermissions()` now also returns `isPlatformAdmin: boolean`. Nav `requires` accepts `'platformAdmin'`.

- [ ] **Step 1: Extend `usePermissions` in `src/lib/permissions.ts`**

Add the query and field. Inside the hook body, alongside the existing `cafe` query:

```ts
  const adminMe = useQuery(api.admin.me, {});
  const isPlatformAdmin = adminMe?.isPlatformAdmin === true;
```

Add `isPlatformAdmin` to the return object and to the hook's return type annotation:

```ts
): {
  can: (p: Permission) => boolean;
  isOwner: boolean;
  isPlatformAdmin: boolean;
  isLoading: boolean;
} {
```

```ts
  return {
    can: (p) => (hasCashier ? data.role === 'owner' || data.permissions[p] : isAccountMember),
    isOwner: isAccountOwner || (hasCashier && data.role === 'owner'),
    isPlatformAdmin,
    isLoading: cafe === undefined || (cashierId !== null && data === undefined),
  };
```

- [ ] **Step 2: Extend the `requires` union in `src/components/app-shared.tsx`**

Line 36 currently:

```ts
	requires?: Permission | 'owner';
```

Change to:

```ts
	requires?: Permission | 'owner' | 'platformAdmin';
```

- [ ] **Step 3: Add the Admin nav group in `src/components/app-shared.tsx`**

After the existing `Akun` group object in `navGroups`, add (import `ShieldCheck` from `lucide-react` at the top alongside the other icon imports):

```ts
	{
		label: msg`Admin`,
		items: [
			{ title: msg`Users`, path: "/admin/users", icon: <ShieldCheck />, requires: 'platformAdmin' },
		],
	},
```

- [ ] **Step 4: Extend `allowed` in `src/components/app-sidebar.tsx`**

Lines 25 / 28-29 — pull `isPlatformAdmin` from the hook and handle the new case:

```ts
	const { can, isOwner, isPlatformAdmin, isLoading } = usePermissions();
```

```ts
	const allowed = (req?: SidebarNavItem['requires']) =>
		!req ||
		isLoading ||
		(req === 'owner' ? isOwner : req === 'platformAdmin' ? isPlatformAdmin : can(req));
```

- [ ] **Step 5: Extend `allowed` in `src/components/command-palette.tsx`**

Line 31 / 63-64 — mirror the same:

```ts
  const { can, isOwner, isPlatformAdmin, isLoading: permLoading } = usePermissions();
```

```ts
  const allowed = (req?: SidebarNavItem['requires']) =>
    !req ||
    permLoading ||
    (req === 'owner' ? isOwner : req === 'platformAdmin' ? isPlatformAdmin : can(req));
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no new route yet, so `/admin/users` path will fail type-check against the route tree — this is expected and fixed in Task 7. If typecheck blocks here, proceed to Task 7 before running it, then run typecheck once at Task 7.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/permissions.ts src/components/app-shared.tsx src/components/app-sidebar.tsx src/components/command-palette.tsx
git commit -m "feat(admin): platformAdmin nav permission wiring"
```

---

### Task 7: `/admin/users` page

**Files:**
- Create: `src/routes/_pos/admin/users.tsx`
- Modify: `src/routeTree.gen.ts` (regenerated)

**Interfaces:**
- Consumes: `api.admin.listUsers`, `api.admin.fixOutletAccess`, `api.admin.setDeactivated`, `api.admin.setPlatformAdmin`, `usePermissions().isPlatformAdmin`.
- Produces: route `/admin/users`.

- [ ] **Step 1: Create the page `src/routes/_pos/admin/users.tsx`**

English-only copy (no `Trans`/`msg`). Reuse existing primitives the same way `members.tsx` does (`Input`, `Badge`, `Button`, `RowActions`, `ConfirmDialog`, `Spinner`, `Empty`, `toast`). A non-admin who reaches the URL directly sees an access-denied panel.

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { Input } from '~/components/ui/input';
import { RowActions } from '~/components/ui/row-actions';
import { Spinner } from '~/components/ui/spinner';
import { usePermissions } from '~/lib/permissions';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/admin/users')({
  component: AdminUsersPage,
});

type ConfirmState =
  | { kind: 'deactivate'; userId: Id<'users'>; name: string; next: boolean }
  | { kind: 'admin'; userId: Id<'users'>; name: string; next: boolean }
  | null;

function AdminUsersPage() {
  const { isPlatformAdmin, isLoading } = usePermissions();
  const [search, setSearch] = useState('');
  const users = useQuery(api.admin.listUsers, isPlatformAdmin ? { search } : 'skip');
  const fixAccess = useMutation(api.admin.fixOutletAccess);
  const setDeactivated = useMutation(api.admin.setDeactivated);
  const setAdmin = useMutation(api.admin.setPlatformAdmin);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  if (isLoading) return <div className="p-6"><Spinner /></div>;
  if (!isPlatformAdmin) {
    return (
      <div className="p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ShieldCheck /></EmptyMedia>
            <EmptyTitle>Admins only</EmptyTitle>
            <EmptyDescription>You do not have platform admin access.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const onFix = async (userId: Id<'users'>) => {
    try {
      const { fixed } = await fixAccess({ userId });
      toast.success(fixed ? 'Outlet access repaired' : 'Nothing to fix');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to fix access');
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'deactivate') {
        await setDeactivated({ userId: confirm.userId, deactivated: confirm.next });
        toast.success(confirm.next ? 'User deactivated' : 'User reactivated');
      } else {
        await setAdmin({ userId: confirm.userId, isAdmin: confirm.next });
        toast.success(confirm.next ? 'Admin granted' : 'Admin removed');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setConfirm(null);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Users (platform)</h1>
        <Input
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {users === undefined ? (
        <div className="py-10"><Spinner /></div>
      ) : users.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ShieldCheck /></EmptyMedia>
            <EmptyTitle>No users found</EmptyTitle>
            <EmptyDescription>Try a different search.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Cafes</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className="border-b last:border-0">
                  <td className="p-3">
                    {u.name ?? 'unnamed'}
                    {u.isPlatformAdmin && <Badge variant="secondary" className="ml-2">admin</Badge>}
                  </td>
                  <td className="p-3 text-muted-foreground">{u.email ?? 'no email'}</td>
                  <td className="p-3">{u.cafeNames.join(', ') || 'none'}</td>
                  <td className="p-3">{u.role ?? 'none'}</td>
                  <td className="p-3">
                    {u.deactivated ? (
                      <Badge variant="destructive">deactivated</Badge>
                    ) : (
                      <Badge variant="outline">active</Badge>
                    )}
                    {u.accessHealth === 'no_outlet' && (
                      <Badge variant="secondary" className="ml-2">no outlet</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    <RowActions
                      actions={[
                        ...(u.accessHealth === 'no_outlet'
                          ? [{ label: 'Fix access', onSelect: () => onFix(u._id) }]
                          : []),
                        {
                          label: u.deactivated ? 'Reactivate' : 'Deactivate',
                          destructive: !u.deactivated,
                          onSelect: () =>
                            setConfirm({
                              kind: 'deactivate',
                              userId: u._id,
                              name: u.name ?? 'this user',
                              next: !u.deactivated,
                            }),
                        },
                        {
                          label: u.isPlatformAdmin ? 'Remove admin' : 'Make admin',
                          destructive: u.isPlatformAdmin,
                          onSelect: () =>
                            setConfirm({
                              kind: 'admin',
                              userId: u._id,
                              name: u.name ?? 'this user',
                              next: !u.isPlatformAdmin,
                            }),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm?.kind === 'deactivate'
            ? confirm.next
              ? `Deactivate ${confirm.name}?`
              : `Reactivate ${confirm.name}?`
            : confirm?.next
              ? `Make ${confirm?.name} an admin?`
              : `Remove admin from ${confirm?.name}?`
        }
        description={
          confirm?.kind === 'deactivate' && confirm.next
            ? 'They will be locked out of all outlets until reactivated.'
            : confirm?.kind === 'admin' && confirm.next
              ? 'They will gain full platform admin access.'
              : 'This change takes effect immediately.'
        }
        confirmLabel="Confirm"
        onConfirm={runConfirm}
      />
    </div>
  );
}
```

Note: before writing, open `src/components/ui/row-actions.tsx` and `src/components/ui/confirm-dialog.tsx` to confirm the exact prop names (`actions` items shape: `label`/`onSelect`/`destructive`; ConfirmDialog: `open`/`onOpenChange`/`title`/`description`/`confirmLabel`/`onConfirm`). Adjust the JSX to the real signatures — mirror a current caller such as `src/routes/_pos/settings/members.tsx`.

- [ ] **Step 2: Regenerate the route tree**

Run: `pnpm dev` briefly (TanStack regenerates `routeTree.gen.ts`), or run the project's route-gen step. Confirm `/admin/users` appears in `src/routeTree.gen.ts`.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_pos/admin/users.tsx src/routeTree.gen.ts
git commit -m "feat(admin): /admin/users management page"
```

---

### Task 8: Full verification + lingui

**Files:** none (verification only)

- [ ] **Step 1: Lingui extract + compile** (no new catalog strings expected, but confirm the nav `msg\`Admin\`` / `msg\`Users\`` are picked up and en-filled)

Run: `pnpm lingui:extract && pnpm lingui:compile`
Then fill the English translations for any new `Admin` / `Users` entries (per the run-extract-after-new-strings rule).

- [ ] **Step 2: Full typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: PASS, including `tests/convex/admin.test.ts`.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: PASS (or auto-fixable).

- [ ] **Step 4: Commit any lingui/catalog changes**

```bash
git add src/locales
git commit -m "i18n(admin): extract nav labels, en-fill"
```

- [ ] **Step 5: Manual smoke (operator)**

1. In the Convex dashboard, set your own user's `isPlatformAdmin = true`.
2. Reload the app; confirm the **Admin → Users** nav entry appears.
3. Open `/admin/users`; confirm the table lists users, search filters, and a `no outlet` user shows **Fix access**.
4. Run **Fix access**; confirm the chip clears.
5. Confirm a non-admin account does not see the nav entry and hitting `/admin/users` shows the "Admins only" panel.

---

## Self-Review

**Spec coverage:**
- Access model (isPlatformAdmin/deactivatedAt + requirePlatformAdmin + dashboard bootstrap) → Task 1. ✓
- listUsers with joins + accessHealth → Task 2. ✓
- fixOutletAccess → Task 3. ✓
- setDeactivated + enforcement at requireActiveOutlet → Task 4. ✓
- setPlatformAdmin with guards → Task 5. ✓
- me() query for the shell → Task 2. ✓
- Frontend nav permission + page → Tasks 6, 7. ✓
- English-only, no-dash, shadcn Empty, routeTree/codegen/CI conventions → Global Constraints + Task 8. ✓
- Testing matrix from spec → Tasks 1-5 tests. ✓
- Deferred impersonation → explicitly out of scope, no task. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. The two "verify prop names / export names" notes (Task 4 Step 1, Task 7 Step 1) are deliberate guardrails pointing at exact files to mirror, not deferred work.

**Type consistency:** `UserRow` fields (`accessHealth`, `cafeNames`, `isPlatformAdmin`, `deactivated`, `role`) are produced in Task 2 and consumed identically in Task 7. `requirePlatformAdmin` returns `{ userId, user }` (Task 1) and callers use `userId` (Tasks 4, 5). `usePermissions().isPlatformAdmin` produced in Task 6, consumed in Tasks 6 (nav) and 7 (page). Consistent.
