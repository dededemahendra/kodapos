# Multi-outlet v1 — Phase 3: Outlet switcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user see and switch between their accessible outlets from a sidebar switcher, let owners add a new outlet, and make the client's "current cafe" reads reflect the active outlet so switching re-scopes the whole app.

**Architecture:** Extract a shared `resolveOutletAccess(ctx, userId)` helper from Phase 2's `requireActiveOutlet` (the accessible-outlet resolution), then build three Convex functions on it — `myOutlets` (switcher list), `setActiveOutlet` (the only writer of `activeOutlet`), `createOutlet` (owner-only). Make `myCafe` resolve the active outlet instead of the oldest cafe, so every client read re-scopes on switch via Convex reactivity. The UI replaces the sidebar's brand-mark header with a shadcn DropdownMenu outlet switcher; owners get an "Add outlet" item that opens a dialog, creates the outlet, switches to it, and navigates to Settings → Profile.

**Tech Stack:** Convex (queries/mutations + a `lib/auth` helper), convex-test + Vitest, React + TanStack Router, shadcn (DropdownMenu, Dialog, Sidebar), Lingui i18n.

## Global Constraints

- **Convex function syntax:** new-style `query/mutation({ args, returns, handler })` with full `v.*` arg + return validators. Read `convex/_generated/ai/guidelines.md` before writing Convex code.
- **Auth helpers** take `QueryCtx | MutationCtx`. `resolveOutletAccess` and all query-path code MUST NOT write. Only `setActiveOutlet` and `createOutlet` (mutations) persist `activeOutlet`.
- **Codegen:** after adding the new `convex/outlets.ts` module (new registered functions enter the `api` object), run `./node_modules/.bin/convex codegen` (NOT `npx`) and **commit the regenerated `convex/_generated/**`**.
- **Quality gate before every commit:** `pnpm typecheck` and `pnpm test` must pass (currently 906 tests).
- **i18n (UI tasks only):** user-facing copy is authored in **Indonesian** (source locale `id`) via Lingui `<Trans>` / `` t`...` `` macros. After adding strings, run `pnpm lingui:extract`, fill the English translations in `src/locales/en/messages.po` (do not leave them empty — empty `msgstr` renders Indonesian to English users), then `pnpm lingui:compile`. **No em-dash (—) or `--` in any user-facing copy** (BI + en); use commas/periods/parentheses.
- **Test harness:** `convexTest(schema, modules)`; authenticate with `t.withIdentity({ subject: \`${userId}|test_session\` })`; the scoped tester's `.run((ctx) => fn(ctx))` runs inline functions with that identity. Seed via `api.cafes.createForOwner` (creates business + membership + active outlet) or direct `ctx.db.insert`. See `tests/convex/active-outlet.test.ts` and `tests/convex/multi-outlet.test.ts`.
- **shadcn primitives:** use the existing shadcn DropdownMenu / Dialog / Sidebar components (see `src/components/nav-user.tsx` for the in-sidebar dropdown pattern). Do not hand-roll menus or modals.
- **Frontend has no component-test harness:** UI tasks are verified by `pnpm typecheck`, the lingui extract/compile cycle, and visual checks via the `run` skill — not unit tests.

---

### Task 1: Active-outlet-aware read layer — `resolveOutletAccess`, `myOutlets`, `myCafe`

**Files:**
- Modify: `convex/lib/auth.ts` (add `resolveOutletAccess` + `OutletAccess` type; refactor `requireActiveOutlet` to use it — behavior-preserving)
- Create: `convex/outlets.ts` (add `myOutlets` query)
- Modify: `convex/cafes.ts:116-139` (`myCafe` resolves the active outlet)
- Test: `tests/convex/outlet-switcher.test.ts` (create)

**Interfaces:**
- Consumes: Phase 1 schema; Phase 2 `requireActiveOutlet`.
- Produces:
  - `type OutletAccess = { member: Doc<'businessMembers'> | null; accessibleCafeIds: Id<'cafes'>[]; businessId: Id<'businesses'> | null; role: 'owner' | 'manager' }`
  - `resolveOutletAccess(ctx, userId: Id<'users'>): Promise<OutletAccess | null>` — null when the user can reach no outlet. Never writes.
  - `api.outlets.myOutlets(): Array<{ cafeId: Id<'cafes'>; name: string; isActive: boolean }>` — the accessible outlets, `isActive` marking the resolved active one. Returns `[]` when unauthenticated / no access.
  - `api.cafes.myCafe()` — unchanged signature, now returns the **active outlet's** cafe doc (+ `logoUrl`) instead of the oldest cafe.

- [ ] **Step 1: Write the failing tests**

Create `tests/convex/outlet-switcher.test.ts`:

```typescript
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

/** Owner seeded via the real bootstrap; returns helpers + the owner's first cafe/business. */
async function seedOwner(t: ReturnType<typeof convexTest>, name = 'Kopi Senja') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: `${name}@x.com` }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  const cafeId = await asOwner.mutation(api.cafes.createForOwner, { name });
  const cafe = await t.run((ctx) => ctx.db.get(cafeId as Id<'cafes'>));
  return { userId, asOwner, cafeId, businessId: cafe!.businessId as Id<'businesses'> };
}

describe('myOutlets', () => {
  it('returns the single outlet as active for a fresh owner', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId } = await seedOwner(t);
    const outlets = await asOwner.query(api.outlets.myOutlets, {});
    expect(outlets).toHaveLength(1);
    expect(outlets[0]).toMatchObject({ cafeId, isActive: true });
  });

  it('lists all of an owner business outlets, marking the active one', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId, businessId, cafeId: first } = await seedOwner(t);
    const second = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang 2', ownerUserId: userId, businessId, createdAt: 2 })
    );
    await t.run(async (ctx) => {
      const active = await ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId)).first();
      await ctx.db.patch(active!._id, { cafeId: second, updatedAt: 3 });
    });

    const outlets = await asOwner.query(api.outlets.myOutlets, {});
    expect(outlets).toHaveLength(2);
    const active = outlets.find((o) => o.isActive);
    expect(active?.cafeId).toBe(second);
    expect(outlets.map((o) => o.cafeId).sort()).toEqual([first, second].sort());
  });

  it('returns only granted outlets for a manager', async () => {
    const t = convexTest(schema, modules);
    const { userId: ownerId, businessId } = await seedOwner(t);
    const granted = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang Manajer', ownerUserId: ownerId, businessId, createdAt: 2 })
    );
    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'm@x.com' }));
    const mgrMemberId = await t.run((ctx) =>
      ctx.db.insert('businessMembers', { businessId, userId: mgrUserId, role: 'manager', createdAt: 5 })
    );
    await t.run((ctx) =>
      ctx.db.insert('memberOutletAccess', { businessMemberId: mgrMemberId, cafeId: granted, createdAt: 5 })
    );
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });

    const outlets = await asMgr.query(api.outlets.myOutlets, {});
    expect(outlets).toHaveLength(1);
    expect(outlets[0]).toMatchObject({ cafeId: granted, isActive: true });
  });

  it('returns [] when unauthenticated', async () => {
    const t = convexTest(schema, modules);
    const outlets = await t.query(api.outlets.myOutlets, {});
    expect(outlets).toEqual([]);
  });
});

describe('myCafe resolves the active outlet', () => {
  it('returns the active outlet, not the oldest cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId, businessId, cafeId: first } = await seedOwner(t);
    const second = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang 2', ownerUserId: userId, businessId, createdAt: 2 })
    );
    await t.run(async (ctx) => {
      const active = await ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId)).first();
      await ctx.db.patch(active!._id, { cafeId: second, updatedAt: 3 });
    });

    const cafe = await asOwner.query(api.cafes.myCafe, {});
    expect(cafe?._id).toBe(second);
    expect(cafe?._id).not.toBe(first);
  });

  it('returns null when unauthenticated', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.cafes.myCafe, {})).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/convex/outlet-switcher.test.ts`
Expected: FAIL — `api.outlets` does not exist; `myCafe` returns the oldest cafe (`first`), not `second`.

- [ ] **Step 3: Extract `resolveOutletAccess` and refactor `requireActiveOutlet`**

In `convex/lib/auth.ts`, add the type + helper (the `Doc` import already exists on line 2), and replace the body of `requireActiveOutlet` to consume it. The accessible-resolution logic moves verbatim out of `requireActiveOutlet` into `resolveOutletAccess`:

```typescript
export type OutletAccess = {
  member: Doc<'businessMembers'> | null;
  accessibleCafeIds: Id<'cafes'>[];
  businessId: Id<'businesses'> | null;
  role: 'owner' | 'manager';
};

/**
 * Resolve which outlets a user may operate, plus their membership context.
 * Returns null when the user can reach no outlet (no membership and no cafe).
 * Shared by requireActiveOutlet (active pick), outlets.myOutlets (switcher
 * list) and outlets.setActiveOutlet (access validation). Never writes.
 */
export async function resolveOutletAccess(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>
): Promise<OutletAccess | null> {
  const member = await ctx.db
    .query('businessMembers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();

  // Transitional fallback: an owner whose data predates the multi-outlet
  // backfill has a cafe but no businessMembers row. Mirror the legacy
  // requireOwnerCafe behavior (oldest cafe by owner). Removable once the
  // backfill is confirmed run in all environments.
  if (!member) {
    const cafe = await ctx.db
      .query('cafes')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
      .first();
    if (!cafe) return null;
    return {
      member: null,
      accessibleCafeIds: [cafe._id],
      businessId: cafe.businessId ?? null,
      role: 'owner',
    };
  }

  let accessibleCafeIds: Id<'cafes'>[];
  if (member.role === 'owner') {
    const cafes = await ctx.db
      .query('cafes')
      .withIndex('by_business', (q) => q.eq('businessId', member.businessId))
      .collect();
    accessibleCafeIds = cafes.map((c) => c._id);
  } else {
    const access = await ctx.db
      .query('memberOutletAccess')
      .withIndex('by_member', (q) => q.eq('businessMemberId', member._id))
      .collect();
    accessibleCafeIds = access.map((a) => a.cafeId);
  }

  return { member, accessibleCafeIds, businessId: member.businessId, role: member.role };
}
```

Then replace the body of `requireActiveOutlet` (keep its JSDoc, signature, and return type) so it delegates resolution:

```typescript
export async function requireActiveOutlet(
  ctx: QueryCtx | MutationCtx
): Promise<ActiveOutlet> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('not authenticated');
  }

  const access = await resolveOutletAccess(ctx, userId);
  if (!access || access.accessibleCafeIds.length === 0) {
    throw new Error('no outlet access');
  }

  const active = await ctx.db
    .query('activeOutlet')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();
  const cafeId =
    active && access.accessibleCafeIds.includes(active.cafeId)
      ? active.cafeId
      : access.accessibleCafeIds[0]!;

  return { userId, cafeId, businessId: access.businessId, role: access.role };
}
```

(`requireBusinessOwner` and `requireOwned` stay untouched.)

- [ ] **Step 4: Run the Phase 2 helper tests to confirm the refactor is behavior-preserving**

Run: `pnpm exec vitest run tests/convex/active-outlet.test.ts`
Expected: PASS — all 9 existing helper tests stay green (the refactor only relocated the resolution logic).

- [ ] **Step 5: Create `convex/outlets.ts` with `myOutlets`**

Create `convex/outlets.ts`:

```typescript
import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireActiveOutlet, resolveOutletAccess } from './lib/auth';

export const myOutlets = query({
  args: {},
  returns: v.array(
    v.object({
      cafeId: v.id('cafes'),
      name: v.string(),
      isActive: v.boolean(),
    })
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    let activeCafeId;
    try {
      activeCafeId = (await requireActiveOutlet(ctx)).cafeId;
    } catch {
      return [];
    }
    const access = await resolveOutletAccess(ctx, userId);
    if (!access) return [];
    const cafes = await Promise.all(access.accessibleCafeIds.map((id) => ctx.db.get(id)));
    return cafes
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map((c) => ({ cafeId: c._id, name: c.name, isActive: c._id === activeCafeId }));
  },
});
```

- [ ] **Step 6: Make `myCafe` resolve the active outlet**

In `convex/cafes.ts`, replace the `myCafe` handler body (lines ~122-138) so it resolves through `requireActiveOutlet` instead of `by_owner.first()`. `requireActiveOutlet` is already imported (Phase 2 rename). Replace the handler:

```typescript
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    // Resolve the active outlet (not the oldest cafe) so the client re-scopes
    // when the user switches outlets. Returns null on no-access rather than
    // throwing, preserving the query's null-on-signed-out contract.
    let cafeId;
    try {
      cafeId = (await requireActiveOutlet(ctx)).cafeId;
    } catch {
      return null;
    }
    const cafe = await ctx.db.get(cafeId);
    if (!cafe) return null;
    const logoUrl = cafe.logoStorageId
      ? await ctx.storage.getUrl(cafe.logoStorageId)
      : null;
    return { ...cafe, ...(logoUrl ? { logoUrl } : {}) };
  },
```

(Leave the `mine` query untouched — it still lists all of an owner's cafes.)

- [ ] **Step 7: Regenerate types (new `outlets` module)**

Run: `./node_modules/.bin/convex codegen`
Expected: `convex/_generated/api.d.ts` now exposes `api.outlets.myOutlets`, exit 0.

- [ ] **Step 8: Run the new tests to verify they pass**

Run: `pnpm exec vitest run tests/convex/outlet-switcher.test.ts`
Expected: PASS.

- [ ] **Step 9: Full suite + typecheck (regression — `myCafe` has 13 consumers)**

Run: `pnpm typecheck && pnpm test`
Expected: all green. Existing tests seed one cafe via `createForOwner`, so the active outlet equals that cafe and `myCafe` returns the same doc as before — no regression.

- [ ] **Step 10: Commit**

```bash
git add convex/lib/auth.ts convex/outlets.ts convex/cafes.ts convex/_generated tests/convex/outlet-switcher.test.ts
git commit -m "feat(multi-outlet): myOutlets + active-outlet-aware myCafe"
```

---

### Task 2: `setActiveOutlet` mutation

**Files:**
- Modify: `convex/outlets.ts` (add `setActiveOutlet`)
- Test: `tests/convex/outlet-switcher.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `resolveOutletAccess` (Task 1).
- Produces: `api.outlets.setActiveOutlet({ cafeId: Id<'cafes'> }): null` — validates the user may access `cafeId`, then upserts the user's `activeOutlet` row. Throws `'not authenticated'` / `'no outlet access'`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/convex/outlet-switcher.test.ts`:

```typescript
describe('setActiveOutlet', () => {
  it('switches the active outlet to an accessible cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId, businessId, cafeId: first } = await seedOwner(t);
    const second = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang 2', ownerUserId: userId, businessId, createdAt: 2 })
    );

    await asOwner.mutation(api.outlets.setActiveOutlet, { cafeId: second });

    const active = await t.run((ctx) =>
      ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId)).first()
    );
    expect(active?.cafeId).toBe(second);
    const cafe = await asOwner.query(api.cafes.myCafe, {});
    expect(cafe?._id).toBe(second);
    expect(second).not.toBe(first);
  });

  it('rejects switching to an outlet the user cannot access', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedOwner(t);
    const otherUser = await t.run((ctx) => ctx.db.insert('users', { name: 'X', email: 'x2@x.com' }));
    const otherBiz = await t.run((ctx) => ctx.db.insert('businesses', { name: 'B', ownerUserId: otherUser, createdAt: 1 }));
    const foreign = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Foreign', ownerUserId: otherUser, businessId: otherBiz, createdAt: 1 })
    );

    await expect(asOwner.mutation(api.outlets.setActiveOutlet, { cafeId: foreign })).rejects.toThrow('no outlet access');
  });

  it('upserts (does not duplicate) the activeOutlet row', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId, businessId } = await seedOwner(t);
    const second = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang 2', ownerUserId: userId, businessId, createdAt: 2 })
    );
    await asOwner.mutation(api.outlets.setActiveOutlet, { cafeId: second });
    const rows = await t.run((ctx) =>
      ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId)).collect()
    );
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/convex/outlet-switcher.test.ts -t "setActiveOutlet"`
Expected: FAIL — `api.outlets.setActiveOutlet` does not exist.

- [ ] **Step 3: Implement `setActiveOutlet`**

In `convex/outlets.ts`, add `mutation` to the imports from `./_generated/server` (so the import line reads `import { mutation, query } from './_generated/server';`) and append:

```typescript
export const setActiveOutlet = mutation({
  args: { cafeId: v.id('cafes') },
  returns: v.null(),
  handler: async (ctx, { cafeId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('not authenticated');
    }
    const access = await resolveOutletAccess(ctx, userId);
    if (!access || !access.accessibleCafeIds.includes(cafeId)) {
      throw new Error('no outlet access');
    }
    const now = Date.now();
    const existing = await ctx.db
      .query('activeOutlet')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { cafeId, updatedAt: now });
    } else {
      await ctx.db.insert('activeOutlet', { userId, cafeId, updatedAt: now });
    }
    return null;
  },
});
```

- [ ] **Step 4: Regenerate types**

Run: `./node_modules/.bin/convex codegen`
Expected: `api.outlets.setActiveOutlet` exposed, exit 0.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/convex/outlet-switcher.test.ts -t "setActiveOutlet"`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add convex/outlets.ts convex/_generated tests/convex/outlet-switcher.test.ts
git commit -m "feat(multi-outlet): setActiveOutlet mutation"
```

---

### Task 3: `createOutlet` mutation (owner-only)

**Files:**
- Modify: `convex/outlets.ts` (add `createOutlet`)
- Test: `tests/convex/outlet-switcher.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `requireBusinessOwner` (Phase 2).
- Produces: `api.outlets.createOutlet({ name: string }): Id<'cafes'>` — owner-only. Inserts a `cafes` row under the owner's business (default `timezone`/`tax`, mirroring `createForOwner`), an owner `cafeStaff` row, and switches the owner's `activeOutlet` to the new cafe. Throws `'owner access required'` for managers and validates the name.

- [ ] **Step 1: Write the failing tests**

Append to `tests/convex/outlet-switcher.test.ts`:

```typescript
describe('createOutlet', () => {
  it('creates an outlet under the owner business, with staff, and switches to it', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId, businessId } = await seedOwner(t);

    const newId = await asOwner.mutation(api.outlets.createOutlet, { name: '  Cabang 2  ' });

    const cafe = await t.run((ctx) => ctx.db.get(newId as Id<'cafes'>));
    expect(cafe?.name).toBe('Cabang 2'); // trimmed
    expect(cafe?.businessId).toBe(businessId);
    expect(cafe?.taxEnabled).toBe(true);

    const staff = await t.run((ctx) =>
      ctx.db.query('cafeStaff').withIndex('by_cafe_active', (q) => q.eq('cafeId', newId as Id<'cafes'>)).collect()
    );
    expect(staff.some((s) => s.role === 'owner')).toBe(true);

    const active = await t.run((ctx) =>
      ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId)).first()
    );
    expect(active?.cafeId).toBe(newId);

    const outlets = await asOwner.query(api.outlets.myOutlets, {});
    expect(outlets).toHaveLength(2);
    expect(outlets.find((o) => o.isActive)?.cafeId).toBe(newId);
  });

  it('rejects an empty name', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedOwner(t);
    await expect(asOwner.mutation(api.outlets.createOutlet, { name: '   ' })).rejects.toThrow('wajib diisi');
  });

  it('rejects a manager (owner-only)', async () => {
    const t = convexTest(schema, modules);
    const { userId: ownerId, businessId } = await seedOwner(t);
    const granted = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang', ownerUserId: ownerId, businessId, createdAt: 2 })
    );
    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'm3@x.com' }));
    const mgrMemberId = await t.run((ctx) =>
      ctx.db.insert('businessMembers', { businessId, userId: mgrUserId, role: 'manager', createdAt: 5 })
    );
    await t.run((ctx) =>
      ctx.db.insert('memberOutletAccess', { businessMemberId: mgrMemberId, cafeId: granted, createdAt: 5 })
    );
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });

    await expect(asMgr.mutation(api.outlets.createOutlet, { name: 'Nakal' })).rejects.toThrow('owner access required');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/convex/outlet-switcher.test.ts -t "createOutlet"`
Expected: FAIL — `api.outlets.createOutlet` does not exist.

- [ ] **Step 3: Implement `createOutlet`**

In `convex/outlets.ts`, add `requireBusinessOwner` to the `./lib/auth` import (so it reads `import { requireActiveOutlet, requireBusinessOwner, resolveOutletAccess } from './lib/auth';`) and append:

```typescript
export const createOutlet = mutation({
  args: { name: v.string() },
  returns: v.id('cafes'),
  handler: async (ctx, { name }) => {
    const { userId, businessId } = await requireBusinessOwner(ctx);
    // businessId is only null for an owner whose data predates the backfill;
    // by the time an owner adds a second outlet the backfill has run.
    if (!businessId) {
      throw new Error('no outlet access');
    }
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      throw new Error('Nama outlet wajib diisi.');
    }
    if (trimmed.length > 80) {
      throw new Error('Nama outlet maksimal 80 karakter.');
    }
    const now = Date.now();
    const cafeId = await ctx.db.insert('cafes', {
      name: trimmed,
      ownerUserId: userId,
      businessId,
      createdAt: now,
      timezone: 'Asia/Jakarta',
      taxRatePct: 11,
      taxEnabled: true,
    });
    const user = await ctx.db.get(userId);
    const ownerName = (user as { name?: string } | null)?.name?.trim() || 'Pemilik';
    await ctx.db.insert('cafeStaff', {
      cafeId,
      name: ownerName,
      role: 'owner',
      archived: false,
      createdAt: now,
    });
    const existing = await ctx.db
      .query('activeOutlet')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { cafeId, updatedAt: now });
    } else {
      await ctx.db.insert('activeOutlet', { userId, cafeId, updatedAt: now });
    }
    return cafeId;
  },
});
```

- [ ] **Step 4: Regenerate types**

Run: `./node_modules/.bin/convex codegen`
Expected: `api.outlets.createOutlet` exposed, exit 0.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/convex/outlet-switcher.test.ts -t "createOutlet"`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add convex/outlets.ts convex/_generated tests/convex/outlet-switcher.test.ts
git commit -m "feat(multi-outlet): createOutlet mutation (owner-only)"
```

---

### Task 4: Outlet switcher UI in the sidebar header

**Files:**
- Create: `src/components/outlet-switcher.tsx`
- Modify: `src/components/app-sidebar.tsx:44-54` (replace the brand-mark header with the switcher)
- i18n: `src/locales/{id,en}/messages.po` (regenerated + en filled)

**Interfaces:**
- Consumes: `api.outlets.myOutlets`, `api.outlets.setActiveOutlet` (Tasks 1-2).
- Produces: `<OutletSwitcher />` — a shadcn DropdownMenu in the sidebar header that shows the active outlet and switches on select. (Owner-only "Add outlet" is added in Task 5.)

- [ ] **Step 1: Create the switcher component**

Create `src/components/outlet-switcher.tsx`:

```tsx
"use client";

import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Check, ChevronsUpDown, Store } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { SidebarMenuButton } from "~/components/ui/sidebar";

export function OutletSwitcher() {
	const outlets = useQuery(api.outlets.myOutlets, {});
	const setActive = useMutation(api.outlets.setActiveOutlet);
	const active = outlets?.find((o) => o.isActive) ?? outlets?.[0];
	const activeName = active?.name ?? "kodapos";
	const initial = activeName.charAt(0).toUpperCase();

	async function handleSelect(cafeId: Id<"cafes">): Promise<void> {
		if (!active || cafeId === active.cafeId) return;
		await setActive({ cafeId });
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<SidebarMenuButton
					size="lg"
					className="data-[state=open]:bg-sidebar-accent"
				>
					<div className="flex aspect-square size-7 items-center justify-center rounded-md bg-primary/10 font-semibold text-primary text-xs">
						{initial}
					</div>
					<span className="truncate font-medium text-foreground!">
						{activeName}
					</span>
					<ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
				</SidebarMenuButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
			>
				<DropdownMenuLabel className="text-muted-foreground text-xs">
					<Trans>Outlet</Trans>
				</DropdownMenuLabel>
				{outlets?.map((o) => (
					<DropdownMenuItem
						key={o.cafeId}
						className="gap-2"
						onSelect={() => handleSelect(o.cafeId)}
					>
						<Store className="size-4 text-muted-foreground" />
						<span className="truncate">{o.name}</span>
						{o.isActive ? <Check className="ml-auto size-4" /> : null}
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="font-normal text-[10px] text-muted-foreground">
					kodapos v{__APP_VERSION__}
				</DropdownMenuLabel>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
```

- [ ] **Step 2: Mount the switcher in the sidebar header**

In `src/components/app-sidebar.tsx`, replace the `SidebarHeader` block (the `SidebarMenuButton asChild`/`Link to="/dashboard"` brand mark) with the switcher. Add `SidebarMenu` to the existing import from `~/components/ui/sidebar` (it's already imported; `SidebarMenuItem` too). The new header:

```tsx
			<SidebarHeader className="h-14 justify-center border-b px-2">
				<SidebarMenu>
					<SidebarMenuItem>
						<OutletSwitcher />
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
```

Add the import `import { OutletSwitcher } from "~/components/outlet-switcher";`. Remove the now-unused `BrandMark` import and the `closeMobile`/`Link`/`useLingui`/`__APP_VERSION__` references **only if** they are no longer used anywhere else in the file — check first (`closeMobile` is still used by the footer links; `Link`, `useLingui` are still used by the footer; keep them). `BrandMark` becomes unused after this change — remove its import. Dashboard remains reachable via the "Dasbor" nav item.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (Catches an unused `BrandMark` import or a wrong `Id` type.)

- [ ] **Step 4: Extract + translate i18n strings**

Run: `pnpm lingui:extract`
This adds the new `Outlet` message to `src/locales/id/messages.po` (source) and `src/locales/en/messages.po`. In `src/locales/en/messages.po`, set the English `msgstr` for the new id:
- `msgid "Outlet"` → `msgstr "Outlet"`

(The Indonesian source `msgstr` for `Outlet` is `Outlet`.) Then compile:

Run: `pnpm lingui:compile`
Expected: both steps exit 0; no other catalog churn beyond the new string.

- [ ] **Step 5: Visual verification**

Use the `run` skill (or `pnpm dev`) to open the app as a signed-in owner. Confirm: the sidebar header shows the active outlet name with an initial badge; opening the dropdown lists the outlet(s) with a check on the active one; the `kodapos vX` label shows at the dropdown bottom; collapsing the sidebar to icon mode shows just the initial badge. Check light and dark themes. (No automated test — this is a manual gate.)

- [ ] **Step 6: Commit**

```bash
git add src/components/outlet-switcher.tsx src/components/app-sidebar.tsx src/locales
git commit -m "feat(multi-outlet): outlet switcher in the sidebar header"
```

---

### Task 5: "Add outlet" dialog (owner-only)

**Files:**
- Create: `src/components/add-outlet-dialog.tsx`
- Modify: `src/components/outlet-switcher.tsx` (owner-only "Add outlet" item + dialog state)
- i18n: `src/locales/{id,en}/messages.po`

**Interfaces:**
- Consumes: `api.outlets.createOutlet` (Task 3); `usePermissions` (`isOwner`); TanStack Router `useNavigate`.
- Produces: `<AddOutletDialog open onOpenChange />` — name input that creates an outlet, closes, and navigates to `/settings/profile`. The switcher gains an owner-only "Tambah outlet" item that opens it.

- [ ] **Step 1: Create the dialog component**

Create `src/components/add-outlet-dialog.tsx`:

```tsx
"use client";

import { useNavigate } from "@tanstack/react-router";
import { api } from "convex/_generated/api";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export function AddOutletDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (value: boolean) => void;
}): React.ReactElement {
	const { t } = useLingui();
	const navigate = useNavigate();
	const createOutlet = useMutation(api.outlets.createOutlet);
	const [name, setName] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: React.FormEvent): Promise<void> {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) {
			setError(t`Nama outlet wajib diisi.`);
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			await createOutlet({ name: trimmed });
			onOpenChange(false);
			setName("");
			await navigate({ to: "/settings/profile" });
		} catch (err) {
			setError(err instanceof Error ? err.message : t`Gagal membuat outlet.`);
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>
							<Trans>Tambah outlet</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								Buat outlet baru. Anda bisa mengatur menu, pajak, dan jam buka
								setelahnya.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-2 py-4">
						<Label htmlFor="outlet-name">
							<Trans>Nama outlet</Trans>
						</Label>
						<Input
							id="outlet-name"
							autoFocus
							maxLength={80}
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder={t`Misalnya: Kopi Senja Cabang 2`}
						/>
						{error ? (
							<p className="text-destructive text-sm">{error}</p>
						) : null}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							<Trans>Batal</Trans>
						</Button>
						<Button type="submit" disabled={submitting}>
							<Trans>Buat outlet</Trans>
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 2: Add the owner-only "Add outlet" item to the switcher**

In `src/components/outlet-switcher.tsx`: import `useState` from `react`, `Plus` from `lucide-react`, `usePermissions` from `~/lib/permissions`, and `AddOutletDialog` from `~/components/add-outlet-dialog`. Add state and the gated item.

Add near the top of the component body:
```tsx
	const { isOwner } = usePermissions();
	const [addOpen, setAddOpen] = useState(false);
```

Insert before the final `<DropdownMenuSeparator />` + version label, an owner-only block:
```tsx
				{isOwner ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="gap-2"
							onSelect={(e) => {
								e.preventDefault();
								setAddOpen(true);
							}}
						>
							<Plus className="size-4" />
							<Trans>Tambah outlet</Trans>
						</DropdownMenuItem>
					</>
				) : null}
```

And render the dialog after the `</DropdownMenu>` (wrap the return in a fragment):
```tsx
	return (
		<>
			<DropdownMenu>
				{/* ...existing trigger + content... */}
			</DropdownMenu>
			<AddOutletDialog open={addOpen} onOpenChange={setAddOpen} />
		</>
	);
```

(`e.preventDefault()` on the item keeps the dropdown's select-close from racing the dialog open.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Extract + translate i18n strings**

Run: `pnpm lingui:extract`
In `src/locales/en/messages.po`, fill the English `msgstr` for the new ids (leave `Batal` — it already exists with `msgstr "Cancel"`):
- `Tambah outlet` → `Add outlet`
- `Buat outlet baru. Anda bisa mengatur menu, pajak, dan jam buka setelahnya.` → `Create a new outlet. You can set up its menu, tax, and hours afterward.`
- `Nama outlet` → `Outlet name`
- `Misalnya: Kopi Senja Cabang 2` → `For example: Kopi Senja Branch 2`
- `Buat outlet` → `Create outlet`
- `Nama outlet wajib diisi.` → `Outlet name is required.`
- `Gagal membuat outlet.` → `Failed to create outlet.`

Then:

Run: `pnpm lingui:compile`
Expected: exit 0. Confirm no English `msgstr` for the new ids is left empty (an empty `msgstr` renders the Indonesian source to English users).

- [ ] **Step 5: Visual verification**

Via the `run` skill: as an owner, open the switcher → "Tambah outlet" appears; clicking opens the dialog; submitting a name creates the outlet, closes the dialog, switches the active outlet, and lands on Settings → Profile showing the new (empty) outlet. As a non-owner (manager) the "Tambah outlet" item is absent. Check light and dark. (Manual gate — no automated test.)

- [ ] **Step 6: Commit**

```bash
git add src/components/add-outlet-dialog.tsx src/components/outlet-switcher.tsx src/locales
git commit -m "feat(multi-outlet): add-outlet dialog from the switcher"
```

---

## Self-Review

**Spec coverage (Phase 3 slice of §6):**
- `myOutlets` query → `[{ cafeId, name, isActive }]` → Task 1. ✓
- `setActiveOutlet({ cafeId })` validates access + upserts → Task 2. ✓
- `createOutlet({ name })` owner-only, cafe under business + owner `cafeStaff`, then owner configures via existing settings → Task 3 (create + switch) + Task 5 (navigate to Settings → Profile). ✓
- Outlet switcher dropdown in the sidebar header → Task 4. ✓
- Owner-only "Add outlet" → Task 5. ✓
- Existing single-cafe owners: switcher shows one outlet, active = that outlet, zero UX change → `myOutlets`/`myCafe` resolve the single outlet identically (Task 1). ✓
- Reactivity re-scopes the app on switch → `myCafe` is now active-outlet-aware (Task 1); `setActiveOutlet` writing `activeOutlet` re-runs every `requireActiveOutlet`-backed query. ✓

**Deliberate deferrals (out of Phase 3 scope, by design):**
- **"All outlets" entry → consolidated dashboard:** deferred to Phase 5 (the dashboard does not exist yet). Adding a dead entry now would be a placeholder.
- **Per-outlet logos in the switcher:** `myOutlets` returns name only (spec shape). The trigger shows an initial badge; the active outlet's logo still appears via `nav-user`'s avatar.
- **Manager dangling-cafe-id guard + manager multi-grant ordering test:** carried over from the Phase 2 review as Phase 3 follow-ups. `resolveOutletAccess`'s manager branch maps `memberOutletAccess` → `cafeId` without checking the cafe still exists; since managers cannot be created until Phase 4, this remains latent — track it into Phase 4 rather than Phase 3 (no manager-facing create/switch flow ships here either). Noted, not silently dropped.

**Placeholder scan:** none — every code step has complete code. The `cafeStaff` index used in Task 3's test is `by_cafe_active` (`['cafeId', 'archived']`), verified against `convex/schema.ts`.

**Type consistency:** `OutletAccess` / `resolveOutletAccess` (Task 1) are consumed with the same names/shape in Tasks 2-3. `myOutlets` returns `{ cafeId: Id<'cafes'>, name: string, isActive: boolean }` in Task 1 and is consumed with those exact fields in Task 4. `api.outlets.{myOutlets,setActiveOutlet,createOutlet}` references match across backend and UI tasks. `createOutlet` returns `Id<'cafes'>`, consumed (ignored) by the dialog in Task 5.

---

## Next phases (separate plans)

- **Phase 4:** manager invites (`inviteManager`, `acceptPendingInvites`), members UI, no-access state, owner-only gating via `requireBusinessOwner`. Fold in the deferred manager dangling-cafe guard + ordering test.
- **Phase 5:** consolidated reporting (`reports.businessOverview`) + "All outlets" dashboard + the switcher's "All outlets" entry.
```
