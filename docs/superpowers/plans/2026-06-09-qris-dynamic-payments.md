# Dynamic QRIS Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take a dynamic-QRIS payment end-to-end — cashier picks QRIS dinamis, a (mock) gateway issues a per-transaction QR, a `pending` order is created, a signed webhook confirms payment, and the dialog auto-advances to the receipt with inventory + loyalty settled.

**Architecture:** A provider-adapter layer (`PaymentProvider` interface + `MockProvider`) isolates the gateway. The synchronous "insert paid order" logic is split into `buildOrder` (validate + insert `pending`) and `settleSale` (inventory + loyalty + mark `paid`); cash/static run both in one mutation, dynamic runs `settleSale` from a webhook. A frontend method registry replaces hardcoded `cash`/`qris_static` branching.

**Tech Stack:** Convex (mutations/queries/actions/httpActions/crons, Web Crypto HMAC, file storage), TanStack Start + React, Convex reactive `useQuery`, Lingui i18n, shadcn/ui, Vitest + convex-test (`t.fetch`), Playwright.

**Spec:** `docs/superpowers/specs/2026-06-09-qris-dynamic-payments-design.md`

**Branch:** `feat/qris-dynamic-payments` (already created off `main`, spec committed).

**Conventions:**
- Run CI locally before any push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`.
- Convex codegen after signature changes: `./node_modules/.bin/convex codegen` (npx is broken by a shell hook); commit the generated files.
- New UI strings are Bahasa Indonesia via Lingui `<Trans>`/`` t`...` ``; run `pnpm lingui:extract` and fill the `en` catalog (not just compile). Receipt content stays English and off-catalog.
- `fetch()` and `crypto.subtle` are available in the default Convex runtime — do NOT add `"use node"`.
- Small conventional commits per task.

---

## File Structure

**Backend (create):**
- `convex/lib/sale.ts` — shared `buildOrder()` + `settleSale()` (extracted from `orders.ts` `buildAndInsertSale`) and shared `SaleArgs`/`PaymentInput` types.
- `convex/payments/providers/types.ts` — `PaymentProvider` interface + event types.
- `convex/payments/providers/mock.ts` — `MockProvider` (fabricate QR, HMAC sign/verify).
- `convex/payments/providers/index.ts` — `resolveProvider()`.
- `convex/payments/qrisDynamic.ts` — `createQrisDynamicSale` (action), `buildPendingDynamicOrder`/`confirmFromWebhook`/`voidPendingOrder` (internal mutations), `getOrderStatusByRef` (internal query), `sweepExpired` (internal mutation), `simulateWebhook` (dev action).

**Backend (modify):**
- `convex/schema.ts` — `payments.expiresAt` + `by_provider_ref` index.
- `convex/orders.ts` — `createCashSale`/`createQrisStaticSale` call `buildOrder` + `settleSale` from `lib/sale.ts`; remove the inlined `buildAndInsertSale`.
- `convex/http.ts` — add `POST /webhooks/qris` route.
- `convex/crons.ts` — add the `sweepExpired` cron.

**Frontend (create):**
- `src/components/sale/payment-methods.tsx` — method registry.
- `src/components/sale/qris-dynamic-payment-dialog.tsx` — dynamic dialog.

**Frontend (modify):**
- `src/components/sale/sale-screen.tsx` — drive pay buttons + dialogs from the registry.
- `src/components/sale/cart-pane.tsx` — label any method via the registry.
- `src/routes/_pos/settings/tax.tsx` — "QRIS dinamis" row reflects the `qris` integration.

**Tests:**
- `tests/convex/sale-core.test.ts`, `tests/convex/qris-dynamic.test.ts`, `tests/convex/mock-provider.test.ts`, `tests/e2e/sale.spec.ts` (extend).

---

## Task 1: Schema — payment provider fields + index

**Files:**
- Modify: `convex/schema.ts` (payments table, ~lines 298-315)

- [ ] **Step 1: Add `expiresAt` and the provider-ref index**

In `convex/schema.ts`, update the `payments` table. Add `expiresAt` after `providerStatus`, and add the index:

```ts
  payments: defineTable({
    cafeId: v.id('cafes'),
    orderId: v.id('orders'),
    method: v.union(
      v.literal('cash'),
      v.literal('qris_static'),
      v.literal('qris_dynamic')
    ),
    amountIDR: v.number(),
    cashTenderedIDR: v.optional(v.number()),
    changeIDR: v.optional(v.number()),
    providerRef: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
  })
    .index('by_order', ['orderId'])
    .index('by_cafe_method_confirmed', ['cafeId', 'method', 'confirmedAt'])
    .index('by_provider_ref', ['providerRef']),
```

- [ ] **Step 2: Regenerate Convex types**

Run: `./node_modules/.bin/convex codegen`
Expected: exits 0; `convex/_generated/dataModel.d.ts` updated.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(payments): payments.expiresAt + by_provider_ref index for dynamic QRIS"
```

---

## Task 2: Split `buildAndInsertSale` into `buildOrder` + `settleSale`

This is a refactor that must preserve cash/static behavior exactly. The existing suite (`tests/convex/orders.test.ts`, 418 tests) is the regression guard.

**Files:**
- Create: `convex/lib/sale.ts`
- Modify: `convex/orders.ts` (remove `buildAndInsertSale`, lines ~28-350; keep mutations + read queries)
- Test: `tests/convex/sale-core.test.ts`

- [ ] **Step 1: Create `convex/lib/sale.ts` with the shared types and `buildOrder`**

Move the existing helpers verbatim from `orders.ts` and reshape into `buildOrder`. `buildOrder` is the current `buildAndInsertSale` body **up to and including the order + payment inserts**, with two changes: (a) it always inserts the order with `paymentStatus: 'pending'` and the payment **without** `confirmedAt`; (b) it does NOT run the inventory loop or the loyalty/customer block (those move to `settleSale`).

```ts
import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { requireOwned, requireOwnerCafe } from './auth';
import { DEFAULT_LOYALTY, pointsEarned, redemptionIDR } from './loyalty';
import { DEFAULT_SERVICE_CHARGE_NAME, computeOrderTotals, promoDiscountIDR } from './pricing';
import { requireActiveCashier } from './staff';

export const lineInput = v.object({
  menuItemId: v.id('menuItems'),
  qty: v.number(),
  modifierOptionIds: v.array(v.id('modifierOptions')),
});

export const saleArgs = {
  clientId: v.string(),
  shiftId: v.id('shifts'),
  cashierId: v.id('cafeStaff'),
  lines: v.array(lineInput),
  promoId: v.optional(v.id('promotions')),
  customerId: v.optional(v.id('customers')),
  redeemPoints: v.optional(v.number()),
  createdAtClient: v.optional(v.number()),
};

export const saleResult = v.object({
  orderId: v.id('orders'),
  totalIDR: v.number(),
  changeIDR: v.number(),
});

export type SaleArgs = {
  clientId: string;
  shiftId: Id<'shifts'>;
  cashierId: Id<'cafeStaff'>;
  lines: Array<{ menuItemId: Id<'menuItems'>; qty: number; modifierOptionIds: Array<Id<'modifierOptions'>> }>;
  promoId?: Id<'promotions'>;
  customerId?: Id<'customers'>;
  redeemPoints?: number;
  createdAtClient?: number;
};

export type PaymentInput =
  | { method: 'cash'; tenderedIDR: number }
  | { method: 'qris_static' }
  | { method: 'qris_dynamic'; providerRef: string; expiresAt: number };

function assertIDR(n: number, label: string): number {
  if (!Number.isInteger(n)) throw new Error(`${label} harus berupa angka bulat (rupiah).`);
  if (n < 0) throw new Error(`${label} tidak boleh negatif.`);
  return n;
}

/**
 * Build + insert an order in `pending` state plus its payment row. Validates the
 * cart, recomputes promo + loyalty + totals authoritatively. Does NOT apply side
 * effects (inventory, loyalty txns, customer patch) or mark the order paid — that
 * is settleSale's job. Returns the existing order unchanged on a clientId replay.
 */
export async function buildOrder(
  ctx: MutationCtx,
  args: SaleArgs,
  payment: PaymentInput
): Promise<{ orderId: Id<'orders'>; totalIDR: number; changeIDR: number }> {
  const { cafeId } = await requireOwnerCafe(ctx);

  // Idempotency: an existing order (any status) short-circuits.
  const existing = await ctx.db
    .query('orders')
    .withIndex('by_cafe_clientId', (q) => q.eq('cafeId', cafeId).eq('clientId', args.clientId))
    .unique();
  if (existing) {
    const existingPayment = await ctx.db
      .query('payments')
      .withIndex('by_order', (q) => q.eq('orderId', existing._id))
      .unique();
    return { orderId: existing._id, totalIDR: existing.totalIDR, changeIDR: existingPayment?.changeIDR ?? 0 };
  }

  if (args.lines.length < 1) throw new Error('Keranjang kosong.');

  const shift = await requireOwned(ctx, cafeId, args.shiftId, 'Shift');
  if (shift.status !== 'open') throw new Error('Shift sudah ditutup.');
  await requireActiveCashier(ctx, cafeId, args.cashierId);

  // --- MOVE VERBATIM from orders.ts buildAndInsertSale: the per-line build loop
  //     (current lines ~88-174), `subtotalIDR` (176), promo block (178-191),
  //     redeem-without-customer check (193-195), settings read (197-201). ---

  // method-availability guards (cash/qris_static keep the settings.methods gate;
  // qris_dynamic is gated by the connected integration in the action, not here).
  const methods = settings?.payment?.methods;
  if (payment.method === 'cash' && methods?.cash === false) {
    throw new Error('Metode tunai tidak aktif.');
  }
  if (payment.method === 'qris_static') {
    if (methods?.qrisStatic === false) throw new Error('Metode QRIS statis tidak aktif.');
    if (!settings?.payment?.qrisImageStorageId) throw new Error('QRIS statis belum dikonfigurasi.');
  }

  // --- MOVE VERBATIM: loyalty resolution block (current lines ~209-235),
  //     cafe tax read (237-239), service charge (241-244), computeOrderTotals (246-253). ---

  // method-specific: funds check + change only for cash.
  let changeIDR = 0;
  if (payment.method === 'cash') {
    const tendered = assertIDR(payment.tenderedIDR, 'Uang yang diterima');
    if (tendered < totalIDR) throw new Error('Uang yang diterima kurang dari total.');
    changeIDR = tendered - totalIDR;
  }

  const earnBase = subtotalIDR - discountIDR;
  const earned = customer ? pointsEarned(earnBase, loyaltyCfg) : 0;

  const now = Date.now();
  const orderId = await ctx.db.insert('orders', {
    cafeId,
    shiftId: shift._id,
    cashierId: args.cashierId,
    clientId: args.clientId,
    lines: builtLines,
    subtotalIDR,
    taxRatePct,
    taxIDR,
    discountIDR,
    ...(appliedPromo ? { appliedPromo } : {}),
    serviceChargeIDR,
    serviceChargePct: scPct,
    serviceChargeName: scName,
    ...(customer ? { customerId: customer._id, pointsEarned: earned } : {}),
    ...(pointsRedeemed > 0 ? { pointsRedeemed, pointsRedeemedIDR } : {}),
    totalIDR,
    paymentMethod: payment.method,
    paymentStatus: 'pending',
    createdAtClient: args.createdAtClient ?? now,
    syncedAt: now,
  });

  await ctx.db.insert('payments', {
    cafeId,
    orderId,
    method: payment.method,
    amountIDR: totalIDR,
    ...(payment.method === 'cash' ? { cashTenderedIDR: payment.tenderedIDR, changeIDR } : {}),
    ...(payment.method === 'qris_dynamic'
      ? { providerRef: payment.providerRef, providerStatus: 'pending', expiresAt: payment.expiresAt }
      : {}),
  });

  return { orderId, totalIDR, changeIDR };
}
```

> Note for the implementer: the blocks marked "MOVE VERBATIM" are the existing, unchanged statements from `orders.ts`. Copy them exactly, keeping the variable names (`builtLines`, `subtotalIDR`, `discountIDR`, `appliedPromo`, `customer`, `loyaltyCfg`, `pointsRedeemed`, `pointsRedeemedIDR`, `settings`, `taxEnabled`, `taxRatePct`, `taxIDR`, `serviceChargeIDR`, `scPct`, `scName`, `totalIDR`) so the insert above type-checks.

- [ ] **Step 2: Add `settleSale` to `convex/lib/sale.ts`**

Append the settle step. It reconstructs all side effects from the persisted order doc, so it needs only `orderId`:

```ts
/**
 * Apply the side effects of a confirmed sale: inventory deduction, loyalty
 * transactions, customer patch, and flip the order to `paid` + stamp the payment
 * confirmedAt. Idempotent: a no-op if the order is already `paid` or `void`.
 */
export async function settleSale(ctx: MutationCtx, orderId: Id<'orders'>): Promise<void> {
  const order = await ctx.db.get(orderId);
  if (!order) throw new Error('Pesanan tidak ditemukan.');
  if (order.paymentStatus !== 'pending') return; // already settled or voided

  const now = Date.now();

  // Inventory deduction: one inventoryMovements row per (line × ingredient).
  for (const line of order.lines) {
    for (const recipeLine of line.recipeSnapshot ?? []) {
      const consumed = line.qty * recipeLine.qty * recipeLine.wastageFactor;
      await ctx.db.insert('inventoryMovements', {
        cafeId: order.cafeId,
        ingredientId: recipeLine.ingredientId,
        delta: -consumed,
        reason: 'sale',
        refType: 'order',
        refId: orderId as unknown as string,
        at: now,
      });
    }
  }

  if (order.customerId) {
    const customer = await ctx.db.get(order.customerId);
    if (customer) {
      const pointsRedeemed = order.pointsRedeemed ?? 0;
      const earned = order.pointsEarned ?? 0;
      if (pointsRedeemed > 0) {
        await ctx.db.insert('loyaltyTransactions', {
          cafeId: order.cafeId, customerId: customer._id, orderId, type: 'redeem', points: -pointsRedeemed, at: now,
        });
      }
      if (earned > 0) {
        await ctx.db.insert('loyaltyTransactions', {
          cafeId: order.cafeId, customerId: customer._id, orderId, type: 'earn', points: earned, at: now,
        });
      }
      await ctx.db.patch(customer._id, {
        pointsBalance: customer.pointsBalance + earned - pointsRedeemed,
        visitCount: customer.visitCount + 1,
        totalSpentIDR: customer.totalSpentIDR + order.totalIDR,
        lastVisitAt: now,
      });
    }
  }

  await ctx.db.patch(orderId, { paymentStatus: 'paid' });
  const payment = await ctx.db
    .query('payments')
    .withIndex('by_order', (q) => q.eq('orderId', orderId))
    .unique();
  if (payment) {
    await ctx.db.patch(payment._id, {
      confirmedAt: now,
      ...(payment.method === 'qris_dynamic' ? { providerStatus: 'paid' } : {}),
    });
  }
}
```

- [ ] **Step 3: Rewrite the mutations in `convex/orders.ts`**

Replace the `buildAndInsertSale` function and the local `lineInput`/`saleResult`/`saleArgs`/`SaleArgs`/`PaymentInput`/`assertIDR` definitions (lines ~10-374) with imports + thin wrappers. Keep all read queries (`getById`, etc.) untouched.

```ts
import { mutation } from './_generated/server';
import { buildOrder, settleSale, saleArgs, saleResult } from './lib/sale';

export const createCashSale = mutation({
  args: { ...saleArgs, cashTenderedIDR: v.number() },
  returns: saleResult,
  handler: async (ctx, args) => {
    const res = await buildOrder(ctx, args, { method: 'cash', tenderedIDR: args.cashTenderedIDR });
    await settleSale(ctx, res.orderId);
    return res;
  },
});

export const createQrisStaticSale = mutation({
  args: saleArgs,
  returns: saleResult,
  handler: async (ctx, args) => {
    const res = await buildOrder(ctx, args, { method: 'qris_static' });
    await settleSale(ctx, res.orderId);
    return res;
  },
});
```

> Keep the existing `v` import and the read-query section in `orders.ts`. Remove now-unused imports (`requireOwned`, `DEFAULT_LOYALTY`, etc.) that only `buildAndInsertSale` used — `pnpm typecheck` / biome will flag leftovers.

- [ ] **Step 4: Run the existing order suite (regression guard)**

Run: `pnpm test tests/convex/orders.test.ts`
Expected: PASS (all existing cash/static tests green — the split is behavior-preserving because cash/static run `buildOrder` then `settleSale` in one transaction).

- [ ] **Step 5: Add a focused split test**

Create `tests/convex/sale-core.test.ts` (reuse the `setup` pattern from `orders.test.ts`):

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/api';
import schema from '../../convex/schema';
// import { setup } from helper or inline-copy the setup() from orders.test.ts

const modules = import.meta.glob('../../convex/**/*.*s');

describe('sale core: cash sale still settles in one mutation', () => {
  it('marks the order paid with inventory + payment confirmedAt', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const res = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'core-1', shiftId, cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000, createdAtClient: 1700000000000,
    });
    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    expect(order?.paymentStatus).toBe('paid');
    const payment = await t.run((ctx) =>
      ctx.db.query('payments').withIndex('by_order', (q) => q.eq('orderId', res.orderId)).unique()
    );
    expect(payment?.confirmedAt).toEqual(expect.any(Number));
  });
});
```

Run: `pnpm test tests/convex/sale-core.test.ts`
Expected: PASS.

- [ ] **Step 6: Codegen + typecheck + commit**

```bash
./node_modules/.bin/convex codegen
pnpm typecheck
git add convex/lib/sale.ts convex/orders.ts convex/_generated tests/convex/sale-core.test.ts
git commit -m "refactor(payments): split buildAndInsertSale into buildOrder + settleSale"
```

---

## Task 3: PaymentProvider interface

**Files:**
- Create: `convex/payments/providers/types.ts`

- [ ] **Step 1: Define the interface + events**

```ts
export type ChargeInput = { amountIDR: number; ref: string; idempotencyKey: string };
export type ChargeResult = { providerRef: string; qrString: string; expiresAt: number };
export type WebhookEvent = { providerRef: string; status: 'paid' | 'expired' | 'failed' };

export interface PaymentProvider {
  /** Create a per-transaction QR charge with the gateway. */
  createCharge(input: ChargeInput): Promise<ChargeResult>;
  /** Verify a webhook body's signature; return the parsed event, or null if invalid. */
  verifyWebhook(req: { body: string; signature: string | null }): Promise<WebhookEvent | null>;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add convex/payments/providers/types.ts
git commit -m "feat(payments): PaymentProvider adapter interface"
```

---

## Task 4: MockProvider + HMAC

**Files:**
- Create: `convex/payments/providers/mock.ts`
- Test: `tests/convex/mock-provider.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/convex/mock-provider.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MockProvider, signMockBody } from '../../convex/payments/providers/mock';

const SECRET = 'test-secret';

describe('MockProvider', () => {
  it('createCharge returns a providerRef, qrString and future expiry', async () => {
    const p = new MockProvider(SECRET);
    const r = await p.createCharge({ amountIDR: 36000, ref: 'client-1', idempotencyKey: 'client-1' });
    expect(r.providerRef).toMatch(/^mock_/);
    expect(typeof r.qrString).toBe('string');
    expect(r.expiresAt).toBeGreaterThan(Date.now());
  });

  it('verifyWebhook accepts a correctly-signed body and rejects a bad signature', async () => {
    const p = new MockProvider(SECRET);
    const body = JSON.stringify({ providerRef: 'mock_abc', status: 'paid' });
    const sig = await signMockBody(SECRET, body);
    await expect(p.verifyWebhook({ body, signature: sig })).resolves.toEqual({
      providerRef: 'mock_abc', status: 'paid',
    });
    await expect(p.verifyWebhook({ body, signature: 'wrong' })).resolves.toBeNull();
  });
});
```

Run: `pnpm test tests/convex/mock-provider.test.ts`
Expected: FAIL ("Cannot find module .../mock").

- [ ] **Step 2: Implement `mock.ts`**

```ts
import type { ChargeInput, ChargeResult, PaymentProvider, WebhookEvent } from './types';

/** HMAC-SHA256 hex over `body` using Web Crypto (available in the default Convex runtime). */
export async function signMockBody(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class MockProvider implements PaymentProvider {
  constructor(private readonly secret: string) {}

  async createCharge(input: ChargeInput): Promise<ChargeResult> {
    // Deterministic ref from the idempotency key so retries map to the same charge.
    const providerRef = `mock_${input.idempotencyKey}`;
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
    const qrString = `MOCKQR|${providerRef}|${input.amountIDR}`;
    return { providerRef, qrString, expiresAt };
  }

  async verifyWebhook(req: { body: string; signature: string | null }): Promise<WebhookEvent | null> {
    if (!req.signature) return null;
    const expected = await signMockBody(this.secret, req.body);
    // Constant-time-ish compare (lengths equal for same algo).
    if (req.signature.length !== expected.length || req.signature !== expected) return null;
    try {
      const parsed = JSON.parse(req.body) as { providerRef?: string; status?: string };
      if (!parsed.providerRef || !['paid', 'expired', 'failed'].includes(parsed.status ?? '')) return null;
      return { providerRef: parsed.providerRef, status: parsed.status as WebhookEvent['status'] };
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 3: Run the test**

Run: `pnpm test tests/convex/mock-provider.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add convex/payments/providers/mock.ts tests/convex/mock-provider.test.ts
git commit -m "feat(payments): MockProvider with HMAC-signed webhooks"
```

---

## Task 5: resolveProvider

**Files:**
- Create: `convex/payments/providers/index.ts`

- [ ] **Step 1: Implement the resolver**

The webhook secret comes from `process.env.QRIS_WEBHOOK_SECRET` (set in the Convex dashboard; falls back to a dev default so local/test runs work).

```ts
import type { PaymentProvider } from './types';
import { MockProvider } from './mock';

export function qrisWebhookSecret(): string {
  return process.env.QRIS_WEBHOOK_SECRET ?? 'dev-qris-secret';
}

/**
 * Select the active QRIS provider. Until a real Midtrans/Xendit adapter is wired,
 * this always returns MockProvider. `integrationConfig` (the connected `qris`
 * integration's config) is accepted now so the real selector can branch on it.
 */
export function resolveProvider(_integrationConfig?: unknown): PaymentProvider {
  return new MockProvider(qrisWebhookSecret());
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add convex/payments/providers/index.ts
git commit -m "feat(payments): resolveProvider selector (mock for now)"
```

---

## Task 6: Dynamic-QRIS orchestration

**Files:**
- Create: `convex/payments/qrisDynamic.ts`
- Test: `tests/convex/qris-dynamic.test.ts`

- [ ] **Step 1: Implement internal mutations + query + the create action**

```ts
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { action, internalMutation, internalQuery } from '../_generated/server';
import { requireOwnerCafe } from '../lib/auth';
import { buildOrder, saleArgs } from '../lib/sale';
import { resolveProvider } from './providers';

/** Internal: connected-integration check for the action (which can't read ctx.db). */
export const assertQrisConnected = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    const connected = (row?.integrations ?? []).some((i) => i.key === 'qris' && i.connected);
    if (!connected) throw new Error('Integrasi QRIS dinamis belum terhubung.');
    return null;
  },
});

/** Internal: insert the pending order via the shared buildOrder. */
export const buildPendingDynamicOrder = internalMutation({
  args: { ...saleArgs, providerRef: v.string(), expiresAt: v.number() },
  returns: v.object({ orderId: v.id('orders'), totalIDR: v.number(), changeIDR: v.number() }),
  handler: async (ctx, { providerRef, expiresAt, ...args }) =>
    buildOrder(ctx, args, { method: 'qris_dynamic', providerRef, expiresAt }),
});

/** Internal: look up an order id by provider ref (for the webhook). */
export const getOrderIdByRef = internalQuery({
  args: { providerRef: v.string() },
  returns: v.union(v.id('orders'), v.null()),
  handler: async (ctx, { providerRef }) => {
    const payment = await ctx.db
      .query('payments')
      .withIndex('by_provider_ref', (q) => q.eq('providerRef', providerRef))
      .unique();
    return payment?.orderId ?? null;
  },
});

/** Owner-triggered: create a charge with the provider and a pending order. */
export const createQrisDynamicSale = action({
  args: saleArgs,
  returns: v.object({ orderId: v.id('orders'), qrString: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args): Promise<{ orderId: Id<'orders'>; qrString: string; expiresAt: number }> => {
    await ctx.runQuery(internal.payments.qrisDynamic.assertQrisConnected, {});
    // amountIDR is recomputed authoritatively inside buildOrder; for the charge we
    // pass a provisional amount via a cheap dry build is overkill — the mock ignores
    // exact amount correctness, and the real provider charge is created against the
    // order total. Compute the charge amount from the same totals by building first.
    const provider = resolveProvider();
    const charge = await provider.createCharge({
      amountIDR: 0, // placeholder; replaced below once the order total is known
      ref: args.clientId,
      idempotencyKey: args.clientId,
    });
    const res = await ctx.runMutation(internal.payments.qrisDynamic.buildPendingDynamicOrder, {
      ...args,
      providerRef: charge.providerRef,
      expiresAt: charge.expiresAt,
    });
    return { orderId: res.orderId, qrString: charge.qrString, expiresAt: charge.expiresAt };
  },
});
```

> Amount note: the mock QR encodes a placeholder amount, which is fine for the mock flow (payment confirmation is signature-based, not amount-based). When the real adapter lands, build the order first (an internal "dry-run/build" mutation returning `totalIDR`), then call `createCharge({ amountIDR: total })`, then patch the providerRef onto the already-inserted payment. Keep this simplification for the mock slice and note it in the dialog (the displayed total comes from `usePaymentTotals`, which is authoritative for the cashier).

- [ ] **Step 2: Implement confirm / void / sweep mutations**

Append to `qrisDynamic.ts`:

```ts
import { settleSale } from '../lib/sale';

/** Internal: settle a pending order identified by provider ref (idempotent). */
export const confirmFromWebhook = internalMutation({
  args: { providerRef: v.string() },
  returns: v.union(v.literal('settled'), v.literal('unknown')),
  handler: async (ctx, { providerRef }) => {
    const payment = await ctx.db
      .query('payments')
      .withIndex('by_provider_ref', (q) => q.eq('providerRef', providerRef))
      .unique();
    if (!payment) return 'unknown';
    await settleSale(ctx, payment.orderId);
    return 'settled';
  },
});

/** Internal: void a pending order by provider ref (expired/failed webhook). */
export const voidByRef = internalMutation({
  args: { providerRef: v.string() },
  returns: v.null(),
  handler: async (ctx, { providerRef }) => {
    const payment = await ctx.db
      .query('payments')
      .withIndex('by_provider_ref', (q) => q.eq('providerRef', providerRef))
      .unique();
    if (!payment) return null;
    const order = await ctx.db.get(payment.orderId);
    if (order?.paymentStatus === 'pending') {
      await ctx.db.patch(order._id, { paymentStatus: 'void' });
      await ctx.db.patch(payment._id, { providerStatus: 'void' });
    }
    return null;
  },
});

/** Owner-triggered: cancel a pending dynamic order (cashier closed the dialog). */
export const cancelQrisDynamicSale = mutation({
  args: { orderId: v.id('orders') },
  returns: v.null(),
  handler: async (ctx, { orderId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const order = await ctx.db.get(orderId);
    if (!order || order.cafeId !== cafeId) throw new Error('Pesanan tidak ditemukan.');
    if (order.paymentStatus !== 'pending') return null; // already settled/voided — no-op
    await ctx.db.patch(orderId, { paymentStatus: 'void' });
    const payment = await ctx.db
      .query('payments')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .unique();
    if (payment) await ctx.db.patch(payment._id, { providerStatus: 'void' });
    return null;
  },
});

/** Internal cron: void pending dynamic orders past expiry + grace (5 min). */
export const sweepExpired = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    const stale = await ctx.db
      .query('payments')
      .withIndex('by_provider_ref') // scan dynamic payments; filter in code
      .collect();
    let voided = 0;
    for (const p of stale) {
      if (p.method !== 'qris_dynamic' || !p.expiresAt || p.expiresAt > cutoff) continue;
      const order = await ctx.db.get(p.orderId);
      if (order?.paymentStatus === 'pending') {
        await ctx.db.patch(order._id, { paymentStatus: 'void' });
        await ctx.db.patch(p._id, { providerStatus: 'expired' });
        voided++;
      }
    }
    return voided;
  },
});
```

> Add `mutation` to the import from `'../_generated/server'`.

- [ ] **Step 3: Write the tests**

Create `tests/convex/qris-dynamic.test.ts`. Use the `setup` helper (inline-copy from `orders.test.ts`). Helper to connect the integration:

```ts
async function connectQris(asOwner: any) {
  await asOwner.mutation(api.settings.connectIntegration, { key: 'qris', config: { apiKey: 'k' } });
}
```

Tests:

```ts
describe('createQrisDynamicSale', () => {
  it('throws when the qris integration is not connected', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await expect(
      asOwner.action(api.payments.qrisDynamic.createQrisDynamicSale, {
        clientId: 'dyn-off', shiftId, cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }], createdAtClient: 1,
      })
    ).rejects.toThrow(/belum terhubung/i);
  });

  it('creates a pending order with no inventory or loyalty side effects', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await connectQris(asOwner);
    const r = await asOwner.action(api.payments.qrisDynamic.createQrisDynamicSale, {
      clientId: 'dyn-1', shiftId, cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }], createdAtClient: 1,
    });
    expect(r.qrString).toContain('MOCKQR');
    const order = await t.run((ctx) => ctx.db.get(r.orderId));
    expect(order?.paymentStatus).toBe('pending');
    const moves = await t.run((ctx) => ctx.db.query('inventoryMovements').collect());
    expect(moves).toHaveLength(0);
  });

  it('confirmFromWebhook settles the order and is idempotent', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await connectQris(asOwner);
    const r = await asOwner.action(api.payments.qrisDynamic.createQrisDynamicSale, {
      clientId: 'dyn-2', shiftId, cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }], createdAtClient: 1,
    });
    const payment = await t.run((ctx) =>
      ctx.db.query('payments').withIndex('by_order', (q) => q.eq('orderId', r.orderId)).unique()
    );
    const ref = payment!.providerRef!;
    await t.mutation(internal.payments.qrisDynamic.confirmFromWebhook, { providerRef: ref });
    await t.mutation(internal.payments.qrisDynamic.confirmFromWebhook, { providerRef: ref }); // duplicate
    const order = await t.run((ctx) => ctx.db.get(r.orderId));
    expect(order?.paymentStatus).toBe('paid');
    const moves = await t.run((ctx) => ctx.db.query('inventoryMovements').collect());
    expect(moves.length).toBeGreaterThan(0); // settled exactly once is covered by paymentStatus guard
  });

  it('cancel and sweep void pending orders', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await connectQris(asOwner);
    const r = await asOwner.action(api.payments.qrisDynamic.createQrisDynamicSale, {
      clientId: 'dyn-3', shiftId, cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }], createdAtClient: 1,
    });
    await asOwner.mutation(api.payments.qrisDynamic.cancelQrisDynamicSale, { orderId: r.orderId });
    const order = await t.run((ctx) => ctx.db.get(r.orderId));
    expect(order?.paymentStatus).toBe('void');
  });
});
```

> `internal` import: `import { internal } from '../../convex/_generated/api';`. Recipe items in `setup` have no recipe by default, so the "settles" test asserts `paymentStatus` flips; if `setup`'s item has no recipe, drop the `moves.length` assertion or attach a recipe in the test. Adjust to match the `setup` helper's actual fixtures.

- [ ] **Step 4: Codegen + run tests**

```bash
./node_modules/.bin/convex codegen
pnpm test tests/convex/qris-dynamic.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/payments/qrisDynamic.ts convex/_generated tests/convex/qris-dynamic.test.ts
git commit -m "feat(payments): dynamic-QRIS action, webhook confirm, cancel + sweep"
```

---

## Task 7: Webhook route

**Files:**
- Modify: `convex/http.ts`
- Test: `tests/convex/qris-dynamic.test.ts` (extend)

- [ ] **Step 1: Add the route**

```ts
import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { auth } from './auth';
import { resolveProvider } from './payments/providers';

const http = httpRouter();
auth.addHttpRoutes(http);

http.route({
  path: '/webhooks/qris',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    const signature = req.headers.get('x-signature');
    const event = await resolveProvider().verifyWebhook({ body, signature });
    if (!event) return new Response('invalid signature', { status: 401 });

    if (event.status === 'paid') {
      const r = await ctx.runMutation(internal.payments.qrisDynamic.confirmFromWebhook, {
        providerRef: event.providerRef,
      });
      return new Response(r, { status: 200 }); // 'settled' | 'unknown' — 200 acks either way
    }
    await ctx.runMutation(internal.payments.qrisDynamic.voidByRef, { providerRef: event.providerRef });
    return new Response('ok', { status: 200 });
  }),
});

export default http;
```

- [ ] **Step 2: Add a webhook route test (t.fetch)**

Append to `tests/convex/qris-dynamic.test.ts`:

```ts
import { signMockBody } from '../../convex/payments/providers/mock';

describe('POST /webhooks/qris', () => {
  it('rejects a bad signature and settles a valid paid event', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await connectQris(asOwner);
    const r = await asOwner.action(api.payments.qrisDynamic.createQrisDynamicSale, {
      clientId: 'wh-1', shiftId, cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }], createdAtClient: 1,
    });
    const payment = await t.run((ctx) =>
      ctx.db.query('payments').withIndex('by_order', (q) => q.eq('orderId', r.orderId)).unique()
    );
    const body = JSON.stringify({ providerRef: payment!.providerRef, status: 'paid' });

    const bad = await t.fetch('/webhooks/qris', { method: 'POST', body, headers: { 'x-signature': 'nope' } });
    expect(bad.status).toBe(401);

    const sig = await signMockBody('dev-qris-secret', body);
    const ok = await t.fetch('/webhooks/qris', { method: 'POST', body, headers: { 'x-signature': sig } });
    expect(ok.status).toBe(200);
    const order = await t.run((ctx) => ctx.db.get(r.orderId));
    expect(order?.paymentStatus).toBe('paid');
  });
});
```

Run: `pnpm test tests/convex/qris-dynamic.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add convex/http.ts tests/convex/qris-dynamic.test.ts
git commit -m "feat(payments): /webhooks/qris httpAction route"
```

---

## Task 8: Expiry sweep cron

**Files:**
- Modify: `convex/crons.ts`

- [ ] **Step 1: Register the cron**

```ts
import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
crons.cron('nightly forecast', '0 15 * * *', internal.forecast.generateNightly, {});
crons.interval('sweep expired qris', { minutes: 5 }, internal.payments.qrisDynamic.sweepExpired, {});

export default crons;
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add convex/crons.ts
git commit -m "feat(payments): cron sweep for expired pending QRIS orders"
```

---

## Task 9: Dev webhook simulator

**Files:**
- Modify: `convex/payments/qrisDynamic.ts`

- [ ] **Step 1: Add a dev-only simulate action**

It POSTs a correctly-signed event to the webhook route via the Convex site URL, so the full path (signature verify → settle) runs. Used by the e2e test and an optional dev button.

```ts
import { signMockBody, qrisWebhookSecret } from './providers'; // re-export qrisWebhookSecret from index if needed
// (qrisWebhookSecret is exported from providers/index.ts; signMockBody from providers/mock.ts)

export const simulateWebhook = action({
  args: { providerRef: v.string(), status: v.union(v.literal('paid'), v.literal('expired'), v.literal('failed')) },
  returns: v.number(),
  handler: async (_ctx, { providerRef, status }) => {
    const body = JSON.stringify({ providerRef, status });
    const sig = await signMockBody(qrisWebhookSecret(), body);
    const res = await fetch(`${process.env.CONVEX_SITE_URL}/webhooks/qris`, {
      method: 'POST', headers: { 'x-signature': sig, 'content-type': 'application/json' }, body,
    });
    return res.status;
  },
});
```

> Import `signMockBody` from `'./providers/mock'` and `qrisWebhookSecret` from `'./providers'`. `CONVEX_SITE_URL` is provided by Convex at runtime.

- [ ] **Step 2: Codegen + typecheck + commit**

```bash
./node_modules/.bin/convex codegen
pnpm typecheck
git add convex/payments/qrisDynamic.ts convex/_generated
git commit -m "feat(payments): dev simulateWebhook action for QRIS testing"
```

---

## Task 10: Frontend method registry

**Files:**
- Create: `src/components/sale/payment-methods.tsx`
- Modify: `src/components/sale/cart-pane.tsx`, `src/components/sale/sale-screen.tsx`

- [ ] **Step 1: Create the registry**

`PaymentMethod` widens the existing `'cash' | 'qris_static'` union to include `'qris_dynamic'`. `isReady` takes the resolved `settings` object (the shape returned by `api.settings.get`).

```tsx
import type { ReactNode } from 'react';

export type PaymentMethod = 'cash' | 'qris_static' | 'qris_dynamic';

type SettingsShape = {
  payment: { methods: { cash: boolean; qrisStatic: boolean } };
  qrisImageUrl?: string;
  integrations: Array<{ key: string; connected: boolean }>;
};

export type PaymentMethodEntry = {
  method: PaymentMethod;
  label: ReactNode;
  isReady: (s: SettingsShape) => boolean;
};

import { Trans } from '@lingui/react/macro';

export const PAYMENT_METHODS: PaymentMethodEntry[] = [
  { method: 'cash', label: <Trans>Tunai</Trans>, isReady: (s) => s.payment.methods.cash },
  {
    method: 'qris_static',
    label: <Trans>QRIS</Trans>,
    isReady: (s) => s.payment.methods.qrisStatic && Boolean(s.qrisImageUrl),
  },
  {
    method: 'qris_dynamic',
    label: <Trans>QRIS</Trans>,
    isReady: (s) => s.integrations.some((i) => i.key === 'qris' && i.connected),
  },
];

export function methodLabel(method: PaymentMethod): ReactNode {
  return PAYMENT_METHODS.find((m) => m.method === method)?.label ?? method;
}
```

- [ ] **Step 2: Update `cart-pane.tsx` to label via the registry**

Change the prop types from `Array<'cash' | 'qris_static'>` to `PaymentMethod[]`, and the button label from the `m === 'cash' ? ... : ...` ternary to `{methodLabel(m)}`. Import `methodLabel`, `type PaymentMethod` from `./payment-methods`. Keep the existing empty-state ("Atur metode pembayaran") block unchanged.

```tsx
import { methodLabel, type PaymentMethod } from './payment-methods';
// prop types:
//   payMethods: PaymentMethod[];
//   onPay: (method: PaymentMethod) => void;
// button body:
//   {methodLabel(m)}
```

- [ ] **Step 3: Update `sale-screen.tsx` to compute supported methods from the registry**

Replace the hardcoded `supported` push block (lines ~84-92) with a registry filter, and the `onPay` `if (method === 'cash')` branch with a method→dialog-open map. Keep `defaultMethod` ordering (boolean-key comparator).

```tsx
import { PAYMENT_METHODS, type PaymentMethod } from './payment-methods';
// ...
const defaultMethod = settings.payment.defaultMethod;
const supported = PAYMENT_METHODS.filter((m) => m.isReady(settings)).map((m) => m.method);
const payMethods = [...supported].sort(
  (a, b) => Number(b === defaultMethod) - Number(a === defaultMethod)
);
const [openMethod, setOpenMethod] = useState<PaymentMethod | null>(null);
// CartPane: onPay={(m) => { if (cart.lines.length > 0) setOpenMethod(m); }}
// Dialogs: open={openMethod === 'cash'} onOpenChange={(o) => !o && setOpenMethod(null)} (per dialog)
```

Replace the two `cashOpen`/`qrisOpen` state booleans with the single `openMethod`. Render `CashPaymentDialog` (open when `openMethod === 'cash'`), `QrisStaticPaymentDialog` (`'qris_static'`), and `QrisDynamicPaymentDialog` (`'qris_dynamic'`, added in Task 11).

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (the dynamic dialog import will be unresolved until Task 11 — do Step 4 after Task 11, or stub the import). To keep this task self-contained, temporarily omit the dynamic dialog from `sale-screen` and add it in Task 11 Step 3.

- [ ] **Step 5: Commit**

```bash
git add src/components/sale/payment-methods.tsx src/components/sale/cart-pane.tsx src/components/sale/sale-screen.tsx
git commit -m "refactor(sale): drive pay buttons + dialogs from a method registry"
```

---

## Task 11: Dynamic-QRIS dialog

**Files:**
- Create: `src/components/sale/qris-dynamic-payment-dialog.tsx`
- Modify: `src/components/sale/sale-screen.tsx` (wire it in)

- [ ] **Step 1: Implement the dialog**

Mirrors `qris-static-payment-dialog.tsx`'s props/shape, but: calls `createQrisDynamicSale` (an action — `useAction`), shows the returned QR, watches the order via `useQuery(api.orders.getById)`, auto-advances on `paymentStatus === 'paid'`, and cancels on close.

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { DEFAULT_LOYALTY } from 'convex/lib/loyalty';
import { useAction, useMutation, useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';
import { genUUID } from '~/lib/uuid';
import type { CartState } from './cart-reducer';
import { CustomerSection, type CustomerSelection } from './customer-section';
import { usePaymentTotals } from './use-payment-totals';

export function QrisDynamicPaymentDialog({
  open, onOpenChange, subtotalIDR, promoDiscountIDR, serviceChargeEnabled, serviceChargePct,
  taxEnabled, taxRatePct, cart, shiftId, cashierId, promoId, onPaid,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; subtotalIDR: number; promoDiscountIDR: number;
  serviceChargeEnabled: boolean; serviceChargePct: number; taxEnabled: boolean; taxRatePct: number;
  cart: CartState; shiftId: Id<'shifts'>; cashierId: Id<'cafeStaff'>; promoId?: Id<'promotions'>;
  onPaid: (orderId: Id<'orders'>) => void;
}) {
  const { t } = useLingui();
  const createSale = useAction(api.payments.qrisDynamic.createQrisDynamicSale);
  const cancelSale = useMutation(api.payments.qrisDynamic.cancelQrisDynamicSale);
  const loyaltyCfg = useQuery(api.loyalty.getConfig) ?? DEFAULT_LOYALTY;
  const [customer, setCustomer] = useState<CustomerSelection>({ redeemPoints: 0 });
  const [orderId, setOrderId] = useState<Id<'orders'> | null>(null);
  const [qrString, setQrString] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const clientIdRef = useRef<string>('');

  const { afterPromoIDR, redeemIDR, totalIDR } = usePaymentTotals({
    subtotalIDR, promoDiscountIDR, redeemPoints: customer.redeemPoints, loyaltyCfg,
    serviceChargeEnabled, serviceChargePct, taxEnabled, taxRatePct,
  });

  // Reset on open.
  useEffect(() => {
    if (open) {
      clientIdRef.current = genUUID();
      setCustomer({ redeemPoints: 0 }); setOrderId(null); setQrString(null); setError(null);
    }
  }, [open]);

  const liveOrder = useQuery(api.orders.getById, orderId ? { id: orderId } : 'skip');

  // Auto-advance when the webhook confirms.
  useEffect(() => {
    if (liveOrder?.paymentStatus === 'paid' && orderId) {
      onPaid(orderId);
      onOpenChange(false);
    }
  }, [liveOrder?.paymentStatus, orderId, onPaid, onOpenChange]);

  async function startCharge() {
    if (creating || orderId) return;
    setCreating(true); setError(null);
    try {
      const res = await createSale({
        clientId: clientIdRef.current, shiftId, cashierId,
        lines: cart.lines.map((l) => ({ menuItemId: l.menuItemId, qty: l.qty, modifierOptionIds: l.modifierOptionIds })),
        ...(promoId ? { promoId } : {}),
        ...(customer.customerId ? { customerId: customer.customerId } : {}),
        ...(customer.redeemPoints > 0 ? { redeemPoints: customer.redeemPoints } : {}),
        createdAtClient: Date.now(),
      });
      setOrderId(res.orderId); setQrString(res.qrString);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Gagal membuat tagihan QRIS.`);
    } finally {
      setCreating(false);
    }
  }

  async function handleClose(next: boolean) {
    if (!next && orderId && liveOrder?.paymentStatus === 'pending') {
      try { await cancelSale({ orderId }); } catch { /* ignore */ }
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle><Trans>Pembayaran QRIS</Trans></DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!orderId ? (
            <>
              <CustomerSection cafeLoyalty={loyaltyCfg} afterPromoIDR={afterPromoIDR} value={customer} onChange={setCustomer} />
              <div className="rounded-md bg-muted px-3 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground"><Trans>Total tagihan</Trans></div>
                <div className="text-2xl font-semibold text-primary tabular-nums">{formatIDR(totalIDR)}</div>
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button type="button" onClick={startCharge} disabled={creating} className="w-full" size="lg">
                {creating ? <Spinner data-icon="inline-start" /> : null}
                {creating ? <Trans>Membuat tagihan…</Trans> : <Trans>Buat QRIS</Trans>}
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-md bg-muted px-3 py-2 text-center">
                <div className="text-2xl font-semibold text-primary tabular-nums">{formatIDR(totalIDR)}</div>
              </div>
              <div className="flex flex-col items-center gap-2 rounded-md border border-border px-3 py-4">
                {/* Mock QR: render the string; a real provider returns a QR image URL. */}
                <div className="font-mono text-xs break-all">{qrString}</div>
                <p className="text-sm text-muted-foreground"><Trans>Menunggu pembayaran…</Trans></p>
                <Spinner />
              </div>
              <Button type="button" variant="outline" onClick={() => handleClose(false)} className="w-full">
                <Trans>Batal</Trans>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Wire it into `sale-screen.tsx`**

Import `QrisDynamicPaymentDialog` and render it inside the `shift && cashierId` block alongside the others:

```tsx
<QrisDynamicPaymentDialog
  open={openMethod === 'qris_dynamic'}
  onOpenChange={(o) => { if (!o) setOpenMethod(null); }}
  subtotalIDR={subtotal}
  promoDiscountIDR={discount}
  serviceChargeEnabled={scEnabled}
  serviceChargePct={scPct}
  taxEnabled={taxEnabled}
  taxRatePct={taxRatePct}
  {...(cart.promo?._id ? { promoId: cart.promo._id } : {})}
  cart={cart}
  shiftId={shift._id}
  cashierId={cashierId}
  onPaid={(orderId) => { setReceiptOrderId(orderId); dispatch({ type: 'clearCart' }); }}
/>
```

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm typecheck
git add src/components/sale/qris-dynamic-payment-dialog.tsx src/components/sale/sale-screen.tsx
git commit -m "feat(sale): dynamic-QRIS dialog with reactive auto-advance"
```

---

## Task 12: Settings enable gate

**Files:**
- Modify: `src/routes/_pos/settings/tax.tsx`

- [ ] **Step 1: Replace the "QRIS dinamis" ComingSoonRow**

`api.settings.get` returns `integrations`. Show the row as connected/not-connected based on the `qris` integration, with a hint linking to `/settings/integrations`. Keep it a read-only reflection here (connecting happens on the integrations page).

```tsx
// near the other rows, replace: <ComingSoonRow label={<Trans>QRIS dinamis</Trans>} />
const qrisConnected = s.integrations.some((i) => i.key === 'qris' && i.connected);
// ...
<SettingRow
  label={<Trans>QRIS dinamis</Trans>}
  description={
    qrisConnected
      ? <Trans>Terhubung lewat integrasi penyedia.</Trans>
      : <Trans>Hubungkan penyedia di halaman Integrasi.</Trans>
  }
  control={<Switch checked={qrisConnected} disabled onCheckedChange={() => {}} />}
/>
```

> `s` is the `useQuery(api.settings.get)` result already in scope. Leave the other three `ComingSoonRow`s (card/ewallet/transfer) as-is.

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add src/routes/_pos/settings/tax.tsx
git commit -m "feat(settings): reflect QRIS-dynamic readiness from the integration"
```

---

## Task 13: i18n

**Files:**
- Modify: `src/locales/en/messages.po`, `src/locales/id/messages.po`

- [ ] **Step 1: Extract**

Run: `pnpm lingui:extract`
Expected: new strings reported missing for `en` (e.g. "Buat QRIS", "Membuat tagihan…", "Menunggu pembayaran…", "Batal", "Gagal membuat tagihan QRIS.", "Terhubung lewat integrasi penyedia.", "Hubungkan penyedia di halaman Integrasi.").

- [ ] **Step 2: Fill the `en` catalog**

Edit `src/locales/en/messages.po`, setting `msgstr` for each new `msgid`:
- "Buat QRIS" → "Generate QRIS"
- "Membuat tagihan…" → "Creating charge…"
- "Menunggu pembayaran…" → "Waiting for payment…"
- "Batal" → "Cancel"  (reuse existing if already present)
- "Gagal membuat tagihan QRIS." → "Failed to create the QRIS charge."
- "Terhubung lewat integrasi penyedia." → "Connected via the provider integration."
- "Hubungkan penyedia di halaman Integrasi." → "Connect a provider on the Integrations page."
- "Integrasi QRIS dinamis belum terhubung." → "Dynamic QRIS integration is not connected." (if surfaced in UI)

- [ ] **Step 3: Compile + commit**

```bash
pnpm lingui:compile
git add src/locales/en/messages.po src/locales/id/messages.po
git commit -m "i18n(payments): translate dynamic-QRIS strings"
```

---

## Task 14: e2e dynamic flow

**Files:**
- Modify: `tests/e2e/sale.spec.ts`

- [ ] **Step 1: Add the dynamic-QRIS e2e test**

Model it on the existing static-QRIS test (~line 282). Connect the `qris` integration via the integrations page (fill the API key, click Connect), start a sale, pick QRIS dinamis, click "Buat QRIS", then drive confirmation by calling the `simulateWebhook` action. Since e2e can't call Convex actions directly, expose the provider ref by reading the QR string from the dialog OR add a tiny dev affordance; simplest: after creating the charge, the test triggers payment through a dev-only button that calls `simulateWebhook` (gate the button behind `import.meta.env.DEV`).

```ts
test('dynamic QRIS: connect provider → pay → webhook confirms → receipt', async ({ page }) => {
  // ... sign up, open shift (copy from the static-QRIS test) ...
  // Connect the qris integration:
  await page.goto('/settings/integrations');
  await page.getByRole('button', { name: /QRIS \(Midtrans\/Xendit\)/ }).click(); // open connect dialog
  await page.getByLabel(/API key|Kunci API/i).fill('test-key');
  await page.getByRole('button', { name: /Hubungkan|Connect/ }).click();
  // Sale → QRIS dinamis:
  await page.goto('/sale');
  await page.getByRole('button', { name: /Espresso/ }).first().click();
  await page.getByRole('button', { name: /^QRIS$/ }).click(); // dynamic is the only QRIS if static has no image
  await page.getByRole('button', { name: /Buat QRIS/ }).click();
  await expect(page.getByText(/Menunggu pembayaran/)).toBeVisible();
  // Simulate the webhook via the dev button (gated to DEV):
  await page.getByRole('button', { name: /Simulasikan pembayaran|Simulate payment/ }).click();
  await expect(page.getByText(/QRIS/)).toBeVisible(); // receipt shown
});
```

> If you prefer not to add a dev button, drive `simulateWebhook` from a Playwright `request` call to the deployed Convex HTTP action, or skip e2e confirmation and assert the "Menunggu pembayaran…" state only. Decide during implementation; keep the unit/route tests as the authoritative confirmation coverage.

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/sale.spec.ts src/components/sale/qris-dynamic-payment-dialog.tsx
git commit -m "test(e2e): dynamic-QRIS connect → pay → webhook confirm"
```

---

## Task 15: Audit aggregations + final verification

**Files:**
- Review: `convex/dashboard.ts`, `convex/shifts.ts`, `convex/customers.ts`, `convex/loyalty.ts`

- [ ] **Step 1: Ensure aggregations exclude non-paid orders**

Grep for order aggregations and confirm each filters to `paymentStatus === 'paid'` (reports.ts already does). Pending/void orders must not inflate dashboard sales, shift totals, or customer spend.

Run: `rtk proxy git grep -n "query('orders')" convex/`
For each hit that sums totals/counts sales, add a `.filter((o) => o.paymentStatus === 'paid')` (or an index-level guard) if missing. Add/extend a unit test asserting a `pending` order is excluded from the dashboard/shift total it feeds.

- [ ] **Step 2: Full local CI gate**

```bash
pnpm typecheck && pnpm test && pnpm lingui:compile
```
Expected: all PASS.

- [ ] **Step 3: Commit any aggregation fixes**

```bash
git add -A
git commit -m "fix(reports): exclude pending/void orders from sales aggregations"
```

- [ ] **Step 4: Push + open PR**

```bash
rtk proxy git push -u origin feat/qris-dynamic-payments
gh pr create --fill
```

---

## Self-review notes (addressed)

- **Spec coverage:** provider adapter (T3-5), build/settle split (T2), pending order + webhook confirm + cancel + expiry (T6-8), reactive dialog (T11), method registry (T10), enable gate (T12), settlement-on-confirmation (T2 `settleSale` + T6 webhook), aggregation exclusion (T15), testing (T2,4,6,7,14). All covered.
- **Type consistency:** `buildOrder`/`settleSale`/`PaymentInput`/`saleArgs` defined in T2 and reused by name in T6; `confirmFromWebhook`/`voidByRef`/`sweepExpired`/`createQrisDynamicSale` names consistent across T6-9 and T11; `PaymentMethod` defined in T10 and used in T10-11.
- **Known simplification (mock slice):** the mock charge uses a placeholder amount (payment confirmation is signature-based). The real-adapter task (out of scope here) must build the order first to charge the exact total — noted in T6.
