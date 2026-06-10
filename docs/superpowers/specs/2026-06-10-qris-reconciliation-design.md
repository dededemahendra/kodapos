# QRIS Status Reconciliation Design Spec

**Date:** 2026-06-10
**Branch:** `feat/qris-reconciliation` (off `main`)
**Predecessor:** Real Xendit BYO QRIS (PR #34, merged). See
`2026-06-10-qris-xendit-byo-design.md`.

## Context

Dynamic QRIS confirms payment via an out-of-band webhook. Today, a cron
(`sweepExpired`, an `internalMutation`) **blindly voids** any pending
`qris_dynamic` order past its local `expiresAt`, with no knowledge of the
gateway's real state. If a `paid` webhook is delayed, dropped, or arrives after
the sweep, a genuinely-paid order is wrongly voided — the customer paid but the
sale is lost. This is the last real-money edge in the QRIS flow (recorded as a
deferred follow-up in the Xendit BYO spec).

This slice makes **Xendit the authority**: a reconcile loop polls each pending
order's real status from the cafe's own Xendit account and settles/voids/leaves
accordingly. Voiding happens only on an explicit `expired`/`failed` from Xendit
or a long hard-failsafe — never on a local clock alone.

### Decision (from brainstorming)

**Reconcile-then-act**, replacing the blind local-clock void. Poll Xendit per
pending order: `paid` → settle, `expired`/`failed` → void, `pending` → leave;
`unknown`/unreachable → leave, except a far-past-expiry failsafe void to prevent
orphans.

## Architecture

Replace the `sweepExpired` **mutation** with a `reconcilePending`
**internalAction** (actions can `fetch`; mutations cannot), scheduled by the same
5-minute cron. It reuses the existing idempotent, pending-guarded
`confirmFromWebhook` / `voidByRef` mutations to apply outcomes, so settlement
logic stays in one place.

### Module touch points

```
convex/payments/providers/types.ts   # + fetchStatus on PaymentProvider
convex/payments/providers/xendit.ts  # XenditProvider.fetchStatus (GET status)
convex/payments/providers/mock.ts    # MockProvider.fetchStatus → 'pending'
convex/payments/qrisDynamic.ts       # + listPendingDynamic (internalQuery),
                                      #   reconcilePending (internalAction);
                                      #   remove sweepExpired
convex/crons.ts                       # cron → reconcilePending
```

## A. Provider interface — `fetchStatus`

```ts
export type ChargeStatus = 'paid' | 'pending' | 'expired' | 'failed' | 'unknown';

export interface PaymentProvider {
  createCharge(input: { amountIDR: number; referenceId: string }):
    Promise<{ providerRef: string; qrString: string; expiresAt: number }>;
  verifyWebhook(req: { body: string; headers: Headers }): Promise<WebhookEvent | null>;
  /** Poll the gateway for a charge's current status (reconciliation). */
  fetchStatus(providerRef: string): Promise<ChargeStatus>;
}
```

- **`XenditProvider.fetchStatus(qrId)`**: GET `https://api.xendit.co/qr_codes/{qrId}`
  with Basic auth (secretApiKey as username). Map Xendit's QR/payment state to
  `ChargeStatus`: a succeeded payment on the QR → `paid`; QR `ACTIVE` and unpaid
  → `pending`; `INACTIVE`/expired → `expired`; explicit failure → `failed`; a
  non-2xx or unparseable response → `unknown` (never throw — reconciliation must
  not crash on one bad call). The exact field path (QR `status` vs a nested
  `payments`/`payment` indicator) is validated against the live sandbox in the
  manual step; the unit test pins the mapping with recorded shapes.
- **`MockProvider.fetchStatus`**: returns `'pending'` (so the automated suite and
  dev never auto-settle/void via reconcile unless `fetch` is stubbed in a test).

## B. `listPendingDynamic` (internalQuery)

Returns the bounded set of reconcile candidates — pending `qris_dynamic`
payments whose order is still `pending`:

```ts
// returns Array<{ orderId, cafeId, providerRef, expiresAt }>, bounded (take 50)
```
Uses the existing `by_method_provider_status` index
(`method='qris_dynamic'`, `providerStatus='pending'`). Skips rows with no
`providerRef` (charge not yet patched) and rows whose order isn't `pending`.

## C. `reconcilePending` (internalAction)

Scheduled by cron every 5 minutes. Pseudocode:

```
candidates = runQuery(listPendingDynamic)          // bounded
for each c in candidates:                           // own try/catch per item
  config = runQuery(getQrisConfig, { cafeId: c.cafeId })
  if (!config) { maybeFailsafeVoid(c); continue }   // disconnected (rare; disconnect is blocked while pending)
  status = resolveProvider(config).fetchStatus(c.providerRef)
  switch status:
    'paid'              -> runMutation(confirmFromWebhook, { providerRef: c.providerRef })
    'expired'|'failed'  -> runMutation(voidByRef, { providerRef: c.providerRef })
    'pending'           -> // leave; re-check next cycle
    'unknown'           -> maybeFailsafeVoid(c)
return { settled, voided, left }                    // counts, for observability/logs
```

- **`maybeFailsafeVoid(c)`**: void via `voidByRef` ONLY if `now > expiresAt +
  FAILSAFE_GRACE` (e.g. 60 min) — a QR an hour past expiry that Xendit still
  won't confirm as paid is treated as abandoned. Otherwise leave for next cycle.
  This bounds orphan lifetime without risking a fresh paid order.
- Per-item try/catch: one cafe's error (bad creds, Xendit down) never blocks the
  rest; treated as `unknown` → leave / failsafe.
- All outcome mutations are the existing idempotent, pending-guarded ones, so a
  reconcile racing a real webhook is safe (whichever commits second no-ops).
- `'paid'` reconciliation calls `confirmFromWebhook` (not a new path) so
  inventory/loyalty settle exactly as a webhook would.

## D. Cron

`convex/crons.ts`: replace
`crons.interval('sweep expired qris', { minutes: 5 }, …sweepExpired, {})`
with `crons.interval('reconcile qris', { minutes: 5 }, …reconcilePending, {})`.
Remove `sweepExpired`.

## Testing

- **`XenditProvider.fetchStatus`** (`tests/convex/xendit-provider.test.ts`):
  mock `fetch` with recorded Xendit shapes → assert mapping for paid / active /
  inactive-expired and that a non-2xx returns `'unknown'` (no throw).
- **`reconcilePending`** (`tests/convex/qris-reconcile.test.ts`): seed a pending
  dynamic order (create via the action with stubbed `createCharge`), then stub
  `fetchStatus` via `globalThis.fetch` and assert:
  - paid → order `paid` (settled, inventory/loyalty applied);
  - expired/failed → order `void`;
  - pending → order stays `pending`;
  - far-past-expiry + unknown (non-2xx) → order `void` (failsafe);
  - near-expiry + unknown → order stays `pending` (no premature void).
- **`MockProvider.fetchStatus`** returns `'pending'`, keeping the existing
  dynamic-QRIS + webhook suites green (reconcile is a no-op under the mock).
- **Live sandbox** (manual, with the owner's keys): create a QR, let the webhook
  be "missed" (don't deliver it), confirm the next reconcile cycle settles the
  paid order from Xendit's status.

## Conventions

- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`.
- `fetch` runs in the default Convex runtime — actions only (mutations/queries
  can't fetch); no `"use node"`.
- Do NOT run `convex codegen` (interactive auth unavailable); the dev watcher /
  manual `api.d.ts` registration keeps types in sync.
- Secrets are never logged; reconcile reads creds via the internal `getQrisConfig`.
- Small conventional commits; PR → review → merge commit.

## Out of scope

- Real-time push reconciliation (we rely on the webhook for promptness; the poll
  is the backstop).
- Per-payment retry/backoff bookkeeping (a persisted attempt counter) — the
  simple time-based failsafe is sufficient for this slice.
- Credential encryption-at-rest; additional providers — unchanged deferrals.
