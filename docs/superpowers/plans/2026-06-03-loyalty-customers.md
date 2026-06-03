# Loyalty & Customers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a customer directory and a points-per-spend loyalty program where cash sales can attach a customer (phone lookup) to earn points and redeem points for a discount that stacks on top of a promo.

**Architecture:** Two new Convex tables (`customers`, `loyaltyTransactions`) with denormalized balance aggregates on the customer doc plus an immutable ledger, updated atomically inside `createCashSale`. Program config lives in a new `loyalty` group on `cafeSettings`. Pure math lives in `convex/lib/loyalty.ts` (shared server + client preview), mirroring `convex/lib/pricing.ts`. Both pages replace existing `ComingSoon` stubs and reuse the Catalog UI kit.

**Tech Stack:** Convex (queries/mutations, `convex-test` + vitest), TanStack Start/Router, React, shadcn/ui Catalog UI kit, Lingui (id + en), Playwright.

**Spec:** `docs/superpowers/specs/2026-06-03-loyalty-customers-design.md`

**Conventions to follow (read before starting):**
- Convex module shape, validators, and tenant guards: `convex/suppliers.ts`, `convex/lib/auth.ts` (`requireOwnerCafe`, `requireOwned`), `convex/lib/staff.ts` (`requireActiveCashier`), `convex/lib/phone.ts` (`normalizePhone`).
- Pure helper + test style: `convex/lib/pricing.ts`, `tests/convex/pricing.test.ts`.
- Convex test harness: `tests/convex/suppliers.test.ts` (`setupOwner`) and `tests/convex/orders.test.ts` (`setup` with shift/cashier/item).
- Settings config pattern (defaults-merge): `convex/settings.ts` (`DEFAULT_SETTINGS`, `get`, `update*`).
- Codegen after schema/function changes: `./node_modules/.bin/convex codegen` (NOT `npx`), then commit the tracked `convex/_generated` files.
- Run `pnpm typecheck` and `pnpm test` locally before every commit; run `pnpm lingui:extract` + fill + `pnpm lingui:compile` after adding UI strings.

---

## File Structure

**Create:**
- `convex/lib/loyalty.ts` — pure points math (`pointsEarned`, `redemptionIDR`, `maxRedeemablePoints`, `LoyaltyConfig`, `DEFAULT_LOYALTY`).
- `convex/customers.ts` — directory CRUD + POS lookup + manual adjust.
- `convex/loyalty.ts` — program config get/update + stats.
- `tests/convex/loyalty-math.test.ts` — unit tests for `convex/lib/loyalty.ts`.
- `tests/convex/customers.test.ts` — customers + adjustPoints tests.
- `tests/convex/loyalty.test.ts` — config + stats tests.
- `src/components/customer/customer-form-dialog.tsx` — create/edit dialog.
- `src/components/customer/customer-detail-sheet.tsx` — detail + history + adjust.
- `src/components/sale/customer-section.tsx` — phone lookup + quick-create + redeem control for the cash dialog.

**Modify:**
- `convex/schema.ts` — `customers` + `loyaltyTransactions` tables; `cafeSettings.loyalty` group; `orders` snapshot fields.
- `convex/orders.ts` — `createCashSale` gains `customerId` + `redeemPoints`, earn/redeem ledger writes, balance update, snapshot fields; `orderSummary`/`orderDetail` validators.
- `tests/convex/orders.test.ts` — loyalty cases in `createCashSale`.
- `src/routes/_pos/customers.tsx` — replace stub with directory.
- `src/routes/_pos/loyalty.tsx` — replace stub with config + stats.
- `src/components/sale/cash-payment-dialog.tsx` — mount `<CustomerSection>`, fold loyalty into totals, pass `customerId`/`redeemPoints`.
- `src/components/sale/receipt-preview.tsx` — points-redeemed line + earned/balance footer (English).
- `tests/e2e/sale.spec.ts` — e2e for customer create + earn + redeem.
- `src/locales/id/messages.po`, `src/locales/en/messages.po` — via lingui extract/fill.

---

## Phase 1 — Foundations (schema, pure math, backend)

### Task 1: Schema — tables, config group, order fields

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add the `customers` and `loyaltyTransactions` tables**

Add inside the `defineSchema({ ... })` object (next to `suppliers`):

```ts
  customers: defineTable({
    cafeId: v.id('cafes'),
    name: v.string(),
    phone: v.string(),
    note: v.optional(v.string()),
    pointsBalance: v.number(),
    visitCount: v.number(),
    totalSpentIDR: v.number(),
    lastVisitAt: v.optional(v.number()),
    archived: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_cafe_phone', ['cafeId', 'phone'])
    .index('by_cafe_active', ['cafeId', 'archived'])
    .index('by_cafe_points', ['cafeId', 'pointsBalance']),

  loyaltyTransactions: defineTable({
    cafeId: v.id('cafes'),
    customerId: v.id('customers'),
    orderId: v.optional(v.id('orders')),
    type: v.union(v.literal('earn'), v.literal('redeem'), v.literal('adjust')),
    points: v.number(),
    note: v.optional(v.string()),
    at: v.number(),
  }).index('by_customer_at', ['customerId', 'at']),
```

- [ ] **Step 2: Add the `loyalty` group to `cafeSettings`**

In the `cafeSettings` table definition, add after the `integrations` field (before `taxName`):

```ts
    loyalty: v.optional(
      v.object({
        enabled: v.boolean(),
        earnRatePerIDR: v.number(),
        redeemBlockPoints: v.number(),
        redeemBlockIDR: v.number(),
      })
    ),
```

- [ ] **Step 3: Add the optional snapshot fields to `orders`**

In the `orders` table definition, add after `serviceChargeName` (before `totalIDR`):

```ts
    customerId: v.optional(v.id('customers')),
    pointsRedeemed: v.optional(v.number()),
    pointsRedeemedIDR: v.optional(v.number()),
    pointsEarned: v.optional(v.number()),
```

- [ ] **Step 4: Regenerate the API and typecheck**

Run: `./node_modules/.bin/convex codegen && pnpm typecheck`
Expected: no errors; `convex/_generated/api.d.ts` updated.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(loyalty): schema — customers, loyaltyTransactions, config + order fields"
```

---

### Task 2: Pure points math — `convex/lib/loyalty.ts`

**Files:**
- Create: `convex/lib/loyalty.ts`
- Test: `tests/convex/loyalty-math.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOYALTY,
  maxRedeemablePoints,
  pointsEarned,
  redemptionIDR,
} from '../../convex/lib/loyalty';

const cfg = { ...DEFAULT_LOYALTY, enabled: true }; // 1pt/Rp1000, 100pt=Rp10000

describe('pointsEarned', () => {
  it('floors net base by earn rate', () => {
    expect(pointsEarned(50000, cfg)).toBe(50); // 50000 / 1000
    expect(pointsEarned(50999, cfg)).toBe(50); // floors
  });
  it('returns 0 when disabled', () => {
    expect(pointsEarned(50000, { ...cfg, enabled: false })).toBe(0);
  });
  it('returns 0 for a non-positive base or rate', () => {
    expect(pointsEarned(0, cfg)).toBe(0);
    expect(pointsEarned(50000, { ...cfg, earnRatePerIDR: 0 })).toBe(0);
  });
});

describe('redemptionIDR', () => {
  it('values whole blocks', () => {
    expect(redemptionIDR(100, cfg)).toBe(10000);
    expect(redemptionIDR(250, cfg)).toBe(20000); // floors to 2 blocks
  });
  it('returns 0 for sub-block or disabled', () => {
    expect(redemptionIDR(50, cfg)).toBe(0);
    expect(redemptionIDR(100, { ...cfg, enabled: false })).toBe(0);
  });
});

describe('maxRedeemablePoints', () => {
  it('limited by balance, in whole blocks', () => {
    expect(maxRedeemablePoints(250, 100000, cfg)).toBe(200); // 2 blocks
  });
  it('limited by remaining goods value', () => {
    expect(maxRedeemablePoints(1000, 15000, cfg)).toBe(100); // only 1 block fits Rp15000
  });
  it('returns 0 when disabled or nothing fits', () => {
    expect(maxRedeemablePoints(1000, 100000, { ...cfg, enabled: false })).toBe(0);
    expect(maxRedeemablePoints(50, 100000, cfg)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test loyalty-math`
Expected: FAIL — cannot find module `convex/lib/loyalty`.

- [ ] **Step 3: Write the implementation**

```ts
// convex/lib/loyalty.ts
/** Loyalty program config. Stored in cafeSettings.loyalty; merged over DEFAULT_LOYALTY. */
export type LoyaltyConfig = {
  enabled: boolean;
  earnRatePerIDR: number; // Rp spent per 1 point earned
  redeemBlockPoints: number; // points per redemption block
  redeemBlockIDR: number; // Rp value of one block
};

export const DEFAULT_LOYALTY: LoyaltyConfig = {
  enabled: false,
  earnRatePerIDR: 1000,
  redeemBlockPoints: 100,
  redeemBlockIDR: 10000,
};

/** Points earned on a net base (subtotal − discounts, excl. tax/service). Floored. */
export function pointsEarned(baseIDR: number, cfg: LoyaltyConfig): number {
  if (!cfg.enabled || cfg.earnRatePerIDR <= 0 || baseIDR <= 0) return 0;
  return Math.floor(baseIDR / cfg.earnRatePerIDR);
}

/** Rp value of redeeming `points`, counting only whole blocks. */
export function redemptionIDR(points: number, cfg: LoyaltyConfig): number {
  if (!cfg.enabled || cfg.redeemBlockPoints <= 0) return 0;
  const blocks = Math.floor(points / cfg.redeemBlockPoints);
  return Math.max(0, blocks) * cfg.redeemBlockIDR;
}

/** Largest whole-block point amount redeemable given balance and remaining goods value. */
export function maxRedeemablePoints(
  balance: number,
  afterPromoIDR: number,
  cfg: LoyaltyConfig
): number {
  if (!cfg.enabled || cfg.redeemBlockPoints <= 0 || cfg.redeemBlockIDR <= 0) return 0;
  const blocksByBalance = Math.floor(balance / cfg.redeemBlockPoints);
  const blocksByValue = Math.floor(afterPromoIDR / cfg.redeemBlockIDR);
  const blocks = Math.max(0, Math.min(blocksByBalance, blocksByValue));
  return blocks * cfg.redeemBlockPoints;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test loyalty-math`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/loyalty.ts tests/convex/loyalty-math.test.ts
git commit -m "feat(loyalty): pure points math helpers + unit tests"
```

---

### Task 3: Customers backend — `convex/customers.ts`

**Files:**
- Create: `convex/customers.ts`
- Test: `tests/convex/customers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

describe('customers CRUD', () => {
  it('creates + lists (sorted, non-archived by default)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '0812-1111-111' });
    await asOwner.mutation(api.customers.create, { name: 'Ani', phone: '0813-2222-222' });
    const list = await asOwner.query(api.customers.list, {});
    expect(list).toHaveLength(2);
    expect(list[0]?.name).toBe('Ani'); // id-ID sort
    expect(list[0]?.pointsBalance).toBe(0);
    expect(list[0]?.visitCount).toBe(0);
  });

  it('rejects a duplicate phone in the same cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '0812-1111-111' });
    await expect(
      asOwner.mutation(api.customers.create, { name: 'Other', phone: '0812 1111 111' })
    ).rejects.toThrow(/terdaftar/i);
  });

  it('findByPhone normalizes and ignores archived', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111111' });
    const found = await asOwner.query(api.customers.findByPhone, { phone: '0812-1111-111' });
    expect(found?._id).toBe(id);
    await asOwner.mutation(api.customers.archive, { id });
    expect(await asOwner.query(api.customers.findByPhone, { phone: '08121111111' })).toBeNull();
  });

  it('adjustPoints writes a ledger row and updates balance; cannot go negative', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111111' });
    await asOwner.mutation(api.customers.adjustPoints, { id, points: 50, note: 'bonus' });
    const detail = await asOwner.query(api.customers.getDetail, { id });
    expect(detail?.pointsBalance).toBe(50);
    expect(detail?.transactions).toHaveLength(1);
    expect(detail?.transactions[0]?.type).toBe('adjust');
    await expect(
      asOwner.mutation(api.customers.adjustPoints, { id, points: -100 })
    ).rejects.toThrow(/poin/i);
  });

  it('validates name + phone', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(asOwner.mutation(api.customers.create, { name: '  ', phone: '08121111111' })).rejects.toThrow(/nama/i);
    await expect(asOwner.mutation(api.customers.create, { name: 'OK', phone: '12' })).rejects.toThrow(/telepon/i);
  });

  it('tenant isolation: cafe B cannot read or archive cafe A customer', async () => {
    const t = convexTest(schema, modules);
    const a = await setupOwner(t, 'a@x.com');
    const aId = await a.asOwner.mutation(api.customers.create, { name: 'A', phone: '08120000000' });
    const b = await setupOwner(t, 'b@x.com');
    expect(await b.asOwner.query(api.customers.list, {})).toHaveLength(0);
    await expect(b.asOwner.mutation(api.customers.archive, { id: aId })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test customers`
Expected: FAIL — `api.customers` undefined.

- [ ] **Step 3: Write the implementation**

```ts
// convex/customers.ts
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { normalizePhone } from './lib/phone';

const customerDoc = v.object({
  _id: v.id('customers'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  phone: v.string(),
  note: v.optional(v.string()),
  pointsBalance: v.number(),
  visitCount: v.number(),
  totalSpentIDR: v.number(),
  lastVisitAt: v.optional(v.number()),
  archived: v.boolean(),
  createdAt: v.number(),
});

const txnDoc = v.object({
  _id: v.id('loyaltyTransactions'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  customerId: v.id('customers'),
  orderId: v.optional(v.id('orders')),
  type: v.union(v.literal('earn'), v.literal('redeem'), v.literal('adjust')),
  points: v.number(),
  note: v.optional(v.string()),
  at: v.number(),
});

function assertCustomer(name: string, phone: string): { name: string; phone: string } {
  const trimmedName = name.trim();
  if (trimmedName.length < 1) throw new Error('Nama pelanggan wajib diisi.');
  if (trimmedName.length > 60) throw new Error('Nama pelanggan maksimal 60 karakter.');
  const trimmedPhone = phone.trim();
  if (normalizePhone(trimmedPhone).length < 8) throw new Error('Nomor telepon tidak valid.');
  return { name: trimmedName, phone: trimmedPhone };
}

/** Find an active customer in this cafe by normalized phone, or null. */
async function findActiveByPhone(
  ctx: Parameters<typeof query>[0] extends never ? never : any,
  cafeId: Doc<'cafes'>['_id'],
  phone: string
): Promise<Doc<'customers'> | null> {
  const norm = normalizePhone(phone);
  const rows = await ctx.db
    .query('customers')
    .withIndex('by_cafe_phone', (q: any) => q.eq('cafeId', cafeId).eq('phone', norm))
    .collect();
  return rows.find((r: Doc<'customers'>) => !r.archived) ?? null;
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()), search: v.optional(v.string()) },
  returns: v.array(customerDoc),
  handler: async (ctx, { includeArchived = false, search }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('customers')
      .withIndex('by_cafe_active', (q) =>
        includeArchived ? q.eq('cafeId', cafeId) : q.eq('cafeId', cafeId).eq('archived', false)
      )
      .collect();
    const q = (search ?? '').trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (r) => r.name.toLowerCase().includes(q) || normalizePhone(r.phone).includes(normalizePhone(q))
        )
      : rows;
    return filtered.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
  },
});

// POS lookup — phone is stored normalized at create time, so we store normalized.
export const findByPhone = query({
  args: { phone: v.string() },
  returns: v.union(customerDoc, v.null()),
  handler: async (ctx, { phone }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    return await findActiveByPhone(ctx, cafeId, phone);
  },
});

export const getDetail = query({
  args: { id: v.id('customers') },
  returns: v.union(
    v.object({ ...customerDoc.fields, transactions: v.array(txnDoc), truncated: v.boolean() }),
    v.null()
  ),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.cafeId !== cafeId) return null;
    const all = await ctx.db
      .query('loyaltyTransactions')
      .withIndex('by_customer_at', (q) => q.eq('customerId', id))
      .order('desc')
      .take(101);
    const truncated = all.length > 100;
    return { ...c, transactions: all.slice(0, 100), truncated };
  },
});

export const create = mutation({
  args: { name: v.string(), phone: v.string(), note: v.optional(v.string()) },
  returns: v.id('customers'),
  handler: async (ctx, { name, phone, note }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const clean = assertCustomer(name, phone);
    const norm = normalizePhone(clean.phone);
    const dupe = await findActiveByPhone(ctx, cafeId, norm);
    if (dupe) throw new Error('Nomor telepon sudah terdaftar.');
    return await ctx.db.insert('customers', {
      cafeId,
      name: clean.name,
      phone: norm,
      ...(note?.trim() ? { note: note.trim() } : {}),
      pointsBalance: 0,
      visitCount: 0,
      totalSpentIDR: 0,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { id: v.id('customers'), name: v.string(), phone: v.string(), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, name, phone, note }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Pelanggan');
    const clean = assertCustomer(name, phone);
    const norm = normalizePhone(clean.phone);
    const dupe = await findActiveByPhone(ctx, cafeId, norm);
    if (dupe && dupe._id !== id) throw new Error('Nomor telepon sudah terdaftar.');
    await ctx.db.patch(id, {
      name: clean.name,
      phone: norm,
      note: note?.trim() ? note.trim() : undefined,
    });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('customers') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Pelanggan');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

export const adjustPoints = mutation({
  args: { id: v.id('customers'), points: v.number(), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, points, note }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const c = await requireOwned(ctx, cafeId, id, 'Pelanggan');
    if (!Number.isInteger(points) || points === 0) throw new Error('Poin tidak valid.');
    const next = c.pointsBalance + points;
    if (next < 0) throw new Error('Poin tidak boleh menjadi negatif.');
    const now = Date.now();
    await ctx.db.insert('loyaltyTransactions', {
      cafeId,
      customerId: id,
      type: 'adjust',
      points,
      ...(note?.trim() ? { note: note.trim() } : {}),
      at: now,
    });
    await ctx.db.patch(id, { pointsBalance: next });
    return null;
  },
});
```

> Note: `findActiveByPhone`'s loose `any` typing avoids importing internal ctx types; if the codebase prefers strict typing, type `ctx` as `QueryCtx | MutationCtx` from `./_generated/server` and the index callback arg accordingly.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/convex codegen && pnpm test customers && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add convex/customers.ts tests/convex/customers.test.ts convex/_generated
git commit -m "feat(customers): directory CRUD, phone lookup, manual point adjust"
```

---

### Task 4: Loyalty config + stats — `convex/loyalty.ts`

**Files:**
- Create: `convex/loyalty.ts`
- Test: `tests/convex/loyalty.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

describe('loyalty config', () => {
  it('returns defaults when unset, then persists updates', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const cfg = await asOwner.query(api.loyalty.getConfig, {});
    expect(cfg).toEqual({ enabled: false, earnRatePerIDR: 1000, redeemBlockPoints: 100, redeemBlockIDR: 10000 });
    await asOwner.mutation(api.loyalty.updateConfig, {
      enabled: true,
      earnRatePerIDR: 1000,
      redeemBlockPoints: 100,
      redeemBlockIDR: 5000,
    });
    expect((await asOwner.query(api.loyalty.getConfig, {})).redeemBlockIDR).toBe(5000);
  });

  it('rejects non-positive numeric config', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.loyalty.updateConfig, {
        enabled: true,
        earnRatePerIDR: 0,
        redeemBlockPoints: 100,
        redeemBlockIDR: 10000,
      })
    ).rejects.toThrow();
  });
});

describe('loyalty stats', () => {
  it('counts members + outstanding points + top customers', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const a = await asOwner.mutation(api.customers.create, { name: 'A', phone: '08120000001' });
    await asOwner.mutation(api.customers.create, { name: 'B', phone: '08120000002' });
    await asOwner.mutation(api.customers.adjustPoints, { id: a, points: 300 });
    const stats = await asOwner.query(api.loyalty.stats, {});
    expect(stats.memberCount).toBe(2);
    expect(stats.pointsOutstanding).toBe(300);
    expect(stats.topCustomers[0]?.name).toBe('A');
    expect(stats.topCustomers[0]?.pointsBalance).toBe(300);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test loyalty.test`
Expected: FAIL — `api.loyalty` undefined.

- [ ] **Step 3: Write the implementation**

```ts
// convex/loyalty.ts
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';
import { DEFAULT_LOYALTY } from './lib/loyalty';

const configValidator = v.object({
  enabled: v.boolean(),
  earnRatePerIDR: v.number(),
  redeemBlockPoints: v.number(),
  redeemBlockIDR: v.number(),
});

export const getConfig = query({
  args: {},
  returns: configValidator,
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const settings = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    return { ...DEFAULT_LOYALTY, ...(settings?.loyalty ?? {}) };
  },
});

export const updateConfig = mutation({
  args: configValidator,
  returns: v.null(),
  handler: async (ctx, cfg) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    if (cfg.earnRatePerIDR <= 0) throw new Error('Nilai perolehan poin harus lebih dari 0.');
    if (cfg.redeemBlockPoints <= 0 || cfg.redeemBlockIDR <= 0) {
      throw new Error('Nilai penukaran poin harus lebih dari 0.');
    }
    const existing = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { loyalty: cfg, updatedAt: Date.now() });
    } else {
      await ctx.db.insert('cafeSettings', { cafeId, loyalty: cfg, updatedAt: Date.now() });
    }
    return null;
  },
});

export const stats = query({
  args: {},
  returns: v.object({
    memberCount: v.number(),
    pointsOutstanding: v.number(),
    topCustomers: v.array(
      v.object({ _id: v.id('customers'), name: v.string(), pointsBalance: v.number() })
    ),
  }),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const active = await ctx.db
      .query('customers')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    const pointsOutstanding = active.reduce((sum, c) => sum + c.pointsBalance, 0);
    const topCustomers = [...active]
      .sort((a, b) => b.pointsBalance - a.pointsBalance)
      .slice(0, 5)
      .map((c) => ({ _id: c._id, name: c.name, pointsBalance: c.pointsBalance }));
    return { memberCount: active.length, pointsOutstanding, topCustomers };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/convex codegen && pnpm test loyalty.test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/loyalty.ts tests/convex/loyalty.test.ts convex/_generated
git commit -m "feat(loyalty): program config get/update + stats"
```

---

## Phase 2 — Checkout integration

### Task 5: `createCashSale` — attach customer + earn points

**Files:**
- Modify: `convex/orders.ts`
- Test: `tests/convex/orders.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `describe('orders.createCashSale', ...)` in `tests/convex/orders.test.ts`:

```ts
  it('attaches a customer and earns points on the net base', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.loyalty.updateConfig, {
      enabled: true, earnRatePerIDR: 1000, redeemBlockPoints: 100, redeemBlockIDR: 10000,
    });
    const customerId = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111111' });
    const res = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-loyal-1', shiftId, cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }], // Espresso 18000
      cashTenderedIDR: 20000, customerId, createdAtClient: 1700000000000,
    });
    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    expect(order?.customerId).toBe(customerId);
    expect(order?.pointsEarned).toBe(18); // floor(18000 / 1000)
    const detail = await asOwner.query(api.customers.getDetail, { id: customerId });
    expect(detail?.pointsBalance).toBe(18);
    expect(detail?.visitCount).toBe(1);
    expect(detail?.totalSpentIDR).toBe(18000);
    expect(detail?.transactions[0]?.type).toBe('earn');
  });

  it('idempotent replay does not double-earn', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.loyalty.updateConfig, {
      enabled: true, earnRatePerIDR: 1000, redeemBlockPoints: 100, redeemBlockIDR: 10000,
    });
    const customerId = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111111' });
    const args = {
      clientId: 'order-loyal-2', shiftId, cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000, customerId, createdAtClient: 1700000000000,
    };
    await asOwner.mutation(api.orders.createCashSale, args);
    await asOwner.mutation(api.orders.createCashSale, args); // replay
    const detail = await asOwner.query(api.customers.getDetail, { id: customerId });
    expect(detail?.pointsBalance).toBe(18);
    expect(detail?.visitCount).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test orders`
Expected: FAIL — `customerId` not a valid arg / `pointsEarned` undefined on order.

- [ ] **Step 3: Add the `customerId` arg + earn logic**

In `convex/orders.ts`:

1. Add the import near the other lib imports:
```ts
import { DEFAULT_LOYALTY, pointsEarned, redemptionIDR } from './lib/loyalty';
```

2. In `createCashSale` `args`, add after `promoId`:
```ts
    customerId: v.optional(v.id('customers')),
    redeemPoints: v.optional(v.number()),
```

3. After the promo block (after `appliedPromo` is set, before `const cafe = ...`), load the customer + config. (Redemption math is added in Task 6; for now compute earn only.)
```ts
    // Loyalty: resolve customer + program config. Redemption handled in Task 6.
    let customer: Doc<'customers'> | null = null;
    let loyaltyCfg = DEFAULT_LOYALTY;
    if (args.customerId) {
      const c = await requireOwned(ctx, cafeId, args.customerId, 'Pelanggan');
      if (c.archived) throw new Error('Pelanggan sudah diarsipkan.');
      customer = c;
      const settings0 = await ctx.db
        .query('cafeSettings')
        .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
        .first();
      loyaltyCfg = { ...DEFAULT_LOYALTY, ...(settings0?.loyalty ?? {}) };
    }
```

4. In the `ctx.db.insert('orders', { ... })` call, add after `serviceChargeName: scName,`:
```ts
      ...(customer ? { customerId: customer._id } : {}),
```
(`pointsRedeemed`/`pointsRedeemedIDR`/`pointsEarned` are added after we compute earn below — keep the insert and patch it, or compute earn before insert. Implement as: compute `earned` before the insert and include it.)

   Concretely, immediately BEFORE the `ctx.db.insert('orders', ...)`, add:
```ts
    const earnBase = subtotalIDR - discountIDR;
    const earned = customer ? pointsEarned(earnBase, loyaltyCfg) : 0;
```
   and in the insert object add after the `customerId` spread:
```ts
      ...(customer ? { pointsEarned: earned } : {}),
```

5. After the inventory-movement loop (before `return { orderId, ... }`), apply the ledger + balance update:
```ts
    if (customer) {
      if (earned > 0) {
        await ctx.db.insert('loyaltyTransactions', {
          cafeId, customerId: customer._id, orderId, type: 'earn', points: earned, at: now,
        });
      }
      await ctx.db.patch(customer._id, {
        pointsBalance: customer.pointsBalance + earned,
        visitCount: customer.visitCount + 1,
        totalSpentIDR: customer.totalSpentIDR + totalIDR,
        lastVisitAt: now,
      });
    }
```

- [ ] **Step 4: Update the order validators**

In `orderSummary` (used by `listForShift`/`getById`), add after `serviceChargeName`:
```ts
  customerId: v.optional(v.id('customers')),
  pointsRedeemed: v.optional(v.number()),
  pointsRedeemedIDR: v.optional(v.number()),
  pointsEarned: v.optional(v.number()),
```

- [ ] **Step 5: Run tests + typecheck**

Run: `./node_modules/.bin/convex codegen && pnpm test orders && pnpm typecheck`
Expected: the two new tests PASS; existing order tests stay green.

- [ ] **Step 6: Commit**

```bash
git add convex/orders.ts tests/convex/orders.test.ts convex/_generated
git commit -m "feat(loyalty): earn points + visit/spend tracking on cash sale"
```

---

### Task 6: `createCashSale` — redeem points (stacks on promo)

**Files:**
- Modify: `convex/orders.ts`
- Test: `tests/convex/orders.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `describe('orders.createCashSale', ...)`:

```ts
  it('redeems points (stacks on promo) and earns on the net base', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, categoryId } = await setup(t);
    await asOwner.mutation(api.loyalty.updateConfig, {
      enabled: true, earnRatePerIDR: 1000, redeemBlockPoints: 100, redeemBlockIDR: 10000,
    });
    // A pricier item so 100k subtotal makes the math obvious.
    const big = await asOwner.mutation(api.menu.items.create, { categoryId, name: 'Beans 1kg', priceIDR: 100000 });
    const promoId = await asOwner.mutation(api.promotions.create, { name: 'Disc10', type: 'percent', value: 10 });
    const customerId = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111111' });
    await asOwner.mutation(api.customers.adjustPoints, { id: customerId, points: 100 });

    const res = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-redeem-1', shiftId, cashierId,
      lines: [{ menuItemId: big, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 100000, promoId, customerId, redeemPoints: 100,
      createdAtClient: 1700000000000,
    });
    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    // subtotal 100000; promo -10000 → 90000; points -10000 → discountIDR 20000
    expect(order?.discountIDR).toBe(20000);
    expect(order?.pointsRedeemedIDR).toBe(10000);
    expect(order?.pointsRedeemed).toBe(100);
    expect(order?.totalIDR).toBe(80000); // no tax/service in this setup
    expect(order?.pointsEarned).toBe(80); // floor((100000-20000)/1000)
    const detail = await asOwner.query(api.customers.getDetail, { id: customerId });
    expect(detail?.pointsBalance).toBe(80); // 100 - 100 redeemed + 80 earned
    expect(detail?.transactions.map((x) => x.type).sort()).toEqual(['earn', 'redeem']);
  });

  it('rejects redeeming more points than the balance', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.loyalty.updateConfig, {
      enabled: true, earnRatePerIDR: 1000, redeemBlockPoints: 100, redeemBlockIDR: 10000,
    });
    const customerId = await asOwner.mutation(api.customers.create, { name: 'Budi', phone: '08121111111' });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'order-redeem-2', shiftId, cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000, customerId, redeemPoints: 100,
      })
    ).rejects.toThrow(/poin/i);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test orders`
Expected: FAIL — `redeemPoints` not applied; `discountIDR` is 10000 not 20000.

- [ ] **Step 3: Add the redemption logic**

In `convex/orders.ts`, inside the `if (args.customerId)` loyalty block (Task 5), AFTER `loyaltyCfg` is set, compute redemption and fold it into `discountIDR`:

```ts
      const redeemPoints = args.redeemPoints ?? 0;
      if (redeemPoints > 0) {
        if (!loyaltyCfg.enabled) throw new Error('Program loyalitas tidak aktif.');
        if (!Number.isInteger(redeemPoints) || redeemPoints % loyaltyCfg.redeemBlockPoints !== 0) {
          throw new Error('Poin harus kelipatan blok penukaran.');
        }
        if (redeemPoints > c.pointsBalance) throw new Error('Poin tidak mencukupi.');
        const afterPromo = subtotalIDR - discountIDR;
        const redeemIDR = redemptionIDR(redeemPoints, loyaltyCfg);
        if (redeemIDR > afterPromo) throw new Error('Penukaran poin melebihi total.');
        pointsRedeemed = redeemPoints;
        pointsRedeemedIDR = redeemIDR;
        discountIDR += redeemIDR;
      }
```

Declare the accumulators near the top of the loyalty block (with `customer`/`loyaltyCfg`):
```ts
    let pointsRedeemed = 0;
    let pointsRedeemedIDR = 0;
```

Then in the order insert object add after the `pointsEarned` spread:
```ts
      ...(pointsRedeemed > 0 ? { pointsRedeemed, pointsRedeemedIDR } : {}),
```

And in the post-insert customer block, add the redeem ledger row before the earn row and include it in the balance delta:
```ts
      if (pointsRedeemed > 0) {
        await ctx.db.insert('loyaltyTransactions', {
          cafeId, customerId: customer._id, orderId, type: 'redeem', points: -pointsRedeemed, at: now,
        });
      }
```
and change the `pointsBalance` patch to:
```ts
        pointsBalance: customer.pointsBalance + earned - pointsRedeemed,
```

> `earnBase = subtotalIDR - discountIDR` already reflects the combined discount, so earn is computed on the net base automatically — no change needed there.

- [ ] **Step 4: Run tests + typecheck**

Run: `./node_modules/.bin/convex codegen && pnpm test orders && pnpm typecheck`
Expected: new redemption tests PASS; all prior tests green.

- [ ] **Step 5: Commit**

```bash
git add convex/orders.ts tests/convex/orders.test.ts convex/_generated
git commit -m "feat(loyalty): redeem points at checkout, stacking on promo"
```

---

## Phase 3 — UI, receipt, e2e, i18n

> UI tasks follow the Catalog UI kit. Study `src/routes/_pos/suppliers.tsx` + `src/components/supplier/supplier-form-dialog.tsx` for the directory + dialog pattern, and `src/routes/_pos/settings/tax.tsx` for a config-form page. Verify them with `pnpm typecheck` and the e2e in Task 11.

### Task 7: Customers page — directory + form dialog

**Files:**
- Modify: `src/routes/_pos/customers.tsx`
- Create: `src/components/customer/customer-form-dialog.tsx`

- [ ] **Step 1: Build `CustomerFormDialog`**

Mirror `src/components/supplier/supplier-form-dialog.tsx` exactly, swapping supplier → customer: fields `name` (Nama), `phone` (Telepon/No. HP), and an optional `note` (Catatan) textarea. On submit call `api.customers.create` (when no `id`) or `api.customers.update` (with `id`), show a toast via `src/lib/toast.ts`, and surface thrown errors inline (the mutation messages are user-facing Indonesian). Props: `{ open, onOpenChange, customer? }` where `customer` is the `getDetail`/`list` row for edit mode.

- [ ] **Step 2: Replace the customers stub with the directory**

Replace `src/routes/_pos/customers.tsx` body with a Catalog-kit page modeled on `suppliers.tsx`:
- `useQuery(api.customers.list, { includeArchived, search })`.
- `PageHeader` title `<Trans>Pelanggan</Trans>` + a "Tambah pelanggan" action opening `CustomerFormDialog`.
- `Toolbar` with search (`onSearch` → `setSearch`) and Aktif/Arsip chips (`includeArchived`).
- `DataTable` columns: Nama, Telp (`row.phone`), Poin (`row.pointsBalance`), Kunjungan (`row.visitCount`), Total (`formatIDR(row.totalSpentIDR)`).
- `RowActions`: "Ubah" → open dialog in edit mode; "Arsipkan" → `ConfirmDialog` → `api.customers.archive`.
- Row click → open the detail sheet (Task 8).
- shadcn `Empty` state when the list is empty.

Use `t` / `<Trans>` macros for all visible strings.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_pos/customers.tsx src/components/customer/customer-form-dialog.tsx
git commit -m "feat(customers): directory page + create/edit dialog"
```

---

### Task 8: Customer detail sheet — history + manual adjust

**Files:**
- Create: `src/components/customer/customer-detail-sheet.tsx`
- Modify: `src/routes/_pos/customers.tsx` (wire row click → sheet)

- [ ] **Step 1: Build `CustomerDetailSheet`**

A shadcn `Sheet` (model the layout on `src/components/inventory/movement-history-sheet.tsx`). Props `{ customerId, open, onOpenChange }`. `useQuery(api.customers.getDetail, customerId ? { id: customerId } : 'skip')`. Show:
- Header: name + phone; a "Saldo poin: {pointsBalance}" badge; visit count + total spent.
- A "Sesuaikan poin" button → an inline adjust form (signed integer `points` + optional `note`) → `api.customers.adjustPoints`, with a toast; surface the "Poin tidak boleh menjadi negatif." error inline.
- A transaction list from `detail.transactions` (type badge — Perolehan/Penukaran/Penyesuaian, signed points, date via `src/lib/formater.ts`), with the shadcn `Empty` state when there are none and a "menampilkan 100 terakhir" note when `truncated`.
- An "Ubah" button opening `CustomerFormDialog` in edit mode.

- [ ] **Step 2: Wire row click in the directory**

In `customers.tsx`, track `selectedId` state; row click sets it and opens the sheet; render `<CustomerDetailSheet>` with it.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/customer/customer-detail-sheet.tsx src/routes/_pos/customers.tsx
git commit -m "feat(customers): detail sheet with history + manual point adjust"
```

---

### Task 9: Loyalty page — config + stats

**Files:**
- Modify: `src/routes/_pos/loyalty.tsx`

- [ ] **Step 1: Replace the loyalty stub**

Replace with a page that has:
- `PageHeader` title `<Trans>Loyalitas</Trans>`.
- A config card: `useQuery(api.loyalty.getConfig)`, a draft form (model dirty/save handling on `src/components/settings/` `useEditableState` + `SaveBar` if present, else local state + a Save button) with: "Program aktif" `Switch` (`enabled`); "Poin per belanja" — earn `1 poin per Rp {earnRatePerIDR}`; redemption — `{redeemBlockPoints} poin = Rp {redeemBlockIDR}`. Save → `api.loyalty.updateConfig` with a toast; surface validation errors inline.
- A stats row: `useQuery(api.loyalty.stats)` → cards for "Anggota" (`memberCount`) and "Poin beredar" (`pointsOutstanding`), and a "Pelanggan teratas" list/table from `topCustomers` (name + balance), with an `Empty` state when there are no members.

Use `t` / `<Trans>` for all strings; format Rp via `formatIDR`.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_pos/loyalty.tsx
git commit -m "feat(loyalty): program config + stats page"
```

---

### Task 10: Cash dialog — customer lookup + redeem; receipt lines

**Files:**
- Create: `src/components/sale/customer-section.tsx`
- Modify: `src/components/sale/cash-payment-dialog.tsx`
- Modify: `src/components/sale/receipt-preview.tsx`

- [ ] **Step 1: Build `CustomerSection`**

A self-contained block for the cash dialog. Props:
`{ cafeLoyalty: LoyaltyConfig, afterPromoIDR: number, value: { customerId?: Id<'customers'>; redeemPoints: number }, onChange: (next) => void }`.

Behavior:
- A phone `Input` ("No. HP pelanggan") with debounced `useQuery(api.customers.findByPhone, phone.length>=4 ? { phone } : 'skip')`.
- When found: show name + "Saldo: {pointsBalance} poin"; set `customerId`. When not found and a phone is entered: a "+ Tambah pelanggan baru" button opening a minimal inline create (name + phone) via `api.customers.create`, then select it.
- When a customer is selected and `cafeLoyalty.enabled` and `pointsBalance >= redeemBlockPoints`: a "Tukar poin" control — block buttons up to `maxRedeemablePoints(pointsBalance, afterPromoIDR, cafeLoyalty)` (from `convex/lib/loyalty`) plus a "Maks" button and a "Hapus" to clear. Selecting sets `redeemPoints`; show the live "- Rp {redemptionIDR(redeemPoints, cfg)}" preview.
- Clearing the customer resets `redeemPoints` to 0.

Import the pure helpers from `convex/lib/loyalty` (already client-safe — no server imports).

- [ ] **Step 2: Wire into `CashPaymentDialog`**

- Read config: `useQuery(api.loyalty.getConfig)` (fallback `DEFAULT_LOYALTY` while loading).
- The dialog already knows the cart subtotal + promo. Compute `promoDiscount` (reuse the promo amount already shown), `afterPromoIDR = subtotal - promoDiscount`, then `redeemIDR = redemptionIDR(redeemPoints, cfg)`, `discountIDR = promoDiscount + redeemIDR`, and recompute totals via `computeOrderTotals({ subtotalIDR, discountIDR, ... })` (same call already used). Render a "Poin ditukar  - Rp {redeemIDR}" line between the promo line and PB1.
- Validate cash against the new `totalIDR`.
- Pass `customerId` + `redeemPoints` into the `api.orders.createCashSale` call.

- [ ] **Step 3: Receipt lines (English)**

In `receipt-preview.tsx`, using English literals (receipt is always English, kept out of the i18n catalog):
- When `order.pointsRedeemedIDR > 0`: a "Points redeemed   -Rp {...}" line alongside the existing discount/promo lines.
- When `order.customerId` and `order.pointsEarned !== undefined`: a footer line "Points earned: +{pointsEarned}". (Balance after the sale isn't snapshotted on the order; show earned only to avoid a second query.)

- [ ] **Step 4: Typecheck + unit tests**

Run: `pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/sale/customer-section.tsx src/components/sale/cash-payment-dialog.tsx src/components/sale/receipt-preview.tsx
git commit -m "feat(loyalty): POS customer lookup, point redemption, receipt lines"
```

---

### Task 11: Playwright e2e

**Files:**
- Modify: `tests/e2e/sale.spec.ts`

- [ ] **Step 1: Add an e2e covering create → earn → redeem**

Following the existing auth-gated helpers in `tests/e2e/sale.spec.ts` (signup → onboarding → PIN → open shift), add a test that:
1. Enables the loyalty program (navigate to `/loyalty`, toggle on, save) OR seeds it — prefer driving the UI to keep it realistic.
2. Creates a customer on `/customers` (name + phone).
3. Makes a sale on `/sale`, opens the cash dialog, enters the customer phone, confirms the found customer, pays, and asserts the receipt shows the customer + "Points earned".
4. Makes a second sale, redeems a block of points at checkout, and asserts the "Points redeemed" line appears and the collected total dropped by the block value.

- [ ] **Step 2: Run the e2e**

Run: `pnpm test:e2e sale`
Expected: PASS (allow the documented per-test timeout; this suite is auth-gated).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/sale.spec.ts
git commit -m "test(e2e): loyalty — customer earn + redeem at checkout"
```

---

### Task 12: i18n + nav verification + final sweep

**Files:**
- Modify: `src/locales/id/messages.po`, `src/locales/en/messages.po`
- Verify: `src/components/app-shared.tsx` (nav already has Pelanggan + Loyalitas)

- [ ] **Step 1: Extract + fill + compile**

Run: `pnpm lingui:extract`
Then fill English translations for every new `msgid` in `src/locales/en/messages.po` (Indonesian source strings stay as-is in the `id` catalog). Then: `pnpm lingui:compile`.

- [ ] **Step 2: Verify nav + lint**

Confirm `/customers` and `/loyalty` nav entries render (they already exist in `app-shared.tsx`). Run: `pnpm lint:i18n` and `pnpm lint`.
Expected: no missing-translation or lint errors.

- [ ] **Step 3: Full local CI**

Run: `pnpm typecheck && pnpm test && pnpm lingui:compile`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/locales convex/_generated
git commit -m "i18n(loyalty): extract + English fill for loyalty/customers strings"
```

---

## Done criteria

- Owner can manage customers (`/customers`) and the loyalty program (`/loyalty`).
- A cash sale can attach a customer by phone, earn points on the net base, and redeem whole point-blocks that stack on a promo (promo first, then points off the remainder, then service charge, then PB1).
- Balances/visits/spend update atomically with each sale; idempotent replays never double-apply; the ledger records every earn/redeem/adjust.
- Receipt shows redeemed + earned points in English; all UI strings exist in id + en.
- `pnpm typecheck`, `pnpm test`, and the Playwright sale e2e pass.

## Spec coverage self-check

- Schema (customers, loyaltyTransactions, cafeSettings.loyalty, order fields) → Task 1. ✓
- Pure helpers (pointsEarned, redemptionIDR, maxRedeemablePoints) → Task 2. ✓
- customers.ts (list, findByPhone, getDetail, create, update, archive, adjustPoints) → Task 3. ✓
- loyalty.ts (getConfig, updateConfig, stats) → Task 4. ✓
- Checkout earn → Task 5; redeem stacking + clamps + idempotency → Task 5/6. ✓
- Customers page + detail/adjust → Tasks 7–8; Loyalty page → Task 9. ✓
- Cash dialog lookup/redeem + receipt (English) → Task 10. ✓
- Tests (Convex + unit + e2e) → Tasks 2–6, 11; i18n → Task 12. ✓
- Access (owner-only pages; cashier POS create) → enforced via `requireOwnerCafe` in customers/loyalty + `customers.create` reachable at POS. ✓
- Deferred items (expiry, tiers, notifications, QRIS redemption, CSV, trend stats) → out of scope, not planned. ✓
```
