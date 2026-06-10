# Real QRIS Provider — Xendit (Bring-Your-Own-Gateway) Design Spec

**Date:** 2026-06-10
**Branch:** `feat/qris-xendit-byo` (off `main`)
**Predecessor:** Dynamic QRIS against a mock provider (PR #33, merged). See
`2026-06-09-qris-dynamic-payments-design.md`.

## Context

Dynamic QRIS shipped the full architecture (provider adapter, pending order,
webhook confirmation, reactive dialog) against a `MockProvider`. This slice
implements a **real provider — Xendit — in a bring-your-own-gateway (BYO)
model**: each cafe connects **their own** Xendit account, so payments settle
directly to the merchant and kodapos never holds a central gateway account.

This finally exercises the parts of the dynamic-QRIS seam that the mock left
inert: `resolveProvider(integrationConfig)` (currently ignores its arg),
per-cafe credentials, provider-specific webhook verification, real amount
binding, and real QR rendering. It also resolves most of the "real-adapter
follow-ups" recorded in the predecessor spec.

### Decisions (from brainstorming)

1. **Xendit-only BYO** — each cafe connects their own Xendit account; the
   `PaymentProvider` seam keeps multi-provider possible later (YAGNI now).
2. **Per-provider webhook path** — `/webhooks/qris/xendit`; the path identifies
   the provider so the handler knows the body shape + verification scheme.
3. **Create the charge after the order exists** — `buildOrder` inserts the
   pending order with the real total, then Xendit `createCharge` runs, then the
   payment is patched with `providerRef`/`qrString`/`expiresAt`.
4. **Per-cafe credentials, server-only** — Xendit Secret API Key + callback
   token live in the cafe's `qris` integration config; never echoed to the
   client (only a masked hint + `connected` flag are returned).

## Architecture

The dynamic-QRIS architecture is unchanged; this slice swaps the mock for a real
adapter and makes three flows multi-tenant/credential-aware: provider
resolution, charge creation ordering, and webhook verification.

### Module layout

```
convex/payments/providers/
  types.ts        # PaymentProvider interface (revised — see below)
  mock.ts         # MockProvider (kept for the automated test suite + dev)
  xendit.ts       # NEW: XenditProvider (real Xendit QR Codes API)
  index.ts        # resolveProvider(config) → Xendit when creds present, else Mock
convex/payments/qrisDynamic.ts   # createQrisDynamicSale reordered; patchCharge added
convex/http.ts                   # + POST /webhooks/qris/xendit route
convex/settings.ts               # connectQrisProvider mutation; get() masks the secret
src/routes/_pos/settings/integrations.tsx   # capture secretApiKey + callbackToken
src/components/sale/qris-dynamic-payment-dialog.tsx  # render qrString as a real QR
```

## A. Credential model & integration config

The `qris` integration's `config` (already `v.any()` in the schema's
`integrations` array) carries:

```ts
{
  provider: 'xendit',
  secretApiKey: string,     // Xendit sandbox/live Secret API Key (server-only)
  callbackToken: string,    // Xendit account's webhook verification token
  keyHint: string,          // e.g. "xnd_…ab12" — safe to show the owner
}
```

- **New mutation `connectQrisProvider`** (`settings.ts`, owner-scoped):
  validates the key looks like a Xendit secret key, computes `keyHint`, and
  upserts the `qris` integration with `connected: true`. Replaces the generic
  `connectIntegration({key:'qris', config:{apiKey}})` path for QRIS.
- **`settings.get` masks secrets**: the existing `get` returns `integrations`
  to the client. It must strip `secretApiKey`/`callbackToken` from any returned
  config and expose only `{ connected, keyHint }` for the `qris` entry. (Audit
  every client-facing query that returns `integrations`.)
- Credentials are stored plaintext in the Convex DB (only server functions read
  them; never returned to the client). Env-key **encryption-at-rest is a noted
  follow-up**, not in this slice.

## B. `PaymentProvider` interface (revised for multi-tenancy)

The mock's `verifyWebhook({body, signature})` resolved the provider with no cafe
context. BYO requires identifying the cafe **before** verifying, and Xendit
verifies via a static per-account `x-callback-token` header (not a body HMAC).
Revised interface:

```ts
export interface PaymentProvider {
  createCharge(input: { amountIDR: number; referenceId: string }):
    Promise<{ providerRef: string; qrString: string; expiresAt: number }>;

  /** Pure parse of the raw webhook body → our reference, with no verification.
   *  Called by the route BEFORE the cafe is known, to look up the payment. */
  parseReference(body: string): string | null;

  /** Verify the request authentically came from THIS cafe's account, then map
   *  it to our event. The instance carries the cafe's callback token. */
  verifyWebhook(req: { body: string; headers: Headers }):
    Promise<{ providerRef: string; status: 'paid' | 'expired' | 'failed' } | null>;
}
```

`WebhookStatus`/`WEBHOOK_STATUSES` stay as the single source of truth (added in
the predecessor slice).

### `XenditProvider` (`xendit.ts`)

Constructed with `{ secretApiKey, callbackToken }`.

- **`createCharge`**: `POST https://api.xendit.co/qr_codes` with Basic-auth
  (`secretApiKey` as username, empty password), body `{ reference_id, type:
  'DYNAMIC', currency: 'IDR', amount }`. Parse `{ id (qr_xxx), qr_string,
  expires_at }` → `{ providerRef: id, qrString: qr_string, expiresAt:
  Date.parse(expires_at) }`. Non-2xx → throw a clear Indonesian error.
- **`parseReference`**: returns the lookup key we store as `providerRef` —
  `JSON.parse(body).data?.qr_id ?? null` (Xendit's canonical charge id, present
  in the `qr.payment` webhook `data`). `reference_id` (our orderId) is also in
  the payload as a secondary trace, but `by_provider_ref` is keyed on `qr_id`.
- **`verifyWebhook`**: constant-time compare `headers.get('x-callback-token')`
  against the instance's `callbackToken`; on match, map the Xendit event
  (`data.status`: `SUCCEEDED`/`COMPLETED` → `'paid'`; `EXPIRED` → `'expired'`;
  `FAILED` → `'failed'`) → `{ providerRef: data.qr_id, status }`. Token mismatch
  → `null`.

`fetch` + Web Crypto run in the default Convex runtime (no `"use node"`).

## C. Multi-tenant webhook flow (`/webhooks/qris/xendit`)

```
httpAction:
  body = await req.text()
  ref  = XenditProvider.parseReference(body)            // pure, no creds
  if (!ref) → 400
  payment = runQuery(getPaymentByProviderRef, { ref })  // → { orderId, cafeId } | null
  if (!payment) → return 200 ack (unknown; nothing to do)   // or 202 for retry — see note
  config  = runQuery(getQrisConfig, { cafeId: payment.cafeId })  // internal, returns creds
  provider = resolveProvider(config)
  event = await provider.verifyWebhook({ body, headers: req.headers })
  if (!event) → 401                                     // bad/missing token for THIS cafe
  event.status === 'paid'    → runMutation(confirmFromWebhook, { providerRef: event.providerRef })
  event.status in (expired, failed) → runMutation(voidByRef, { providerRef })
  → 200
```

Cafe A's callback token cannot settle cafe B's order: the token is checked
against the cafe that owns the looked-up payment. The existing
`confirmFromWebhook`/`voidByRef` internal mutations (idempotent, pending-guarded)
are reused unchanged.

## D. Reordered `createQrisDynamicSale`

The mock created the charge first with `amountIDR: 0`. Real Xendit needs the
authoritative total and binds the QR to it, so the order is built first:

```
action createQrisDynamicSale(saleArgs):
  config = runQuery(assertQrisConnected)            // throws if not connected; returns config
  { orderId, totalIDR } = runMutation(buildPendingDynamicOrder, saleArgs)  // inserts pending, real total, NO providerRef yet
  try:
    charge = resolveProvider(config).createCharge({ amountIDR: totalIDR, referenceId: orderId })
  catch:
    runMutation(voidPendingOrder, { orderId, providerStatus: 'failed' })   // nothing dangles
    throw
  runMutation(patchCharge, { orderId, providerRef, qrString, expiresAt })
  return { orderId, qrString, expiresAt }
```

- `buildPendingDynamicOrder` no longer takes `providerRef`/`expiresAt` (the
  payment row is inserted without them; they're patched after the charge).
- **New internal mutation `patchCharge`**: sets `payment.providerRef`,
  `payment.expiresAt`, `payment.providerStatus: 'pending'` on the order's
  payment row. (`qrString` stays ephemeral — returned to the client, not
  persisted.)
- `referenceId` passed to Xendit is the `orderId` (stable, unique); the webhook
  `reference_id` round-trips it, and we also store `providerRef = Xendit qr_id`
  for `by_provider_ref` lookup. **Both** the qr_id and reference_id appear in
  Xendit's webhook `data`, so lookup works regardless.

## E. Real QR rendering

The dialog currently prints `qrString` as monospace text. Render it as a
scannable QR using a small client lib (`qrcode.react` preferred — shadcn-free,
tiny, React-native). The post-charge panel shows the QR image + the
"Menunggu pembayaran…" waiting state; the reactive `getById` auto-advance is
unchanged.

## F. Testing

- **`XenditProvider` unit tests** (`tests/convex/xendit-provider.test.ts`):
  mock global `fetch` to return recorded Xendit `/qr_codes` response shapes;
  assert `createCharge` maps fields correctly and throws on non-2xx;
  `parseReference` extracts `reference_id`; `verifyWebhook` accepts a matching
  `x-callback-token` and rejects a wrong/missing one and maps statuses.
- **Multi-tenant webhook tests** (extend `tests/convex/qris-dynamic.test.ts` or
  add `tests/convex/xendit-webhook.test.ts`): two cafes each connect a Xendit
  account with distinct tokens; a webhook signed with cafe A's token settles
  cafe A's order but is rejected (401) for cafe B's `providerRef`.
- **Reordered create flow**: order is pending after build; on a simulated
  Xendit failure (mocked `fetch` throws) the pending order is voided and no
  dangling charge remains.
- **Mock retained**: `resolveProvider` returns `MockProvider` when no Xendit
  creds are present, so the existing dynamic-QRIS suite keeps passing without
  network access. CI never hits live Xendit.
- **Live sandbox round-trip**: verified manually after build with the owner's
  Xendit sandbox keys (connect → create QR → pay in sandbox → webhook → receipt).

## G. Follow-ups: resolved vs. still deferred

**Resolved by this slice:** amount binding (D), charge-before-idempotency &
webhook-before-commit (D — order exists first), per-cafe credentials (A),
provider-specific header verification (B/C), QR image rendering (E),
`resolveProvider` config threading (A/C).

**Still deferred (noted, not in scope):**
- Sweep-vs-late-`paid`-webhook race — mitigated only partially; a proper fix is
  a status-reconciliation poll against Xendit before voiding. Stretch goal.
- Settle-after-shift-close — a dynamic order can be confirmed after its shift
  closed; shift reconciliation with outstanding pending payments is a product
  decision.
- Credential encryption-at-rest (env-key envelope encryption of
  `secretApiKey`/`callbackToken`).
- Disconnecting the QRIS integration while a dynamic order is still pending
  strands that order: a later genuine 'paid' webhook can't be verified (no cafe
  config → falls back to Mock → 401), so the order is eventually swept to void
  even though the customer paid. Proper fix is the deferred
  status-reconciliation poll (and/or blocking disconnect while pending
  qris_dynamic payments exist).

## Conventions

- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`.
- Convex codegen if signatures change: `./node_modules/.bin/convex codegen`
  (interactive auth may be unavailable; the dev watcher / manual `api.d.ts`
  registration keeps types in sync — only modules referenced via `api.`/
  `internal.` need listing).
- New UI strings are Bahasa Indonesia via Lingui; run `pnpm lingui:extract` and
  fill the `en` catalog. Receipt content stays English/off-catalog.
- Secrets (`secretApiKey`, `callbackToken`) are NEVER returned to the client and
  NEVER logged.
- Small conventional commits; PR → review → merge commit (no squash).

## Out of scope

- Midtrans or any non-Xendit adapter (the seam allows it later).
- Refunds, partial payments, split tender.
- Credential encryption-at-rest; status-reconciliation polling; shift-close
  reconciliation (all noted as follow-ups).
