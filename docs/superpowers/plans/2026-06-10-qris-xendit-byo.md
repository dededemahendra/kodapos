# Xendit BYO QRIS Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock QRIS provider with a real **Xendit** adapter in a bring-your-own-gateway model — each cafe connects their own Xendit account, charges bind to the real order total, and a multi-tenant webhook verifies each cafe's own callback token.

**Architecture:** Keep the dynamic-QRIS architecture; swap the mock for a real adapter behind `PaymentProvider`. Three flows become credential-aware: provider resolution (`resolveProvider(config)`), charge creation (build the pending order first → create the Xendit charge with the real total → patch the payment), and webhook verification (`/webhooks/qris/xendit`: look up payment→cafe, then verify with that cafe's token). The `MockProvider` is retained for the automated test suite.

**Tech Stack:** Convex (actions/httpActions/internal mutations+queries, `fetch`, Web Crypto), Xendit QR Codes API, TanStack Start + React, `qrcode.react`, Lingui, Vitest + convex-test (`t.fetch`, mocked `fetch`), Playwright.

**Spec:** `docs/superpowers/specs/2026-06-10-qris-xendit-byo-design.md`

**Branch:** `feat/qris-xendit-byo` (already created off `main`, spec committed).

**Conventions:**
- Run CI locally before any push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`.
- Do NOT run `convex codegen` (interactive auth unavailable). A dev watcher keeps `_generated/api.d.ts` in sync; only modules referenced via `api.`/`internal.` need listing — if typecheck complains a new `internal.*`/`api.*` ref is missing, hand-add the module to `api.d.ts` (import line + `fullApi` entry, alphabetical) following the existing pattern.
- `fetch` + `crypto.subtle` run in the default Convex runtime — NO `"use node"`.
- Secrets (`secretApiKey`, `callbackToken`) are NEVER returned to the client and NEVER logged.
- New UI strings are Bahasa Indonesia via Lingui; run `pnpm lingui:extract` and fill the `en` catalog.
- Small conventional commits per task.

---

## Key interface decisions (read before starting)

- `PaymentProvider` interface = `createCharge` + `verifyWebhook` only. Webhook routes are **per-provider**, so reference extraction for the multi-tenant lookup is a **static** `XenditProvider.parseReference(body)` (no creds needed), not an interface method.
- Revised signatures (Task 1):
  - `createCharge(input: { amountIDR: number; referenceId: string }): Promise<{ providerRef; qrString; expiresAt }>`
  - `verifyWebhook(req: { body: string; headers: Headers }): Promise<WebhookEvent | null>`
- Charge is created **after** the order exists; `providerRef`/`expiresAt` are patched onto the payment by a new `patchCharge` mutation.

---

## Task 1: Revise the provider interface; update MockProvider + its route

**Files:**
- Modify: `convex/payments/providers/types.ts`
- Modify: `convex/payments/providers/mock.ts`
- Modify: `convex/http.ts` (the existing `/webhooks/qris` mock route)
- Modify: `tests/convex/mock-provider.test.ts`

- [ ] **Step 1: Revise `types.ts`**

Keep `WEBHOOK_STATUSES`/`WebhookStatus`/`WebhookEvent`. Replace the `PaymentProvider` interface:

```ts
export const WEBHOOK_STATUSES = ['paid', 'expired', 'failed'] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];
export type WebhookEvent = { providerRef: string; status: WebhookStatus };

export interface PaymentProvider {
  createCharge(input: { amountIDR: number; referenceId: string }):
    Promise<{ providerRef: string; qrString: string; expiresAt: number }>;
  verifyWebhook(req: { body: string; headers: Headers }): Promise<WebhookEvent | null>;
}
```

- [ ] **Step 2: Update `mock.ts` to the new signatures**

`createCharge` now takes `referenceId`; `verifyWebhook` reads the signature from headers. Keep `signMockBody` + the constant-time compare.

```ts
import type { PaymentProvider, WebhookEvent } from './types';
import { WEBHOOK_STATUSES } from './types';

export async function signMockBody(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export class MockProvider implements PaymentProvider {
  constructor(private readonly secret: string) {}

  async createCharge(input: { amountIDR: number; referenceId: string }) {
    const providerRef = `mock_${input.referenceId}`;
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const qrString = `MOCKQR|${providerRef}|${input.amountIDR}`;
    return { providerRef, qrString, expiresAt };
  }

  async verifyWebhook(req: { body: string; headers: Headers }): Promise<WebhookEvent | null> {
    const signature = req.headers.get('x-signature');
    if (!signature) return null;
    const expected = await signMockBody(this.secret, req.body);
    if (!timingSafeEqual(signature, expected)) return null;
    try {
      const parsed = JSON.parse(req.body) as { providerRef?: string; status?: string };
      if (!parsed.providerRef || !(WEBHOOK_STATUSES as readonly string[]).includes(parsed.status ?? '')) return null;
      return { providerRef: parsed.providerRef, status: parsed.status as WebhookEvent['status'] };
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 3: Update the mock route in `http.ts`**

The existing `/webhooks/qris` route currently calls `resolveProvider().verifyWebhook({ body, signature })`. Change it to construct the mock directly and pass headers:

```ts
import { MockProvider } from './payments/providers/mock';
import { qrisWebhookSecret } from './payments/providers';
// ...
http.route({
  path: '/webhooks/qris',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    const event = await new MockProvider(qrisWebhookSecret()).verifyWebhook({ body, headers: req.headers });
    if (!event) return new Response('invalid signature', { status: 401 });
    if (event.status === 'paid') {
      const r = await ctx.runMutation(internal.payments.qrisDynamic.confirmFromWebhook, { providerRef: event.providerRef });
      return new Response(r, { status: 200 });
    }
    await ctx.runMutation(internal.payments.qrisDynamic.voidByRef, { providerRef: event.providerRef });
    return new Response('ok', { status: 200 });
  }),
});
```

- [ ] **Step 4: Update `tests/convex/mock-provider.test.ts`**

`createCharge` input is now `{ amountIDR, referenceId }`; `verifyWebhook` takes `{ body, headers }`:

```ts
import { describe, expect, it } from 'vitest';
import { MockProvider, signMockBody } from '../../convex/payments/providers/mock';

const SECRET = 'test-secret';

describe('MockProvider', () => {
  it('createCharge returns providerRef/qrString/future expiry', async () => {
    const p = new MockProvider(SECRET);
    const r = await p.createCharge({ amountIDR: 36000, referenceId: 'ord-1' });
    expect(r.providerRef).toBe('mock_ord-1');
    expect(r.expiresAt).toBeGreaterThan(Date.now());
  });

  it('verifyWebhook accepts a valid x-signature and rejects a bad one', async () => {
    const p = new MockProvider(SECRET);
    const body = JSON.stringify({ providerRef: 'mock_abc', status: 'paid' });
    const ok = new Headers({ 'x-signature': await signMockBody(SECRET, body) });
    const bad = new Headers({ 'x-signature': 'wrong' });
    await expect(p.verifyWebhook({ body, headers: ok })).resolves.toEqual({ providerRef: 'mock_abc', status: 'paid' });
    await expect(p.verifyWebhook({ body, headers: bad })).resolves.toBeNull();
  });
});
```

- [ ] **Step 5: Verify + commit**

Run `pnpm typecheck` (the qris-dynamic webhook test in `tests/convex/qris-dynamic.test.ts` still passes the `x-signature` header, so it stays green) and `pnpm test tests/convex/mock-provider.test.ts tests/convex/qris-dynamic.test.ts`.
Expected: PASS.
```bash
git add convex/payments/providers/types.ts convex/payments/providers/mock.ts convex/http.ts tests/convex/mock-provider.test.ts
git commit -m "refactor(payments): provider interface uses referenceId + headers (createCharge/verifyWebhook)"
```

---

## Task 2: Reorder the create flow — build order first, patch charge after

**Files:**
- Modify: `convex/lib/sale.ts` (`PaymentInput`, `buildOrder` payment insert)
- Modify: `convex/payments/qrisDynamic.ts` (`buildPendingDynamicOrder`, `assertQrisConnected`, `createQrisDynamicSale`; new `patchCharge`)
- Modify: `tests/convex/qris-dynamic.test.ts`

- [ ] **Step 1: `PaymentInput` for qris_dynamic carries no charge fields**

In `convex/lib/sale.ts`, change the union member and the payment insert. Replace:
```ts
  | { method: 'qris_dynamic'; providerRef: string; expiresAt: number };
```
with:
```ts
  | { method: 'qris_dynamic' };
```
And in `buildOrder`'s `payments` insert, the qris_dynamic spread becomes just the pending marker (providerRef/expiresAt are patched later):
```ts
    ...(payment.method === 'qris_dynamic' ? { providerStatus: 'pending' } : {}),
```

- [ ] **Step 2: `buildPendingDynamicOrder` drops the charge args; `assertQrisConnected` returns config; add `patchCharge`**

In `convex/payments/qrisDynamic.ts`:

```ts
export const assertQrisConnected = internalQuery({
  args: {},
  returns: v.any(), // the qris integration's config (server-only; contains creds)
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await ctx.db.query('cafeSettings').withIndex('by_cafe', (q) => q.eq('cafeId', cafeId)).first();
    const qris = (row?.integrations ?? []).find((i) => i.key === 'qris' && i.connected);
    if (!qris) throw new Error('Integrasi QRIS dinamis belum terhubung.');
    return qris.config ?? {};
  },
});

export const buildPendingDynamicOrder = internalMutation({
  args: saleArgs,
  returns: v.object({ orderId: v.id('orders'), totalIDR: v.number(), changeIDR: v.number() }),
  handler: async (ctx, args) => buildOrder(ctx, args, { method: 'qris_dynamic' }),
});

export const patchCharge = internalMutation({
  args: { orderId: v.id('orders'), providerRef: v.string(), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { orderId, providerRef, expiresAt }) => {
    const payment = await ctx.db.query('payments').withIndex('by_order', (q) => q.eq('orderId', orderId)).unique();
    if (payment) await ctx.db.patch(payment._id, { providerRef, expiresAt, providerStatus: 'pending' });
    return null;
  },
});
```

- [ ] **Step 3: Reorder `createQrisDynamicSale`**

```ts
export const createQrisDynamicSale = action({
  args: saleArgs,
  returns: v.object({ orderId: v.id('orders'), qrString: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args): Promise<{ orderId: Id<'orders'>; qrString: string; expiresAt: number }> => {
    const config = await ctx.runQuery(internal.payments.qrisDynamic.assertQrisConnected, {});
    const { orderId, totalIDR } = await ctx.runMutation(internal.payments.qrisDynamic.buildPendingDynamicOrder, args);
    let charge: { providerRef: string; qrString: string; expiresAt: number };
    try {
      charge = await resolveProvider(config).createCharge({ amountIDR: totalIDR, referenceId: orderId });
    } catch (err) {
      await ctx.runMutation(internal.payments.qrisDynamic.voidPendingOrderByRef, { orderId, providerStatus: 'failed' });
      throw err;
    }
    await ctx.runMutation(internal.payments.qrisDynamic.patchCharge, { orderId, providerRef: charge.providerRef, expiresAt: charge.expiresAt });
    return { orderId, qrString: charge.qrString, expiresAt: charge.expiresAt };
  },
});
```

Add a tiny internal mutation that voids by orderId (the existing `voidPendingOrder` helper in `lib/sale.ts` takes orderId — wrap it):
```ts
export const voidPendingOrderByRef = internalMutation({
  args: { orderId: v.id('orders'), providerStatus: v.string() },
  returns: v.null(),
  handler: async (ctx, { orderId, providerStatus }) => { await voidPendingOrder(ctx, orderId, providerStatus); return null; },
});
```
Add imports: `voidPendingOrder` from `'../lib/sale'`. `resolveProvider` is already imported.

- [ ] **Step 4: Update `tests/convex/qris-dynamic.test.ts`**

The create flow no longer passes providerRef into build, and providerRef is now `mock_<orderId>` (patched after). Existing tests read `payment.providerRef` from the row, so the confirm/webhook tests keep working. Verify the "creates a pending order with no side effects" test still asserts `paymentStatus === 'pending'` and zero inventory — unchanged. If any test referenced `mock_<clientId>` literally, change it to read the actual `payment.providerRef`. Run:
```
pnpm test tests/convex/qris-dynamic.test.ts
```
Expected: PASS (adjust only literal-ref assertions if present).

- [ ] **Step 5: Codegen-sync check, typecheck, commit**

```bash
pnpm typecheck   # if internal.payments.qrisDynamic.patchCharge/voidPendingOrderByRef unresolved, add to api.d.ts per conventions
git add convex/lib/sale.ts convex/payments/qrisDynamic.ts convex/_generated tests/convex/qris-dynamic.test.ts
git commit -m "refactor(payments): create dynamic charge after the order; patchCharge sets providerRef"
```

---

## Task 3: XenditProvider

**Files:**
- Create: `convex/payments/providers/xendit.ts`
- Test: `tests/convex/xendit-provider.test.ts`

- [ ] **Step 1: Write the failing test (mocked `fetch`)**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { XenditProvider } from '../../convex/payments/providers/xendit';

afterEach(() => vi.restoreAllMocks());

const CFG = { secretApiKey: 'xnd_test_key', callbackToken: 'cbtoken123' };

describe('XenditProvider', () => {
  it('createCharge posts to /qr_codes and maps the response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'qr_abc', qr_string: '00020101...', expires_at: '2026-06-10T12:00:00Z' }), { status: 201 })
    );
    const p = new XenditProvider(CFG);
    const r = await p.createCharge({ amountIDR: 36000, referenceId: 'ord-1' });
    expect(r.providerRef).toBe('qr_abc');
    expect(r.qrString).toBe('00020101...');
    expect(r.expiresAt).toBe(Date.parse('2026-06-10T12:00:00Z'));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/qr_codes');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toContain('Basic ');
  });

  it('createCharge throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"message":"nope"}', { status: 400 }));
    await expect(new XenditProvider(CFG).createCharge({ amountIDR: 1000, referenceId: 'x' })).rejects.toThrow(/QRIS/i);
  });

  it('parseReference extracts data.qr_id', () => {
    const body = JSON.stringify({ event: 'qr.payment', data: { qr_id: 'qr_abc', reference_id: 'ord-1', status: 'SUCCEEDED' } });
    expect(XenditProvider.parseReference(body)).toBe('qr_abc');
    expect(XenditProvider.parseReference('not json')).toBeNull();
  });

  it('verifyWebhook checks x-callback-token and maps status', async () => {
    const p = new XenditProvider(CFG);
    const body = JSON.stringify({ data: { qr_id: 'qr_abc', status: 'SUCCEEDED' } });
    const ok = new Headers({ 'x-callback-token': 'cbtoken123' });
    const bad = new Headers({ 'x-callback-token': 'wrong' });
    await expect(p.verifyWebhook({ body, headers: ok })).resolves.toEqual({ providerRef: 'qr_abc', status: 'paid' });
    await expect(p.verifyWebhook({ body, headers: bad })).resolves.toBeNull();
    await expect(p.verifyWebhook({ body, headers: new Headers() })).resolves.toBeNull();
  });
});
```

Run: `pnpm test tests/convex/xendit-provider.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement `convex/payments/providers/xendit.ts`**

```ts
import type { PaymentProvider, WebhookEvent } from './types';

export type XenditConfig = { secretApiKey: string; callbackToken: string };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const XENDIT_QR_URL = 'https://api.xendit.co/qr_codes';

export class XenditProvider implements PaymentProvider {
  constructor(private readonly config: XenditConfig) {}

  async createCharge(input: { amountIDR: number; referenceId: string }) {
    const auth = btoa(`${this.config.secretApiKey}:`);
    const res = await fetch(XENDIT_QR_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', 'api-version': '2022-07-31' },
      body: JSON.stringify({ reference_id: input.referenceId, type: 'DYNAMIC', currency: 'IDR', amount: input.amountIDR }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gagal membuat QRIS di Xendit (${res.status}). ${detail}`.trim());
    }
    const json = (await res.json()) as { id: string; qr_string: string; expires_at: string };
    return { providerRef: json.id, qrString: json.qr_string, expiresAt: Date.parse(json.expires_at) };
  }

  /** Pure parse of the lookup key (qr_id); no creds needed. Used before the cafe is known. */
  static parseReference(body: string): string | null {
    try {
      const data = (JSON.parse(body) as { data?: { qr_id?: string } }).data;
      return data?.qr_id ?? null;
    } catch {
      return null;
    }
  }

  async verifyWebhook(req: { body: string; headers: Headers }): Promise<WebhookEvent | null> {
    const token = req.headers.get('x-callback-token');
    if (!token || !timingSafeEqual(token, this.config.callbackToken)) return null;
    try {
      const data = (JSON.parse(req.body) as { data?: { qr_id?: string; status?: string } }).data;
      if (!data?.qr_id || !data.status) return null;
      const map: Record<string, WebhookEvent['status']> = {
        SUCCEEDED: 'paid', COMPLETED: 'paid', EXPIRED: 'expired', FAILED: 'failed', INACTIVE: 'expired',
      };
      const status = map[data.status];
      if (!status) return null;
      return { providerRef: data.qr_id, status };
    } catch {
      return null;
    }
  }
}
```

Run: `pnpm test tests/convex/xendit-provider.test.ts` → PASS.

- [ ] **Step 3: Commit**

```bash
git add convex/payments/providers/xendit.ts tests/convex/xendit-provider.test.ts
git commit -m "feat(payments): XenditProvider (QR Codes API + callback-token verify)"
```

---

## Task 4: resolveProvider selects Xendit from cafe config

**Files:**
- Modify: `convex/payments/providers/index.ts`
- Test: `tests/convex/xendit-provider.test.ts` (extend)

- [ ] **Step 1: Update `resolveProvider`**

```ts
import type { PaymentProvider } from './types';
import { MockProvider } from './mock';
import { XenditProvider } from './xendit';

export function qrisWebhookSecret(): string {
  return process.env.QRIS_WEBHOOK_SECRET ?? 'dev-qris-secret';
}

/**
 * Select the QRIS provider for a cafe. A connected Xendit config (secretApiKey +
 * callbackToken) yields a XenditProvider; otherwise MockProvider (dev/test).
 */
export function resolveProvider(config?: unknown): PaymentProvider {
  const c = config as { provider?: string; secretApiKey?: string; callbackToken?: string } | undefined;
  if (c?.provider === 'xendit' && c.secretApiKey && c.callbackToken) {
    return new XenditProvider({ secretApiKey: c.secretApiKey, callbackToken: c.callbackToken });
  }
  return new MockProvider(qrisWebhookSecret());
}
```

- [ ] **Step 2: Add a resolver test**

Append to `tests/convex/xendit-provider.test.ts`:
```ts
import { resolveProvider } from '../../convex/payments/providers';
import { MockProvider } from '../../convex/payments/providers/mock';

describe('resolveProvider', () => {
  it('returns XenditProvider for a complete xendit config, else MockProvider', () => {
    expect(resolveProvider({ provider: 'xendit', secretApiKey: 'k', callbackToken: 't' })).toBeInstanceOf(XenditProvider);
    expect(resolveProvider({ provider: 'xendit', secretApiKey: 'k' })).toBeInstanceOf(MockProvider); // incomplete
    expect(resolveProvider(undefined)).toBeInstanceOf(MockProvider);
  });
});
```

Run: `pnpm test tests/convex/xendit-provider.test.ts` → PASS. `pnpm typecheck`.

- [ ] **Step 3: Commit**

```bash
git add convex/payments/providers/index.ts tests/convex/xendit-provider.test.ts
git commit -m "feat(payments): resolveProvider selects Xendit from cafe config"
```

---

## Task 5: connectQrisProvider mutation + secret masking + internal config/lookup queries

**Files:**
- Modify: `convex/settings.ts`
- Modify: `convex/payments/qrisDynamic.ts` (add `getPaymentCafeByRef`, `getQrisConfig` internal queries)
- Test: `tests/convex/settings.test.ts`

- [ ] **Step 1: Add `connectQrisProvider` + mask secrets in `settings.get`**

In `convex/settings.ts`:

```ts
export const connectQrisProvider = mutation({
  args: { secretApiKey: v.string(), callbackToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { secretApiKey, callbackToken }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const key = secretApiKey.trim();
    const token = callbackToken.trim();
    if (!key.startsWith('xnd_')) throw new Error('Secret API Key Xendit tidak valid.');
    if (!token) throw new Error('Callback token wajib diisi.');
    const id = await getOrCreateSettingsId(ctx, cafeId);
    const row = await ctx.db.get(id);
    const keyHint = `${key.slice(0, 8)}…${key.slice(-4)}`;
    const existing = (row?.integrations ?? []).filter((i) => i.key !== 'qris');
    existing.push({
      key: 'qris', connected: true, connectedAt: Date.now(),
      config: { provider: 'xendit', secretApiKey: key, callbackToken: token, keyHint },
    });
    await ctx.db.patch(id, { integrations: existing, updatedAt: Date.now() });
    return null;
  },
});
```

In `settings.get`, replace the raw `integrations` passthrough with a masked map (strip secrets from the qris entry):
```ts
    const integrations = (row?.integrations ?? DEFAULT_SETTINGS.integrations).map((i) =>
      i.key === 'qris'
        ? { key: i.key, connected: i.connected, ...(i.connectedAt !== undefined ? { connectedAt: i.connectedAt } : {}),
            config: { provider: 'xendit', keyHint: (i.config as { keyHint?: string } | undefined)?.keyHint ?? '' } }
        : i
    );
    // ...return { ..., integrations, ... }
```
Confirm `settingsValidator.integrations` (the `integrationsValidator`) still validates this shape — `config` is `v.optional(v.any())`, so the masked `{ provider, keyHint }` validates. Grep for any OTHER client-facing query returning `integrations` and apply the same mask (there should be none besides `get`).

- [ ] **Step 2: Add internal lookup + config queries in `qrisDynamic.ts`**

```ts
export const getPaymentCafeByRef = internalQuery({
  args: { providerRef: v.string() },
  returns: v.union(v.object({ orderId: v.id('orders'), cafeId: v.id('cafes') }), v.null()),
  handler: async (ctx, { providerRef }) => {
    const p = await ctx.db.query('payments').withIndex('by_provider_ref', (q) => q.eq('providerRef', providerRef)).unique();
    return p ? { orderId: p.orderId, cafeId: p.cafeId } : null;
  },
});

export const getQrisConfig = internalQuery({
  args: { cafeId: v.id('cafes') },
  returns: v.any(),
  handler: async (ctx, { cafeId }) => {
    const row = await ctx.db.query('cafeSettings').withIndex('by_cafe', (q) => q.eq('cafeId', cafeId)).first();
    const qris = (row?.integrations ?? []).find((i) => i.key === 'qris' && i.connected);
    return qris?.config ?? null;
  },
});
```

- [ ] **Step 3: Tests**

In `tests/convex/settings.test.ts` (use the existing owner setup pattern there):
```ts
it('connectQrisProvider stores creds; settings.get masks the secret', async () => {
  const t = convexTest(schema, modules);
  const { asOwner } = await setupOwner(t); // reuse the file's owner-setup helper
  await asOwner.mutation(api.settings.connectQrisProvider, { secretApiKey: 'xnd_test_abc12345', callbackToken: 'tok_secret' });
  const s = await asOwner.query(api.settings.get, {});
  const qris = s.integrations.find((i) => i.key === 'qris');
  expect(qris?.connected).toBe(true);
  expect((qris?.config as Record<string, unknown>).keyHint).toContain('xnd_test');
  expect(JSON.stringify(s)).not.toContain('tok_secret');       // callbackToken never leaks
  expect(JSON.stringify(s)).not.toContain('xnd_test_abc12345'); // full secret never leaks
});

it('connectQrisProvider rejects a non-Xendit key', async () => {
  const t = convexTest(schema, modules);
  const { asOwner } = await setupOwner(t);
  await expect(asOwner.mutation(api.settings.connectQrisProvider, { secretApiKey: 'bogus', callbackToken: 't' }))
    .rejects.toThrow(/tidak valid/i);
});
```
(If `settings.test.ts` lacks a reusable owner setup, inline-copy the owner-creation steps from `orders.test.ts` `setup`.)

Run `pnpm test tests/convex/settings.test.ts` → PASS. `pnpm typecheck`.

- [ ] **Step 4: Commit**

```bash
git add convex/settings.ts convex/payments/qrisDynamic.ts convex/_generated tests/convex/settings.test.ts
git commit -m "feat(settings): connectQrisProvider + mask secrets; internal config/ref lookups"
```

---

## Task 6: Multi-tenant Xendit webhook route

**Files:**
- Modify: `convex/http.ts`
- Test: `tests/convex/xendit-webhook.test.ts` (new)

- [ ] **Step 1: Add the `/webhooks/qris/xendit` route**

```ts
import { XenditProvider } from './payments/providers/xendit';
import { resolveProvider } from './payments/providers';
// ...
http.route({
  path: '/webhooks/qris/xendit',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    const ref = XenditProvider.parseReference(body);
    if (!ref) return new Response('bad request', { status: 400 });
    const payment = await ctx.runQuery(internal.payments.qrisDynamic.getPaymentCafeByRef, { providerRef: ref });
    if (!payment) return new Response('ok', { status: 200 }); // unknown ref — ack, nothing to do
    const config = await ctx.runQuery(internal.payments.qrisDynamic.getQrisConfig, { cafeId: payment.cafeId });
    const event = await resolveProvider(config).verifyWebhook({ body, headers: req.headers });
    if (!event) return new Response('invalid token', { status: 401 });
    if (event.status === 'paid') {
      await ctx.runMutation(internal.payments.qrisDynamic.confirmFromWebhook, { providerRef: event.providerRef });
    } else {
      await ctx.runMutation(internal.payments.qrisDynamic.voidByRef, { providerRef: event.providerRef });
    }
    return new Response('ok', { status: 200 });
  }),
});
```

- [ ] **Step 2: Multi-tenant webhook test (new file `tests/convex/xendit-webhook.test.ts`)**

Inline-copy `setup()` from `orders.test.ts`. Two cafes connect Xendit accounts with distinct callback tokens; a paid webhook signed with cafe A's token settles A's order but is 401 for a providerRef that belongs to A when sent with the wrong token. Because the action calls real Xendit `createCharge`, stub `globalThis.fetch` to return a fake `{ id, qr_string, expires_at }` so the order gets a `providerRef`.

```ts
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
const modules = import.meta.glob('../../convex/**/*.*s');
afterEach(() => vi.restoreAllMocks());
// inline-copy setup()

async function connectXendit(asOwner: any, token: string) {
  await asOwner.mutation(api.settings.connectQrisProvider, { secretApiKey: 'xnd_test_k', callbackToken: token });
}

describe('POST /webhooks/qris/xendit', () => {
  it('settles with the cafe’s own token and rejects a wrong token', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await connectXendit(asOwner, 'tokenA');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'qr_A', qr_string: 's', expires_at: '2026-06-10T12:00:00Z' }), { status: 201 })
    );
    const r = await asOwner.action(api.payments.qrisDynamic.createQrisDynamicSale, {
      clientId: 'wh-A', shiftId, cashierId, lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }], createdAtClient: 1,
    });
    const body = JSON.stringify({ event: 'qr.payment', data: { qr_id: 'qr_A', reference_id: r.orderId, status: 'SUCCEEDED' } });

    const bad = await t.fetch('/webhooks/qris/xendit', { method: 'POST', body, headers: { 'x-callback-token': 'WRONG' } });
    expect(bad.status).toBe(401);
    const order1 = await t.run((ctx) => ctx.db.get(r.orderId));
    expect(order1?.paymentStatus).toBe('pending');

    const ok = await t.fetch('/webhooks/qris/xendit', { method: 'POST', body, headers: { 'x-callback-token': 'tokenA' } });
    expect(ok.status).toBe(200);
    const order2 = await t.run((ctx) => ctx.db.get(r.orderId));
    expect(order2?.paymentStatus).toBe('paid');
  });

  it('acks 200 for an unknown providerRef', async () => {
    const t = convexTest(schema, modules);
    await setup(t);
    const body = JSON.stringify({ data: { qr_id: 'qr_nope', status: 'SUCCEEDED' } });
    const res = await t.fetch('/webhooks/qris/xendit', { method: 'POST', body, headers: { 'x-callback-token': 'x' } });
    expect(res.status).toBe(200);
  });
});
```

Run: `pnpm test tests/convex/xendit-webhook.test.ts` → PASS. `pnpm typecheck`.

- [ ] **Step 3: Commit**

```bash
git add convex/http.ts tests/convex/xendit-webhook.test.ts
git commit -m "feat(payments): multi-tenant /webhooks/qris/xendit (lookup then verify)"
```

---

## Task 7: Integrations UI — connect a Xendit account

**Files:**
- Modify: `src/routes/_pos/settings/integrations.tsx`

- [ ] **Step 1: QRIS-specific connect form**

Read the current `integrations.tsx` connect dialog (it captures a single `apiKey` and calls `connectIntegration`). For the `qris` entry only, show two fields — **Secret API Key** and **Callback Token** — and call `api.settings.connectQrisProvider({ secretApiKey, callbackToken })` instead. Keep the generic flow for the other (coming-soon) integrations. After connect, the entry shows connected + the `keyHint` from `s.integrations` (the secret is never present client-side). Disconnect uses the existing `disconnectIntegration({ key: 'qris' })`.

Concretely: add `const connectQris = useMutation(api.settings.connectQrisProvider);` and, in the connect dialog, branch on `dialogKey === 'qris'` to render the two inputs (state `xnditKey`, `xnditToken`) and submit via `connectQris`. Use `<Trans>`/`t\`...\`` for labels: "Secret API Key", "Callback Token", "Hubungkan", plus a hint "Tempel kunci dari dasbor Xendit Anda." and the note that the keys are stored aman (server-only).

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add src/routes/_pos/settings/integrations.tsx
git commit -m "feat(settings): connect a Xendit account (Secret API Key + Callback Token)"
```

---

## Task 8: Render the QR as a scannable code

**Files:**
- Modify: `package.json` (add `qrcode.react`)
- Modify: `src/components/sale/qris-dynamic-payment-dialog.tsx`

- [ ] **Step 1: Add the dependency**

Run: `pnpm add qrcode.react`
Expected: adds `qrcode.react` to dependencies; lockfile updated.

- [ ] **Step 2: Render `qrString` as a QR**

In `qris-dynamic-payment-dialog.tsx`, replace the raw-string display:
```tsx
<div className="font-mono text-xs break-all">{qrString}</div>
```
with a real QR:
```tsx
import { QRCodeSVG } from 'qrcode.react';
// ...
{qrString ? <QRCodeSVG value={qrString} size={224} marginSize={2} /> : null}
```
Keep the "Menunggu pembayaran…" text + spinner and the reactive auto-advance unchanged.

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add package.json pnpm-lock.yaml src/components/sale/qris-dynamic-payment-dialog.tsx
git commit -m "feat(sale): render dynamic-QRIS as a scannable QR code"
```

---

## Task 9: i18n, full verification, manual live-sandbox steps

**Files:**
- Modify: `src/locales/en/messages.po`, `src/locales/id/messages.po`

- [ ] **Step 1: i18n**

Run `pnpm lingui:extract`. Fill the `en` catalog for new strings (e.g. "Secret API Key" → "Secret API Key", "Callback Token" → "Callback Token", "Tempel kunci dari dasbor Xendit Anda." → "Paste the keys from your Xendit dashboard.", "Secret API Key Xendit tidak valid." → "Invalid Xendit Secret API Key.", "Callback token wajib diisi." → "Callback token is required.", "Gagal membuat QRIS di Xendit." → "Failed to create the QRIS charge on Xendit."). Provide natural English for any other surfaced msgid. Then `pnpm lingui:compile`. Verify `pnpm lingui:extract` reports 0 missing for `en`.

- [ ] **Step 2: Full local CI gate**

```bash
pnpm typecheck && pnpm test && pnpm lingui:compile
```
Expected: all PASS.

- [ ] **Step 3: Commit i18n**

```bash
git add src/locales/en/messages.po src/locales/id/messages.po
git commit -m "i18n(payments): translate Xendit connect strings"
```

- [ ] **Step 4: Manual live-sandbox verification (documented, run by the owner)**

Record these steps in the PR description (cannot run in CI — needs live Xendit + the owner's sandbox keys):
1. In the Convex dashboard, leave `QRIS_WEBHOOK_SECRET` unset (mock path unused by real cafes).
2. In the app, Settings → Integrations → QRIS: paste a Xendit **sandbox** Secret API Key + Callback Token.
3. In the Xendit sandbox dashboard, set the QR `qr.payment` callback URL to `<convex-site-url>/webhooks/qris/xendit`.
4. Take a QRIS-dynamic sale, scan/pay the QR in the Xendit sandbox simulator, and confirm the dialog auto-advances to the receipt and the order is `paid`.

---

## Self-review notes (addressed)

- **Spec coverage:** credential model + masking (T5), revised interface (T1), XenditProvider (T3), resolveProvider config (T4), multi-tenant webhook (T6), reordered create/amount-binding (T2), QR rendering (T8), tests (T1,3,4,5,6), i18n (T9). All spec sections mapped.
- **Type consistency:** `createCharge({ amountIDR, referenceId })`, `verifyWebhook({ body, headers })`, `XenditProvider.parseReference`, `PaymentInput` qris_dynamic `{ method }`, `patchCharge`/`voidPendingOrderByRef`/`getPaymentCafeByRef`/`getQrisConfig`/`connectQrisProvider` names are used consistently across tasks.
- **Mock retained:** `resolveProvider(undefined)` → Mock keeps the existing dynamic-QRIS + mock-provider suites green without network; CI never calls live Xendit.
- **Known deferrals (carried from the spec):** sweep-vs-late-webhook reconciliation poll, settle-after-shift-close, credential encryption-at-rest.
