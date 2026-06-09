# Dynamic QRIS Payments — Design Spec

**Date:** 2026-06-09
**Branch:** `feat/qris-dynamic-payments` (off `main`)
**Predecessor:** Static QRIS (PR #32, merged). See
`2026-06-08-qris-static-payments-design.md`.

## Context

Static QRIS lets a cashier show a single pre-printed merchant QR and manually
confirm payment. Dynamic QRIS generates a **per-transaction** QR through a
payment gateway (Midtrans/Xendit in production) and confirms payment
**out-of-band** via a provider webhook — no manual "Sudah dibayar" tap. This is
the natural next payment slice and the trigger for the architectural refactors
deferred from PR #32 (build/settle split, frontend method registry).

This slice ships the **full architecture against a mock provider**: every layer
(adapter interface, pending order, webhook confirmation, reactive dialog) is real
and tested end-to-end, but the gateway HTTP calls are fulfilled by a
`MockProvider`. A real Midtrans/Xendit adapter slots in later behind the same
interface with no changes to the orchestration, UI, or data model.

### Decisions (from brainstorming)

1. **Provider-agnostic + mock** — adapter interface now, mock implementation;
   real provider later.
2. **Webhook + reactive auto-advance** — a Convex `httpAction` webhook marks the
   order paid; the dialog watches the order via a reactive query and
   auto-advances to the receipt.
3. **Settle on payment confirmation** — inventory deduction and loyalty
   (earn/redeem, visit/spend) run when the webhook confirms `paid`, NOT at QR
   creation. A never-paid order consumes no stock and awards no points.
4. **Pending order in DB** — the unpaid sale exists as an `orders` row with
   `paymentStatus: 'pending'`; the webhook flips it to `paid` and settles.

## Architecture (Approach A)

A thin **provider adapter** layer isolates gateway specifics; the orchestration,
data model, and UI are provider-neutral. The synchronous "insert a paid order"
mutation is split into **build** (validate + insert order) and **settle**
(side effects + mark paid) so cash/static can settle inline while dynamic settles
in the webhook.

### Module layout

```
convex/payments/
  providers/
    types.ts        # PaymentProvider interface + shared types
    mock.ts         # MockProvider: fabricate QR, HMAC sign/verify, dev simulate
    index.ts        # resolveProvider(integrationConfig) → PaymentProvider
  qrisDynamic.ts    # createQrisDynamicSale (action), confirmFromWebhook,
                    #   cancelQrisDynamicSale, sweepExpired (internal)
convex/orders/
  core.ts           # buildOrder() + settleSale() extracted from buildAndInsertSale
convex/http.ts      # + POST /webhooks/qris route (httpAction)
convex/crons.ts     # + sweepExpired cron (backstop for abandoned pending orders)
src/components/sale/
  payment-methods.tsx           # method registry: {method, label, isReady, Dialog}
  qris-dynamic-payment-dialog.tsx
```

## Data model

The schema already anticipates this slice: `orders.paymentStatus` is
`pending|paid|void`, `orders.paymentMethod` and `payments.method` include
`qris_dynamic`, and `payments` has optional `providerRef`/`providerStatus`/
`confirmedAt`. Deltas:

- `payments`: add `expiresAt: v.optional(v.number())` (QR expiry — drives the
  dialog countdown and the cron sweep).
- `payments`: add index `by_provider_ref: ['providerRef']` for webhook lookup.
- The QR payload is **ephemeral**: `createQrisDynamicSale` returns
  `{ orderId, qrString, expiresAt }` to the client; the QR image/string is not
  persisted (only `providerRef` + `expiresAt` are).

## Provider adapter

```ts
// convex/payments/providers/types.ts
export interface PaymentProvider {
  createCharge(input: {
    amountIDR: number;
    ref: string;          // our order clientId, passed to the gateway
    idempotencyKey: string;
  }): Promise<{ providerRef: string; qrString: string; expiresAt: number }>;

  // Returns the parsed event, or null when the signature is invalid.
  verifyWebhook(req: { body: string; signature: string | null }):
    | { providerRef: string; status: 'paid' | 'expired' | 'failed' }
    | null;
}
```

- **`MockProvider`** (`mock.ts`): `createCharge` returns a fabricated
  `providerRef` and a QR string encoding the ref + amount, with
  `expiresAt = now + 15min`. `verifyWebhook` checks an HMAC over the raw body
  using a shared secret (config/env). A dev-only `simulateWebhook(providerRef,
  status)` internal action constructs a correctly-signed body and POSTs it to the
  webhook route, exercising the entire confirmation path without an external
  gateway.
- **`resolveProvider`** (`index.ts`): selects an implementation from the
  connected `qris` integration config; defaults to `MockProvider` until a real
  provider is wired.

## Backend flow

### build / settle split (`convex/orders/core.ts`)

Refactor today's `buildAndInsertSale` into two reusable steps:

- **`buildOrder(ctx, args, method)`** — idempotency check (existing order by
  `clientId`), cart validation, totals + loyalty resolution, and insert of the
  `orders` row + `payments` row **always at `paymentStatus: 'pending'`** (with
  `providerRef`/`expiresAt` for `qris_dynamic`). Returns the new `orderId`.
- **`settleSale(ctx, orderId)`** — inventory deduction, loyalty transactions,
  customer patch (points/visit/spend), set order `paymentStatus: 'paid'` and
  payment `confirmedAt`. **Idempotent**: a no-op if the order is already `paid`.

Cash/static call `buildOrder` then `settleSale` in the **same mutation
transaction**, so the `pending` state is never externally observed — behavior is
identical to today. Dynamic inserts `pending` in `createQrisDynamicSale` and
runs `settleSale` only when the webhook confirms.

### mutations / actions

- `createCashSale` / `createQrisStaticSale`: `buildOrder(...)` then `settleSale`
  in the same mutation — behavior identical to today (regression-guarded by the
  existing tests).
- `createQrisDynamicSale` (**action**): calls `provider.createCharge`, then a
  `buildOrder` mutation inserts the `pending` order with the charge's
  `providerRef`/`expiresAt`; returns `{ orderId, qrString, expiresAt }`.

## Webhook + security

- `POST /webhooks/qris` (`httpAction` in `http.ts`):
  1. `provider.verifyWebhook(rawBody, signatureHeader)`; invalid signature → **401**.
  2. Look up the payment by `by_provider_ref`. Unknown ref → **200** ack (no-op,
     stops gateway retries).
  3. `status: 'paid'` → `settleSale(orderId)` (idempotent — safe for duplicate
     deliveries). `status: 'expired' | 'failed'` → void the pending order.
- The mock's `simulateWebhook` posts a correctly-signed body to this route.

## Pending lifecycle

- **Cashier cancels** — closing the dialog before payment calls
  `cancelQrisDynamicSale`, which voids the pending order (only if still
  `pending`).
- **Expiry** — the `expired` webhook voids the order; a **cron sweep**
  (`crons.ts`, e.g. every few minutes) voids any `pending` order past
  `expiresAt + grace` as a backstop for missed events.
- **Aggregations** — `reports.ts` already filters `paymentStatus === 'paid'`.
  Audit `dashboard.ts`, shift-close totals, and customer-stat queries to confirm
  they exclude non-`paid` orders before pending orders can exist.

## Frontend

- **Method registry** (`payment-methods.tsx`): an array of
  `{ method, label, isReady(settings), Dialog }`. `sale-screen` and `cart-pane`
  iterate it instead of hardcoding `cash`/`qris_static` (the deferred frontend
  refactor, needed now for the 3rd method). `qris_dynamic.isReady` = the `qris`
  integration is connected. The existing `cart-pane` empty-state ("Atur metode
  pembayaran") and default-first ordering carry over.
- **`qris-dynamic-payment-dialog.tsx`**: on open, calls `createQrisDynamicSale`,
  shows the returned QR + a countdown to `expiresAt`, and subscribes to the order
  via `useQuery(orders.getById)`. When `paymentStatus` flips to `paid`, it
  auto-advances to the receipt (reuses `onPaid`). "Batal" cancels; on expiry it
  shows an expired state with a retry. Shared totals come from the existing
  `usePaymentTotals` hook.
- **Enable gate** (`settings/tax.tsx`): the "QRIS dinamis" row stops being a
  static "Segera hadir" `ComingSoonRow` — it reflects the `qris` integration
  connection state and links to the integrations page to connect/disconnect.

## Testing

- **Unit (convex-test):**
  - `buildOrder`/`settleSale` split preserves cash/static behavior (existing
    suite must stay green).
  - `createQrisDynamicSale` inserts a `pending` order with **no** inventory or
    loyalty side effects.
  - Webhook `paid` → `settleSale` runs (inventory + loyalty applied) and is
    **idempotent** on duplicate delivery.
  - Invalid signature rejected (401); unknown ref acked (200, no-op).
  - `expired` webhook and `cancelQrisDynamicSale` void the pending order; cron
    sweep voids stale pending orders.
- **MockProvider unit tests:** `createCharge` shape + HMAC sign/verify round-trip.
- **e2e (`sale.spec.ts`):** connect the `qris` integration → start a dynamic QRIS
  sale → call `simulateWebhook` → dialog auto-advances to the receipt showing
  "QRIS".

## Conventions

- Run CI locally before any push: `pnpm typecheck`, `pnpm test`,
  `pnpm lingui:compile`.
- Convex codegen when signatures change: `./node_modules/.bin/convex codegen`;
  commit the generated files.
- New UI strings are Bahasa Indonesia via Lingui `<Trans>`/`t\`...\``; run
  `pnpm lingui:extract` and fill the `en` catalog. Receipt content stays English
  and off-catalog.
- Small conventional commits per task; merge with a merge commit (no squash).

## Out of scope

- Real Midtrans/Xendit adapters (slot in behind `PaymentProvider` later).
- Refunds/partial payments, split tender, offline-first pending sync.
- Replacing `createCashSale`/`createQrisStaticSale` with a single synchronous
  `createSale` — mooted: dynamic is inherently two-phase (action + webhook), so
  the build/settle split is the right shared seam, not a unified mutation.

## Known limitations / real-adapter follow-ups

These are deliberately deferred to when a real Midtrans/Xendit adapter replaces
the `MockProvider`. The mock confirms by HMAC signature (not amount) and mints a
deterministic `providerRef` from the `clientId`, which papers over several
issues that a real gateway would expose:

- **Charge created with a placeholder amount.** `createQrisDynamicSale` calls
  `createCharge` with `amountIDR: 0` because the authoritative total is only
  computed later in `buildOrder`. Real gateways bind the QR to the amount, so the
  real adapter must obtain the authoritative total before creating the charge
  (e.g. compute totals in a read step first).
- **Charge created before the idempotency check.** The charge is created before
  `buildOrder`'s `clientId` idempotency check runs. With a non-deterministic real
  `providerRef`, a retried action could mint an orphan gateway charge. The real
  adapter should reconcile, or move charge creation to after the order insert.
- **Webhook acks 200 for unknown refs.** The webhook returns HTTP 200 even for an
  unknown `providerRef` (`'unknown'`). A real gateway that treats 200 as delivered
  won't retry, so a webhook arriving before the order commits could be lost.
  Consider returning a retryable status for not-yet-found refs, plus a
  reconciliation poll.
- **Sweep races a delayed `paid` webhook.** `sweepExpired` voids on a local
  5-min-grace clock; a real gateway's delayed `paid` webhook could lose a race
  with the sweep. The gateway should be the authority — reconcile via status
  polling rather than voiding purely on local time.
- **Settle after shift close.** A dynamic order can settle via webhook AFTER its
  shift is closed (the order keeps its original `shiftId`). Shift reconciliation
  with outstanding pending payments is unhandled.
- **Provider seam shortcuts.** The webhook reads a hardcoded `x-signature` header;
  the QR is rendered as a raw string; `resolveProvider(integrationConfig)` ignores
  its arg and the webhook resolves the provider without cafe context. A real
  adapter needs provider-specific header/scheme verification, QR-image rendering,
  per-cafe credentials (the webhook must look up the payment → cafe before
  resolving), and amount verification against the order total.
