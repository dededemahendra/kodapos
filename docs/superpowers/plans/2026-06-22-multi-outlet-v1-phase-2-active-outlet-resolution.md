# Multi-outlet v1 — Phase 2: Active-outlet resolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-cafe-per-owner assumption with a server-resolved **active outlet**, so the ~230 existing call sites keep working while the resolved `cafeId` now respects business membership and the user's active-outlet choice.

**Architecture:** Rewrite the single auth helper `requireOwnerCafe` into `requireActiveOutlet(ctx)` returning a **superset** shape `{ userId, cafeId, businessId, role }`. The new body resolves the member's accessible outlets (owner → all cafes in the business; manager → `memberOutletAccess`), picks the persisted `activeOutlet` when still accessible else the first accessible outlet, and **never writes** (it runs in queries too). A transitional legacy fallback keeps un-backfilled owners working. Add `requireBusinessOwner(ctx)` for owner-only operations (consumed in later phases). Task 1 lands the new logic behind a name-preserving alias so every call site stays green; Task 2 does the mechanical rename and drops the alias.

**Tech Stack:** Convex (function helpers in `convex/lib/auth.ts`), convex-test + Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-21-multi-outlet-v1-design.md` (§5 auth resolution, §10 testing).

## Global Constraints

- **Convex function syntax:** helpers are plain `async` functions taking `QueryCtx | MutationCtx`; any new Convex functions use new-style `query/mutation({ args, returns, handler })` with full `v.*` validators. Read `convex/_generated/ai/guidelines.md` before writing Convex code.
- **Codegen:** only needed if a registered function changes. This phase changes only `convex/lib/auth.ts` (a helper module, not a registered function) and call-site imports, so **no codegen is expected**. If you add/rename a registered function, run `./node_modules/.bin/convex codegen` (NOT `npx`) and commit `convex/_generated/**`.
- **Quality gate before every commit:** `pnpm typecheck` and `pnpm test` must both pass (full suite, currently 897 tests).
- **Test harness:** `convexTest(schema, modules)`; authenticate with `t.withIdentity({ subject: \`${userId}|test_session\` })`; the returned scoped tester's `.run((ctx) => ...)` executes inline functions **with that identity**, so a `ctx`-helper like `requireActiveOutlet` can be called directly inside `asOwner.run(...)`. Seed rows with `t.run((ctx) => ctx.db.insert(...))`. See `tests/convex/multi-outlet.test.ts`.
- **The helper MUST NOT write.** It runs inside queries. The active-outlet default is computed per call; only `setActiveOutlet` (Phase 3) persists a choice.
- **Backward compatibility:** existing call sites destructure `{ userId, cafeId }`; the superset return is additive so they keep compiling and behaving. After Phase 1's backfill, every owner has a `businessMembers` row + `activeOutlet`; the legacy fallback covers any owner whose data predates the backfill.

---

### Task 1: Rewrite the auth helper — `requireActiveOutlet` + `requireBusinessOwner`

**Files:**
- Modify: `convex/lib/auth.ts:13-34` (replace `requireOwnerCafe` body/signature; add `requireActiveOutlet`, `requireBusinessOwner`, `ActiveOutlet` type, and a name-preserving `requireOwnerCafe` alias)
- Test: `tests/convex/active-outlet.test.ts` (create)

**Interfaces:**
- Consumes: the Phase 1 schema (`businessMembers` by_user, `cafes` by_business, `memberOutletAccess` by_member, `activeOutlet` by_user).
- Produces:
  - `type ActiveOutlet = { userId: Id<'users'>; cafeId: Id<'cafes'>; businessId: Id<'businesses'> | null; role: 'owner' | 'manager' }`
  - `requireActiveOutlet(ctx: QueryCtx | MutationCtx): Promise<ActiveOutlet>` — throws `'not authenticated'` / `'no outlet access'`.
  - `requireBusinessOwner(ctx: QueryCtx | MutationCtx): Promise<ActiveOutlet & { role: 'owner' }>` — throws `'owner access required'` for managers.
  - `requireOwnerCafe` — transitional alias `= requireActiveOutlet` (removed in Task 2). Its `{ userId, cafeId }` consumers keep working via structural subset.

- [ ] **Step 1: Write the failing tests**

Create `tests/convex/active-outlet.test.ts`:

```typescript
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { requireActiveOutlet, requireBusinessOwner } from '../../convex/lib/auth';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

/** Seed a fresh owner via the real bootstrap (creates business + membership + active outlet). */
async function seedOwner(t: ReturnType<typeof convexTest>, name = 'Kopi Senja') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: `${name}@x.com` }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  const cafeId = await asOwner.mutation(api.cafes.createForOwner, { name });
  const cafe = await t.run((ctx) => ctx.db.get(cafeId as Id<'cafes'>));
  return { userId, asOwner, cafeId, businessId: cafe!.businessId as Id<'businesses'> };
}

describe('requireActiveOutlet — owner', () => {
  it('resolves the single outlet for a freshly bootstrapped owner', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cafeId, businessId, userId } = await seedOwner(t);

    const resolved = await asOwner.run((ctx) => requireActiveOutlet(ctx));
    expect(resolved.cafeId).toBe(cafeId);
    expect(resolved.businessId).toBe(businessId);
    expect(resolved.role).toBe('owner');
    expect(resolved.userId).toBe(userId);
  });

  it('honors the persisted active outlet when the owner has multiple outlets', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, businessId, userId, cafeId: first } = await seedOwner(t);
    // A second outlet under the same business.
    const second = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang 2', ownerUserId: userId, businessId, createdAt: 2 })
    );
    // Point the active outlet at the second cafe.
    await t.run(async (ctx) => {
      const active = await ctx.db
        .query('activeOutlet')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .first();
      await ctx.db.patch(active!._id, { cafeId: second, updatedAt: 3 });
    });

    const resolved = await asOwner.run((ctx) => requireActiveOutlet(ctx));
    expect(resolved.cafeId).toBe(second);
    expect([first, second]).toContain(resolved.cafeId);
  });

  it('falls back to the first accessible outlet when the active outlet is not accessible', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId } = await seedOwner(t);
    // Point active outlet at a cafe in a DIFFERENT business (not accessible).
    const otherUser = await t.run((ctx) => ctx.db.insert('users', { name: 'X', email: 'x2@x.com' }));
    const otherBiz = await t.run((ctx) => ctx.db.insert('businesses', { name: 'B', ownerUserId: otherUser, createdAt: 1 }));
    const foreignCafe = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Foreign', ownerUserId: otherUser, businessId: otherBiz, createdAt: 1 })
    );
    await t.run(async (ctx) => {
      const active = await ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId)).first();
      await ctx.db.patch(active!._id, { cafeId: foreignCafe, updatedAt: 4 });
    });

    const resolved = await asOwner.run((ctx) => requireActiveOutlet(ctx));
    expect(resolved.cafeId).not.toBe(foreignCafe);
    expect(resolved.role).toBe('owner');
  });

  it('does not write when defaulting (helper is query-safe)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, userId } = await seedOwner(t);
    // Remove the seeded active outlet so the helper must default.
    await t.run(async (ctx) => {
      const active = await ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId)).first();
      if (active) await ctx.db.delete(active._id);
    });

    await asOwner.run((ctx) => requireActiveOutlet(ctx));

    const after = await t.run((ctx) =>
      ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId)).collect()
    );
    expect(after).toHaveLength(0); // helper never persisted a default
  });
});

describe('requireActiveOutlet — manager', () => {
  it('resolves only outlets granted via memberOutletAccess', async () => {
    const t = convexTest(schema, modules);
    const { userId: ownerId, businessId } = await seedOwner(t);
    const ownerCafe = await t.run((ctx) =>
      ctx.db.query('cafes').withIndex('by_business', (q) => q.eq('businessId', businessId)).first()
    );
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

    const resolved = await asMgr.run((ctx) => requireActiveOutlet(ctx));
    expect(resolved.cafeId).toBe(granted);
    expect(resolved.cafeId).not.toBe(ownerCafe!._id);
    expect(resolved.role).toBe('manager');
  });
});

describe('requireActiveOutlet — failure & fallback', () => {
  it('throws when the user has no membership and no cafe', async () => {
    const t = convexTest(schema, modules);
    const orphan = await t.run((ctx) => ctx.db.insert('users', { name: 'Orphan', email: 'orphan@x.com' }));
    const asOrphan = t.withIdentity({ subject: `${orphan}|test_session` });
    await expect(asOrphan.run((ctx) => requireActiveOutlet(ctx))).rejects.toThrow('no outlet access');
  });

  it('legacy fallback: an owner with a cafe but no membership row still resolves', async () => {
    const t = convexTest(schema, modules);
    const { userId, cafeId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Legacy', email: 'legacy@x.com' });
      const cafeId = await ctx.db.insert('cafes', { name: 'Warung Lama', ownerUserId: userId, createdAt: 1 });
      return { userId, cafeId };
    });
    const asLegacy = t.withIdentity({ subject: `${userId}|test_session` });

    const resolved = await asLegacy.run((ctx) => requireActiveOutlet(ctx));
    expect(resolved.cafeId).toBe(cafeId);
    expect(resolved.role).toBe('owner');
    expect(resolved.businessId).toBeNull();
  });
});

describe('requireBusinessOwner', () => {
  it('passes for an owner', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, businessId } = await seedOwner(t);
    const resolved = await asOwner.run((ctx) => requireBusinessOwner(ctx));
    expect(resolved.role).toBe('owner');
    expect(resolved.businessId).toBe(businessId);
  });

  it('rejects a manager', async () => {
    const t = convexTest(schema, modules);
    const { userId: ownerId, businessId } = await seedOwner(t);
    const granted = await t.run((ctx) =>
      ctx.db.insert('cafes', { name: 'Cabang', ownerUserId: ownerId, businessId, createdAt: 2 })
    );
    const mgrUserId = await t.run((ctx) => ctx.db.insert('users', { name: 'Mgr', email: 'm2@x.com' }));
    const mgrMemberId = await t.run((ctx) =>
      ctx.db.insert('businessMembers', { businessId, userId: mgrUserId, role: 'manager', createdAt: 5 })
    );
    await t.run((ctx) =>
      ctx.db.insert('memberOutletAccess', { businessMemberId: mgrMemberId, cafeId: granted, createdAt: 5 })
    );
    const asMgr = t.withIdentity({ subject: `${mgrUserId}|test_session` });

    await expect(asMgr.run((ctx) => requireBusinessOwner(ctx))).rejects.toThrow('owner access required');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/convex/active-outlet.test.ts`
Expected: FAIL — `requireActiveOutlet` / `requireBusinessOwner` are not exported from `convex/lib/auth.ts`.

- [ ] **Step 3: Implement the new helper**

In `convex/lib/auth.ts`, add the imports for the new Id types if not already present (`Id<'businesses'>` is referenced). The existing import is `import type { DataModel, Doc, Id, TableNames } from '../_generated/dataModel';` — `Id` is generic, so no import change is needed.

Replace the entire `requireOwnerCafe` function (lines 9-34, the JSDoc block + function) with:

```typescript
export type ActiveOutlet = {
  userId: Id<'users'>;
  cafeId: Id<'cafes'>;
  businessId: Id<'businesses'> | null;
  role: 'owner' | 'manager';
};

/**
 * Resolve the outlet (cafe) the signed-in user is currently operating.
 *
 * Returns a superset of the legacy `{ userId, cafeId }` shape so the ~230
 * existing call sites keep working unchanged. Resolution:
 *   1. owner  -> all cafes in their business
 *      manager-> the cafes granted via memberOutletAccess
 *   2. active outlet = the persisted choice when still accessible, else the
 *      first accessible outlet (an ephemeral default — this helper runs in
 *      queries and MUST NOT write; only setActiveOutlet persists a choice).
 *
 * Throws 'not authenticated' with no identity and 'no outlet access' when the
 * user can reach no outlet.
 */
export async function requireActiveOutlet(
  ctx: QueryCtx | MutationCtx
): Promise<ActiveOutlet> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('not authenticated');
  }

  const member = await ctx.db
    .query('businessMembers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();

  // Transitional fallback: an owner whose data predates the multi-outlet
  // backfill has a cafe but no businessMembers row. Behave exactly like the
  // legacy requireOwnerCafe (oldest cafe by owner, via by_owner.first()) so
  // this phase is safe to deploy before the backfill has run everywhere.
  // Removable once the backfill is confirmed run in all environments.
  if (!member) {
    const cafe = await ctx.db
      .query('cafes')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
      .first();
    if (!cafe) {
      throw new Error('no outlet access');
    }
    return { userId, cafeId: cafe._id, businessId: cafe.businessId ?? null, role: 'owner' };
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

  if (accessibleCafeIds.length === 0) {
    throw new Error('no outlet access');
  }

  const active = await ctx.db
    .query('activeOutlet')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();
  const cafeId =
    active && accessibleCafeIds.includes(active.cafeId)
      ? active.cafeId
      : accessibleCafeIds[0];

  return { userId, cafeId, businessId: member.businessId, role: member.role };
}

/**
 * Owner-only gate for business-level operations (manage members, add/remove
 * outlets, business settings). Resolves the active outlet first, then asserts
 * the member is the owner. Consumed by later phases.
 */
export async function requireBusinessOwner(
  ctx: QueryCtx | MutationCtx
): Promise<ActiveOutlet & { role: 'owner' }> {
  const resolved = await requireActiveOutlet(ctx);
  if (resolved.role !== 'owner') {
    throw new Error('owner access required');
  }
  return { ...resolved, role: 'owner' };
}

/**
 * @deprecated Transitional alias kept so the ~230 existing call sites compile
 * during the Phase 2 rename. Removed in the same phase (Task 2) once every
 * call site references `requireActiveOutlet` directly.
 */
export const requireOwnerCafe = requireActiveOutlet;
```

Leave `requireOwned` (and its `TenantTable` type) untouched below.

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `pnpm exec vitest run tests/convex/active-outlet.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Run the full suite (regression — every existing call site)**

Run: `pnpm test`
Expected: PASS — 897 existing tests stay green (they seed via `createForOwner`, so they take the membership path; the alias preserves the `requireOwnerCafe` name and the `{ userId, cafeId }` subset).

If any previously-green test now fails, STOP and diagnose — a real behavior change leaked in (the resolution should be equivalent to the old `.first()` for single-outlet owners).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add convex/lib/auth.ts tests/convex/active-outlet.test.ts
git commit -m "feat(multi-outlet): requireActiveOutlet resolves outlet via membership"
```

---

### Task 2: Mechanical rename `requireOwnerCafe` → `requireActiveOutlet` and drop the alias

**Files:**
- Modify: all 45 `convex/**/*.ts` files that import or call `requireOwnerCafe` (imports + call sites)
- Modify: `convex/lib/auth.ts` (remove the `requireOwnerCafe` alias)

**Interfaces:**
- Consumes: `requireActiveOutlet` from Task 1.
- Produces: zero references to `requireOwnerCafe` anywhere in `convex/` or `tests/`; the alias export is gone.

- [ ] **Step 1: Confirm the starting reference count**

Run: `grep -rn "requireOwnerCafe" convex tests --include="*.ts" | grep -v "_generated" | wc -l`
Expected: a non-zero count (≈231 — the 230 call sites plus the alias line in `lib/auth.ts`).

- [ ] **Step 2: Rename across the codebase (mechanical, identifier-only)**

`requireOwnerCafe` is a unique identifier (no substring collisions — `requireOwned` is a different token and won't match a whole-word replace). Replace it everywhere it appears in `convex/` and `tests/`, **except** delete the alias line in `lib/auth.ts` rather than renaming it (Step 3 handles that). Run:

```bash
grep -rl "requireOwnerCafe" convex tests --include="*.ts" \
  | grep -v "_generated" \
  | xargs sed -i '' 's/requireOwnerCafe/requireActiveOutlet/g'
```

(On the BSD/macOS `sed` in this environment the empty `''` after `-i` is required for in-place edit with no backup.)

This rewrites both the `import { ... } from './lib/auth'` specifiers and every call site. After this, `lib/auth.ts` contains a stray line `export const requireActiveOutlet = requireActiveOutlet;` (the renamed alias) — remove it in Step 3.

- [ ] **Step 3: Remove the now-self-referential alias line**

In `convex/lib/auth.ts`, delete the (now-renamed) alias block — the JSDoc `@deprecated` comment plus the line that reads `export const requireActiveOutlet = requireActiveOutlet;`. The genuine `export async function requireActiveOutlet(...)` definition stays.

- [ ] **Step 4: Verify no references remain and no self-assignment lingers**

Run: `grep -rn "requireOwnerCafe" convex tests --include="*.ts" | grep -v "_generated"`
Expected: no output.

Run: `grep -n "requireActiveOutlet = requireActiveOutlet" convex/lib/auth.ts`
Expected: no output (the alias line is gone).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (A leftover self-assignment or a missed import would surface here.)

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: PASS — 897 + Task 1's new tests, all green. Pure rename, no behavior change.

- [ ] **Step 7: Commit**

```bash
git add convex/ tests/
git commit -m "refactor(multi-outlet): rename requireOwnerCafe to requireActiveOutlet at call sites"
```

---

## Self-Review

**Spec coverage (Phase 2 slice of §5 + §10):**
- `requireOwnerCafe` → `requireActiveOutlet`, superset return `{ userId, cafeId, businessId, role }` → Task 1 (logic) + Task 2 (rename). ✓
- Owner all-access; manager subset via `memberOutletAccess` → Task 1 Step 1 tests + Step 3 logic. ✓
- Active outlet honored when accessible; default-to-first otherwise; helper never writes → Task 1 tests (`honors`, `falls back`, `does not write`). ✓
- Access-denied for a non-accessible active outlet → falls back to first accessible (Task 1 `falls back` test). ✓
- Throws with no membership/cafe → Task 1 `throws when the user has no membership and no cafe`. ✓
- `requireBusinessOwner` rejects managers → Task 1 `requireBusinessOwner` tests. ✓
- Regression: existing per-cafe tests stay green (helper still returns `cafeId`) → Task 1 Step 5, Task 2 Step 6. ✓

**Deviations from spec, with rationale:**
- **Legacy fallback added** (spec §5 says "throw if none"): an owner whose data predates the backfill has a cafe but no `businessMembers` row. The fallback preserves today's exact behavior for them, decoupling Phase 2's deploy from the manual backfill step. Documented as transitional/removable. `businessId` is `Id<'businesses'> | null` to be honest about that one path; Phase 2 has no `businessId` consumers, so the `| null` costs nothing now.
- **Name-preserving alias in Task 1, rename in Task 2:** keeps each commit independently green and splits the risky logic change from the large mechanical diff, so a reviewer can gate them separately.

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `ActiveOutlet`, `requireActiveOutlet`, `requireBusinessOwner` names and the `{ userId, cafeId, businessId, role }` shape are used identically across Tasks 1–2 and the tests. The `businessId: Id<'businesses'> | null` type is consistent between the function return and the `legacy fallback` test (`toBeNull()`).

---

## Next phases (separate plans)

- **Phase 3:** outlet switcher — `myOutlets` query, `setActiveOutlet` mutation (the only writer of `activeOutlet`), `createOutlet` (owner-only), sidebar switcher UI + "Add outlet".
- **Phase 4:** manager invites — `inviteManager`, `acceptPendingInvites`, members UI, no-access state, owner-only gating via `requireBusinessOwner`.
- **Phase 5:** consolidated reporting — `reports.businessOverview` + "All outlets" dashboard.
