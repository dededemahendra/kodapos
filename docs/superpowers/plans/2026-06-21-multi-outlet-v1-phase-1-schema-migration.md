# Multi-outlet v1 — Phase 1: Schema + Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the multi-outlet data model (business + membership + active-outlet tables, `cafes.businessId`) and migrate existing single-cafe owners into it, with zero behavior change for current users.

**Architecture:** A "cafe" is already an outlet. Phase 1 adds a `business` grouping above cafes plus membership/active-outlet tables, evolves `cafes.createForOwner` to create the business + owner membership + active-outlet for new signups, and adds an idempotent backfill `internalMutation` for existing cafes. No query/mutation re-scoping yet — the app keeps resolving the single cafe per owner exactly as today (every existing owner has exactly one cafe → one outlet).

**Tech Stack:** Convex (schema + functions), convex-test + Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-21-multi-outlet-v1-design.md` (§4 data model, §9 migration).

## Global Constraints

- **Convex function syntax:** new-style `mutation/query/internalMutation({ args, returns, handler })` with full `v.*` arg + return validators. Read `convex/_generated/ai/guidelines.md` before writing Convex code.
- **Codegen:** after any schema change, run `./node_modules/.bin/convex codegen` (NOT `npx`, which a shell hook breaks) and **commit the regenerated `convex/_generated/**` files**.
- **Quality gate before every commit:** `pnpm typecheck` and `pnpm test` must pass.
- **Test harness:** `convexTest(schema, modules)`; authenticate with `t.withIdentity({ subject: \`${userId}|test_session\` })`; seed rows with `t.run((ctx) => ctx.db.insert(...))`. See `tests/convex/cafes.test.ts`.
- **Time:** Convex server code may use `Date.now()` (the existing code does).
- **Backward compatibility:** existing single-cafe owners must see no behavior change; `requireOwnerCafe` and all 230 call sites stay untouched in Phase 1.

---

### Task 1: Schema — new tables + `cafes.businessId`

**Files:**
- Modify: `convex/schema.ts` (add 5 tables; add `businessId` + index to `cafes`)
- Modify: `convex/cafes.ts:9-40` (add `businessId` to the `cafeFields` return validator)
- Test: `tests/convex/multi-outlet.test.ts` (create)

**Interfaces:**
- Produces (schema tables, all new):
  - `businesses { name: string, ownerUserId: Id<'users'>, createdAt: number }` — index `by_owner ['ownerUserId']`
  - `businessMembers { businessId: Id<'businesses'>, userId: Id<'users'>, role: 'owner'|'manager', createdAt: number }` — indexes `by_business ['businessId']`, `by_user ['userId']`
  - `businessInvites { businessId: Id<'businesses'>, email: string, role: 'manager', cafeIds: Id<'cafes'>[], createdAt: number }` — indexes `by_email ['email']`, `by_business ['businessId']`
  - `memberOutletAccess { businessMemberId: Id<'businessMembers'>, cafeId: Id<'cafes'>, createdAt: number }` — indexes `by_member ['businessMemberId']`, `by_cafe ['cafeId']`
  - `activeOutlet { userId: Id<'users'>, cafeId: Id<'cafes'>, updatedAt: number }` — index `by_user ['userId']`
- Produces (changed): `cafes` gains `businessId: optional Id<'businesses'>` + index `by_business ['businessId']`.

- [ ] **Step 1: Write the failing test**

Create `tests/convex/multi-outlet.test.ts`:

```typescript
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

describe('multi-outlet schema', () => {
  it('stores a business, an owner membership, and an active outlet', async () => {
    const t = convexTest(schema, modules);
    const result = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
      const businessId = await ctx.db.insert('businesses', {
        name: 'Kopi Senja',
        ownerUserId: userId,
        createdAt: 1,
      });
      const cafeId = await ctx.db.insert('cafes', {
        name: 'Kopi Senja',
        ownerUserId: userId,
        businessId,
        createdAt: 1,
      });
      const memberId = await ctx.db.insert('businessMembers', {
        businessId,
        userId,
        role: 'owner',
        createdAt: 1,
      });
      await ctx.db.insert('activeOutlet', { userId, cafeId, updatedAt: 1 });
      return { userId, businessId, cafeId, memberId };
    });

    const cafe = await t.run((ctx) => ctx.db.get(result.cafeId as Id<'cafes'>));
    expect(cafe?.businessId).toBe(result.businessId);

    const active = await t.run((ctx) =>
      ctx.db
        .query('activeOutlet')
        .withIndex('by_user', (q) => q.eq('userId', result.userId as Id<'users'>))
        .first()
    );
    expect(active?.cafeId).toBe(result.cafeId);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/convex/multi-outlet.test.ts`
Expected: FAIL — convex-test rejects the unknown tables (`businesses`, `businessMembers`, `activeOutlet`) and the unknown `businessId` field on `cafes`.

- [ ] **Step 3: Add the tables and the `cafes.businessId` field to the schema**

In `convex/schema.ts`, add `businessId: v.optional(v.id('businesses'))` to the `cafes` table definition and add `.index('by_business', ['businessId'])` to its index chain. Then add these five new table definitions to the schema object (place them near `cafes`):

```typescript
  businesses: defineTable({
    name: v.string(),
    ownerUserId: v.id('users'),
    createdAt: v.number(),
  }).index('by_owner', ['ownerUserId']),

  businessMembers: defineTable({
    businessId: v.id('businesses'),
    userId: v.id('users'),
    role: v.union(v.literal('owner'), v.literal('manager')),
    createdAt: v.number(),
  })
    .index('by_business', ['businessId'])
    .index('by_user', ['userId']),

  businessInvites: defineTable({
    businessId: v.id('businesses'),
    email: v.string(),
    role: v.literal('manager'),
    cafeIds: v.array(v.id('cafes')),
    createdAt: v.number(),
  })
    .index('by_email', ['email'])
    .index('by_business', ['businessId']),

  memberOutletAccess: defineTable({
    businessMemberId: v.id('businessMembers'),
    cafeId: v.id('cafes'),
    createdAt: v.number(),
  })
    .index('by_member', ['businessMemberId'])
    .index('by_cafe', ['cafeId']),

  activeOutlet: defineTable({
    userId: v.id('users'),
    cafeId: v.id('cafes'),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),
```

- [ ] **Step 4: Add `businessId` to the `cafeFields` return validator**

In `convex/cafes.ts`, inside the `cafeFields` object (after `ownerUserId: v.id('users'),` on line 13), add:

```typescript
  businessId: v.optional(v.id('businesses')),
```

(Without this, the `mine`/`myCafe` queries that return `cafeDoc` would fail return-validation once cafes carry `businessId`.)

- [ ] **Step 5: Regenerate the Convex types**

Run: `./node_modules/.bin/convex codegen`
Expected: updates `convex/_generated/**` with the new tables/fields, exit 0.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/convex/multi-outlet.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add convex/schema.ts convex/cafes.ts convex/_generated tests/convex/multi-outlet.test.ts
git commit -m "feat(multi-outlet): schema for businesses, membership, active outlet"
```

---

### Task 2: Evolve `createForOwner` to create the business + owner membership + active outlet

**Files:**
- Modify: `convex/cafes.ts:43-80` (`createForOwner` handler)
- Test: `tests/convex/multi-outlet.test.ts` (add a test)

**Interfaces:**
- Consumes: the schema tables from Task 1.
- Produces: `createForOwner({ name })` now also inserts one `businesses` row, one `businessMembers` (role `owner`) row, and one `activeOutlet` row, and sets `cafes.businessId`. Return type is unchanged (`Id<'cafes'>`). Idempotency unchanged (returns the existing cafe if one exists).

- [ ] **Step 1: Write the failing test**

Append to `tests/convex/multi-outlet.test.ts`:

```typescript
import { api } from '../../convex/_generated/api';

describe('createForOwner — business bootstrap', () => {
  it('creates a business, owner membership, and active outlet for a new owner', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' }));
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    const cafeId = await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });

    const cafe = await t.run((ctx) => ctx.db.get(cafeId as Id<'cafes'>));
    expect(cafe?.businessId).toBeDefined();

    const business = await t.run((ctx) => ctx.db.get(cafe!.businessId as Id<'businesses'>));
    expect(business?.ownerUserId).toBe(userId);

    const member = await t.run((ctx) =>
      ctx.db.query('businessMembers').withIndex('by_user', (q) => q.eq('userId', userId as Id<'users'>)).first()
    );
    expect(member?.role).toBe('owner');
    expect(member?.businessId).toBe(cafe!.businessId);

    const active = await t.run((ctx) =>
      ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId as Id<'users'>)).first()
    );
    expect(active?.cafeId).toBe(cafeId);
  });

  it('is idempotent: a second call returns the same cafe and does not duplicate the business', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' }));
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    const first = await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
    const second = await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
    expect(second).toBe(first);

    const businesses = await t.run((ctx) =>
      ctx.db.query('businesses').withIndex('by_owner', (q) => q.eq('ownerUserId', userId as Id<'users'>)).collect()
    );
    expect(businesses).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/convex/multi-outlet.test.ts -t "business bootstrap"`
Expected: FAIL — `cafe.businessId` is undefined; no `businesses`/`businessMembers`/`activeOutlet` rows are created yet.

- [ ] **Step 3: Implement the bootstrap in `createForOwner`**

Replace the `createForOwner` handler body (the part after the idempotency `if (existing) return existing._id;`) so it creates the business first, links the cafe, and seeds membership + active outlet:

```typescript
    const now = Date.now();
    const businessId = await ctx.db.insert('businesses', {
      name,
      ownerUserId: userId,
      createdAt: now,
    });
    const cafeId = await ctx.db.insert('cafes', {
      name,
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
    await ctx.db.insert('businessMembers', {
      businessId,
      userId,
      role: 'owner',
      createdAt: now,
    });
    await ctx.db.insert('activeOutlet', { userId, cafeId, updatedAt: now });
    return cafeId;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/convex/multi-outlet.test.ts -t "business bootstrap"`
Expected: PASS (both new tests).

- [ ] **Step 5: Run the full Convex test suite (regression)**

Run: `pnpm exec vitest run tests/convex/cafes.test.ts tests/convex/multi-outlet.test.ts`
Expected: PASS — existing cafe tests still green (createForOwner return shape unchanged).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add convex/cafes.ts tests/convex/multi-outlet.test.ts
git commit -m "feat(multi-outlet): createForOwner bootstraps business + owner membership"
```

---

### Task 3: Idempotent backfill migration for existing cafes

**Files:**
- Create: `convex/multiOutlet.ts` (the `backfillBusinesses` internal mutation)
- Test: `tests/convex/multi-outlet.test.ts` (add a test)

**Interfaces:**
- Consumes: the schema tables from Task 1.
- Produces: `internal.multiOutlet.backfillBusinesses` — an `internalMutation` taking no args, returning `{ migrated: number }`. For every cafe lacking `businessId`, it creates a `businesses` row, patches the cafe, and (if missing) creates the owner `businessMembers` + `activeOutlet`. Idempotent: re-running migrates 0.

- [ ] **Step 1: Write the failing test**

Append to `tests/convex/multi-outlet.test.ts`:

```typescript
import { internal } from '../../convex/_generated/api';

describe('backfillBusinesses migration', () => {
  it('wraps a legacy cafe in a business + owner membership + active outlet, idempotently', async () => {
    const t = convexTest(schema, modules);

    // A legacy cafe inserted WITHOUT businessId (pre-migration shape).
    const { userId, cafeId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Legacy Owner', email: 'legacy@x.com' });
      const cafeId = await ctx.db.insert('cafes', {
        name: 'Warung Lama',
        ownerUserId: userId,
        createdAt: 1,
      });
      return { userId, cafeId };
    });

    const first = await t.mutation(internal.multiOutlet.backfillBusinesses, {});
    expect(first.migrated).toBe(1);

    const cafe = await t.run((ctx) => ctx.db.get(cafeId as Id<'cafes'>));
    expect(cafe?.businessId).toBeDefined();

    const business = await t.run((ctx) => ctx.db.get(cafe!.businessId as Id<'businesses'>));
    expect(business?.ownerUserId).toBe(userId);

    const member = await t.run((ctx) =>
      ctx.db.query('businessMembers').withIndex('by_user', (q) => q.eq('userId', userId as Id<'users'>)).first()
    );
    expect(member?.role).toBe('owner');

    const active = await t.run((ctx) =>
      ctx.db.query('activeOutlet').withIndex('by_user', (q) => q.eq('userId', userId as Id<'users'>)).first()
    );
    expect(active?.cafeId).toBe(cafeId);

    // Idempotent: re-running migrates nothing and does not duplicate the business.
    const second = await t.mutation(internal.multiOutlet.backfillBusinesses, {});
    expect(second.migrated).toBe(0);
    const businesses = await t.run((ctx) =>
      ctx.db.query('businesses').withIndex('by_owner', (q) => q.eq('ownerUserId', userId as Id<'users'>)).collect()
    );
    expect(businesses).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/convex/multi-outlet.test.ts -t "backfillBusinesses"`
Expected: FAIL — `internal.multiOutlet.backfillBusinesses` does not exist.

- [ ] **Step 3: Implement the migration**

Create `convex/multiOutlet.ts`:

```typescript
import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

/**
 * One-off, idempotent backfill: wrap every pre-multi-outlet cafe in a business,
 * give its owner a business membership, and seed their active outlet. Safe to
 * re-run — cafes that already have a businessId are skipped, and owner
 * membership / active-outlet rows are only created when missing.
 *
 * Run against a deployment with:
 *   ./node_modules/.bin/convex run multiOutlet:backfillBusinesses
 */
export const backfillBusinesses = internalMutation({
  args: {},
  returns: v.object({ migrated: v.number() }),
  handler: async (ctx) => {
    const cafes = await ctx.db.query('cafes').collect();
    let migrated = 0;
    for (const cafe of cafes) {
      if (cafe.businessId) continue;
      const now = Date.now();
      const businessId = await ctx.db.insert('businesses', {
        name: cafe.name,
        ownerUserId: cafe.ownerUserId,
        createdAt: cafe.createdAt ?? now,
      });
      await ctx.db.patch(cafe._id, { businessId });

      const existingMember = await ctx.db
        .query('businessMembers')
        .withIndex('by_user', (q) => q.eq('userId', cafe.ownerUserId))
        .first();
      if (!existingMember) {
        await ctx.db.insert('businessMembers', {
          businessId,
          userId: cafe.ownerUserId,
          role: 'owner',
          createdAt: now,
        });
      }

      const existingActive = await ctx.db
        .query('activeOutlet')
        .withIndex('by_user', (q) => q.eq('userId', cafe.ownerUserId))
        .first();
      if (!existingActive) {
        await ctx.db.insert('activeOutlet', {
          userId: cafe.ownerUserId,
          cafeId: cafe._id,
          updatedAt: now,
        });
      }

      migrated += 1;
    }
    return { migrated };
  },
});
```

- [ ] **Step 4: Regenerate types (new module adds to `internal` API)**

Run: `./node_modules/.bin/convex codegen`
Expected: `convex/_generated/api.d.ts` now exposes `internal.multiOutlet.backfillBusinesses`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/convex/multi-outlet.test.ts -t "backfillBusinesses"`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: all green (893+ existing tests plus the new ones).

- [ ] **Step 7: Commit**

```bash
git add convex/multiOutlet.ts convex/_generated tests/convex/multi-outlet.test.ts
git commit -m "feat(multi-outlet): idempotent backfill migration for existing cafes"
```

- [ ] **Step 8: Run the migration against the deployment (manual, after merge/deploy)**

After this phase is deployed, run the backfill once against the live Convex deployment:

Run: `./node_modules/.bin/convex run multiOutlet:backfillBusinesses`
Expected: `{ migrated: <number of legacy cafes> }`. Re-running returns `{ migrated: 0 }`.

---

## Self-Review

**Spec coverage (Phase 1 slice of §4 + §9):**
- New tables `businesses`, `businessMembers`, `businessInvites`, `memberOutletAccess`, `activeOutlet` → Task 1. ✓
- `cafes.businessId` + index → Task 1. ✓
- `createForOwner` evolves to create business + owner membership (+ active outlet) → Task 2. ✓
- Idempotent backfill of existing cafes → Task 3. ✓
- Backward compatibility (no re-scoping; existing owners unchanged) → no call sites touched; `mine`/`myCafe` validator updated only additively. ✓

**Deferred to later phases (out of Phase 1 scope, by design):** `requireActiveOutlet` resolution (Phase 2), switcher (Phase 3), invites/managers (Phase 4 — `businessInvites`/`memberOutletAccess` are defined here but written to later), consolidated reporting (Phase 5).

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** table/field names (`businessId`, `ownerUserId`, `businessMembers.role`, `activeOutlet.cafeId`) are used identically across Tasks 1–3 and match the spec §4. `createForOwner` return type stays `Id<'cafes'>`.

---

## Next phases (separate plans)

Per the spec build sequence, each subsequent phase gets its own plan when we reach it:
- **Phase 2:** `requireActiveOutlet` + `requireBusinessOwner`; swap the ~230 `requireOwnerCafe` call sites (mechanical, superset return).
- **Phase 3:** outlet switcher (`myOutlets`, `setActiveOutlet`, `createOutlet`) + sidebar UI + "Add outlet".
- **Phase 4:** manager invites (`inviteManager`, `acceptPendingInvites`), members UI, no-access state, owner-only gating.
- **Phase 5:** consolidated reporting (`reports.businessOverview`) + "All outlets" dashboard.
