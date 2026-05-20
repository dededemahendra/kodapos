# Phase 1 · Slice 1 — Onboarding + Menu Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Slice 1 of Phase 1: cafe profile + categories + menu items + reusable modifier groups + onboarding wizard scaffolding. Outcome: owner can sign up, complete onboarding, and build a full menu through the UI.

**Architecture:** Pure CRUD over Convex with reactive `useQuery`/`useMutation`. Every Convex function in `convex/cafes.ts` and `convex/menu/*.ts` calls a new `requireOwnerCafe(ctx)` helper for tenant isolation. Owner-facing pages use shadcn `FieldGroup`/`Spinner` forms (same pattern as signup). Onboarding is a 4-step stepper with steps 1+2 active, 3+4 stub-disabled.

**Tech Stack:** TanStack Start · Convex · Convex Auth · shadcn/ui · Tailwind v4 · Lingui 6 · Vitest · `convex-test` · Playwright

**Spec:** `docs/superpowers/specs/2026-05-20-phase-1-slice-1-onboarding-menu-design.md`

---

## File Map

**Convex (server):**

- Modify: `convex/schema.ts` — extend `cafes`, add 5 tables
- Create: `convex/lib/auth.ts` — `requireOwnerCafe(ctx)` helper
- Modify: `convex/cafes.ts` — add `updateProfile`, `markSetupComplete`, `myCafe`
- Create: `convex/menu/categories.ts`
- Create: `convex/menu/items.ts`
- Create: `convex/menu/modifierGroups.ts`
- Create: `convex/menu/itemGroups.ts`

**Client:**

- Create: `src/lib/position.ts` — `nextPositionAfter` helper
- Create: shadcn UI primitives (table, alert-dialog, select, switch, skeleton, empty, sheet)
- Create: `src/components/menu/wizard-stepper.tsx`
- Create: `src/components/menu/cafe-profile-form.tsx`
- Create: `src/components/menu/item-edit-form.tsx`
- Create: `src/components/menu/modifier-group-form.tsx`
- Create: `src/components/menu/category-table.tsx`
- Modify: `src/routes/_pos.tsx` — add onboarding redirect loader
- Create: `src/routes/_pos/onboarding/route.tsx` — wizard chrome
- Create: `src/routes/_pos/onboarding/profile.tsx`
- Create: `src/routes/_pos/onboarding/menu.tsx`
- Create: `src/routes/_pos/menu/route.tsx` — tab nav
- Create: `src/routes/_pos/menu/index.tsx`
- Create: `src/routes/_pos/menu/items.$itemId.tsx`
- Create: `src/routes/_pos/menu/categories.tsx`
- Create: `src/routes/_pos/menu/modifiers.tsx`
- Create: `src/routes/_pos/menu/modifiers.$groupId.tsx`
- Create: `src/routes/_pos/settings/route.tsx`
- Create: `src/routes/_pos/settings/profile.tsx`

**Tests:**

- Create: `src/lib/position.test.ts`
- Create: `tests/convex/cafes.profile.test.ts`
- Create: `tests/convex/menu/categories.test.ts`
- Create: `tests/convex/menu/items.test.ts`
- Create: `tests/convex/menu/modifierGroups.test.ts`
- Create: `tests/convex/menu/itemGroups.test.ts`
- Create: `tests/e2e/menu.spec.ts`

---

## Task 1: Extend schema with profile fields + 5 new tables

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Replace `convex/schema.ts` with the extended schema**

```typescript
import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,

  cafes: defineTable({
    name: v.string(),
    ownerUserId: v.id('users'),
    createdAt: v.number(),
    // Profile (added in Phase 1 · Slice 1). Optional in schema for
    // backward compatibility with existing rows; required when written
    // via cafes.updateProfile.
    phone: v.optional(v.string()),
    addressLine: v.optional(v.string()),
    timezone: v.optional(v.string()),
    taxRatePct: v.optional(v.number()),
    taxEnabled: v.optional(v.boolean()),
    setupCompletedAt: v.optional(v.number()),
  }).index('by_owner', ['ownerUserId']),

  categories: defineTable({
    cafeId: v.id('cafes'),
    name: v.string(),
    position: v.number(),
    archived: v.boolean(),
    createdAt: v.number(),
  }).index('by_cafe_active', ['cafeId', 'archived', 'position']),

  menuItems: defineTable({
    cafeId: v.id('cafes'),
    categoryId: v.id('categories'),
    name: v.string(),
    priceIDR: v.number(),
    isActive: v.boolean(),
    archived: v.boolean(),
    position: v.number(),
    createdAt: v.number(),
  })
    .index('by_cafe_category', ['cafeId', 'categoryId', 'archived', 'position'])
    .index('by_cafe_active', ['cafeId', 'archived', 'isActive']),

  modifierGroups: defineTable({
    cafeId: v.id('cafes'),
    name: v.string(),
    required: v.boolean(),
    minSelect: v.number(),
    maxSelect: v.number(),
    archived: v.boolean(),
    createdAt: v.number(),
  }).index('by_cafe_active', ['cafeId', 'archived']),

  modifierOptions: defineTable({
    cafeId: v.id('cafes'),
    groupId: v.id('modifierGroups'),
    name: v.string(),
    priceAdjustmentIDR: v.number(),
    position: v.number(),
    archived: v.boolean(),
    createdAt: v.number(),
  }).index('by_group_active', ['groupId', 'archived', 'position']),

  menuItemModifierGroups: defineTable({
    cafeId: v.id('cafes'),
    menuItemId: v.id('menuItems'),
    modifierGroupId: v.id('modifierGroups'),
    position: v.number(),
  })
    .index('by_item', ['menuItemId', 'position'])
    .index('by_group', ['modifierGroupId']),
});
```

- [ ] **Step 2: Run codegen to update `_generated/api`**

Run: `pnpm exec convex codegen`
Expected: "Generating TypeScript bindings..." with no errors.

- [ ] **Step 3: Run lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(schema): add cafe profile fields + menu tables for Slice 1"
```

---

## Task 2: `nextPositionAfter` helper (TDD)

**Files:**
- Create: `src/lib/position.ts`
- Create: `src/lib/position.test.ts`

This helper computes the next `position` for an appended row. Convention: gaps of 100 so mid-list inserts don't renumber.

- [ ] **Step 1: Write the failing test**

`src/lib/position.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { nextPositionAfter } from './position';

describe('nextPositionAfter', () => {
  it('returns 100 for an empty list', () => {
    expect(nextPositionAfter([])).toBe(100);
  });

  it('returns max + 100 for a populated list', () => {
    expect(nextPositionAfter([{ position: 10 }, { position: 110 }])).toBe(210);
  });

  it('handles unsorted input', () => {
    expect(nextPositionAfter([{ position: 210 }, { position: 10 }, { position: 110 }])).toBe(310);
  });

  it('throws on non-integer positions', () => {
    expect(() => nextPositionAfter([{ position: 10.5 }])).toThrow(/integer/i);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test src/lib/position.test.ts`
Expected: FAIL with "Cannot find module './position'".

- [ ] **Step 3: Implement `src/lib/position.ts`**

```typescript
export function nextPositionAfter(rows: ReadonlyArray<{ position: number }>): number {
  if (rows.length === 0) return 100;
  let max = -Infinity;
  for (const row of rows) {
    if (!Number.isInteger(row.position)) {
      throw new Error(`nextPositionAfter requires integer positions, got ${row.position}`);
    }
    if (row.position > max) max = row.position;
  }
  return max + 100;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm test src/lib/position.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/position.ts src/lib/position.test.ts
git commit -m "feat(lib): add nextPositionAfter helper for menu ordering"
```

---

## Task 3: `requireOwnerCafe` helper

**Files:**
- Create: `convex/lib/auth.ts`

This helper centralizes the Task 24 tenant-isolation pattern. Every menu function in Slice 1 calls it first.

- [ ] **Step 1: Create `convex/lib/auth.ts`**

```typescript
import { getAuthUserId } from '@convex-dev/auth/server';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

/**
 * Resolve the signed-in owner's cafe. Throws if no user identity or no cafe.
 * Every Slice 1 menu mutation/query calls this first.
 */
export async function requireOwnerCafe(
  ctx: QueryCtx | MutationCtx
): Promise<{ userId: Id<'users'>; cafeId: Id<'cafes'> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('not authenticated');
  }
  const cafe = await ctx.db
    .query('cafes')
    .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
    .unique();
  if (!cafe) {
    throw new Error('cafe not found');
  }
  return { userId, cafeId: cafe._id };
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add convex/lib/auth.ts
git commit -m "feat(convex): add requireOwnerCafe helper for tenant isolation"
```

---

## Task 4: Cafe profile mutations + query (TDD)

**Files:**
- Modify: `convex/cafes.ts`
- Create: `tests/convex/cafes.profile.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/convex/cafes.profile.test.ts`:

```typescript
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function seedOwner(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
  });
  await t.withIdentity({ subject: `${userId}|test_session` })
    .mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return userId;
}

describe('cafes profile', () => {
  it('myCafe returns the owner cafe with new fields defaulted', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    const cafe = await asOwner.query(api.cafes.myCafe);
    expect(cafe).not.toBeNull();
    expect(cafe?.name).toBe('Kopi Senja');
    expect(cafe?.setupCompletedAt).toBeUndefined();
  });

  it('myCafe returns null when not authenticated', async () => {
    const t = convexTest(schema, modules);
    const cafe = await t.query(api.cafes.myCafe);
    expect(cafe).toBeNull();
  });

  it('updateProfile writes all profile fields', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await asOwner.mutation(api.cafes.updateProfile, {
      name: 'Kopi Senja Baru',
      phone: '08123456789',
      addressLine: 'Jl. Sudirman 1',
      timezone: 'Asia/Jakarta',
      taxRatePct: 11,
      taxEnabled: true,
    });

    const cafe = await asOwner.query(api.cafes.myCafe);
    expect(cafe?.name).toBe('Kopi Senja Baru');
    expect(cafe?.phone).toBe('08123456789');
    expect(cafe?.taxRatePct).toBe(11);
    expect(cafe?.taxEnabled).toBe(true);
  });

  it('updateProfile rejects empty name', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await expect(
      asOwner.mutation(api.cafes.updateProfile, {
        name: '   ',
        timezone: 'Asia/Jakarta',
        taxRatePct: 11,
        taxEnabled: true,
      })
    ).rejects.toThrow(/nama/i);
  });

  it('updateProfile rejects negative tax rate', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await expect(
      asOwner.mutation(api.cafes.updateProfile, {
        name: 'Kopi',
        timezone: 'Asia/Jakarta',
        taxRatePct: -1,
        taxEnabled: true,
      })
    ).rejects.toThrow(/pajak/i);
  });

  it('markSetupComplete sets setupCompletedAt once', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    await asOwner.mutation(api.cafes.markSetupComplete);
    const cafe1 = await asOwner.query(api.cafes.myCafe);
    expect(cafe1?.setupCompletedAt).toEqual(expect.any(Number));

    const firstTime = cafe1?.setupCompletedAt;
    await asOwner.mutation(api.cafes.markSetupComplete);
    const cafe2 = await asOwner.query(api.cafes.myCafe);
    expect(cafe2?.setupCompletedAt).toBe(firstTime);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test tests/convex/cafes.profile.test.ts`
Expected: FAIL — `myCafe`, `updateProfile`, `markSetupComplete` don't exist yet.

- [ ] **Step 3: Replace `convex/cafes.ts` with the extended version**

```typescript
import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';

const cafeDoc = v.object({
  _id: v.id('cafes'),
  _creationTime: v.number(),
  name: v.string(),
  ownerUserId: v.id('users'),
  createdAt: v.number(),
  phone: v.optional(v.string()),
  addressLine: v.optional(v.string()),
  timezone: v.optional(v.string()),
  taxRatePct: v.optional(v.number()),
  taxEnabled: v.optional(v.boolean()),
  setupCompletedAt: v.optional(v.number()),
});

export const createForOwner = mutation({
  args: { name: v.string() },
  returns: v.id('cafes'),
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('not authenticated');
    }
    return await ctx.db.insert('cafes', {
      name,
      ownerUserId: userId,
      createdAt: Date.now(),
      timezone: 'Asia/Jakarta',
      taxRatePct: 11,
      taxEnabled: true,
    });
  },
});

export const myCafe = query({
  args: {},
  returns: v.union(cafeDoc, v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const cafe = await ctx.db
      .query('cafes')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
      .unique();
    return cafe ?? null;
  },
});

export const updateProfile = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    addressLine: v.optional(v.string()),
    timezone: v.string(),
    taxRatePct: v.number(),
    taxEnabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    if (args.name.trim().length < 1) {
      throw new Error('Nama kafe wajib diisi.');
    }
    if (args.name.length > 80) {
      throw new Error('Nama kafe maksimal 80 karakter.');
    }
    if (args.taxRatePct < 0 || args.taxRatePct > 100) {
      throw new Error('Persentase pajak harus antara 0 dan 100.');
    }
    await ctx.db.patch(cafeId, {
      name: args.name.trim(),
      phone: args.phone?.trim() || undefined,
      addressLine: args.addressLine?.trim() || undefined,
      timezone: args.timezone,
      taxRatePct: args.taxRatePct,
      taxEnabled: args.taxEnabled,
    });
    return null;
  },
});

export const markSetupComplete = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cafe = await ctx.db.get(cafeId);
    if (cafe?.setupCompletedAt) {
      return null;
    }
    await ctx.db.patch(cafeId, { setupCompletedAt: Date.now() });
    return null;
  },
});
```

- [ ] **Step 4: Run codegen + tests**

Run: `pnpm exec convex codegen && pnpm test tests/convex/cafes.profile.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Run full suite + typecheck**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add convex/cafes.ts convex/_generated tests/convex/cafes.profile.test.ts
git commit -m "feat(cafes): add updateProfile, markSetupComplete, myCafe + tests"
```

---

## Task 5: Categories backend (TDD)

**Files:**
- Create: `convex/menu/categories.ts`
- Create: `tests/convex/menu/categories.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/convex/menu/categories.test.ts`:

```typescript
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../../convex/_generated/api';
import schema from '../../../convex/schema';

const modules = import.meta.glob('../../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  await t.withIdentity({ subject: `${userId}|test_session` })
    .mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return t.withIdentity({ subject: `${userId}|test_session` });
}

describe('menu.categories', () => {
  it('create + list happy path', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    await asOwner.mutation(api.menu.categories.create, { name: 'Non-Kopi' });
    const list = await asOwner.query(api.menu.categories.list, {});
    expect(list).toHaveLength(2);
    expect(list[0]?.name).toBe('Kopi');
    expect(list[1]?.name).toBe('Non-Kopi');
    expect(list[0]?.position).toBeLessThan(list[1]?.position ?? 0);
  });

  it('create rejects blank name', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    await expect(asOwner.mutation(api.menu.categories.create, { name: '  ' })).rejects.toThrow(
      /nama/i
    );
  });

  it('update renames a category', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    await asOwner.mutation(api.menu.categories.update, { id, name: 'Kopi Khas' });
    const list = await asOwner.query(api.menu.categories.list, {});
    expect(list[0]?.name).toBe('Kopi Khas');
  });

  it('reorder up/down swaps positions', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const aId = await asOwner.mutation(api.menu.categories.create, { name: 'A' });
    const bId = await asOwner.mutation(api.menu.categories.create, { name: 'B' });
    await asOwner.mutation(api.menu.categories.reorder, { id: bId, direction: 'up' });
    const list = await asOwner.query(api.menu.categories.list, {});
    expect(list[0]?.name).toBe('B');
    expect(list[1]?.name).toBe('A');
    // reorder beyond edge is a no-op
    await asOwner.mutation(api.menu.categories.reorder, { id: bId, direction: 'up' });
    const list2 = await asOwner.query(api.menu.categories.list, {});
    expect(list2[0]?.name).toBe('B');
  });

  it('archive hides from default list, visible with includeArchived', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.menu.categories.create, { name: 'Lama' });
    await asOwner.mutation(api.menu.categories.archive, { id });
    expect(await asOwner.query(api.menu.categories.list, {})).toHaveLength(0);
    expect(await asOwner.query(api.menu.categories.list, { includeArchived: true })).toHaveLength(
      1
    );
  });

  it('tenant isolation: cafe A cannot read or mutate cafe B categories', async () => {
    const t = convexTest(schema, modules);
    const ownerA = await setupOwner(t, 'a@x.com');
    const ownerB = await setupOwner(t, 'b@x.com');
    const idA = await ownerA.mutation(api.menu.categories.create, { name: 'A-only' });
    expect(await ownerB.query(api.menu.categories.list, {})).toHaveLength(0);
    await expect(
      ownerB.mutation(api.menu.categories.update, { id: idA, name: 'pwn' })
    ).rejects.toThrow(/akses|not found|forbidden/i);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test tests/convex/menu/categories.test.ts`
Expected: FAIL — `menu.categories.*` doesn't exist yet.

- [ ] **Step 3: Implement `convex/menu/categories.ts`**

```typescript
import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireOwnerCafe } from '../lib/auth';

const categoryDoc = v.object({
  _id: v.id('categories'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  position: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

function assertName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama kategori wajib diisi.');
  if (trimmed.length > 60) throw new Error('Nama kategori maksimal 60 karakter.');
  return trimmed;
}

export const create = mutation({
  args: { name: v.string() },
  returns: v.id('categories'),
  handler: async (ctx, { name }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cleanName = assertName(name);
    const existing = await ctx.db
      .query('categories')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    const nextPos = existing.length === 0
      ? 100
      : Math.max(...existing.map((c) => c.position)) + 100;
    return await ctx.db.insert('categories', {
      cafeId,
      name: cleanName,
      position: nextPos,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { id: v.id('categories'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.cafeId !== cafeId) throw new Error('Akses ditolak.');
    await ctx.db.patch(id, { name: assertName(name) });
    return null;
  },
});

export const reorder = mutation({
  args: { id: v.id('categories'), direction: v.union(v.literal('up'), v.literal('down')) },
  returns: v.null(),
  handler: async (ctx, { id, direction }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.cafeId !== cafeId) throw new Error('Akses ditolak.');
    const siblings = await ctx.db
      .query('categories')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', row.archived))
      .collect();
    siblings.sort((a, b) => a.position - b.position);
    const idx = siblings.findIndex((c) => c._id === id);
    const swap = direction === 'up' ? siblings[idx - 1] : siblings[idx + 1];
    if (!swap) return null; // edge — no-op
    await ctx.db.patch(row._id, { position: swap.position });
    await ctx.db.patch(swap._id, { position: row.position });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('categories') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.cafeId !== cafeId) throw new Error('Akses ditolak.');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(categoryDoc),
  handler: async (ctx, { includeArchived = false }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('categories')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    return rows
      .filter((c) => includeArchived || !c.archived)
      .sort((a, b) => a.position - b.position);
  },
});
```

- [ ] **Step 4: Run codegen + tests**

Run: `pnpm exec convex codegen && pnpm test tests/convex/menu/categories.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add convex/menu/categories.ts convex/_generated tests/convex/menu/categories.test.ts
git commit -m "feat(menu): categories CRUD with tenant isolation tests"
```

---

## Task 6: Modifier groups + options backend (TDD)

**Files:**
- Create: `convex/menu/modifierGroups.ts`
- Create: `tests/convex/menu/modifierGroups.test.ts`

This task introduces the atomic `upsert` mutation that takes a group + options array and reconciles in one transaction.

- [ ] **Step 1: Write the failing tests**

`tests/convex/menu/modifierGroups.test.ts`:

```typescript
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../../convex/_generated/api';
import schema from '../../../convex/schema';

const modules = import.meta.glob('../../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  await t.withIdentity({ subject: `${userId}|test_session` })
    .mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return t.withIdentity({ subject: `${userId}|test_session` });
}

describe('menu.modifierGroups', () => {
  it('upsert creates a group with options in one call', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const groupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Ukuran',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: 'Reguler', priceAdjustmentIDR: 0, position: 100 },
        { name: 'Large', priceAdjustmentIDR: 5000, position: 200 },
      ],
    });
    const group = await asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
    expect(group?.name).toBe('Ukuran');
    expect(group?.options).toHaveLength(2);
    expect(group?.options[0]?.name).toBe('Reguler');
    expect(group?.options[1]?.priceAdjustmentIDR).toBe(5000);
  });

  it('upsert updates existing group, adds new option, archives removed option', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const groupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Susu',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [
        { name: 'Sapi', priceAdjustmentIDR: 0, position: 100 },
        { name: 'Oat', priceAdjustmentIDR: 5000, position: 200 },
      ],
    });
    const created = await asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
    const sapiId = created!.options[0]!._id;

    // Now update: rename group, drop "Oat", add "Almond", keep "Sapi".
    await asOwner.mutation(api.menu.modifierGroups.upsert, {
      id: groupId,
      name: 'Susu (revised)',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [
        { id: sapiId, name: 'Sapi', priceAdjustmentIDR: 0, position: 100 },
        { name: 'Almond', priceAdjustmentIDR: 5000, position: 200 },
      ],
    });
    const after = await asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
    expect(after?.name).toBe('Susu (revised)');
    expect(after?.options.map((o) => o.name).sort()).toEqual(['Almond', 'Sapi']);
  });

  it('upsert rejects minSelect > maxSelect', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    await expect(
      asOwner.mutation(api.menu.modifierGroups.upsert, {
        name: 'Bad',
        required: true,
        minSelect: 2,
        maxSelect: 1,
        options: [{ name: 'Only', priceAdjustmentIDR: 0, position: 100 }],
      })
    ).rejects.toThrow(/minimal/i);
  });

  it('upsert rejects required with empty options', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    await expect(
      asOwner.mutation(api.menu.modifierGroups.upsert, {
        name: 'Empty',
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options: [],
      })
    ).rejects.toThrow(/opsi/i);
  });

  it('upsert rejects negative price adjustment', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    await expect(
      asOwner.mutation(api.menu.modifierGroups.upsert, {
        name: 'Bad',
        required: false,
        minSelect: 0,
        maxSelect: 1,
        options: [{ name: 'X', priceAdjustmentIDR: -100, position: 100 }],
      })
    ).rejects.toThrow(/harga|negatif/i);
  });

  it('archive hides group from default list', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Tmp',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'X', priceAdjustmentIDR: 0, position: 100 }],
    });
    await asOwner.mutation(api.menu.modifierGroups.archive, { id });
    expect(await asOwner.query(api.menu.modifierGroups.list, {})).toHaveLength(0);
    expect(
      await asOwner.query(api.menu.modifierGroups.list, { includeArchived: true })
    ).toHaveLength(1);
  });

  it('tenant isolation: cafe B cannot read cafe A groups', async () => {
    const t = convexTest(schema, modules);
    const ownerA = await setupOwner(t, 'a@x.com');
    const ownerB = await setupOwner(t, 'b@x.com');
    await ownerA.mutation(api.menu.modifierGroups.upsert, {
      name: 'A-only',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'X', priceAdjustmentIDR: 0, position: 100 }],
    });
    expect(await ownerB.query(api.menu.modifierGroups.list, {})).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test tests/convex/menu/modifierGroups.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `convex/menu/modifierGroups.ts`**

```typescript
import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireOwnerCafe } from '../lib/auth';

const optionInput = v.object({
  id: v.optional(v.id('modifierOptions')),
  name: v.string(),
  priceAdjustmentIDR: v.number(),
  position: v.number(),
});

const optionDoc = v.object({
  _id: v.id('modifierOptions'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  groupId: v.id('modifierGroups'),
  name: v.string(),
  priceAdjustmentIDR: v.number(),
  position: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

const groupWithOptions = v.object({
  _id: v.id('modifierGroups'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  required: v.boolean(),
  minSelect: v.number(),
  maxSelect: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
  options: v.array(optionDoc),
});

function assertGroup(name: string, required: boolean, minSelect: number, maxSelect: number, optionCount: number) {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama grup modifier wajib diisi.');
  if (trimmed.length > 60) throw new Error('Nama grup modifier maksimal 60 karakter.');
  if (!Number.isInteger(minSelect) || minSelect < 0) throw new Error('minSelect tidak valid.');
  if (!Number.isInteger(maxSelect) || maxSelect < 1) throw new Error('maxSelect tidak valid.');
  if (minSelect > maxSelect) throw new Error('minSelect tidak boleh lebih besar dari maxSelect.');
  if (required && optionCount === 0) throw new Error('Grup wajib harus memiliki minimal satu opsi.');
  return trimmed;
}

function assertOption(name: string, priceAdjustmentIDR: number) {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama opsi wajib diisi.');
  if (trimmed.length > 60) throw new Error('Nama opsi maksimal 60 karakter.');
  if (!Number.isInteger(priceAdjustmentIDR)) throw new Error('Harga modifier harus berupa angka bulat (rupiah).');
  if (priceAdjustmentIDR < 0) throw new Error('Harga modifier tidak boleh negatif.');
  return trimmed;
}

export const upsert = mutation({
  args: {
    id: v.optional(v.id('modifierGroups')),
    name: v.string(),
    required: v.boolean(),
    minSelect: v.number(),
    maxSelect: v.number(),
    options: v.array(optionInput),
  },
  returns: v.id('modifierGroups'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cleanName = assertGroup(args.name, args.required, args.minSelect, args.maxSelect, args.options.length);

    let groupId: typeof args.id extends undefined ? never : typeof args.id;
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.cafeId !== cafeId) throw new Error('Akses ditolak.');
      await ctx.db.patch(args.id, {
        name: cleanName,
        required: args.required,
        minSelect: args.minSelect,
        maxSelect: args.maxSelect,
      });
      groupId = args.id;
    } else {
      groupId = await ctx.db.insert('modifierGroups', {
        cafeId,
        name: cleanName,
        required: args.required,
        minSelect: args.minSelect,
        maxSelect: args.maxSelect,
        archived: false,
        createdAt: Date.now(),
      });
    }

    // Reconcile options.
    const existingOptions = await ctx.db
      .query('modifierOptions')
      .withIndex('by_group_active', (q) => q.eq('groupId', groupId).eq('archived', false))
      .collect();
    const keptIds = new Set(args.options.filter((o) => o.id).map((o) => o.id as string));

    // Archive options whose ids are not in the kept set.
    for (const existing of existingOptions) {
      if (!keptIds.has(existing._id)) {
        await ctx.db.patch(existing._id, { archived: true });
      }
    }

    // Insert new or update kept options.
    for (const opt of args.options) {
      const cleanOptName = assertOption(opt.name, opt.priceAdjustmentIDR);
      if (opt.id) {
        const existing = await ctx.db.get(opt.id);
        if (!existing || existing.groupId !== groupId) throw new Error('Akses ditolak.');
        await ctx.db.patch(opt.id, {
          name: cleanOptName,
          priceAdjustmentIDR: opt.priceAdjustmentIDR,
          position: opt.position,
        });
      } else {
        await ctx.db.insert('modifierOptions', {
          cafeId,
          groupId,
          name: cleanOptName,
          priceAdjustmentIDR: opt.priceAdjustmentIDR,
          position: opt.position,
          archived: false,
          createdAt: Date.now(),
        });
      }
    }

    return groupId;
  },
});

export const archive = mutation({
  args: { id: v.id('modifierGroups') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.cafeId !== cafeId) throw new Error('Akses ditolak.');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

async function fetchOptions(ctx: Parameters<typeof query>[0]['handler'] extends (c: infer C, ...rest: unknown[]) => unknown ? C : never, groupId: import('../_generated/dataModel').Id<'modifierGroups'>) {
  const opts = await ctx.db
    .query('modifierOptions')
    .withIndex('by_group_active', (q) => q.eq('groupId', groupId).eq('archived', false))
    .collect();
  return opts.sort((a, b) => a.position - b.position);
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(groupWithOptions),
  handler: async (ctx, { includeArchived = false }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const groups = await ctx.db
      .query('modifierGroups')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    const filtered = groups.filter((g) => includeArchived || !g.archived);
    const result = [];
    for (const g of filtered) {
      const options = await ctx.db
        .query('modifierOptions')
        .withIndex('by_group_active', (q) => q.eq('groupId', g._id).eq('archived', false))
        .collect();
      result.push({ ...g, options: options.sort((a, b) => a.position - b.position) });
    }
    return result;
  },
});

export const getById = query({
  args: { id: v.id('modifierGroups') },
  returns: v.union(groupWithOptions, v.null()),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const group = await ctx.db.get(id);
    if (!group || group.cafeId !== cafeId) return null;
    const options = await ctx.db
      .query('modifierOptions')
      .withIndex('by_group_active', (q) => q.eq('groupId', group._id).eq('archived', false))
      .collect();
    return { ...group, options: options.sort((a, b) => a.position - b.position) };
  },
});
```

- [ ] **Step 4: Run codegen + tests**

Run: `pnpm exec convex codegen && pnpm test tests/convex/menu/modifierGroups.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add convex/menu/modifierGroups.ts convex/_generated tests/convex/menu/modifierGroups.test.ts
git commit -m "feat(menu): modifier groups + options with atomic upsert"
```

---

## Task 7: Menu items backend (TDD)

**Files:**
- Create: `convex/menu/items.ts`
- Create: `tests/convex/menu/items.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/convex/menu/items.test.ts`:

```typescript
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../../convex/_generated/api';
import schema from '../../../convex/schema';

const modules = import.meta.glob('../../../convex/**/*.*s');

async function setupOwnerAndCategory(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  return { asOwner, categoryId };
}

describe('menu.items', () => {
  it('create + list happy path', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Kopi Susu Gula Aren',
      priceIDR: 22000,
    });
    const items = await asOwner.query(api.menu.items.list, {});
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('Kopi Susu Gula Aren');
    expect(items[0]?.priceIDR).toBe(22000);
    expect(items[0]?.isActive).toBe(true);
    expect(items[0]?.archived).toBe(false);
  });

  it('list filters by categoryId when provided', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    const otherCat = await asOwner.mutation(api.menu.categories.create, { name: 'Non-Kopi' });
    await asOwner.mutation(api.menu.items.create, { categoryId, name: 'Espresso', priceIDR: 18000 });
    await asOwner.mutation(api.menu.items.create, { categoryId: otherCat, name: 'Matcha', priceIDR: 28000 });
    const kopiItems = await asOwner.query(api.menu.items.list, { categoryId });
    expect(kopiItems).toHaveLength(1);
    expect(kopiItems[0]?.name).toBe('Espresso');
  });

  it('update changes price + category', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    const otherCat = await asOwner.mutation(api.menu.categories.create, { name: 'Non-Kopi' });
    const id = await asOwner.mutation(api.menu.items.create, { categoryId, name: 'X', priceIDR: 10000 });
    await asOwner.mutation(api.menu.items.update, {
      id,
      categoryId: otherCat,
      name: 'X-Renamed',
      priceIDR: 12000,
    });
    const items = await asOwner.query(api.menu.items.list, {});
    expect(items[0]?.name).toBe('X-Renamed');
    expect(items[0]?.priceIDR).toBe(12000);
    expect(items[0]?.categoryId).toBe(otherCat);
  });

  it('setActive toggles isActive', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    const id = await asOwner.mutation(api.menu.items.create, { categoryId, name: 'X', priceIDR: 10000 });
    await asOwner.mutation(api.menu.items.setActive, { id, isActive: false });
    expect(
      await asOwner.query(api.menu.items.list, { includeInactive: false })
    ).toHaveLength(0);
    expect(
      await asOwner.query(api.menu.items.list, { includeInactive: true })
    ).toHaveLength(1);
  });

  it('archive hides from default list', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    const id = await asOwner.mutation(api.menu.items.create, { categoryId, name: 'X', priceIDR: 10000 });
    await asOwner.mutation(api.menu.items.archive, { id });
    expect(await asOwner.query(api.menu.items.list, {})).toHaveLength(0);
    expect(await asOwner.query(api.menu.items.list, { includeArchived: true })).toHaveLength(1);
  });

  it('create rejects non-integer price', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    await expect(
      asOwner.mutation(api.menu.items.create, { categoryId, name: 'X', priceIDR: 99.99 })
    ).rejects.toThrow(/bulat|rupiah/i);
  });

  it('create rejects negative price', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    await expect(
      asOwner.mutation(api.menu.items.create, { categoryId, name: 'X', priceIDR: -1 })
    ).rejects.toThrow(/negatif/i);
  });

  it('create rejects blank name', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    await expect(
      asOwner.mutation(api.menu.items.create, { categoryId, name: '   ', priceIDR: 10000 })
    ).rejects.toThrow(/nama/i);
  });

  it('create rejects category from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setupOwnerAndCategory(t, 'a@x.com');
    const { categoryId: catB } = await setupOwnerAndCategory(t, 'b@x.com');
    await expect(
      ownerA.mutation(api.menu.items.create, { categoryId: catB, name: 'X', priceIDR: 10000 })
    ).rejects.toThrow(/kategori|akses/i);
  });

  it('getById returns item with attached groups in position order', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, categoryId } = await setupOwnerAndCategory(t);
    const itemId = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Kopi',
      priceIDR: 22000,
    });
    const g1 = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Ukuran',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [{ name: 'R', priceAdjustmentIDR: 0, position: 100 }],
    });
    const g2 = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Susu',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'Sapi', priceAdjustmentIDR: 0, position: 100 }],
    });
    await asOwner.mutation(api.menu.itemGroups.attach, { menuItemId: itemId, modifierGroupId: g1 });
    await asOwner.mutation(api.menu.itemGroups.attach, { menuItemId: itemId, modifierGroupId: g2 });
    const detail = await asOwner.query(api.menu.items.getById, { id: itemId });
    expect(detail?.item.name).toBe('Kopi');
    expect(detail?.attachedGroups).toHaveLength(2);
    expect(detail?.attachedGroups[0]?.group.name).toBe('Ukuran');
    expect(detail?.attachedGroups[1]?.group.name).toBe('Susu');
  });

  it('tenant isolation: cafe A cannot read cafe B items', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA, categoryId: catA } = await setupOwnerAndCategory(t, 'a@x.com');
    const { asOwner: ownerB } = await setupOwnerAndCategory(t, 'b@x.com');
    await ownerA.mutation(api.menu.items.create, { categoryId: catA, name: 'A-only', priceIDR: 10000 });
    expect(await ownerB.query(api.menu.items.list, {})).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test tests/convex/menu/items.test.ts`
Expected: FAIL — `menu.items.*` and `menu.itemGroups.*` don't exist yet. (Some tests reference `itemGroups`; that module lands in Task 8. Those specific tests will error; the rest fail on missing items module. That's expected — TDD.)

- [ ] **Step 3: Implement `convex/menu/items.ts`**

```typescript
import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireOwnerCafe } from '../lib/auth';

const menuItemDoc = v.object({
  _id: v.id('menuItems'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  categoryId: v.id('categories'),
  name: v.string(),
  priceIDR: v.number(),
  isActive: v.boolean(),
  archived: v.boolean(),
  position: v.number(),
  createdAt: v.number(),
});

const modifierGroupDoc = v.object({
  _id: v.id('modifierGroups'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  required: v.boolean(),
  minSelect: v.number(),
  maxSelect: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

const modifierOptionDoc = v.object({
  _id: v.id('modifierOptions'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  groupId: v.id('modifierGroups'),
  name: v.string(),
  priceAdjustmentIDR: v.number(),
  position: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

const itemDetail = v.object({
  item: menuItemDoc,
  attachedGroups: v.array(
    v.object({
      group: modifierGroupDoc,
      options: v.array(modifierOptionDoc),
      position: v.number(),
    })
  ),
});

function assertItem(name: string, priceIDR: number) {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama item wajib diisi.');
  if (trimmed.length > 80) throw new Error('Nama item maksimal 80 karakter.');
  if (!Number.isInteger(priceIDR)) throw new Error('Harga harus berupa angka bulat (rupiah).');
  if (priceIDR < 0) throw new Error('Harga tidak boleh negatif.');
  return trimmed;
}

export const create = mutation({
  args: { categoryId: v.id('categories'), name: v.string(), priceIDR: v.number() },
  returns: v.id('menuItems'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cleanName = assertItem(args.name, args.priceIDR);
    const category = await ctx.db.get(args.categoryId);
    if (!category || category.cafeId !== cafeId) throw new Error('Kategori tidak ditemukan.');
    const siblings = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_category', (q) =>
        q.eq('cafeId', cafeId).eq('categoryId', args.categoryId).eq('archived', false)
      )
      .collect();
    const nextPos = siblings.length === 0
      ? 100
      : Math.max(...siblings.map((c) => c.position)) + 100;
    return await ctx.db.insert('menuItems', {
      cafeId,
      categoryId: args.categoryId,
      name: cleanName,
      priceIDR: args.priceIDR,
      isActive: true,
      archived: false,
      position: nextPos,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('menuItems'),
    categoryId: v.id('categories'),
    name: v.string(),
    priceIDR: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const item = await ctx.db.get(args.id);
    if (!item || item.cafeId !== cafeId) throw new Error('Akses ditolak.');
    const category = await ctx.db.get(args.categoryId);
    if (!category || category.cafeId !== cafeId) throw new Error('Kategori tidak ditemukan.');
    const cleanName = assertItem(args.name, args.priceIDR);
    await ctx.db.patch(args.id, {
      categoryId: args.categoryId,
      name: cleanName,
      priceIDR: args.priceIDR,
    });
    return null;
  },
});

export const setActive = mutation({
  args: { id: v.id('menuItems'), isActive: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { id, isActive }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const item = await ctx.db.get(id);
    if (!item || item.cafeId !== cafeId) throw new Error('Akses ditolak.');
    await ctx.db.patch(id, { isActive });
    return null;
  },
});

export const reorder = mutation({
  args: { id: v.id('menuItems'), direction: v.union(v.literal('up'), v.literal('down')) },
  returns: v.null(),
  handler: async (ctx, { id, direction }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const item = await ctx.db.get(id);
    if (!item || item.cafeId !== cafeId) throw new Error('Akses ditolak.');
    const siblings = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_category', (q) =>
        q.eq('cafeId', cafeId).eq('categoryId', item.categoryId).eq('archived', item.archived)
      )
      .collect();
    siblings.sort((a, b) => a.position - b.position);
    const idx = siblings.findIndex((c) => c._id === id);
    const swap = direction === 'up' ? siblings[idx - 1] : siblings[idx + 1];
    if (!swap) return null;
    await ctx.db.patch(item._id, { position: swap.position });
    await ctx.db.patch(swap._id, { position: item.position });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('menuItems') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const item = await ctx.db.get(id);
    if (!item || item.cafeId !== cafeId) throw new Error('Akses ditolak.');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

export const list = query({
  args: {
    categoryId: v.optional(v.id('categories')),
    includeArchived: v.optional(v.boolean()),
    includeInactive: v.optional(v.boolean()),
  },
  returns: v.array(menuItemDoc),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = args.categoryId
      ? await ctx.db
          .query('menuItems')
          .withIndex('by_cafe_category', (q) =>
            q.eq('cafeId', cafeId).eq('categoryId', args.categoryId as import('../_generated/dataModel').Id<'categories'>)
          )
          .collect()
      : await ctx.db
          .query('menuItems')
          .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
          .collect();
    return rows
      .filter((r) => (args.includeArchived ? true : !r.archived))
      .filter((r) => (args.includeInactive ? true : r.isActive))
      .sort((a, b) => a.position - b.position);
  },
});

export const getById = query({
  args: { id: v.id('menuItems') },
  returns: v.union(itemDetail, v.null()),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const item = await ctx.db.get(id);
    if (!item || item.cafeId !== cafeId) return null;
    const joins = await ctx.db
      .query('menuItemModifierGroups')
      .withIndex('by_item', (q) => q.eq('menuItemId', id))
      .collect();
    joins.sort((a, b) => a.position - b.position);
    const attachedGroups = [];
    for (const j of joins) {
      const group = await ctx.db.get(j.modifierGroupId);
      if (!group || group.archived) continue;
      const options = await ctx.db
        .query('modifierOptions')
        .withIndex('by_group_active', (q) => q.eq('groupId', group._id).eq('archived', false))
        .collect();
      attachedGroups.push({
        group,
        options: options.sort((a, b) => a.position - b.position),
        position: j.position,
      });
    }
    return { item, attachedGroups };
  },
});
```

- [ ] **Step 4: Run codegen + Items tests only**

Run: `pnpm exec convex codegen && pnpm test tests/convex/menu/items.test.ts -t "create|list|update|setActive|archive|tenant"`
Expected: items-only tests pass (10/11). The `getById returns item with attached groups` test still fails because `itemGroups.attach` doesn't exist yet — that's Task 8.

- [ ] **Step 5: Commit**

```bash
git add convex/menu/items.ts convex/_generated tests/convex/menu/items.test.ts
git commit -m "feat(menu): menu items CRUD with category + active/archive filters"
```

---

## Task 8: Item-group join backend (TDD)

**Files:**
- Create: `convex/menu/itemGroups.ts`
- Create: `tests/convex/menu/itemGroups.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/convex/menu/itemGroups.test.ts`:

```typescript
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../../convex/_generated/api';
import schema from '../../../convex/schema';

const modules = import.meta.glob('../../../convex/**/*.*s');

async function setupOwnerWithItemAndGroup(
  t: ReturnType<typeof convexTest>,
  email = 'o@x.com'
) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const menuItemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Kopi',
    priceIDR: 22000,
  });
  const modifierGroupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
    name: 'Ukuran',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options: [{ name: 'R', priceAdjustmentIDR: 0, position: 100 }],
  });
  return { asOwner, menuItemId, modifierGroupId };
}

describe('menu.itemGroups', () => {
  it('attach links a group to an item', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, menuItemId, modifierGroupId } = await setupOwnerWithItemAndGroup(t);
    await asOwner.mutation(api.menu.itemGroups.attach, { menuItemId, modifierGroupId });
    const detail = await asOwner.query(api.menu.items.getById, { id: menuItemId });
    expect(detail?.attachedGroups).toHaveLength(1);
    expect(detail?.attachedGroups[0]?.group._id).toBe(modifierGroupId);
  });

  it('double-attach is idempotent', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, menuItemId, modifierGroupId } = await setupOwnerWithItemAndGroup(t);
    await asOwner.mutation(api.menu.itemGroups.attach, { menuItemId, modifierGroupId });
    await asOwner.mutation(api.menu.itemGroups.attach, { menuItemId, modifierGroupId });
    const detail = await asOwner.query(api.menu.items.getById, { id: menuItemId });
    expect(detail?.attachedGroups).toHaveLength(1);
  });

  it('detach removes the link', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, menuItemId, modifierGroupId } = await setupOwnerWithItemAndGroup(t);
    await asOwner.mutation(api.menu.itemGroups.attach, { menuItemId, modifierGroupId });
    await asOwner.mutation(api.menu.itemGroups.detach, { menuItemId, modifierGroupId });
    const detail = await asOwner.query(api.menu.items.getById, { id: menuItemId });
    expect(detail?.attachedGroups).toHaveLength(0);
  });

  it('reorder swaps positions', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, menuItemId, modifierGroupId } = await setupOwnerWithItemAndGroup(t);
    const secondGroup = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Susu',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'Sapi', priceAdjustmentIDR: 0, position: 100 }],
    });
    await asOwner.mutation(api.menu.itemGroups.attach, { menuItemId, modifierGroupId });
    await asOwner.mutation(api.menu.itemGroups.attach, { menuItemId, modifierGroupId: secondGroup });
    await asOwner.mutation(api.menu.itemGroups.reorder, {
      menuItemId,
      modifierGroupId: secondGroup,
      direction: 'up',
    });
    const detail = await asOwner.query(api.menu.items.getById, { id: menuItemId });
    expect(detail?.attachedGroups[0]?.group._id).toBe(secondGroup);
    expect(detail?.attachedGroups[1]?.group._id).toBe(modifierGroupId);
  });

  it('cannot attach a group from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA, menuItemId: itemA } = await setupOwnerWithItemAndGroup(t, 'a@x.com');
    const { modifierGroupId: groupB } = await setupOwnerWithItemAndGroup(t, 'b@x.com');
    await expect(
      ownerA.mutation(api.menu.itemGroups.attach, { menuItemId: itemA, modifierGroupId: groupB })
    ).rejects.toThrow(/akses|tidak ditemukan/i);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test tests/convex/menu/itemGroups.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `convex/menu/itemGroups.ts`**

```typescript
import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { requireOwnerCafe } from '../lib/auth';

export const attach = mutation({
  args: { menuItemId: v.id('menuItems'), modifierGroupId: v.id('modifierGroups') },
  returns: v.null(),
  handler: async (ctx, { menuItemId, modifierGroupId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const item = await ctx.db.get(menuItemId);
    if (!item || item.cafeId !== cafeId) throw new Error('Item tidak ditemukan.');
    const group = await ctx.db.get(modifierGroupId);
    if (!group || group.cafeId !== cafeId) throw new Error('Grup modifier tidak ditemukan.');
    const existing = await ctx.db
      .query('menuItemModifierGroups')
      .withIndex('by_item', (q) => q.eq('menuItemId', menuItemId))
      .collect();
    if (existing.some((j) => j.modifierGroupId === modifierGroupId)) return null; // idempotent
    const nextPos =
      existing.length === 0 ? 100 : Math.max(...existing.map((j) => j.position)) + 100;
    await ctx.db.insert('menuItemModifierGroups', {
      cafeId,
      menuItemId,
      modifierGroupId,
      position: nextPos,
    });
    return null;
  },
});

export const detach = mutation({
  args: { menuItemId: v.id('menuItems'), modifierGroupId: v.id('modifierGroups') },
  returns: v.null(),
  handler: async (ctx, { menuItemId, modifierGroupId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const item = await ctx.db.get(menuItemId);
    if (!item || item.cafeId !== cafeId) throw new Error('Item tidak ditemukan.');
    const joins = await ctx.db
      .query('menuItemModifierGroups')
      .withIndex('by_item', (q) => q.eq('menuItemId', menuItemId))
      .collect();
    const row = joins.find((j) => j.modifierGroupId === modifierGroupId);
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

export const reorder = mutation({
  args: {
    menuItemId: v.id('menuItems'),
    modifierGroupId: v.id('modifierGroups'),
    direction: v.union(v.literal('up'), v.literal('down')),
  },
  returns: v.null(),
  handler: async (ctx, { menuItemId, modifierGroupId, direction }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const item = await ctx.db.get(menuItemId);
    if (!item || item.cafeId !== cafeId) throw new Error('Item tidak ditemukan.');
    const joins = await ctx.db
      .query('menuItemModifierGroups')
      .withIndex('by_item', (q) => q.eq('menuItemId', menuItemId))
      .collect();
    joins.sort((a, b) => a.position - b.position);
    const idx = joins.findIndex((j) => j.modifierGroupId === modifierGroupId);
    if (idx < 0) return null;
    const swap = direction === 'up' ? joins[idx - 1] : joins[idx + 1];
    if (!swap) return null;
    const me = joins[idx];
    if (!me) return null;
    await ctx.db.patch(me._id, { position: swap.position });
    await ctx.db.patch(swap._id, { position: me.position });
    return null;
  },
});
```

- [ ] **Step 4: Run codegen + all menu tests**

Run: `pnpm exec convex codegen && pnpm test tests/convex/menu/`
Expected: all tests pass — including the previously failing `getById returns item with attached groups` from Task 7.

- [ ] **Step 5: Commit**

```bash
git add convex/menu/itemGroups.ts convex/_generated tests/convex/menu/itemGroups.test.ts
git commit -m "feat(menu): item ↔ modifier-group join with attach/detach/reorder"
```

---

## Task 9: Install required shadcn primitives

**Files:**
- Create: `src/components/ui/table.tsx`
- Create: `src/components/ui/alert-dialog.tsx`
- Create: `src/components/ui/select.tsx`
- Create: `src/components/ui/switch.tsx`
- Create: `src/components/ui/skeleton.tsx`
- Create: `src/components/ui/empty.tsx`
- Create: `src/components/ui/sheet.tsx`

- [ ] **Step 1: Install primitives via the shadcn CLI**

Run:
```bash
pnpm dlx shadcn@latest add table alert-dialog select switch skeleton empty sheet --overwrite
```
Expected: each file written to `src/components/ui/`.

- [ ] **Step 2: Run Biome auto-fix on the new files**

Run: `rtk proxy npx biome check --write src/components/ui/table.tsx src/components/ui/alert-dialog.tsx src/components/ui/select.tsx src/components/ui/switch.tsx src/components/ui/skeleton.tsx src/components/ui/empty.tsx src/components/ui/sheet.tsx`
Expected: files reformatted to project conventions (single quotes, semicolons).

- [ ] **Step 3: Re-run lint to confirm clean**

Run: `pnpm lint`
Expected: exit 0. If a11y/style warnings remain in shadcn-generated code, add inline `// biome-ignore` comments with a short rationale (see field.tsx for the pattern).

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui package.json pnpm-lock.yaml
git commit -m "chore(ui): add shadcn primitives needed by Slice 1 (table, alert-dialog, select, switch, skeleton, empty, sheet)"
```

---

## Task 10: `<WizardStepper>` component

**Files:**
- Create: `src/components/menu/wizard-stepper.tsx`

This is the chrome reused by Slices 2 and 5.

- [ ] **Step 1: Implement the component**

`src/components/menu/wizard-stepper.tsx`:

```tsx
import { cn } from '~/lib/utils';

export interface WizardStep {
  label: string;
  enabled: boolean;
}

export interface WizardStepperProps {
  steps: ReadonlyArray<WizardStep>;
  currentIndex: number;
}

export function WizardStepper({ steps, currentIndex }: WizardStepperProps) {
  return (
    <ol className="flex items-center gap-2 text-xs mb-6" aria-label="Setup progress">
      {steps.map((step, i) => {
        const isCurrent = i === currentIndex;
        const isDone = i < currentIndex;
        const isEnabled = step.enabled;
        return (
          <li key={step.label} className="flex items-center gap-2 flex-1 last:flex-none">
            <span
              className={cn(
                'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium',
                isDone && 'bg-brand-600 text-white',
                isCurrent && 'bg-brand-600 text-white',
                !isCurrent && !isDone && isEnabled && 'bg-surface text-fg-muted',
                !isEnabled && 'bg-surface text-fg-muted/50'
              )}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {i + 1}
            </span>
            <span
              className={cn(
                'font-medium',
                isCurrent && 'text-fg',
                !isCurrent && isEnabled && 'text-fg-muted',
                !isEnabled && 'text-fg-muted/50'
              )}
            >
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <span
                className={cn('flex-1 h-px', isDone ? 'bg-brand-600' : 'bg-border')}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/menu/wizard-stepper.tsx
git commit -m "feat(menu): WizardStepper component for onboarding chrome"
```

---

## Task 11: `<CafeProfileForm>` + onboarding profile route

**Files:**
- Create: `src/components/menu/cafe-profile-form.tsx`
- Create: `src/routes/_pos/onboarding/route.tsx`
- Create: `src/routes/_pos/onboarding/profile.tsx`

- [ ] **Step 1: Create the shared form component**

`src/components/menu/cafe-profile-form.tsx`:

```tsx
import { type FormEvent, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';

export interface CafeProfileFormValues {
  name: string;
  phone?: string;
  addressLine?: string;
  timezone: string;
  taxRatePct: number;
  taxEnabled: boolean;
}

export interface CafeProfileFormProps {
  initial: CafeProfileFormValues;
  submitLabel: string;
  onSubmit: (values: CafeProfileFormValues) => Promise<void>;
  secondaryAction?: { label: string; onClick: () => void };
}

export function CafeProfileForm({ initial, submitLabel, onSubmit, secondaryAction }: CafeProfileFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await onSubmit({
        name: String(fd.get('name') ?? ''),
        phone: String(fd.get('phone') ?? '').trim() || undefined,
        addressLine: String(fd.get('addressLine') ?? '').trim() || undefined,
        timezone: String(fd.get('timezone') ?? 'Asia/Jakarta'),
        taxRatePct: Number(fd.get('taxRatePct') ?? 11),
        taxEnabled: fd.get('taxEnabled') === 'on',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan profil.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Nama kafe</FieldLabel>
          <Input id="name" name="name" required defaultValue={initial.name} maxLength={80} />
        </Field>
        <Field>
          <FieldLabel htmlFor="phone">Nomor HP</FieldLabel>
          <Input id="phone" name="phone" type="tel" defaultValue={initial.phone ?? ''} placeholder="08xx-xxxx-xxxx" />
        </Field>
        <Field>
          <FieldLabel htmlFor="addressLine">Alamat (opsional)</FieldLabel>
          <Input id="addressLine" name="addressLine" defaultValue={initial.addressLine ?? ''} />
        </Field>
        <Field>
          <FieldLabel htmlFor="timezone">Zona waktu</FieldLabel>
          <Input id="timezone" name="timezone" defaultValue={initial.timezone} />
        </Field>
        <Field>
          <FieldLabel htmlFor="taxRatePct">Persentase PPN</FieldLabel>
          <Input
            id="taxRatePct"
            name="taxRatePct"
            type="number"
            min="0"
            max="100"
            step="0.5"
            defaultValue={initial.taxRatePct}
          />
        </Field>
        <Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="taxEnabled"
              defaultChecked={initial.taxEnabled}
              className="h-4 w-4"
            />
            Aktifkan PPN di kasir
          </label>
        </Field>
        {error && <FieldError>{error}</FieldError>}
        <div className="flex gap-2 items-center">
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? 'Menyimpan…' : submitLabel}
          </Button>
          {secondaryAction && (
            <Button type="button" variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      </FieldGroup>
    </form>
  );
}
```

- [ ] **Step 2: Create the onboarding wizard layout**

`src/routes/_pos/onboarding/route.tsx`:

```tsx
import { Outlet, createFileRoute, useRouterState } from '@tanstack/react-router';
import { WizardStepper, type WizardStep } from '~/components/menu/wizard-stepper';

export const Route = createFileRoute('/_pos/onboarding')({
  component: OnboardingLayout,
});

const STEPS: ReadonlyArray<WizardStep> = [
  { label: 'Profil Kafe', enabled: true },
  { label: 'Menu', enabled: true },
  { label: 'Pembayaran', enabled: false },
  { label: 'Kasir', enabled: false },
];

function OnboardingLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const currentIndex = path.includes('/onboarding/menu') ? 1 : 0;
  return (
    <div className="max-w-3xl mx-auto p-6">
      <WizardStepper steps={STEPS} currentIndex={currentIndex} />
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 3: Create the profile route**

`src/routes/_pos/onboarding/profile.tsx`:

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { CafeProfileForm } from '~/components/menu/cafe-profile-form';

export const Route = createFileRoute('/_pos/onboarding/profile')({
  component: OnboardingProfile,
});

function OnboardingProfile() {
  const cafe = useQuery(api.cafes.myCafe);
  const updateProfile = useMutation(api.cafes.updateProfile);
  const markComplete = useMutation(api.cafes.markSetupComplete);
  const navigate = useNavigate();

  if (cafe === undefined) {
    return <p className="text-fg-muted">Memuat…</p>;
  }
  if (cafe === null) {
    return <p className="text-fg-muted">Kafe tidak ditemukan.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Profil kafe</h1>
      <p className="text-fg-muted mb-6 text-sm">Bisa diubah kapan saja di Pengaturan.</p>
      <CafeProfileForm
        initial={{
          name: cafe.name,
          phone: cafe.phone,
          addressLine: cafe.addressLine,
          timezone: cafe.timezone ?? 'Asia/Jakarta',
          taxRatePct: cafe.taxRatePct ?? 11,
          taxEnabled: cafe.taxEnabled ?? true,
        }}
        submitLabel="Lanjut →"
        onSubmit={async (values) => {
          await updateProfile(values);
          navigate({ to: '/onboarding/menu' });
        }}
        secondaryAction={{
          label: 'Lewati semua',
          onClick: async () => {
            await markComplete();
            navigate({ to: '/menu' });
          },
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run codegen + typecheck + lint**

Run: `pnpm exec convex codegen && pnpm typecheck && rtk proxy npx biome check src/components/menu/cafe-profile-form.tsx src/routes/_pos/onboarding/`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/menu/cafe-profile-form.tsx src/routes/_pos/onboarding src/routeTree.gen.ts
git commit -m "feat(onboarding): wizard layout + profile step"
```

---

## Task 12: Onboarding menu route (step 2 skeleton)

**Files:**
- Create: `src/routes/_pos/onboarding/menu.tsx`

This is the simplest of the two steps — just an introduction and call to action; full menu builder lives at `/menu`. Owner can skip or proceed to build.

- [ ] **Step 1: Implement the route**

```tsx
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation } from 'convex/react';
import { Button } from '~/components/ui/button';

export const Route = createFileRoute('/_pos/onboarding/menu')({
  component: OnboardingMenu,
});

function OnboardingMenu() {
  const markComplete = useMutation(api.cafes.markSetupComplete);
  const navigate = useNavigate();

  async function finish(target: '/menu' | '/menu/categories') {
    await markComplete();
    navigate({ to: target });
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Susun menu kafe</h1>
      <p className="text-fg-muted mb-6 text-sm">
        Buat kategori, tambah item, dan kelompokkan modifier yang bisa dipakai ulang. Bisa
        diselesaikan sekarang atau dilanjutkan kapan pun lewat menu utama.
      </p>
      <div className="space-y-3 p-4 rounded-md border border-border bg-bg max-w-md mb-6">
        <h2 className="font-semibold text-sm">Langkah singkat</h2>
        <ol className="list-decimal pl-5 text-sm space-y-1">
          <li>Buat 2–3 kategori (Kopi, Non-Kopi, Makanan).</li>
          <li>Tambahkan beberapa item beserta harganya.</li>
          <li>Buat grup modifier (mis. Ukuran) dan pasang ke item.</li>
        </ol>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => finish('/menu/categories')}>Mulai dengan kategori →</Button>
        <Button variant="outline" onClick={() => finish('/menu')}>Selesaikan nanti</Button>
        <Button asChild variant="ghost">
          <Link to="/onboarding/profile">← Kembali</Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && rtk proxy npx biome check src/routes/_pos/onboarding/menu.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_pos/onboarding/menu.tsx src/routeTree.gen.ts
git commit -m "feat(onboarding): menu step (skeleton; full builder at /menu)"
```

---

## Task 13: `_pos` layout — onboarding redirect loader

**Files:**
- Modify: `src/routes/_pos.tsx`

- [ ] **Step 1: Update the layout to redirect un-setup users**

```tsx
import { Outlet, createFileRoute, redirect, useRouterState } from '@tanstack/react-router';
import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react';
import { api } from 'convex/_generated/api';
import { useConvex } from 'convex/react';
import { useEffect } from 'react';
import { Spinner } from '~/components/ui/spinner';

export const Route = createFileRoute('/_pos')({
  component: PosLayout,
});

function PosLayout() {
  return (
    <div data-density="compact" className="min-h-screen bg-surface">
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center gap-2 text-fg-muted">
          <Spinner />
          <span>Memuat sesi…</span>
        </div>
      </AuthLoading>
      <Unauthenticated>
        <SignedOutRedirect />
      </Unauthenticated>
      <Authenticated>
        <OnboardingGate>
          <Outlet />
        </OnboardingGate>
      </Authenticated>
    </div>
  );
}

function SignedOutRedirect() {
  if (typeof window !== 'undefined') {
    window.location.replace('/signin');
  }
  return null;
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const convex = useConvex();
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cafe = await convex.query(api.cafes.myCafe);
      if (cancelled) return;
      const needsOnboarding = cafe !== null && !cafe.setupCompletedAt;
      const alreadyOnOnboarding = path.startsWith('/onboarding');
      if (needsOnboarding && !alreadyOnOnboarding && typeof window !== 'undefined') {
        window.location.replace('/onboarding/profile');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [convex, path]);
  return <>{children}</>;
}
```

- [ ] **Step 2: Run codegen + typecheck**

Run: `pnpm exec convex codegen && pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_pos.tsx src/routeTree.gen.ts
git commit -m "feat(onboarding): redirect un-setup users to wizard"
```

---

## Task 14: Settings/profile route

**Files:**
- Create: `src/routes/_pos/settings/route.tsx`
- Create: `src/routes/_pos/settings/profile.tsx`

- [ ] **Step 1: Create the layout**

`src/routes/_pos/settings/route.tsx`:

```tsx
import { Link, Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_pos/settings')({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className="max-w-5xl mx-auto p-6 flex gap-6">
      <aside className="w-48 shrink-0">
        <h2 className="text-xs uppercase tracking-wide text-fg-muted mb-3">Pengaturan</h2>
        <nav className="flex flex-col gap-1 text-sm">
          <Link to="/settings/profile" className="hover:underline" activeProps={{ className: 'font-semibold' }}>
            Profil kafe
          </Link>
        </nav>
      </aside>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create the profile route**

`src/routes/_pos/settings/profile.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { CafeProfileForm } from '~/components/menu/cafe-profile-form';

export const Route = createFileRoute('/_pos/settings/profile')({
  component: SettingsProfile,
});

function SettingsProfile() {
  const cafe = useQuery(api.cafes.myCafe);
  const updateProfile = useMutation(api.cafes.updateProfile);

  if (cafe === undefined) return <p className="text-fg-muted">Memuat…</p>;
  if (cafe === null) return <p className="text-fg-muted">Kafe tidak ditemukan.</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Profil kafe</h1>
      <p className="text-fg-muted mb-6 text-sm">Ubah informasi dasar kafe Anda.</p>
      <CafeProfileForm
        initial={{
          name: cafe.name,
          phone: cafe.phone,
          addressLine: cafe.addressLine,
          timezone: cafe.timezone ?? 'Asia/Jakarta',
          taxRatePct: cafe.taxRatePct ?? 11,
          taxEnabled: cafe.taxEnabled ?? true,
        }}
        submitLabel="Simpan"
        onSubmit={async (values) => {
          await updateProfile(values);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && rtk proxy npx biome check src/routes/_pos/settings/`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_pos/settings src/routeTree.gen.ts
git commit -m "feat(settings): cafe profile edit page"
```

---

## Task 15: `_pos/menu` layout + categories page

**Files:**
- Create: `src/routes/_pos/menu/route.tsx`
- Create: `src/routes/_pos/menu/categories.tsx`
- Create: `src/components/menu/category-table.tsx`

- [ ] **Step 1: Create the menu layout (tab nav)**

`src/routes/_pos/menu/route.tsx`:

```tsx
import { Link, Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_pos/menu')({
  component: MenuLayout,
});

function MenuLayout() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <nav className="flex gap-4 border-b border-border mb-4 text-sm">
        <Link
          to="/menu"
          className="py-2 px-1 -mb-px border-b-2 border-transparent hover:border-brand-500"
          activeProps={{ className: 'border-brand-500 font-semibold' }}
          activeOptions={{ exact: true }}
        >
          Items
        </Link>
        <Link
          to="/menu/categories"
          className="py-2 px-1 -mb-px border-b-2 border-transparent hover:border-brand-500"
          activeProps={{ className: 'border-brand-500 font-semibold' }}
        >
          Kategori
        </Link>
        <Link
          to="/menu/modifiers"
          className="py-2 px-1 -mb-px border-b-2 border-transparent hover:border-brand-500"
          activeProps={{ className: 'border-brand-500 font-semibold' }}
        >
          Grup Modifier
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 2: Create the category table component**

`src/components/menu/category-table.tsx`:

```tsx
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';

export function CategoryTable() {
  const categories = useQuery(api.menu.categories.list, {});
  const createCategory = useMutation(api.menu.categories.create);
  const updateCategory = useMutation(api.menu.categories.update);
  const reorderCategory = useMutation(api.menu.categories.reorder);
  const archiveCategory = useMutation(api.menu.categories.archive);
  const [editingId, setEditingId] = useState<Id<'categories'> | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await createCategory({ name: String(fd.get('name') ?? '') });
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat kategori.');
    } finally {
      setCreating(false);
    }
  }

  if (categories === undefined) return <p className="text-fg-muted">Memuat…</p>;

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="flex gap-2 items-end max-w-md">
        <div className="flex-1">
          <label htmlFor="newName" className="text-xs text-fg-muted">Nama kategori baru</label>
          <Input id="newName" name="name" placeholder="mis. Kopi" required maxLength={60} />
        </div>
        <Button type="submit" disabled={creating}>
          {creating && <Spinner data-icon="inline-start" />}
          {creating ? '…' : '+ Tambah'}
        </Button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-fg-muted border-b border-border">
            <th className="py-2 px-2 w-12">#</th>
            <th className="py-2 px-2">Nama</th>
            <th className="py-2 px-2 w-32 text-right">Urutan</th>
            <th className="py-2 px-2 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {categories.length === 0 && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-fg-muted">
                Belum ada kategori.
              </td>
            </tr>
          )}
          {categories.map((c, i) => (
            <tr key={c._id} className="border-b border-border/50">
              <td className="py-2 px-2 text-fg-muted">{i + 1}</td>
              <td className="py-2 px-2">
                {editingId === c._id ? (
                  <InlineEdit
                    initial={c.name}
                    onSave={async (name) => {
                      await updateCategory({ id: c._id, name });
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => setEditingId(c._id)}
                  >
                    {c.name}
                  </button>
                )}
              </td>
              <td className="py-2 px-2 text-right">
                <button
                  type="button"
                  className="px-1 disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => reorderCategory({ id: c._id, direction: 'up' })}
                  aria-label="Naikkan urutan"
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="px-1 disabled:opacity-30"
                  disabled={i === categories.length - 1}
                  onClick={() => reorderCategory({ id: c._id, direction: 'down' })}
                  aria-label="Turunkan urutan"
                >
                  ▼
                </button>
              </td>
              <td className="py-2 px-2 text-right">
                <button
                  type="button"
                  className="text-xs text-danger hover:underline"
                  onClick={() => {
                    if (confirm(`Arsipkan "${c.name}"?`)) {
                      void archiveCategory({ id: c._id });
                    }
                  }}
                >
                  Arsipkan
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InlineEdit({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave(name);
        setSaving(false);
      }}
      className="flex gap-2 items-center"
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        maxLength={60}
      />
      <Button type="submit" size="sm" disabled={saving}>
        Simpan
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Create the categories route**

`src/routes/_pos/menu/categories.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { CategoryTable } from '~/components/menu/category-table';

export const Route = createFileRoute('/_pos/menu/categories')({
  component: CategoriesPage,
});

function CategoriesPage() {
  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Kategori</h1>
      <p className="text-fg-muted text-sm mb-4">Kategori muncul sebagai filter di daftar Items dan di layar kasir.</p>
      <CategoryTable />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && rtk proxy npx biome check src/routes/_pos/menu/ src/components/menu/category-table.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_pos/menu/route.tsx src/routes/_pos/menu/categories.tsx src/components/menu/category-table.tsx src/routeTree.gen.ts
git commit -m "feat(menu): categories page with inline rename + reorder"
```

---

## Task 16: Modifier groups list + editor

**Files:**
- Create: `src/components/menu/modifier-group-form.tsx`
- Create: `src/routes/_pos/menu/modifiers.tsx`
- Create: `src/routes/_pos/menu/modifiers.$groupId.tsx`

- [ ] **Step 1: Create the form component**

`src/components/menu/modifier-group-form.tsx`:

```tsx
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';

export interface OptionRow {
  id?: Id<'modifierOptions'>;
  name: string;
  priceAdjustmentIDR: number;
  position: number;
}

export interface ModifierGroupFormProps {
  initialId?: Id<'modifierGroups'>;
  initialName: string;
  initialRequired: boolean;
  initialMinSelect: number;
  initialMaxSelect: number;
  initialOptions: OptionRow[];
  onSaved: (id: Id<'modifierGroups'>) => void;
}

export function ModifierGroupForm(props: ModifierGroupFormProps) {
  const upsert = useMutation(api.menu.modifierGroups.upsert);
  const [name, setName] = useState(props.initialName);
  const [required, setRequired] = useState(props.initialRequired);
  const [minSelect, setMinSelect] = useState(props.initialMinSelect);
  const [maxSelect, setMaxSelect] = useState(props.initialMaxSelect);
  const [options, setOptions] = useState<OptionRow[]>(props.initialOptions);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function addRow() {
    const maxPos = options.length === 0 ? 0 : Math.max(...options.map((o) => o.position));
    setOptions([...options, { name: '', priceAdjustmentIDR: 0, position: maxPos + 100 }]);
  }

  function updateRow(idx: number, patch: Partial<OptionRow>) {
    setOptions((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRow(idx: number) {
    setOptions((rows) => rows.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const id = await upsert({
        id: props.initialId,
        name,
        required,
        minSelect,
        maxSelect,
        options: options.map((o) => ({
          id: o.id,
          name: o.name,
          priceAdjustmentIDR: o.priceAdjustmentIDR,
          position: o.position,
        })),
      });
      props.onSaved(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan grup.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="groupName">Nama grup</FieldLabel>
          <Input id="groupName" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field>
            <FieldLabel htmlFor="required">Wajib?</FieldLabel>
            <label className="flex items-center gap-2 text-sm">
              <input
                id="required"
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="h-4 w-4"
              />
              Cashier harus memilih
            </label>
          </Field>
          <Field>
            <FieldLabel htmlFor="minSelect">Min</FieldLabel>
            <Input
              id="minSelect"
              type="number"
              min="0"
              max="10"
              value={minSelect}
              onChange={(e) => setMinSelect(Number(e.target.value))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="maxSelect">Max</FieldLabel>
            <Input
              id="maxSelect"
              type="number"
              min="1"
              max="10"
              value={maxSelect}
              onChange={(e) => setMaxSelect(Number(e.target.value))}
            />
          </Field>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-fg-muted">
              Opsi ({options.length})
            </span>
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              + Opsi
            </Button>
          </div>
          <div className="space-y-2">
            {options.length === 0 && (
              <p className="text-sm text-fg-muted">Belum ada opsi. Tambahkan minimal satu.</p>
            )}
            {options.map((o, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
                <Input
                  placeholder="Nama opsi (mis. Large)"
                  value={o.name}
                  onChange={(e) => updateRow(idx, { name: e.target.value })}
                  required
                  maxLength={60}
                />
                <Input
                  type="number"
                  min="0"
                  step="500"
                  placeholder="Selisih harga"
                  value={o.priceAdjustmentIDR}
                  onChange={(e) =>
                    updateRow(idx, { priceAdjustmentIDR: Number(e.target.value) })
                  }
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => removeRow(idx)}>
                  Hapus
                </Button>
              </div>
            ))}
          </div>
        </div>

        {error && <FieldError>{error}</FieldError>}
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? 'Menyimpan…' : 'Simpan grup'}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
```

- [ ] **Step 2: Create the list route**

`src/routes/_pos/menu/modifiers.tsx`:

```tsx
import { Link, createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';

export const Route = createFileRoute('/_pos/menu/modifiers')({
  component: ModifierGroupsPage,
});

function ModifierGroupsPage() {
  const groups = useQuery(api.menu.modifierGroups.list, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Grup Modifier</h1>
          <p className="text-fg-muted text-sm">Dipakai ulang di banyak item — ubah di satu tempat.</p>
        </div>
        <Link to="/menu/modifiers/$groupId" params={{ groupId: 'new' }} className="text-sm">
          <span className="px-3 py-1 rounded-md bg-brand-600 text-white">+ Grup baru</span>
        </Link>
      </div>
      {groups === undefined && <p className="text-fg-muted">Memuat…</p>}
      {groups && groups.length === 0 && (
        <p className="text-fg-muted">Belum ada grup modifier. Buat satu untuk mulai.</p>
      )}
      {groups && groups.length > 0 && (
        <ul className="divide-y divide-border border border-border rounded-md">
          {groups.map((g) => (
            <li key={g._id} className="p-3 hover:bg-surface">
              <Link
                to="/menu/modifiers/$groupId"
                params={{ groupId: g._id }}
                className="flex items-center justify-between"
              >
                <div>
                  <span className="font-medium">{g.name}</span>
                  <span className="text-xs text-fg-muted ml-2">
                    {g.required ? 'wajib' : 'opsional'} · {g.minSelect}/{g.maxSelect} · {g.options.length} opsi
                  </span>
                </div>
                <span className="text-fg-muted">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the editor route**

`src/routes/_pos/menu/modifiers.$groupId.tsx`:

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { ModifierGroupForm } from '~/components/menu/modifier-group-form';

export const Route = createFileRoute('/_pos/menu/modifiers/$groupId')({
  component: ModifierGroupEditor,
});

function ModifierGroupEditor() {
  const { groupId } = Route.useParams();
  const navigate = useNavigate();
  const isNew = groupId === 'new';
  const existing = useQuery(api.menu.modifierGroups.getById, isNew ? 'skip' : { id: groupId as Id<'modifierGroups'> });

  if (!isNew && existing === undefined) return <p className="text-fg-muted">Memuat…</p>;
  if (!isNew && existing === null) return <p className="text-fg-muted">Grup tidak ditemukan.</p>;

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">{isNew ? 'Grup modifier baru' : 'Edit grup modifier'}</h1>
      <ModifierGroupForm
        initialId={existing?._id}
        initialName={existing?.name ?? ''}
        initialRequired={existing?.required ?? false}
        initialMinSelect={existing?.minSelect ?? 1}
        initialMaxSelect={existing?.maxSelect ?? 1}
        initialOptions={
          existing?.options.map((o) => ({
            id: o._id,
            name: o.name,
            priceAdjustmentIDR: o.priceAdjustmentIDR,
            position: o.position,
          })) ?? []
        }
        onSaved={() => navigate({ to: '/menu/modifiers' })}
      />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && rtk proxy npx biome check src/components/menu/modifier-group-form.tsx src/routes/_pos/menu/modifiers.tsx src/routes/_pos/menu/modifiers.\$groupId.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/menu/modifier-group-form.tsx src/routes/_pos/menu/modifiers.tsx 'src/routes/_pos/menu/modifiers.$groupId.tsx' src/routeTree.gen.ts
git commit -m "feat(menu): modifier group list + editor with atomic upsert"
```

---

## Task 17: Items list page

**Files:**
- Create: `src/routes/_pos/menu/index.tsx`

Variant A from brainstorming: left sidebar of categories with counts, right pane is filtered table.

- [ ] **Step 1: Implement the page**

```tsx
import { Link, createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/menu/')({
  component: ItemsListPage,
});

type CategoryFilter = 'all' | 'archived' | Id<'categories'>;

function ItemsListPage() {
  const categories = useQuery(api.menu.categories.list, {});
  const allItems = useQuery(api.menu.items.list, {});
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    if (!allItems) return [];
    let rows = allItems;
    if (filter === 'archived') {
      rows = []; // populated by archived list below
    } else if (filter !== 'all') {
      rows = rows.filter((r) => r.categoryId === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    }
    return rows;
  }, [allItems, filter, search]);

  const archivedItems = useQuery(
    api.menu.items.list,
    filter === 'archived' ? { includeArchived: true, includeInactive: true } : 'skip'
  );

  const archivedVisible = useMemo(() => {
    if (!archivedItems) return [];
    return archivedItems.filter((r) => r.archived);
  }, [archivedItems]);

  const rows = filter === 'archived' ? archivedVisible : visible;
  const isLoading = categories === undefined || allItems === undefined;

  return (
    <div className="flex gap-6">
      <aside className="w-52 shrink-0 text-sm">
        <h2 className="text-xs uppercase tracking-wide text-fg-muted mb-2">Kategori</h2>
        <nav className="space-y-1">
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label={`Semua (${allItems?.length ?? 0})`} />
          {(categories ?? []).map((c) => {
            const count = allItems?.filter((i) => i.categoryId === c._id).length ?? 0;
            return (
              <FilterButton
                key={c._id}
                active={filter === c._id}
                onClick={() => setFilter(c._id)}
                label={`${c.name} (${count})`}
              />
            );
          })}
          <FilterButton
            active={filter === 'archived'}
            onClick={() => setFilter('archived')}
            label="Arsip"
            muted
          />
        </nav>
      </aside>
      <section className="flex-1">
        <div className="flex gap-2 mb-3">
          <Input
            placeholder="Cari item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Button asChild>
            <Link to="/menu/items/$itemId" params={{ itemId: 'new' }}>+ Item</Link>
          </Button>
        </div>
        {isLoading ? (
          <p className="text-fg-muted">Memuat…</p>
        ) : rows.length === 0 ? (
          <p className="text-fg-muted">Tidak ada item.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-fg-muted border-b border-border">
                <th className="py-2 px-2">Nama</th>
                <th className="py-2 px-2 w-24">Kategori</th>
                <th className="py-2 px-2 w-28 text-right">Harga</th>
                <th className="py-2 px-2 w-24">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="border-b border-border/50 hover:bg-surface">
                  <td className="py-2 px-2">
                    <Link to="/menu/items/$itemId" params={{ itemId: r._id }} className="hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 px-2 text-fg-muted">
                    {categories?.find((c) => c._id === r.categoryId)?.name ?? '—'}
                  </td>
                  <td className="py-2 px-2 text-right">{formatIDR(r.priceIDR)}</td>
                  <td className="py-2 px-2">
                    {r.archived ? (
                      <span className="text-xs text-fg-muted">● Arsip</span>
                    ) : r.isActive ? (
                      <span className="text-xs text-brand-600">● Aktif</span>
                    ) : (
                      <span className="text-xs text-fg-muted">○ Off</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  muted,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-2 py-1 rounded ${
        active ? 'bg-brand-50 text-brand-700 font-medium' : 'hover:bg-surface'
      } ${muted ? 'text-fg-muted' : ''}`}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && rtk proxy npx biome check src/routes/_pos/menu/index.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_pos/menu/index.tsx src/routeTree.gen.ts
git commit -m "feat(menu): items list page (sidebar + filtered table)"
```

---

## Task 18: Item edit page

**Files:**
- Create: `src/components/menu/item-edit-form.tsx`
- Create: `src/routes/_pos/menu/items.$itemId.tsx`

- [ ] **Step 1: Create the form component**

`src/components/menu/item-edit-form.tsx`:

```tsx
import { api } from 'convex/_generated/api';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';

export interface AttachedGroupRow {
  group: Doc<'modifierGroups'>;
  position: number;
}

export interface ItemEditFormProps {
  itemId: Id<'menuItems'> | 'new';
  initial: {
    name: string;
    categoryId: Id<'categories'> | '';
    priceIDR: number;
    isActive: boolean;
  };
  attached: AttachedGroupRow[];
  onSaved: (id: Id<'menuItems'>) => void;
}

export function ItemEditForm(props: ItemEditFormProps) {
  const categories = useQuery(api.menu.categories.list, {});
  const allGroups = useQuery(api.menu.modifierGroups.list, {});
  const createItem = useMutation(api.menu.items.create);
  const updateItem = useMutation(api.menu.items.update);
  const setActive = useMutation(api.menu.items.setActive);
  const archive = useMutation(api.menu.items.archive);
  const attachGroup = useMutation(api.menu.itemGroups.attach);
  const detachGroup = useMutation(api.menu.itemGroups.detach);
  const reorderGroup = useMutation(api.menu.itemGroups.reorder);

  const [name, setName] = useState(props.initial.name);
  const [categoryId, setCategoryId] = useState<Id<'categories'> | ''>(props.initial.categoryId);
  const [priceIDR, setPriceIDR] = useState<number>(props.initial.priceIDR);
  const [isActive, setIsActive] = useState(props.initial.isActive);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const attachedIds = new Set(props.attached.map((a) => a.group._id));
  const availableGroups = (allGroups ?? []).filter((g) => !attachedIds.has(g._id));

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!categoryId) {
      setError('Pilih kategori terlebih dahulu.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let id: Id<'menuItems'>;
      if (props.itemId === 'new') {
        id = await createItem({ categoryId, name, priceIDR });
      } else {
        await updateItem({ id: props.itemId, categoryId, name, priceIDR });
        id = props.itemId;
      }
      if (props.itemId !== 'new' && isActive !== props.initial.isActive) {
        await setActive({ id, isActive });
      }
      props.onSaved(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan item.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-8 max-w-4xl">
      <div>
        <h2 className="text-xs uppercase tracking-wide text-fg-muted mb-2">Dasar</h2>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Nama</FieldLabel>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </Field>
          <Field>
            <FieldLabel htmlFor="categoryId">Kategori</FieldLabel>
            <select
              id="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value as Id<'categories'>)}
              required
              className="flex h-10 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            >
              <option value="">— Pilih kategori —</option>
              {(categories ?? []).map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="priceIDR">Harga (Rp)</FieldLabel>
            <Input
              id="priceIDR"
              type="number"
              min="0"
              step="500"
              value={priceIDR}
              onChange={(e) => setPriceIDR(Number(e.target.value))}
              required
            />
          </Field>
          {props.itemId !== 'new' && (
            <Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4"
                />
                Aktif (tampil ke kasir)
              </label>
            </Field>
          )}
        </FieldGroup>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs uppercase tracking-wide text-fg-muted">
            Grup modifier ({props.attached.length})
          </h2>
          {props.itemId !== 'new' && availableGroups.length > 0 && (
            <select
              defaultValue=""
              onChange={async (e) => {
                if (e.target.value && props.itemId !== 'new') {
                  await attachGroup({
                    menuItemId: props.itemId,
                    modifierGroupId: e.target.value as Id<'modifierGroups'>,
                  });
                  e.target.value = '';
                }
              }}
              className="text-xs px-2 py-1 border border-border rounded-md bg-bg"
            >
              <option value="">+ Pasang grup…</option>
              {availableGroups.map((g) => (
                <option key={g._id} value={g._id}>{g.name}</option>
              ))}
            </select>
          )}
        </div>
        {props.itemId === 'new' ? (
          <p className="text-sm text-fg-muted">Simpan item dulu untuk memasang grup modifier.</p>
        ) : props.attached.length === 0 ? (
          <p className="text-sm text-fg-muted">Belum ada grup terpasang.</p>
        ) : (
          <ul className="space-y-2">
            {props.attached.map((a, i) => (
              <li key={a.group._id} className="border border-border rounded-md p-2 flex items-center gap-2">
                <span className="flex-1">
                  <strong>{a.group.name}</strong>
                  <span className="text-xs text-fg-muted ml-2">
                    {a.group.required ? 'wajib' : 'opsional'} · {a.group.minSelect}/{a.group.maxSelect}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() =>
                    props.itemId !== 'new' &&
                    reorderGroup({
                      menuItemId: props.itemId,
                      modifierGroupId: a.group._id,
                      direction: 'up',
                    })
                  }
                  aria-label="Naikkan urutan"
                  className="px-1 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  disabled={i === props.attached.length - 1}
                  onClick={() =>
                    props.itemId !== 'new' &&
                    reorderGroup({
                      menuItemId: props.itemId,
                      modifierGroupId: a.group._id,
                      direction: 'down',
                    })
                  }
                  aria-label="Turunkan urutan"
                  className="px-1 disabled:opacity-30"
                >
                  ▼
                </button>
                <button
                  type="button"
                  onClick={() =>
                    props.itemId !== 'new' &&
                    detachGroup({
                      menuItemId: props.itemId,
                      modifierGroupId: a.group._id,
                    })
                  }
                  className="text-xs text-danger hover:underline"
                >
                  Lepas
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="col-span-2 flex justify-between items-center mt-4 pt-4 border-t border-border">
        <div>
          {props.itemId !== 'new' && (
            <button
              type="button"
              onClick={async () => {
                if (props.itemId !== 'new' && confirm('Arsipkan item ini?')) {
                  await archive({ id: props.itemId });
                  props.onSaved(props.itemId);
                }
              }}
              className="text-sm text-danger hover:underline"
            >
              Arsipkan item
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create the route**

`src/routes/_pos/menu/items.$itemId.tsx`:

```tsx
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { ItemEditForm } from '~/components/menu/item-edit-form';

export const Route = createFileRoute('/_pos/menu/items/$itemId')({
  component: ItemEditPage,
});

function ItemEditPage() {
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const isNew = itemId === 'new';
  const detail = useQuery(
    api.menu.items.getById,
    isNew ? 'skip' : { id: itemId as Id<'menuItems'> }
  );

  if (!isNew && detail === undefined) return <p className="text-fg-muted">Memuat…</p>;
  if (!isNew && detail === null) return <p className="text-fg-muted">Item tidak ditemukan.</p>;

  return (
    <div>
      <div className="text-xs text-fg-muted mb-2">
        <Link to="/menu" className="hover:underline">Menu</Link> ›{' '}
        <Link to="/menu" className="hover:underline">Items</Link> › {isNew ? 'Baru' : detail?.item.name}
      </div>
      <h1 className="text-xl font-bold mb-4">{isNew ? 'Item baru' : detail?.item.name}</h1>
      <ItemEditForm
        itemId={isNew ? 'new' : (itemId as Id<'menuItems'>)}
        initial={{
          name: detail?.item.name ?? '',
          categoryId: detail?.item.categoryId ?? '',
          priceIDR: detail?.item.priceIDR ?? 0,
          isActive: detail?.item.isActive ?? true,
        }}
        attached={(detail?.attachedGroups ?? []).map((a) => ({
          group: a.group,
          position: a.position,
        }))}
        onSaved={() => navigate({ to: '/menu' })}
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && rtk proxy npx biome check src/components/menu/item-edit-form.tsx 'src/routes/_pos/menu/items.\$itemId.tsx'`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/menu/item-edit-form.tsx 'src/routes/_pos/menu/items.$itemId.tsx' src/routeTree.gen.ts
git commit -m "feat(menu): item edit page (basic + attached modifier groups)"
```

---

## Task 19: Playwright E2E for menu

**Files:**
- Create: `tests/e2e/menu.spec.ts`

- [ ] **Step 1: Write the specs**

```typescript
import { expect, test } from '@playwright/test';

// Both specs require a signed-in session + a live Convex backend; gated.
test.describe('menu (auth-gated)', () => {
  test.skip(!process.env.RUN_AUTH_E2E, 'set RUN_AUTH_E2E=1 to run');

  test('wizard happy path: profile → menu → first item with modifier group', async ({ page }) => {
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    // Sign up.
    await page.goto('/signup');
    await page.getByLabel('Nama').fill('E2E Owner');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    // Lands on onboarding/profile after redirect.
    await page.waitForURL(/\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByLabel('Nama kafe').fill('Kopi E2E');
    await page.getByLabel('Persentase PPN').fill('11');
    await page.getByRole('button', { name: /Lanjut/ }).click();

    // Step 2.
    await page.waitForURL(/\/onboarding\/menu$/);
    await page.getByRole('button', { name: /Mulai dengan kategori/ }).click();

    // Categories.
    await page.waitForURL(/\/menu\/categories$/);
    await page.getByLabel('Nama kategori baru').fill('Kopi');
    await page.getByRole('button', { name: /\+ Tambah/ }).click();
    await expect(page.getByText('Kopi')).toBeVisible();

    // Items.
    await page.getByRole('link', { name: 'Items' }).click();
    await page.waitForURL(/\/menu$/);
    await page.getByRole('link', { name: /\+ Item/ }).click();
    await page.waitForURL(/\/menu\/items\/new$/);
    await page.getByLabel('Nama').fill('Kopi Susu Gula Aren');
    await page.getByLabel('Kategori').selectOption({ label: 'Kopi' });
    await page.getByLabel('Harga (Rp)').fill('22000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await page.waitForURL(/\/menu$/);
    await expect(page.getByText('Kopi Susu Gula Aren')).toBeVisible();
  });

  test('CRUD round-trip on an existing item', async ({ page }) => {
    // This test reuses the cafe from the previous test or one seeded manually.
    // It assumes a signed-in session with at least one item present.
    // For an isolated run, prefix with a fresh signup + minimal seed.
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';
    await page.goto('/signup');
    await page.getByLabel('Nama').fill('E2E Owner');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();
    await page.waitForURL(/\/onboarding\/profile$/);
    await page.getByLabel('Nama kafe').fill('Kopi E2E 2');
    await page.getByRole('button', { name: /Lanjut/ }).click();
    await page.waitForURL(/\/onboarding\/menu$/);
    await page.getByRole('button', { name: /Mulai dengan kategori/ }).click();
    await page.waitForURL(/\/menu\/categories$/);
    await page.getByLabel('Nama kategori baru').fill('Kopi');
    await page.getByRole('button', { name: /\+ Tambah/ }).click();
    await page.getByRole('link', { name: 'Items' }).click();
    await page.getByRole('link', { name: /\+ Item/ }).click();
    await page.getByLabel('Nama').fill('Espresso');
    await page.getByLabel('Kategori').selectOption({ label: 'Kopi' });
    await page.getByLabel('Harga (Rp)').fill('18000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await page.waitForURL(/\/menu$/);

    // Now edit it.
    await page.getByRole('link', { name: 'Espresso' }).click();
    await expect(page).toHaveURL(/\/menu\/items\/[^/]+$/);
    await page.getByLabel('Harga (Rp)').fill('20000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await page.waitForURL(/\/menu$/);
    await expect(page.getByText('Rp 20.000')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the E2E specs (default smoke only — auth-gated specs skip)**

Run: `pnpm test:e2e`
Expected: existing smoke passes; menu specs report as skipped.

- [ ] **Step 3: Optional — run with auth gate enabled if a Convex dev backend is available**

Run: `RUN_AUTH_E2E=1 pnpm test:e2e`
Expected: 1 prior auth flow + 2 menu specs all pass. (Skip if `pnpm convex:dev` not running.)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/menu.spec.ts
git commit -m "test(e2e): menu wizard + CRUD round-trip (auth-gated)"
```

---

## Task 20: Final verification + lingui extract

**Files:** (no new files; verifies everything)

- [ ] **Step 1: Extract any new Lingui strings**

Run: `pnpm lingui:extract`
Expected: catalogs in `src/locales/{id,en}/messages.po` update with any new `<Trans>` strings. For Slice 1 most strings are inline (not in `<Trans>`) because the design is owner-facing Indonesian; if any are added later wrap them in `<Trans>` per the parent spec.

If catalogs changed, commit them:
```bash
git add src/locales
git commit -m "i18n(menu): extract Slice 1 strings"
```

If nothing changed, skip.

- [ ] **Step 2: Run the full quality gate**

Run:
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```
Expected: all four exit 0. Unit count should be 30+ menu tests + 7 money + 2 users + 6 cafes profile = ~45+ tests.

- [ ] **Step 3: Smoke-test the dev server in a browser**

Run: `pnpm dev:all` and open `http://localhost:5173`. Walk the wizard, add 2 categories, 3 items, 1 modifier group, attach to an item. Confirm no console errors. (Optional but valuable.)

- [ ] **Step 4: Commit final lint/format if anything drifted**

```bash
git status
# If anything's unstaged from automated formatters or codegen:
git add -A
git commit -m "chore: post-Slice-1 cleanup"
```

---

## Self-Review Notes

**Spec coverage check** against `docs/superpowers/specs/2026-05-20-phase-1-slice-1-onboarding-menu-design.md`:

| Spec section | Task(s) |
|---|---|
| Cafe profile fields + updates | Task 1 (schema), Task 4 (mutations) |
| Categories table + CRUD | Task 1 (schema), Task 5 (backend), Task 15 (UI) |
| Menu items table + CRUD | Task 1 (schema), Task 7 (backend), Task 17 (list), Task 18 (edit) |
| Modifier groups + options | Task 1 (schema), Task 6 (backend), Task 16 (UI) |
| Item ↔ group join | Task 1 (schema), Task 8 (backend), Task 18 (UI integration) |
| `requireOwnerCafe` tenant helper | Task 3 |
| `nextPositionAfter` helper | Task 2 |
| 4-step wizard, steps 1+2 active | Task 10 (component), Task 11 (step 1), Task 12 (step 2) |
| Onboarding redirect loader | Task 13 |
| Settings/profile | Task 14 |
| Convex tests (25–35) | Tasks 4–8 (~45 tests in total) |
| Playwright E2E (gated) | Task 19 |
| shadcn primitives | Task 9 |

**Placeholder scan:** No "TBD", "TODO", "fill in details" left in any task. The "If a11y/style warnings remain" guidance in Task 9 Step 3 is conditional advice, not a placeholder.

**Type / name consistency check:**
- `requireOwnerCafe` returns `{ userId, cafeId }` — used consistently across Tasks 3–8.
- `nextPositionAfter` helper — never directly imported by the Convex functions (they inline the same logic for clarity). Used only by tests; that's fine — its existence documents the convention.
- `markSetupComplete` — same name in Tasks 4, 11, 12, 13.
- `assertItem`, `assertOption`, `assertGroup`, `assertName` — each in their own file; no cross-file references.
- `cafeDoc`, `menuItemDoc`, `optionDoc`, `groupWithOptions`, `itemDetail` — each defined adjacent to its usage in the Convex files.
- Route names match `_layout` pattern; `items.$itemId.tsx` and `modifiers.$groupId.tsx` use TanStack's file-route convention.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-20-phase-1-slice-1-onboarding-menu.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task with two-stage review between tasks. Faster iteration; each subagent stays focused on one task's TDD cycle.
2. **Inline Execution** — I run tasks in this session using batch checkpoints; you review at planned stops.

Which approach?
