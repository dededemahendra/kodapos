# Phase 1 · Slice 2 — Shifts + PIN Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Slice 2 of Phase 1: cafeStaff table + shifts table + PIN auth + onboarding step 4 + Settings → Staff. Outcome: owner signs up, sets their PIN, picks themselves on the device, opens a shift, closes a shift. Unblocks Slice 3 (POS Core) which writes `cashierId` and `shiftId` on every order.

**Architecture:** Two new Convex tables (`cafeStaff`, `shifts`). Owner identity stays the Convex Auth `users` row; cashier identity is a `cafeStaff` row selected via PIN picker into `localStorage.activeCashierId`. A new `PinGate` component wraps shift/sale routes — non-shift owner routes (menu, settings) skip the gate. PIN hashing uses PBKDF2-SHA256 via Web Crypto (works in Convex's V8 runtime, no extra deps).

**Tech Stack:** TanStack Start · Convex · Convex Auth · shadcn/ui · Tailwind v4 · Lingui 6 · Vitest · `convex-test` · Playwright · Web Crypto PBKDF2

**Spec:** `docs/superpowers/specs/2026-05-21-phase-1-slice-2-shifts-design.md`

---

## File Map

**Convex (server):**

- Modify: `convex/schema.ts` — add `cafeStaff` + `shifts` tables.
- Modify: `convex/cafes.ts` — extend `createForOwner` to insert the owner's `cafeStaff` row.
- Create: `convex/lib/pin.ts` — `hashPin` / `verifyPin` via PBKDF2.
- Create: `convex/lib/staff.ts` — `requireActiveCashier(ctx, cafeId, cashierId)` helper.
- Create: `convex/staff.ts` — `list`, `create`, `updateName`, `resetPin`, `archive`, `verifyPin`.
- Create: `convex/shifts.ts` — `current`, `open`, `close`.

**Client:**

- Create: `src/lib/active-cashier.ts` — `useActiveCashier()` hook over `localStorage` with `storage`-event sync.
- Create: `src/components/staff/pin-entry.tsx` — 4-cell numeric input.
- Create: `src/components/staff/staff-picker-card.tsx` — single picker tile.
- Create: `src/components/staff/pin-gate.tsx` — wraps `<Outlet />` with a localStorage check + redirect.
- Create: `src/components/shift/shift-summary-panel.tsx` — formats opening/expected/counted/variance.
- Modify: `src/components/menu/wizard-stepper.tsx` — no code change; the consumer toggles step-4 `enabled` flag.
- Modify: `src/routes/_pos/onboarding/route.tsx` — flip step 4 `enabled` to `true`; map `/onboarding/cashier` path to currentIndex 3.
- Create: `src/routes/_pos/onboarding/cashier.tsx` — wizard step 4: owner PIN + cashier list.
- Create: `src/routes/_pos/pin.tsx` — PIN picker route.
- Create: `src/routes/_pos/shift/route.tsx` — layout that wraps `<Outlet />` in `<PinGate>`.
- Create: `src/routes/_pos/shift/open.tsx`
- Create: `src/routes/_pos/shift/close.tsx`
- Create: `src/routes/_pos/settings/staff.tsx`
- Modify: `src/routes/_pos/settings/route.tsx` — add "Staff" link to the left nav.

**Tests:**

- Create: `tests/convex/staff.test.ts`
- Create: `tests/convex/shifts.test.ts`
- Modify: `tests/convex/cafes.profile.test.ts` — add a test that `createForOwner` auto-inserts the owner staff row.
- Create: `tests/e2e/shifts.spec.ts`

---

## Task 1: Add `cafeStaff` + `shifts` tables to schema

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add the two tables to `defineSchema`**

Insert these after the existing `menuItemModifierGroups` table:

```typescript
  cafeStaff: defineTable({
    cafeId: v.id('cafes'),
    name: v.string(),
    pinHash: v.optional(v.string()),
    role: v.union(v.literal('owner'), v.literal('cashier')),
    archived: v.boolean(),
    createdAt: v.number(),
  }).index('by_cafe_active', ['cafeId', 'archived']),

  shifts: defineTable({
    cafeId: v.id('cafes'),
    cashierId: v.id('cafeStaff'),
    openedAt: v.number(),
    closedAt: v.optional(v.number()),
    openingFloatIDR: v.number(),
    expectedCashIDR: v.optional(v.number()),
    countedCashIDR: v.optional(v.number()),
    varianceIDR: v.optional(v.number()),
    status: v.union(v.literal('open'), v.literal('closed')),
  })
    .index('by_cafe_status', ['cafeId', 'status'])
    .index('by_cafe_opened', ['cafeId', 'openedAt']),
```

- [ ] **Step 2: Run codegen**

Run: `pnpm exec convex codegen`
Expected: no errors.

- [ ] **Step 3: Run typecheck + lint**

Run: `pnpm typecheck && node_modules/.bin/biome check convex/schema.ts`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "$(cat <<'EOF'
feat(schema): add cafeStaff + shifts tables for Slice 2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `convex/lib/pin.ts` — PBKDF2 hash + verify (TDD)

**Files:**
- Create: `convex/lib/pin.ts`
- Create: `tests/convex/lib/pin.test.ts`

PBKDF2-SHA256 over the Web Crypto API. 100k iterations, 16-byte salt, 32-byte output. Hash format `${saltHex}:${hashHex}`.

- [ ] **Step 1: Write the failing test**

`tests/convex/lib/pin.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { hashPin, verifyPin } from '../../../convex/lib/pin';

describe('hashPin / verifyPin', () => {
  it('produces a hash that verifies against the same pin', async () => {
    const hash = await hashPin('1234');
    expect(hash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(await verifyPin('1234', hash)).toBe(true);
  });

  it('rejects a different pin', async () => {
    const hash = await hashPin('1234');
    expect(await verifyPin('0000', hash)).toBe(false);
  });

  it('uses per-call salt so two hashes of the same pin differ', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('1234');
    expect(a).not.toBe(b);
    expect(await verifyPin('1234', a)).toBe(true);
    expect(await verifyPin('1234', b)).toBe(true);
  });

  it('returns false on malformed stored hash', async () => {
    expect(await verifyPin('1234', 'not-a-hash')).toBe(false);
    expect(await verifyPin('1234', '')).toBe(false);
    expect(await verifyPin('1234', 'abcdef')).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect RED**

Run: `pnpm test tests/convex/lib/pin.test.ts`
Expected: FAIL with "Cannot find module '.../convex/lib/pin'".

- [ ] **Step 3: Implement `convex/lib/pin.ts`**

```typescript
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(pin, salt);
  return `${toHex(salt)}:${toHex(hash)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [saltHex, hashHex] = parts;
  if (!saltHex || !hashHex || saltHex.length !== SALT_BYTES * 2 || hashHex.length !== KEY_BYTES * 2) {
    return false;
  }
  const salt = fromHex(saltHex);
  if (!salt) return false;
  const computed = await pbkdf2(pin, salt);
  return constantTimeEqualHex(toHex(computed), hashHex);
}

async function pbkdf2(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    key,
    KEY_BYTES * 8
  );
  return new Uint8Array(bits);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
```

- [ ] **Step 4: Run, expect GREEN**

Run: `pnpm test tests/convex/lib/pin.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/pin.ts tests/convex/lib/pin.test.ts
git commit -m "$(cat <<'EOF'
feat(convex): add PBKDF2-SHA256 pin hash + verify helpers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `convex/lib/staff.ts` — `requireActiveCashier` helper

**Files:**
- Create: `convex/lib/staff.ts`

- [ ] **Step 1: Create the helper**

```typescript
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

/**
 * Validate that the given cashierId belongs to the cafe and is not archived.
 * Mirrors `requireOwned` from convex/lib/auth.ts but emits a cashier-specific
 * message and includes the archived check (since archiving never deletes).
 */
export async function requireActiveCashier(
  ctx: QueryCtx | MutationCtx,
  cafeId: Id<'cafes'>,
  cashierId: Id<'cafeStaff'>
): Promise<Doc<'cafeStaff'>> {
  const row = await ctx.db.get(cashierId);
  if (!row || row.cafeId !== cafeId || row.archived) {
    throw new Error('Kasir tidak ditemukan atau sudah diarsipkan.');
  }
  return row;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add convex/lib/staff.ts
git commit -m "$(cat <<'EOF'
feat(convex): add requireActiveCashier tenant + archived helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extend `cafes.createForOwner` to auto-insert owner staff row (TDD)

**Files:**
- Modify: `convex/cafes.ts`
- Modify: `tests/convex/cafes.profile.test.ts`

- [ ] **Step 1: Append a failing test to `tests/convex/cafes.profile.test.ts`**

Add to the existing `describe('cafes profile', ...)` block:

```typescript
  it('createForOwner auto-inserts an owner cafeStaff row', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', { name: 'Pak Budi', email: 'b@x.com' });
    });
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
    await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });

    const staff = await t.run(async (ctx) =>
      await ctx.db.query('cafeStaff').collect()
    );
    expect(staff).toHaveLength(1);
    expect(staff[0]?.role).toBe('owner');
    expect(staff[0]?.name).toBe('Pak Budi');
    expect(staff[0]?.archived).toBe(false);
    expect(staff[0]?.pinHash).toBeUndefined();
  });
```

- [ ] **Step 2: Run, expect RED**

Run: `pnpm test tests/convex/cafes.profile.test.ts -t "auto-inserts"`
Expected: FAIL — `staff` is empty (length 0).

- [ ] **Step 3: Modify `convex/cafes.ts` createForOwner**

Replace the handler in the `createForOwner` mutation:

```typescript
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('not authenticated');
    }
    const cafeId = await ctx.db.insert('cafes', {
      name,
      ownerUserId: userId,
      createdAt: Date.now(),
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
      createdAt: Date.now(),
    });
    return cafeId;
  },
```

- [ ] **Step 4: Run, expect GREEN**

Run: `pnpm test tests/convex/cafes.profile.test.ts`
Expected: 7 passed (6 prior + the new one).

- [ ] **Step 5: Full suite**

Run: `pnpm test`
Expected: 55+ passed (no regressions).

- [ ] **Step 6: Commit**

```bash
git add convex/cafes.ts tests/convex/cafes.profile.test.ts
git commit -m "$(cat <<'EOF'
feat(cafes): auto-insert owner cafeStaff row in createForOwner

The owner becomes a staff member at signup so the PIN picker has an
entry on day one. pinHash stays undefined until the owner sets one via
onboarding step 4 or Settings → Staff. The picker treats a no-PIN row
as "click to select without PIN entry" so day-zero signup → shift open
still works.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `convex/staff.ts` — list / create / updateName / archive (TDD)

**Files:**
- Create: `convex/staff.ts`
- Create: `tests/convex/staff.test.ts`

`verifyPin` and `resetPin` land in Task 6 to keep this task focused.

- [ ] **Step 1: Write the failing tests**

`tests/convex/staff.test.ts`:

```typescript
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com', ownerName = 'Pemilik') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: ownerName, email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return asOwner;
}

describe('staff', () => {
  it('list returns the auto-inserted owner row after signup', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const list = await asOwner.query(api.staff.list, {});
    expect(list).toHaveLength(1);
    expect(list[0]?.role).toBe('owner');
  });

  it('create adds a cashier row with hashed PIN', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, {
      name: 'Andi',
      pin: '4321',
    });
    expect(id).toBeTruthy();
    const list = await asOwner.query(api.staff.list, {});
    expect(list).toHaveLength(2);
    const andi = list.find((s) => s.name === 'Andi');
    expect(andi?.role).toBe('cashier');
    expect(andi?.pinHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });

  it('create rejects malformed PIN', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    await expect(
      asOwner.mutation(api.staff.create, { name: 'Andi', pin: '123' })
    ).rejects.toThrow(/pin/i);
    await expect(
      asOwner.mutation(api.staff.create, { name: 'Andi', pin: '12345' })
    ).rejects.toThrow(/pin/i);
    await expect(
      asOwner.mutation(api.staff.create, { name: 'Andi', pin: '12a4' })
    ).rejects.toThrow(/pin/i);
  });

  it('create rejects blank/long name', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    await expect(
      asOwner.mutation(api.staff.create, { name: '   ', pin: '1234' })
    ).rejects.toThrow(/nama/i);
    await expect(
      asOwner.mutation(api.staff.create, { name: 'a'.repeat(61), pin: '1234' })
    ).rejects.toThrow(/nama/i);
  });

  it('updateName renames a row', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
    await asOwner.mutation(api.staff.updateName, { id, name: 'Andi B' });
    const list = await asOwner.query(api.staff.list, {});
    expect(list.find((s) => s.name === 'Andi B')).toBeDefined();
  });

  it('list sorts owners first, then cashiers by createdAt', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t, 'o@x.com', 'Pemilik');
    await asOwner.mutation(api.staff.create, { name: 'Cashier A', pin: '1111' });
    await asOwner.mutation(api.staff.create, { name: 'Cashier B', pin: '2222' });
    const list = await asOwner.query(api.staff.list, {});
    expect(list.map((s) => s.role)).toEqual(['owner', 'cashier', 'cashier']);
    expect(list[1]?.name).toBe('Cashier A');
    expect(list[2]?.name).toBe('Cashier B');
  });

  it('archive hides a cashier from the default list', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
    await asOwner.mutation(api.staff.archive, { id });
    expect(await asOwner.query(api.staff.list, {})).toHaveLength(1);
    expect(
      await asOwner.query(api.staff.list, { includeArchived: true })
    ).toHaveLength(2);
  });

  it('archive refuses the last owner', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const ownerRow = (await asOwner.query(api.staff.list, {}))[0];
    await expect(
      asOwner.mutation(api.staff.archive, { id: ownerRow!._id })
    ).rejects.toThrow(/pemilik/i);
  });

  it('tenant isolation: cafe B cannot touch cafe A staff', async () => {
    const t = convexTest(schema, modules);
    const ownerA = await setupOwner(t, 'a@x.com', 'A');
    const ownerB = await setupOwner(t, 'b@x.com', 'B');
    const aRow = (await ownerA.query(api.staff.list, {}))[0];
    await expect(
      ownerB.mutation(api.staff.updateName, { id: aRow!._id, name: 'pwn' })
    ).rejects.toThrow(/tidak ditemukan|akses/i);
  });
});
```

- [ ] **Step 2: Run, expect RED**

Run: `pnpm test tests/convex/staff.test.ts`
Expected: 9 failed — module not found.

- [ ] **Step 3: Implement `convex/staff.ts`**

```typescript
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { hashPin } from './lib/pin';

const cafeStaffDoc = v.object({
  _id: v.id('cafeStaff'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  pinHash: v.optional(v.string()),
  role: v.union(v.literal('owner'), v.literal('cashier')),
  archived: v.boolean(),
  createdAt: v.number(),
});

function assertName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama staf wajib diisi.');
  if (trimmed.length > 60) throw new Error('Nama staf maksimal 60 karakter.');
  return trimmed;
}

function assertPin(pin: string): string {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN harus 4 digit angka.');
  return pin;
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(cafeStaffDoc),
  handler: async (ctx, { includeArchived = false }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('cafeStaff')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    return rows
      .filter((s) => includeArchived || !s.archived)
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === 'owner' ? -1 : 1;
        return a.createdAt - b.createdAt;
      });
  },
});

export const create = mutation({
  args: { name: v.string(), pin: v.string() },
  returns: v.id('cafeStaff'),
  handler: async (ctx, { name, pin }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cleanName = assertName(name);
    const cleanPin = assertPin(pin);
    const pinHash = await hashPin(cleanPin);
    return await ctx.db.insert('cafeStaff', {
      cafeId,
      name: cleanName,
      pinHash,
      role: 'cashier',
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const updateName = mutation({
  args: { id: v.id('cafeStaff'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Staf');
    await ctx.db.patch(id, { name: assertName(name) });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('cafeStaff') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await requireOwned(ctx, cafeId, id, 'Staf');
    if (row.role === 'owner') {
      const owners = await ctx.db
        .query('cafeStaff')
        .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
        .collect();
      const activeOwners = owners.filter((s) => s.role === 'owner');
      if (activeOwners.length <= 1) {
        throw new Error('Tidak bisa mengarsipkan pemilik terakhir.');
      }
    }
    // Block when this cashier has an open shift.
    const openShift = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .unique();
    if (openShift && openShift.cashierId === id) {
      throw new Error('Tutup shift sebelum mengarsipkan.');
    }
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});
```

- [ ] **Step 4: Codegen + run, expect GREEN**

Run: `pnpm exec convex codegen && pnpm test tests/convex/staff.test.ts`
Expected: 9 passed.

- [ ] **Step 5: Full suite**

Run: `pnpm test`
Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add convex/staff.ts tests/convex/staff.test.ts
git commit -m "$(cat <<'EOF'
feat(staff): list / create / updateName / archive with tenant + last-owner guard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `staff.verifyPin` + `staff.resetPin` (TDD)

**Files:**
- Modify: `convex/staff.ts`
- Modify: `tests/convex/staff.test.ts`

`verifyPin` is a query (not a mutation) — it reads the row, hashes the candidate, compares. `resetPin` is an owner-only mutation that hashes and patches.

- [ ] **Step 1: Append failing tests**

Append inside the existing `describe('staff', ...)` block in `tests/convex/staff.test.ts`:

```typescript
  it('verifyPin returns true on match, false on mismatch', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
    expect(await asOwner.query(api.staff.verifyPin, { id, pin: '1234' })).toBe(true);
    expect(await asOwner.query(api.staff.verifyPin, { id, pin: '0000' })).toBe(false);
  });

  it('verifyPin returns false on a row with no pinHash (owner before set)', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const owner = (await asOwner.query(api.staff.list, {}))[0];
    expect(await asOwner.query(api.staff.verifyPin, { id: owner!._id, pin: '0000' })).toBe(false);
  });

  it('resetPin changes the hash so old PIN no longer verifies', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
    await asOwner.mutation(api.staff.resetPin, { id, pin: '9999' });
    expect(await asOwner.query(api.staff.verifyPin, { id, pin: '1234' })).toBe(false);
    expect(await asOwner.query(api.staff.verifyPin, { id, pin: '9999' })).toBe(true);
  });

  it('resetPin rejects malformed PIN', async () => {
    const t = convexTest(schema, modules);
    const asOwner = await setupOwner(t);
    const id = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
    await expect(
      asOwner.mutation(api.staff.resetPin, { id, pin: 'abcd' })
    ).rejects.toThrow(/pin/i);
  });
```

- [ ] **Step 2: Run, expect RED**

Run: `pnpm test tests/convex/staff.test.ts -t "verifyPin|resetPin"`
Expected: FAIL — `api.staff.verifyPin` / `api.staff.resetPin` missing.

- [ ] **Step 3: Add the two functions to `convex/staff.ts`**

Append to the file (after `archive`, before any closing brace):

```typescript
import { verifyPin as verifyPinHash } from './lib/pin';

export const verifyPin = query({
  args: { id: v.id('cafeStaff'), pin: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { id, pin }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.cafeId !== cafeId || row.archived) return false;
    if (!row.pinHash) return false;
    return await verifyPinHash(pin, row.pinHash);
  },
});

export const resetPin = mutation({
  args: { id: v.id('cafeStaff'), pin: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, pin }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Staf');
    const cleanPin = assertPin(pin);
    const pinHash = await hashPin(cleanPin);
    await ctx.db.patch(id, { pinHash });
    return null;
  },
});
```

Move the import `verifyPin as verifyPinHash` to the top of the file with the other imports. (Don't keep two imports of the same module.)

- [ ] **Step 4: Codegen + run, expect GREEN**

Run: `pnpm exec convex codegen && pnpm test tests/convex/staff.test.ts`
Expected: 13 passed.

- [ ] **Step 5: Commit**

```bash
git add convex/staff.ts tests/convex/staff.test.ts
git commit -m "$(cat <<'EOF'
feat(staff): add verifyPin (query) + resetPin (mutation)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `convex/shifts.ts` — current / open / close (TDD)

**Files:**
- Create: `convex/shifts.ts`
- Create: `tests/convex/shifts.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/convex/shifts.test.ts`:

```typescript
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const cashierId = await asOwner.mutation(api.staff.create, {
    name: 'Andi',
    pin: '1234',
  });
  return { asOwner, cashierId };
}

describe('shifts', () => {
  it('current returns null when no open shift', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setup(t);
    expect(await asOwner.query(api.shifts.current, {})).toBeNull();
  });

  it('open creates a shift; current returns it', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    const shiftId = await asOwner.mutation(api.shifts.open, {
      cashierId,
      openingFloatIDR: 100000,
    });
    expect(shiftId).toBeTruthy();
    const current = await asOwner.query(api.shifts.current, {});
    expect(current?._id).toBe(shiftId);
    expect(current?.status).toBe('open');
    expect(current?.openingFloatIDR).toBe(100000);
    expect(current?.cashierName).toBe('Andi');
  });

  it('open rejects when another shift is already open', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
    await expect(
      asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 50000 })
    ).rejects.toThrow(/shift sudah dibuka/i);
  });

  it('open rejects cashier from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setup(t, 'a@x.com');
    const { cashierId: cashierB } = await setup(t, 'b@x.com');
    await expect(
      ownerA.mutation(api.shifts.open, { cashierId: cashierB, openingFloatIDR: 100000 })
    ).rejects.toThrow(/tidak ditemukan/i);
  });

  it('open rejects archived cashier', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    await asOwner.mutation(api.staff.archive, { id: cashierId });
    await expect(
      asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 })
    ).rejects.toThrow(/diarsipkan/i);
  });

  it('open rejects fractional or negative float', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    await expect(
      asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100.5 })
    ).rejects.toThrow(/bulat|rupiah/i);
    await expect(
      asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: -1 })
    ).rejects.toThrow(/negatif/i);
  });

  it('close records counted cash and clears the open shift', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    const shiftId = await asOwner.mutation(api.shifts.open, {
      cashierId,
      openingFloatIDR: 100000,
    });
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 });
    expect(await asOwner.query(api.shifts.current, {})).toBeNull();
    const closed = await t.run(async (ctx) => await ctx.db.get(shiftId));
    expect(closed?.status).toBe('closed');
    expect(closed?.countedCashIDR).toBe(100000);
    expect(closed?.closedAt).toEqual(expect.any(Number));
    expect(closed?.expectedCashIDR).toBeUndefined();
    expect(closed?.varianceIDR).toBeUndefined();
  });

  it('close rejects already-closed shift', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    const shiftId = await asOwner.mutation(api.shifts.open, {
      cashierId,
      openingFloatIDR: 100000,
    });
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 });
    await expect(
      asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 })
    ).rejects.toThrow(/sudah ditutup/i);
  });

  it('close rejects negative counted cash', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    const shiftId = await asOwner.mutation(api.shifts.open, {
      cashierId,
      openingFloatIDR: 100000,
    });
    await expect(
      asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: -1 })
    ).rejects.toThrow(/negatif/i);
  });
});
```

- [ ] **Step 2: Run, expect RED**

Run: `pnpm test tests/convex/shifts.test.ts`
Expected: 9 failed — module not found.

- [ ] **Step 3: Implement `convex/shifts.ts`**

```typescript
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { requireActiveCashier } from './lib/staff';

const shiftWithCashier = v.object({
  _id: v.id('shifts'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  cashierId: v.id('cafeStaff'),
  cashierName: v.string(),
  openedAt: v.number(),
  closedAt: v.optional(v.number()),
  openingFloatIDR: v.number(),
  expectedCashIDR: v.optional(v.number()),
  countedCashIDR: v.optional(v.number()),
  varianceIDR: v.optional(v.number()),
  status: v.union(v.literal('open'), v.literal('closed')),
});

function assertIDR(n: number, label: string): number {
  if (!Number.isInteger(n)) throw new Error(`${label} harus berupa angka bulat (rupiah).`);
  if (n < 0) throw new Error(`${label} tidak boleh negatif.`);
  return n;
}

export const current = query({
  args: {},
  returns: v.union(shiftWithCashier, v.null()),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const open = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .unique();
    if (!open) return null;
    const cashier = await ctx.db.get(open.cashierId);
    return { ...open, cashierName: cashier?.name ?? '—' };
  },
});

export const open = mutation({
  args: { cashierId: v.id('cafeStaff'), openingFloatIDR: v.number() },
  returns: v.id('shifts'),
  handler: async (ctx, { cashierId, openingFloatIDR }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cashier = await requireActiveCashier(ctx, cafeId, cashierId);
    const floatIDR = assertIDR(openingFloatIDR, 'Modal awal');
    const existingOpen = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .unique();
    if (existingOpen) {
      const existingCashier = await ctx.db.get(existingOpen.cashierId);
      const name = existingCashier?.name ?? '—';
      throw new Error(`Shift sudah dibuka oleh ${name}. Tutup dulu sebelum buka baru.`);
    }
    return await ctx.db.insert('shifts', {
      cafeId,
      cashierId: cashier._id,
      openedAt: Date.now(),
      openingFloatIDR: floatIDR,
      status: 'open',
    });
  },
});

export const close = mutation({
  args: { id: v.id('shifts'), countedCashIDR: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, countedCashIDR }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const shift = await requireOwned(ctx, cafeId, id, 'Shift');
    if (shift.status !== 'open') {
      throw new Error('Shift sudah ditutup.');
    }
    const counted = assertIDR(countedCashIDR, 'Uang terhitung');
    await ctx.db.patch(id, {
      status: 'closed',
      closedAt: Date.now(),
      countedCashIDR: counted,
    });
    return null;
  },
});
```

- [ ] **Step 4: Codegen + run, expect GREEN**

Run: `pnpm exec convex codegen && pnpm test tests/convex/shifts.test.ts`
Expected: 9 passed.

- [ ] **Step 5: Full suite**

Run: `pnpm test`
Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add convex/shifts.ts tests/convex/shifts.test.ts
git commit -m "$(cat <<'EOF'
feat(shifts): current / open / close with one-open-per-cafe guard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `useActiveCashier` hook

**Files:**
- Create: `src/lib/active-cashier.ts`

- [ ] **Step 1: Implement the hook**

```typescript
import type { Id } from 'convex/_generated/dataModel';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'kodapos.activeCashierId';

function readFromStorage(): Id<'cafeStaff'> | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? (raw as Id<'cafeStaff'>) : null;
}

export function useActiveCashier(): {
  cashierId: Id<'cafeStaff'> | null;
  setCashier: (id: Id<'cafeStaff'>) => void;
  clearCashier: () => void;
} {
  const [cashierId, setCashierId] = useState<Id<'cafeStaff'> | null>(() => readFromStorage());

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setCashierId(readFromStorage());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function setCashier(id: Id<'cafeStaff'>): void {
    window.localStorage.setItem(STORAGE_KEY, id);
    setCashierId(id);
  }

  function clearCashier(): void {
    window.localStorage.removeItem(STORAGE_KEY);
    setCashierId(null);
  }

  return { cashierId, setCashier, clearCashier };
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && node_modules/.bin/biome check src/lib/active-cashier.ts`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/active-cashier.ts
git commit -m "$(cat <<'EOF'
feat(lib): useActiveCashier hook over localStorage with cross-tab sync

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `<PinEntry>` component

**Files:**
- Create: `src/components/staff/pin-entry.tsx`

- [ ] **Step 1: Implement**

```tsx
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

export interface PinEntryProps {
  digits?: number;
  /** Called when the user fills all digits. Caller decides what to do with the value. */
  onComplete: (pin: string) => void;
  /** Optional caller-controlled error message shown below the cells. */
  errorMessage?: string;
}

export function PinEntry({ digits = 4, onComplete, errorMessage }: PinEntryProps) {
  const [values, setValues] = useState<string[]>(() => Array(digits).fill(''));
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function handleChange(idx: number, char: string): void {
    const digit = char.replace(/\D/g, '').slice(0, 1);
    const next = [...values];
    next[idx] = digit;
    setValues(next);
    if (digit && idx < digits - 1) refs.current[idx + 1]?.focus();
    if (next.every((c) => c.length === 1)) onComplete(next.join(''));
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Backspace' && !values[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  }

  function reset(): void {
    setValues(Array(digits).fill(''));
    refs.current[0]?.focus();
  }

  useEffect(() => {
    if (errorMessage) reset();
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset is stable
  }, [errorMessage]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2 justify-center" role="group" aria-label="PIN">
        {values.map((v, idx) => (
          <input
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length array of digit cells
            key={idx}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="\d"
            maxLength={1}
            value={v}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            className="size-14 text-center text-2xl font-semibold rounded-md border border-border bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label={`Digit ${idx + 1}`}
          />
        ))}
      </div>
      {errorMessage && (
        <p className="text-center text-sm text-danger" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && node_modules/.bin/biome check src/components/staff/pin-entry.tsx`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/staff/pin-entry.tsx
git commit -m "$(cat <<'EOF'
feat(staff): PinEntry component (4-cell numeric input)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `<StaffPickerCard>` + `<ShiftSummaryPanel>` components

**Files:**
- Create: `src/components/staff/staff-picker-card.tsx`
- Create: `src/components/shift/shift-summary-panel.tsx`

- [ ] **Step 1: Create `staff-picker-card.tsx`**

```tsx
export interface StaffPickerCardProps {
  name: string;
  role: 'owner' | 'cashier';
  hasPin: boolean;
  onClick: () => void;
}

export function StaffPickerCard({ name, role, hasPin, onClick }: StaffPickerCardProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border bg-bg hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <span className="flex items-center justify-center size-14 rounded-full bg-brand-100 text-brand-700 text-lg font-semibold">
        {initials}
      </span>
      <span className="text-sm font-medium">{name}</span>
      <span className="text-xs text-fg-muted">
        {role === 'owner' ? 'Pemilik' : 'Kasir'}
        {!hasPin && ' · belum ada PIN'}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Create `shift-summary-panel.tsx`**

```tsx
import type { Doc, Id } from 'convex/_generated/dataModel';
import { formatIDR } from '~/lib/money';

export interface ShiftSummary {
  _id: Id<'shifts'>;
  cashierId: Id<'cafeStaff'>;
  cashierName: string;
  openedAt: number;
  closedAt?: number;
  openingFloatIDR: number;
  expectedCashIDR?: number;
  countedCashIDR?: number;
  varianceIDR?: number;
}

export interface ShiftSummaryPanelProps {
  shift: ShiftSummary;
}

export function ShiftSummaryPanel({ shift }: ShiftSummaryPanelProps) {
  const opened = new Date(shift.openedAt).toLocaleString('id-ID');
  const closed = shift.closedAt ? new Date(shift.closedAt).toLocaleString('id-ID') : null;
  return (
    <dl className="grid grid-cols-2 gap-y-2 text-sm">
      <dt className="text-fg-muted">Dibuka oleh</dt>
      <dd>{shift.cashierName}</dd>
      <dt className="text-fg-muted">Dibuka pada</dt>
      <dd>{opened}</dd>
      {closed && (
        <>
          <dt className="text-fg-muted">Ditutup pada</dt>
          <dd>{closed}</dd>
        </>
      )}
      <dt className="text-fg-muted">Modal awal</dt>
      <dd>{formatIDR(shift.openingFloatIDR)}</dd>
      {shift.expectedCashIDR !== undefined && (
        <>
          <dt className="text-fg-muted">Uang seharusnya</dt>
          <dd>{formatIDR(shift.expectedCashIDR)}</dd>
        </>
      )}
      {shift.countedCashIDR !== undefined && (
        <>
          <dt className="text-fg-muted">Uang terhitung</dt>
          <dd>{formatIDR(shift.countedCashIDR)}</dd>
        </>
      )}
      {shift.varianceIDR !== undefined && (
        <>
          <dt className="text-fg-muted">Selisih</dt>
          <dd className={shift.varianceIDR < 0 ? 'text-danger' : ''}>
            {formatIDR(shift.varianceIDR)}
          </dd>
        </>
      )}
    </dl>
  );
}

// Re-export Doc type to silence biome unused-import if needed
export type { Doc };
```

Drop the `Doc` re-export line if biome accepts the file without it (Doc is imported but used only in the JSDoc-ish type — depends on Biome's posture). If lint complains about the unused `Doc` import, remove BOTH the `Doc` import and the re-export.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && node_modules/.bin/biome check src/components/staff/staff-picker-card.tsx src/components/shift/shift-summary-panel.tsx`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/staff/staff-picker-card.tsx src/components/shift/shift-summary-panel.tsx
git commit -m "$(cat <<'EOF'
feat(staff): StaffPickerCard + ShiftSummaryPanel components

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `<PinGate>` + `_pos/pin.tsx` PIN picker

**Files:**
- Create: `src/components/staff/pin-gate.tsx`
- Create: `src/routes/_pos/pin.tsx`

- [ ] **Step 1: Create `pin-gate.tsx`**

```tsx
import { Navigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useActiveCashier } from '~/lib/active-cashier';

export function PinGate({ children }: { children: ReactNode }) {
  const { cashierId } = useActiveCashier();
  if (cashierId === null) {
    return <Navigate to="/pin" replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 2: Create `_pos/pin.tsx`**

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useConvex, useQuery } from 'convex/react';
import { useState } from 'react';
import { PinEntry } from '~/components/staff/pin-entry';
import { StaffPickerCard } from '~/components/staff/staff-picker-card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { useActiveCashier } from '~/lib/active-cashier';

export const Route = createFileRoute('/_pos/pin')({
  component: PinPickerPage,
});

function PinPickerPage() {
  const staff = useQuery(api.staff.list, {});
  const convex = useConvex();
  const { setCashier } = useActiveCashier();
  const navigate = useNavigate();
  const [picking, setPicking] = useState<{ id: Id<'cafeStaff'>; name: string; hasPin: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (staff === undefined) {
    return <p className="text-fg-muted p-6">Memuat…</p>;
  }

  async function selectWithoutPin(id: Id<'cafeStaff'>): Promise<void> {
    setCashier(id);
    navigate({ to: '/shift/open' });
  }

  async function selectWithPin(pin: string): Promise<void> {
    if (!picking) return;
    const ok = await convex.query(api.staff.verifyPin, { id: picking.id, pin });
    if (!ok) {
      setError('PIN salah.');
      return;
    }
    setCashier(picking.id);
    setPicking(null);
    navigate({ to: '/shift/open' });
  }

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">Siapa yang bertugas?</h1>
      <p className="text-fg-muted text-sm mb-6">
        Pilih nama Anda dan masukkan PIN 4 digit.
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {staff.map((s) => (
          <StaffPickerCard
            key={s._id}
            name={s.name}
            role={s.role}
            hasPin={!!s.pinHash}
            onClick={() => {
              setError(null);
              if (!s.pinHash) {
                void selectWithoutPin(s._id);
              } else {
                setPicking({ id: s._id, name: s.name, hasPin: true });
              }
            }}
          />
        ))}
      </div>

      <Dialog open={!!picking} onOpenChange={(open) => !open && setPicking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>PIN untuk {picking?.name}</DialogTitle>
          </DialogHeader>
          <PinEntry
            onComplete={(pin) => {
              void selectWithPin(pin);
            }}
            {...(error ? { errorMessage: error } : {})}
          />
        </DialogContent>
      </Dialog>
    </main>
  );
}
```

- [ ] **Step 3: Regen route tree + typecheck + lint**

Run `pnpm dev` briefly (timeout 12s) to regenerate `src/routeTree.gen.ts`, then:

```bash
pnpm typecheck
node_modules/.bin/biome check src/components/staff/pin-gate.tsx src/routes/_pos/pin.tsx
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/staff/pin-gate.tsx src/routes/_pos/pin.tsx src/routeTree.gen.ts
git commit -m "$(cat <<'EOF'
feat(staff): PinGate + /pin picker route

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Shift open + close routes

**Files:**
- Create: `src/routes/_pos/shift/route.tsx`
- Create: `src/routes/_pos/shift/open.tsx`
- Create: `src/routes/_pos/shift/close.tsx`

- [ ] **Step 1: Create `_pos/shift/route.tsx` (layout with PinGate)**

```tsx
import { Outlet, createFileRoute } from '@tanstack/react-router';
import { PinGate } from '~/components/staff/pin-gate';

export const Route = createFileRoute('/_pos/shift')({
  component: ShiftLayout,
});

function ShiftLayout() {
  return (
    <PinGate>
      <Outlet />
    </PinGate>
  );
}
```

- [ ] **Step 2: Create `_pos/shift/open.tsx`**

```tsx
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { ShiftSummaryPanel } from '~/components/shift/shift-summary-panel';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { useActiveCashier } from '~/lib/active-cashier';

export const Route = createFileRoute('/_pos/shift/open')({
  component: ShiftOpenPage,
});

function ShiftOpenPage() {
  const { cashierId } = useActiveCashier();
  const current = useQuery(api.shifts.current, {});
  const staff = useQuery(api.staff.list, {});
  const openShift = useMutation(api.shifts.open);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (current === undefined || staff === undefined) {
    return <p className="text-fg-muted p-6">Memuat…</p>;
  }

  // Already an open shift → redirect to close.
  if (current) {
    return (
      <main className="max-w-xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Sudah ada shift terbuka</h1>
        <ShiftSummaryPanel shift={current} />
        <Button asChild>
          <Link to="/shift/close">Lanjut ke Tutup Shift</Link>
        </Button>
      </main>
    );
  }

  const me = staff.find((s) => s._id === cashierId);
  if (!me) {
    return (
      <p className="text-fg-muted p-6">
        Kasir tidak dikenal. <Link to="/pin" className="underline">Pilih ulang</Link>.
      </p>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cashierId) return;
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await openShift({
        cashierId,
        openingFloatIDR: Number(fd.get('openingFloatIDR') ?? 0),
      });
      navigate({ to: '/shift/close' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka shift.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">Buka Shift</h1>
      <p className="text-fg-muted text-sm mb-6">Sebagai: {me.name}</p>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="openingFloatIDR">Modal awal (Rp)</FieldLabel>
            <Input
              id="openingFloatIDR"
              name="openingFloatIDR"
              type="number"
              min="0"
              step="1000"
              defaultValue={0}
              required
            />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? 'Membuka…' : 'Buka Shift'}
          </Button>
        </FieldGroup>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Create `_pos/shift/close.tsx`**

```tsx
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { ShiftSummaryPanel } from '~/components/shift/shift-summary-panel';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { useActiveCashier } from '~/lib/active-cashier';

export const Route = createFileRoute('/_pos/shift/close')({
  component: ShiftClosePage,
});

function ShiftClosePage() {
  const current = useQuery(api.shifts.current, {});
  const closeShift = useMutation(api.shifts.close);
  const { clearCashier } = useActiveCashier();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [closedShift, setClosedShift] = useState<typeof current | null>(null);

  if (current === undefined && !closedShift) {
    return <p className="text-fg-muted p-6">Memuat…</p>;
  }

  if (closedShift) {
    return (
      <main className="max-w-xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Shift ditutup</h1>
        <ShiftSummaryPanel shift={{ ...closedShift, closedAt: closedShift.closedAt ?? Date.now() }} />
        <div className="flex gap-2">
          <Button onClick={() => window.print()}>Cetak ringkasan</Button>
          <Button variant="outline" asChild>
            <Link to="/menu">Kembali ke menu</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (current === null) {
    return (
      <main className="max-w-xl mx-auto p-6">
        <p className="text-fg-muted">Tidak ada shift terbuka.</p>
        <Button asChild className="mt-3">
          <Link to="/shift/open">Buka Shift Baru</Link>
        </Button>
      </main>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!current) return;
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const counted = Number(fd.get('countedCashIDR') ?? 0);
      await closeShift({ id: current._id, countedCashIDR: counted });
      setClosedShift({ ...current, countedCashIDR: counted, closedAt: Date.now() });
      clearCashier();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menutup shift.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-6 grid grid-cols-2 gap-8">
      <section>
        <h1 className="text-2xl font-bold mb-3">Tutup Shift</h1>
        <ShiftSummaryPanel shift={current} />
      </section>
      <section>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="countedCashIDR">Uang terhitung (Rp)</FieldLabel>
              <Input
                id="countedCashIDR"
                name="countedCashIDR"
                type="number"
                min="0"
                step="1000"
                required
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? 'Menutup…' : 'Tutup Shift'}
            </Button>
          </FieldGroup>
        </form>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Regen + typecheck + lint**

Run `pnpm dev` briefly to regenerate routeTree.gen.ts, then:

```bash
pnpm typecheck
node_modules/.bin/biome check src/routes/_pos/shift/
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_pos/shift/ src/routeTree.gen.ts
git commit -m "$(cat <<'EOF'
feat(shifts): /shift/open and /shift/close routes + layout with PinGate

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Settings → Staff page

**Files:**
- Modify: `src/routes/_pos/settings/route.tsx`
- Create: `src/routes/_pos/settings/staff.tsx`

- [ ] **Step 1: Add Staff link to settings nav**

Edit `src/routes/_pos/settings/route.tsx`, replacing the `<nav>` block:

```tsx
<nav className="flex flex-col gap-1 text-sm">
  <Link to="/settings/profile" className="hover:underline" activeProps={{ className: 'font-semibold' }}>
    Profil kafe
  </Link>
  <Link to="/settings/staff" className="hover:underline" activeProps={{ className: 'font-semibold' }}>
    Staff
  </Link>
</nav>
```

- [ ] **Step 2: Create `_pos/settings/staff.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { ConfirmArchive } from '~/components/menu/confirm-archive';
import { PinEntry } from '~/components/staff/pin-entry';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';

export const Route = createFileRoute('/_pos/settings/staff')({
  component: StaffSettingsPage,
});

function StaffSettingsPage() {
  const staff = useQuery(api.staff.list, {});
  const create = useMutation(api.staff.create);
  const updateName = useMutation(api.staff.updateName);
  const resetPin = useMutation(api.staff.resetPin);
  const archive = useMutation(api.staff.archive);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<{ id: Id<'cafeStaff'>; name: string } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await create({
        name: String(fd.get('name') ?? ''),
        pin: String(fd.get('pin') ?? ''),
      });
      form.reset();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Gagal menambah staf.');
    } finally {
      setCreating(false);
    }
  }

  async function handleResetPin(pin: string): Promise<void> {
    if (!resetting) return;
    setResetError(null);
    try {
      await resetPin({ id: resetting.id, pin });
      setResetting(null);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Gagal mengganti PIN.');
    }
  }

  if (staff === undefined) return <p className="text-fg-muted">Memuat…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold mb-1">Staff</h1>
        <p className="text-fg-muted text-sm">Tambah kasir, ganti PIN, atau arsipkan staf.</p>
      </div>

      <form onSubmit={handleCreate} className="flex gap-2 items-end">
        <div className="flex-1">
          <label htmlFor="newName" className="text-xs text-fg-muted">Nama kasir baru</label>
          <Input id="newName" name="name" placeholder="mis. Andi" required maxLength={60} />
        </div>
        <div>
          <label htmlFor="newPin" className="text-xs text-fg-muted">PIN 4 digit</label>
          <Input id="newPin" name="pin" type="text" inputMode="numeric" pattern="\d{4}" maxLength={4} required />
        </div>
        <Button type="submit" disabled={creating}>
          {creating && <Spinner data-icon="inline-start" />}
          {creating ? '…' : '+ Tambah'}
        </Button>
      </form>
      {createError && <p className="text-sm text-danger">{createError}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-fg-muted border-b border-border">
            <th className="py-2 px-2">Nama</th>
            <th className="py-2 px-2 w-24">Peran</th>
            <th className="py-2 px-2 w-32">PIN</th>
            <th className="py-2 px-2 w-44 text-right"></th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <StaffRow
              key={s._id}
              row={s}
              onRename={(name) => updateName({ id: s._id, name })}
              onArchive={() => archive({ id: s._id })}
              onResetPinClick={() => setResetting({ id: s._id, name: s.name })}
            />
          ))}
        </tbody>
      </table>

      <Dialog open={!!resetting} onOpenChange={(o) => !o && setResetting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ganti PIN untuk {resetting?.name}</DialogTitle>
          </DialogHeader>
          <PinEntry
            onComplete={(pin) => {
              void handleResetPin(pin);
            }}
            {...(resetError ? { errorMessage: resetError } : {})}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StaffRow({
  row,
  onRename,
  onArchive,
  onResetPinClick,
}: {
  row: { _id: Id<'cafeStaff'>; name: string; role: 'owner' | 'cashier'; pinHash?: string };
  onRename: (name: string) => Promise<unknown>;
  onArchive: () => Promise<unknown>;
  onResetPinClick: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [saving, setSaving] = useState(false);
  return (
    <tr className="border-b border-border/50">
      <td className="py-2 px-2">
        {editing ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              await onRename(name);
              setSaving(false);
              setEditing(false);
            }}
            className="flex gap-2"
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
            <Button type="submit" size="sm" disabled={saving}>
              Simpan
            </Button>
          </form>
        ) : (
          <button type="button" className="text-left hover:underline" onClick={() => setEditing(true)}>
            {row.name}
          </button>
        )}
      </td>
      <td className="py-2 px-2 text-fg-muted">{row.role === 'owner' ? 'Pemilik' : 'Kasir'}</td>
      <td className="py-2 px-2">
        {row.pinHash ? (
          <button type="button" className="text-xs text-brand-600 hover:underline" onClick={onResetPinClick}>
            Ganti PIN
          </button>
        ) : (
          <button type="button" className="text-xs text-brand-600 hover:underline" onClick={onResetPinClick}>
            Set PIN
          </button>
        )}
      </td>
      <td className="py-2 px-2 text-right">
        <ConfirmArchive
          noun="staf"
          name={row.name}
          onConfirm={onArchive}
          trigger={
            <button type="button" className="text-xs text-danger hover:underline">
              Arsipkan
            </button>
          }
        />
      </td>
    </tr>
  );
}
```

- [ ] **Step 3: Regen + typecheck + lint**

Regen routeTree, then:

```bash
pnpm typecheck
node_modules/.bin/biome check src/routes/_pos/settings/
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_pos/settings/ src/routeTree.gen.ts
git commit -m "$(cat <<'EOF'
feat(settings): Staff management page (add, rename, set/reset PIN, archive)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Onboarding step 4 — `_pos/onboarding/cashier.tsx`

**Files:**
- Modify: `src/routes/_pos/onboarding/route.tsx`
- Modify: `src/routes/_pos/onboarding/menu.tsx`
- Create: `src/routes/_pos/onboarding/cashier.tsx`

- [ ] **Step 1: Flip step 4 to enabled in the layout**

In `src/routes/_pos/onboarding/route.tsx`, replace the `STEPS` definition + the currentIndex computation:

```tsx
const STEPS: ReadonlyArray<WizardStep> = [
  { label: 'Profil Kafe', enabled: true },
  { label: 'Menu', enabled: true },
  { label: 'Pembayaran', enabled: false },
  { label: 'Kasir', enabled: true },
];

function OnboardingLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  let currentIndex = 0;
  if (path.includes('/onboarding/menu')) currentIndex = 1;
  else if (path.includes('/onboarding/cashier')) currentIndex = 3;
  return (
    <div className="max-w-3xl mx-auto p-6">
      <WizardStepper steps={STEPS} currentIndex={currentIndex} />
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 2: Update `_pos/onboarding/menu.tsx` to point at the cashier step**

Replace its CTA section so "Selanjutnya" goes to cashier, and "Selesaikan nanti" still goes to `/menu`:

```tsx
<div className="flex gap-2">
  <Button asChild>
    <Link to="/onboarding/cashier">Lanjut: PIN & Kasir →</Link>
  </Button>
  <Button variant="outline" onClick={() => finish('/menu')}>Selesaikan nanti</Button>
  <Button asChild variant="ghost">
    <Link to="/onboarding/profile">← Kembali</Link>
  </Button>
</div>
```

(Keep the existing `finish('/menu/categories')` for the "Mulai dengan kategori" button if it's there from Slice 1. Verify by reading the file before editing.)

- [ ] **Step 3: Create `_pos/onboarding/cashier.tsx`**

```tsx
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { PinEntry } from '~/components/staff/pin-entry';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';

export const Route = createFileRoute('/_pos/onboarding/cashier')({
  component: OnboardingCashier,
});

function OnboardingCashier() {
  const staff = useQuery(api.staff.list, {});
  const create = useMutation(api.staff.create);
  const resetPin = useMutation(api.staff.resetPin);
  const markComplete = useMutation(api.cafes.markSetupComplete);
  const navigate = useNavigate();
  const [pickingOwner, setPickingOwner] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (staff === undefined) return <p className="text-fg-muted">Memuat…</p>;

  const owner = staff.find((s) => s.role === 'owner');
  const cashiers = staff.filter((s) => s.role === 'cashier');

  async function handleSetOwnerPin(pin: string): Promise<void> {
    if (!owner) return;
    setPinError(null);
    try {
      await resetPin({ id: owner._id, pin });
      setPickingOwner(false);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Gagal mengatur PIN.');
    }
  }

  async function handleAddCashier(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await create({
        name: String(fd.get('name') ?? ''),
        pin: String(fd.get('pin') ?? ''),
      });
      form.reset();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Gagal menambah kasir.');
    } finally {
      setAdding(false);
    }
  }

  async function finish(): Promise<void> {
    await markComplete();
    navigate({ to: '/menu' });
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold mb-1">PIN Pemilik & Kasir</h1>
        <p className="text-fg-muted text-sm">
          Atur PIN 4 digit untuk Anda. Anda juga bisa menambahkan kasir tambahan (opsional).
        </p>
      </div>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-fg-muted mb-2">PIN Pemilik</h2>
        {owner && (
          <div className="flex items-center justify-between p-3 rounded-md border border-border bg-bg">
            <span>{owner.name}</span>
            <Button
              variant={owner.pinHash ? 'outline' : 'default'}
              onClick={() => setPickingOwner(true)}
            >
              {owner.pinHash ? 'Ganti PIN' : 'Atur PIN'}
            </Button>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-fg-muted mb-2">Kasir lain (opsional)</h2>
        <form onSubmit={handleAddCashier} className="flex gap-2 items-end mb-3">
          <div className="flex-1">
            <label htmlFor="cName" className="text-xs text-fg-muted">Nama</label>
            <Input id="cName" name="name" placeholder="mis. Andi" required maxLength={60} />
          </div>
          <div>
            <label htmlFor="cPin" className="text-xs text-fg-muted">PIN 4 digit</label>
            <Input id="cPin" name="pin" type="text" inputMode="numeric" pattern="\d{4}" maxLength={4} required />
          </div>
          <Button type="submit" disabled={adding}>
            {adding && <Spinner data-icon="inline-start" />}
            {adding ? '…' : '+ Tambah'}
          </Button>
        </form>
        {addError && <p className="text-sm text-danger mb-2">{addError}</p>}
        {cashiers.length > 0 && (
          <ul className="text-sm space-y-1">
            {cashiers.map((c) => (
              <li key={c._id}>
                <span>{c.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex gap-2">
        <Button onClick={() => void finish()}>Selesai</Button>
        <Button asChild variant="ghost">
          <Link to="/onboarding/menu">← Kembali</Link>
        </Button>
      </div>

      <Dialog open={pickingOwner} onOpenChange={(o) => !o && setPickingOwner(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atur PIN Pemilik</DialogTitle>
          </DialogHeader>
          <PinEntry
            onComplete={(pin) => {
              void handleSetOwnerPin(pin);
            }}
            {...(pinError ? { errorMessage: pinError } : {})}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 4: Regen + typecheck + lint**

Regen, then:

```bash
pnpm typecheck
node_modules/.bin/biome check src/routes/_pos/onboarding/
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_pos/onboarding/ src/routeTree.gen.ts
git commit -m "$(cat <<'EOF'
feat(onboarding): step 4 — PIN pemilik + cashier list

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Playwright E2E

**Files:**
- Create: `tests/e2e/shifts.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { expect, test } from '@playwright/test';
import { gotoHydrated, waitForUrlHydrated } from './_helpers';

// Auth-gated, like the menu spec. Creates one throwaway user per run.
test.describe('shifts (auth-gated)', () => {
  test.skip(!process.env.RUN_AUTH_E2E, 'set RUN_AUTH_E2E=1 to run');
  test.setTimeout(120_000);

  test('signup → set PIN → pick → open shift → close shift', async ({ page }) => {
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    // Signup creates the cafe and the owner staff row (Task 4).
    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Owner');
    await page.getByLabel('Nama kafe').fill('Kopi E2E S2');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByRole('button', { name: /Lanjut/ }).click();

    await waitForUrlHydrated(page, /\/onboarding\/menu$/);
    await page.getByRole('link', { name: /Lanjut: PIN & Kasir/ }).click();

    // Onboarding step 4: set owner PIN.
    await waitForUrlHydrated(page, /\/onboarding\/cashier$/);
    await page.getByRole('button', { name: /Atur PIN/ }).click();
    // PIN dialog opens; fill 4 cells.
    for (const digit of '1234') {
      await page.keyboard.type(digit);
    }
    // Dialog auto-submits on 4th digit; "Atur PIN" button should now say "Ganti PIN".
    await expect(page.getByRole('button', { name: /Ganti PIN/ })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /Selesai/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // Navigating to /shift/open trips PinGate → /pin
    await page.goto('/shift/open');
    await waitForUrlHydrated(page, /\/pin$/);

    // Pick owner card; PIN entry opens.
    await page.getByRole('button', { name: /E2E Owner/ }).click();
    for (const digit of '1234') {
      await page.keyboard.type(digit);
    }

    // Land on /shift/open.
    await waitForUrlHydrated(page, /\/shift\/open$/);
    await page.getByLabel('Modal awal').fill('100000');
    await page.getByRole('button', { name: /Buka Shift/ }).click();
    await waitForUrlHydrated(page, /\/shift\/close$/);

    // Close the shift.
    await page.getByLabel('Uang terhitung').fill('100000');
    await page.getByRole('button', { name: /Tutup Shift/ }).click();

    await expect(page.getByText(/Shift ditutup/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('link', { name: /Kembali ke menu/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);
  });
});
```

- [ ] **Step 2: Run the default suite**

Run: `pnpm test:e2e`
Expected: existing 1 passed + 3 skipped, plus this new spec also skipped (RUN_AUTH_E2E unset). So: 1 passed, 4 skipped.

- [ ] **Step 3: Run the auth-gated suite (if Convex dev backend available)**

Run: `RUN_AUTH_E2E=1 pnpm test:e2e`
Expected: 4 prior auth-gated tests + this new one all pass → 5 passed.

(Skip this step locally if you don't want to seed dev Convex with another throwaway user; CI will run it.)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/shifts.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): shifts happy path — signup → PIN → open → close

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Final verification + lingui extract

**Files:** (no new files; final sweep)

- [ ] **Step 1: Lingui extract**

Run: `pnpm lingui:extract`
Expected: catalogs in `src/locales/{id,en}/messages.po` update with any new `<Trans>` strings. (Slice 2 doesn't add `<Trans>` macros — most strings are inline Bahasa. If catalogs change, commit them.)

If `git status` shows changes under `src/locales/`:

```bash
git add src/locales
git commit -m "i18n(shifts): extract Slice 2 strings"
```

Otherwise skip.

- [ ] **Step 2: Full quality gate**

Run:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Expected: all four exit 0. Unit count should be 54 (Slice 1) + 9 staff + 9 shifts + 4 pin + 1 cafes-profile auto-insert = ~77 tests.

- [ ] **Step 3: Smoke-test in a browser**

Run: `pnpm dev:all`, open `http://localhost:5173`, walk the wizard: signup → onboarding/profile → onboarding/menu → onboarding/cashier → set PIN → finish → /menu. Then `/shift/open` → /pin → enter PIN → open shift Rp 100k → close shift Rp 100k. Confirm no console errors. (Optional but valuable.)

- [ ] **Step 4: Commit drift, if any**

```bash
git status
# If anything's unstaged from automated formatters or codegen:
git add -A
git commit -m "chore: post-Slice-2 cleanup"
```

---

## Self-Review Notes

**Spec coverage check** against `docs/superpowers/specs/2026-05-21-phase-1-slice-2-shifts-design.md`:

| Spec section | Task(s) |
|---|---|
| `cafeStaff` + `shifts` schema | Task 1 |
| Owner auto-insert at signup | Task 4 |
| PIN hashing (PBKDF2) | Task 2 |
| `requireActiveCashier` helper | Task 3 |
| `staff.list/create/updateName/archive` | Task 5 |
| `staff.verifyPin/resetPin` | Task 6 |
| `shifts.current/open/close` | Task 7 |
| `useActiveCashier` hook | Task 8 |
| `<PinEntry>` | Task 9 |
| `<StaffPickerCard>` + `<ShiftSummaryPanel>` | Task 10 |
| `<PinGate>` + `/pin` route | Task 11 |
| `/shift/open` + `/shift/close` | Task 12 |
| Settings → Staff page | Task 13 |
| Onboarding step 4 + wizard step enable | Task 14 |
| Playwright E2E happy path | Task 15 |
| Lingui extract + full quality gate | Task 16 |

**Placeholder scan:** No "TBD", "fill in details" left in any task. The `Doc` re-export caveat in Task 10 is conditional advice, not a placeholder.

**Type / name consistency check:**
- `requireActiveCashier` returns `Doc<'cafeStaff'>` — used in `shifts.open` (Task 7).
- `useActiveCashier` returns `{ cashierId, setCashier, clearCashier }` — `setCashier(id)` matches the name used in `_pos/pin.tsx` (Task 11) and `clearCashier()` matches the name used in `_pos/shift/close.tsx` (Task 12).
- `PinEntry` `onComplete(pin: string)` — same signature in all four call sites (Task 11 PIN picker, Task 13 reset dialog, Task 14 owner PIN dialog).
- `shifts.current` return shape includes `cashierName` — consumed by `<ShiftSummaryPanel>` (Task 10) and the redirect-summary in `/shift/open` (Task 12) — type matches via the `ShiftSummary` interface.
- `staff.list` return: `Array<CafeStaffDoc>` — consumed identically in PIN picker, Settings, and onboarding step 4.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-21-phase-1-slice-2-shifts.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task with two-stage review between tasks. Faster iteration; each subagent stays focused on one task's TDD cycle.
2. **Inline Execution** — I run tasks in this session using batch checkpoints; you review at planned stops.

Which approach?
