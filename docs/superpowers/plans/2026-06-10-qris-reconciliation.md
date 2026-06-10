# QRIS Status Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blind local-clock `sweepExpired` cron with a `reconcilePending` action that polls each pending dynamic-QRIS order's real status from the cafe's Xendit account and settles/voids/leaves — so a delayed/missed webhook can never wrongly void a paid order.

**Architecture:** Add `fetchStatus(providerRef)` to the `PaymentProvider` interface (Xendit GETs the charge; Mock returns `'pending'`). A `reconcilePending` internalAction (actions can `fetch`) runs on the existing 5-min cron: it lists pending dynamic payments, polls each via the cafe's provider, and applies outcomes through the existing idempotent `confirmFromWebhook`/`voidByRef` mutations. `sweepExpired` is removed.

**Tech Stack:** Convex (internalAction/internalQuery, `fetch`), Xendit QR Codes API, Vitest + convex-test (mocked `fetch`).

**Spec:** `docs/superpowers/specs/2026-06-10-qris-reconciliation-design.md`

**Branch:** `feat/qris-reconciliation` (already created off `main`, spec committed).

**Conventions:**
- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`.
- `fetch` is default-runtime and only available in **actions** (not mutations/queries); no `"use node"`.
- Do NOT run `convex codegen`. New exports in the already-registered `qrisDynamic` module resolve without it; if a new `internal.*` ref fails typecheck, the dev watcher updates `api.d.ts` (commit it).
- Secrets are never logged. Small conventional commits.

---

## Task 1: Add `fetchStatus` to the provider interface + MockProvider

**Files:**
- Modify: `convex/payments/providers/types.ts`
- Modify: `convex/payments/providers/mock.ts`

- [ ] **Step 1: Extend `types.ts`**

Add the `ChargeStatus` type and the interface method. Final interface:
```ts
export const WEBHOOK_STATUSES = ['paid', 'expired', 'failed'] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];
export type WebhookEvent = { providerRef: string; status: WebhookStatus };

export type ChargeStatus = 'paid' | 'pending' | 'expired' | 'failed' | 'unknown';

export interface PaymentProvider {
  createCharge(input: { amountIDR: number; referenceId: string }):
    Promise<{ providerRef: string; qrString: string; expiresAt: number }>;
  verifyWebhook(req: { body: string; headers: Headers }): Promise<WebhookEvent | null>;
  fetchStatus(providerRef: string): Promise<ChargeStatus>;
}
```

- [ ] **Step 2: Implement `MockProvider.fetchStatus`**

In `convex/payments/providers/mock.ts`, add to the class:
```ts
  async fetchStatus(): Promise<import('./types').ChargeStatus> {
    return 'pending';
  }
```
(Reconcile is a no-op under the mock — the automated suite and dev never auto-settle/void via polling. Tests that exercise reconcile stub `globalThis.fetch` against the Xendit provider instead.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL — `XenditProvider` does not yet implement `fetchStatus` (added in Task 2). That's expected; do NOT commit Task 1 alone. Proceed to Task 2 and commit them together. (If you prefer a green checkpoint, add a temporary `async fetchStatus(){return 'unknown' as const;}` stub to `xendit.ts` now and replace it in Task 2 — but committing 1+2 together is cleaner.)

> Note: Tasks 1 and 2 share one commit (the interface change requires both implementors). No standalone commit for Task 1.

---

## Task 2: `XenditProvider.fetchStatus` + tests

**Files:**
- Modify: `convex/payments/providers/xendit.ts`
- Test: `tests/convex/xendit-provider.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/convex/xendit-provider.test.ts`:
```ts
describe('XenditProvider.fetchStatus', () => {
  const CFG2 = { secretApiKey: 'xnd_test_key', callbackToken: 'cb' };

  it('maps a succeeded payment to paid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'qr_1', status: 'ACTIVE', payments: [{ status: 'SUCCEEDED' }] }), { status: 200 })
    );
    await expect(new XenditProvider(CFG2).fetchStatus('qr_1')).resolves.toBe('paid');
  });

  it('maps an active unpaid QR to pending and inactive to expired', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'qr_2', status: 'ACTIVE', payments: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'qr_3', status: 'INACTIVE', payments: [] }), { status: 200 }));
    await expect(new XenditProvider(CFG2).fetchStatus('qr_2')).resolves.toBe('pending');
    await expect(new XenditProvider(CFG2).fetchStatus('qr_3')).resolves.toBe('expired');
  });

  it('returns unknown on a non-2xx without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('err', { status: 500 }));
    await expect(new XenditProvider(CFG2).fetchStatus('qr_x')).resolves.toBe('unknown');
  });
});
```
Run: `pnpm test tests/convex/xendit-provider.test.ts` → FAIL (`fetchStatus` not a function).

- [ ] **Step 2: Implement `fetchStatus` in `xendit.ts`**

Add the import of `ChargeStatus` to the existing type import and add the method to the class:
```ts
import type { ChargeStatus, PaymentProvider, WebhookEvent } from './types';
// ... inside class XenditProvider ...
  async fetchStatus(providerRef: string): Promise<ChargeStatus> {
    try {
      const auth = btoa(`${this.config.secretApiKey}:`);
      const res = await fetch(`${XENDIT_QR_URL}/${encodeURIComponent(providerRef)}`, {
        method: 'GET',
        headers: { Authorization: `Basic ${auth}`, 'api-version': '2022-07-31' },
      });
      if (!res.ok) return 'unknown';
      const json = (await res.json()) as { status?: string; payments?: Array<{ status?: string }> };
      const payments = Array.isArray(json.payments) ? json.payments : [];
      if (payments.some((p) => p.status === 'SUCCEEDED' || p.status === 'COMPLETED')) return 'paid';
      if (json.status === 'ACTIVE') return 'pending';
      if (json.status === 'INACTIVE') return 'expired';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }
```
> Live-API note: this reads the QR GET response's optional inline `payments[]` plus the QR `status`. If the sandbox shows payment success is only available via a separate `GET /qr_codes/{id}/payments` call, that's a small adjustment confirmed in the manual verification step; the mapping (SUCCEEDED/COMPLETED→paid, ACTIVE→pending, INACTIVE→expired, else/non-2xx→unknown) is pinned by the tests above.

Run: `pnpm test tests/convex/xendit-provider.test.ts` → PASS.

- [ ] **Step 3: Typecheck (now green) + commit Tasks 1+2**

Run: `pnpm typecheck` (PASS — both implementors now satisfy the interface) and full `pnpm test` (no regressions; `MockProvider.fetchStatus` keeps existing suites green).
```bash
git add convex/payments/providers/types.ts convex/payments/providers/mock.ts convex/payments/providers/xendit.ts tests/convex/xendit-provider.test.ts
git commit -m "feat(payments): PaymentProvider.fetchStatus (Xendit poll + mock no-op)"
```

---

## Task 3: `reconcilePending` action + cron; remove `sweepExpired`

**Files:**
- Modify: `convex/payments/qrisDynamic.ts` (add `listPendingDynamic`, `reconcilePending`; remove `sweepExpired`)
- Modify: `convex/crons.ts`
- Test: `tests/convex/qris-reconcile.test.ts` (new)

- [ ] **Step 1: Add `listPendingDynamic` internalQuery + `reconcilePending` internalAction; remove `sweepExpired`**

In `convex/payments/qrisDynamic.ts`:
- Ensure `internalAction` is imported from `'../_generated/server'` (it currently imports `action, internalMutation, internalQuery, mutation` — add `internalAction`).
- Ensure `resolveProvider` is imported from `'./providers'` (it already is).
- Add:
```ts
/** Reconcile candidates: pending qris_dynamic payments whose order is still pending. Bounded. */
export const listPendingDynamic = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      orderId: v.id('orders'),
      cafeId: v.id('cafes'),
      providerRef: v.string(),
      expiresAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    const payments = await ctx.db
      .query('payments')
      .withIndex('by_method_provider_status', (q) =>
        q.eq('method', 'qris_dynamic').eq('providerStatus', 'pending')
      )
      .take(50);
    const out: Array<{ orderId: Id<'orders'>; cafeId: Id<'cafes'>; providerRef: string; expiresAt: number }> = [];
    for (const p of payments) {
      if (!p.providerRef || p.expiresAt === undefined) continue;
      const order = await ctx.db.get(p.orderId);
      if (order?.paymentStatus === 'pending') {
        out.push({ orderId: p.orderId, cafeId: order.cafeId, providerRef: p.providerRef, expiresAt: p.expiresAt });
      }
    }
    return out;
  },
});

const FAILSAFE_GRACE_MS = 60 * 60 * 1000; // void only when this far past expiry and still unconfirmable

/** Cron: poll Xendit for each pending dynamic order and settle/void/leave (gateway is authority). */
export const reconcilePending = internalAction({
  args: {},
  returns: v.object({ settled: v.number(), voided: v.number(), left: v.number() }),
  handler: async (ctx): Promise<{ settled: number; voided: number; left: number }> => {
    const candidates = await ctx.runQuery(internal.payments.qrisDynamic.listPendingDynamic, {});
    const now = Date.now();
    let settled = 0;
    let voided = 0;
    let left = 0;
    for (const c of candidates) {
      try {
        const config = await ctx.runQuery(internal.payments.qrisDynamic.getQrisConfig, { cafeId: c.cafeId });
        const status = config ? await resolveProvider(config).fetchStatus(c.providerRef) : 'unknown';
        if (status === 'paid') {
          await ctx.runMutation(internal.payments.qrisDynamic.confirmFromWebhook, { providerRef: c.providerRef });
          settled++;
        } else if (status === 'expired' || status === 'failed') {
          await ctx.runMutation(internal.payments.qrisDynamic.voidByRef, { providerRef: c.providerRef });
          voided++;
        } else if (status === 'pending') {
          left++; // trust the gateway; it will transition to expired in time
        } else {
          // 'unknown' (or no config): only void once far past expiry, to bound orphans.
          if (now > c.expiresAt + FAILSAFE_GRACE_MS) {
            await ctx.runMutation(internal.payments.qrisDynamic.voidByRef, { providerRef: c.providerRef });
            voided++;
          } else {
            left++;
          }
        }
      } catch {
        left++; // one cafe's failure must not block the rest
      }
    }
    return { settled, voided, left };
  },
});
```
- DELETE the existing `sweepExpired` export from this file. (Confirm `voidPendingOrder` is still imported/used by `voidByRef`/`cancelQrisDynamicSale`; it is — leave that import.)

- [ ] **Step 2: Update the cron in `convex/crons.ts`**

```ts
import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
crons.cron('nightly forecast', '0 15 * * *', internal.forecast.generateNightly, {});
crons.interval('reconcile qris', { minutes: 5 }, internal.payments.qrisDynamic.reconcilePending, {});

export default crons;
```

- [ ] **Step 3: Write the reconcile tests `tests/convex/qris-reconcile.test.ts`**

Inline-copy `setup()` from `tests/convex/orders.test.ts`. The action calls Xendit twice via `fetch`: `POST /qr_codes` (during the seed `createQrisDynamicSale`) and `GET /qr_codes/{id}` (during reconcile). Use a `fetch` mock that branches on method so seeding always succeeds and the reconcile GET returns the status under test.

```ts
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';
const modules = import.meta.glob('../../convex/**/*.*s');
afterEach(() => vi.restoreAllMocks());

// ---- inline-copy setup() (+ Setup type) from orders.test.ts ----

async function connectXendit(asOwner: Setup['asOwner']) {
  await asOwner.mutation(api.settings.connectQrisProvider, { secretApiKey: 'xnd_test_k', callbackToken: 'cb' });
}

/** fetch mock: POST /qr_codes → a fresh charge (qr_R); GET /qr_codes/qr_R → `getBody`. */
function stubXendit(getBody: unknown, qrId = 'qr_R') {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'POST') {
      return new Response(JSON.stringify({ id: qrId, qr_string: 's', expires_at: '2026-06-10T12:00:00Z' }), { status: 201 });
    }
    return new Response(JSON.stringify(getBody), { status: 200 });
  });
}

async function seedPending(t: ReturnType<typeof convexTest>) {
  const { asOwner, shiftId, cashierId, itemId } = await setup(t);
  await connectXendit(asOwner);
  const r = await asOwner.action(api.payments.qrisDynamic.createQrisDynamicSale, {
    clientId: 'rec-1', shiftId, cashierId, lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }], createdAtClient: 1,
  });
  return r.orderId as Id<'orders'>;
}

describe('reconcilePending', () => {
  it('settles a paid order', async () => {
    const t = convexTest(schema, modules);
    stubXendit({ status: 'ACTIVE', payments: [{ status: 'SUCCEEDED' }] });
    const orderId = await seedPending(t);
    const res = await t.action(internal.payments.qrisDynamic.reconcilePending, {});
    expect(res.settled).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(orderId)))?.paymentStatus).toBe('paid');
  });

  it('voids an expired order', async () => {
    const t = convexTest(schema, modules);
    stubXendit({ status: 'INACTIVE', payments: [] });
    const orderId = await seedPending(t);
    const res = await t.action(internal.payments.qrisDynamic.reconcilePending, {});
    expect(res.voided).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(orderId)))?.paymentStatus).toBe('void');
  });

  it('leaves a still-pending order', async () => {
    const t = convexTest(schema, modules);
    stubXendit({ status: 'ACTIVE', payments: [] });
    const orderId = await seedPending(t);
    const res = await t.action(internal.payments.qrisDynamic.reconcilePending, {});
    expect(res.left).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(orderId)))?.paymentStatus).toBe('pending');
  });

  it('failsafe-voids an unknown status only when far past expiry', async () => {
    const t = convexTest(schema, modules);
    // GET returns 500 → 'unknown'. Seed, then push the payment expiresAt far into the past.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_i, init) =>
      (init?.method ?? 'GET').toUpperCase() === 'POST'
        ? new Response(JSON.stringify({ id: 'qr_R', qr_string: 's', expires_at: '2026-06-10T12:00:00Z' }), { status: 201 })
        : new Response('err', { status: 500 })
    );
    const orderId = await seedPending(t);
    // Not yet past failsafe (fresh expiresAt = seed time + 15m) → left.
    const r1 = await t.action(internal.payments.qrisDynamic.reconcilePending, {});
    expect(r1.left).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(orderId)))?.paymentStatus).toBe('pending');
    // Backdate expiresAt to >1h ago → failsafe void.
    await t.run(async (ctx) => {
      const p = await ctx.db.query('payments').withIndex('by_order', (q) => q.eq('orderId', orderId)).unique();
      if (p) await ctx.db.patch(p._id, { expiresAt: 1 });
    });
    const r2 = await t.action(internal.payments.qrisDynamic.reconcilePending, {});
    expect(r2.voided).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(orderId)))?.paymentStatus).toBe('void');
  });
});
```

Run: `pnpm test tests/convex/qris-reconcile.test.ts` → PASS.

- [ ] **Step 4: Verify no `sweepExpired` references remain**

Run: `rtk proxy git grep -n "sweepExpired" -- convex tests`
Expected: no matches (the cron now points at `reconcilePending`, and the old test for `sweepExpired` in `tests/convex/qris-dynamic.test.ts`, if any, must be removed or repointed). If `qris-dynamic.test.ts` had a `sweepExpired` test, delete that test case (reconcile supersedes it; the failsafe-void is covered in `qris-reconcile.test.ts`).

- [ ] **Step 5: Full gate + commit**

Run `pnpm typecheck` (PASS), `pnpm test` (PASS), `pnpm lingui:compile` (PASS).
```bash
git add convex/payments/qrisDynamic.ts convex/crons.ts convex/_generated tests/convex/qris-reconcile.test.ts tests/convex/qris-dynamic.test.ts
git commit -m "feat(payments): reconcilePending cron replaces blind sweep (Xendit is authority)"
```

---

## Task 4: Manual live-sandbox verification (documented in the PR)

- [ ] Record in the PR description (cannot run in CI — needs the owner's Xendit sandbox keys):
  1. Connect a Xendit sandbox account (Settings → Integrations → QRIS).
  2. Take a dynamic-QRIS sale; pay the QR in the Xendit sandbox simulator, but do NOT let the webhook reach the dev server (or just wait without delivering it).
  3. Within ~5 min the `reconcile qris` cron polls Xendit, sees the succeeded payment, and settles the order to `paid` (receipt available) — confirming reconciliation works when the webhook is missed.
  4. Separately, confirm `GET /qr_codes/{id}`'s real response shape matches the `fetchStatus` mapping; adjust the field path if the sandbox exposes payment success only via `GET /qr_codes/{id}/payments`.

---

## Self-review notes (addressed)

- **Spec coverage:** `fetchStatus` interface + Xendit/Mock impls (T1-2), `listPendingDynamic` + `reconcilePending` with the paid/expired/failed/pending/unknown+failsafe policy (T3), cron swap + `sweepExpired` removal (T3), tests for every branch (T2-3), manual live step (T4). All spec sections mapped.
- **Type consistency:** `ChargeStatus`, `fetchStatus(providerRef)`, `reconcilePending`/`listPendingDynamic`, and the reused `getQrisConfig`/`confirmFromWebhook`/`voidByRef`/`by_method_provider_status` names match across tasks.
- **Idempotency/safety:** outcomes go through the existing pending-guarded mutations; reconcile racing a webhook is safe. Per-item try/catch isolates failures. `'pending'` never voids; only explicit expired/failed or the >1h failsafe does.
- **Mock retained:** `MockProvider.fetchStatus → 'pending'` keeps the existing suites green (reconcile is a no-op under the mock unless `fetch` is stubbed).
