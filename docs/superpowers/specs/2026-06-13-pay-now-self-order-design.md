# Pay-Now QR Self-Order Design Spec

**Date:** 2026-06-13
**Branch:** `feat/pay-now-self-order` (off `main`)

## Context

QR self-order (#68) ships **pay at counter**: a public self-order is a request; staff Accept loads it
into the register and rings/charges it. This slice adds the deferred half — **pay now**: the customer
pays QRIS-dynamic on the public page; a webhook confirms it; the (now pre-paid) self-order lands in the
staff queue; staff **Accept** creates a real **paid** order (with the staff's shift + cashier) recording
the pre-collected QRIS payment and fires it to the kitchen, **no re-charge**.

This is the first time money is collected on kodapos's unauthenticated surface → built TDD-first with an
adversarial review of the public charge action + webhook + the accept-paid order creation.

## Decisions (locked + defaulted)
- **Headline (user):** *pay then staff confirms* — the order is created at staff-accept time (so no kiosk
  sentinel shift/cashier needed); the only difference from #68 is it's pre-paid.
- **Charge amount = the TRUE total:** recompute `computeOrderTotals` (tax + service charge) from the cafe's
  live settings at charge-creation time, snapshot the full `totalIDR` on the self-order, and charge that.
- **Price-drift at accept:** `acceptPaid` re-prices via `buildOrder`; if the recomputed `totalIDR` differs
  from the snapshotted `paidAmountIDR`, **reject** with a clear error (rare; forces manual handling). No
  silent accounting gap.
- **Coexists:** pay-now is offered ALONGSIDE pay-at-counter, and only when the cafe has QRIS-dynamic
  connected (`menuForTable` returns a `payNowAvailable` flag). If not connected, the public page is
  submit-only (the #68 flow, unchanged).
- **A paid self-order can't be rejected** from the queue (only accepted). Refunding a pre-paid order is
  out-of-band (Xendit dashboard) or via the normal refund flow after accepting. Documented; no auto-refund.
- **qrString stored** on the self-order (survives a page reload; the public page has no long-lived session).

## Model — `selfOrders` gains payment fields
```ts
// added to the existing selfOrders table:
paymentMode: v.optional(v.union(v.literal('counter'), v.literal('qris'))), // absent/counter = #68 flow
paymentStatus: v.optional(v.union(
  v.literal('unpaid'), v.literal('awaiting'), v.literal('paid'))),          // qris lifecycle
totalIDR: v.optional(v.number()),        // full total (incl tax+SC) snapshotted at charge time
providerRef: v.optional(v.string()),     // Xendit qr id
qrString: v.optional(v.string()),        // the QR payload to render
expiresAt: v.optional(v.number()),
paidAmountIDR: v.optional(v.number()),   // set by the webhook on confirm
acceptedOrderId: v.optional(v.id('orders')),
// + index by_provider_ref (['providerRef']) for the webhook lookup
```
The `status` field (new/accepted/rejected) is unchanged; `paymentStatus` is an orthogonal QRIS lifecycle.

## Backend

### Public charge — `convex/public.ts` (or `convex/payments/selfOrderQris.ts`), NO auth
- **`createSelfOrderCharge({ qrToken, selfOrderId })`** (public **action**): resolve the table+cafe from
  `qrToken` (reject mismatched token/selfOrder, like `selfOrderStatus`); load the self-order; if already
  `awaiting`/`paid`, return the existing `{ qrString, expiresAt }` (idempotent, no duplicate charge);
  recompute the true `totalIDR` (`computeOrderTotals` from the cafe's tax/SC settings over the snapshotted
  lines); load the cafe's QRIS config (reuse `getQrisConfig({cafeId})`); if not connected → throw
  `'Pembayaran QRIS tidak tersedia.'`; `resolveProvider(config).createCharge({ amountIDR: totalIDR,
  referenceId: 'so_'+selfOrderId })`; patch the self-order `{ paymentMode:'qris', paymentStatus:'awaiting',
  totalIDR, providerRef, qrString, expiresAt }`; return `{ qrString, expiresAt, totalIDR }`.
- **`selfOrderStatus`** (existing public query) — extend the return to include `paymentStatus` +
  (when awaiting) `qrString`/`expiresAt`/`totalIDR`, so the public page can render the QR + poll. Still
  token-bound; still leaks nothing beyond this self-order's own state.
- **`menuForTable`** — add `payNowAvailable: boolean` (the cafe has QRIS-dynamic connected) to its return.

### Webhook — `convex/http.ts` + `convex/payments/qrisDynamic.ts`
- Both webhook routes: when the `payments.by_provider_ref` lookup MISSES, fall back to
  `selfOrders.by_provider_ref`. Add `getSelfOrderCafeByRef({ providerRef })` (for the Xendit cafe-resolve)
  and `confirmSelfOrderFromWebhook({ providerRef })` (internalMutation: find the self-order, if `awaiting`
  → patch `{ paymentStatus:'paid', paidAmountIDR: totalIDR }`; idempotent). The expired/failed branch →
  `voidSelfOrderCharge` (patch back to `unpaid`, clear providerRef/qrString) so the customer can retry.
- **Reconcile:** extend the `reconcile qris` cron with a self-order pass — `listAwaitingSelfOrders` →
  `fetchStatus(providerRef)` → confirm/void; failsafe void when `now > expiresAt + 1h`.

### Staff accept-paid — `convex/selfOrders.ts`
- **`acceptPaid({ id })`** (owner-gated mutation): require the self-order `paymentStatus === 'paid'`; find
  the cafe's open shift + the calling cashier (mirror how the register resolves them — pass `cashierId`);
  `buildOrder(ctx, { shiftId, cashierId, clientId: selfOrder.clientId, lines: rehydrated, orderType:
  'dine_in', tableId? }, { method:'qris_dynamic' })`; **validate** the returned `totalIDR === paidAmountIDR`
  else throw `'Harga berubah sejak pembayaran, tangani manual.'`; patch the payment row with
  `{ providerRef: selfOrder.providerRef, providerStatus:'pending', expiresAt }` (mirror `patchCharge`);
  `settleSale(ctx, orderId)` (flips paid + kitchen 'new' + confirmedAt); patch the self-order
  `{ status:'accepted', acceptedAt, acceptedOrderId: orderId }`. Returns `{ orderId }`.
- **`queue`** — include `paymentStatus`/`totalIDR` so the staff card shows a "Lunas (QRIS)" badge.
- **`reject`** — reject a paid self-order (`paymentStatus === 'paid'`) → throw `'Pesanan sudah dibayar,
  tidak bisa ditolak.'` (only unpaid/counter orders are rejectable).

## Frontend

### Public — `src/routes/_public/order.$token.tsx`
When `menuForTable.payNowAvailable`, the cart review sheet offers two actions: **"Bayar sekarang (QRIS)"**
and **"Bayar di kasir"** (the existing submit). Pay-now: `submitSelfOrder` (creates the self-order) →
`createSelfOrderCharge({ qrToken, selfOrderId })` → render the **QRIS QR** (`<QRCodeSVG value={qrString}>`,
the dep from #65) + the amount + a countdown to `expiresAt` + "Tunjukkan QR ini untuk membayar"; poll
`selfOrderStatus` → on `paid` show "Pembayaran diterima, pesanan diproses." then track accepted/rejected.
Expired → an option to re-generate. If `!payNowAvailable`, only the existing "Kirim pesanan" shows.

### Staff — `src/routes/_pos/self-orders.tsx`
A paid self-order card shows a "Lunas (QRIS)" badge + amount; its button is **"Terima (sudah dibayar)"** →
`acceptPaid({ id })` (then a success toast / optional receipt), NOT the `/sale?selfOrder=` recall. An unpaid
(counter) order keeps the existing "Terima" → recall flow. "Tolak" is hidden/disabled for paid orders.

## Security (the spine — adversarial review)
- The charge action resolves the cafe ONLY from `qrToken`; never trusts a client amount (recomputes the
  total server-side from the cafe's settings + the server-snapshotted lines).
- Idempotent charge creation: an `awaiting`/`paid` self-order returns its existing QR, never a 2nd charge.
- Webhook stays token-verified (Xendit `callbackToken` / mock HMAC); the self-order branch only flips
  `awaiting → paid`; idempotent; resolves the cafe via the self-order's `cafeId`.
- `acceptPaid` is owner-gated, validates `paymentStatus==='paid'` + the amount match, and is the only path
  a paid self-order becomes an order.
- Reuse the #68 abuse guards (token capability, clientId idempotency, pending cap, bounded inputs).

## Testing
**`tests/convex/self-order-paynow.test.ts`** (new): `createSelfOrderCharge` (mock provider) sets
`awaiting` + stores providerRef/qrString/totalIDR (= the true total incl tax/SC); a 2nd call returns the
same charge (idempotent, no 2nd provider call); QRIS-not-connected throws. `confirmSelfOrderFromWebhook`
flips `awaiting → paid` + sets paidAmountIDR; idempotent. `acceptPaid` on a paid self-order creates a PAID
order with a confirmed qris_dynamic payment of `paidAmountIDR`, the staff's shift/cashier, fires kitchen
('new'), marks the self-order accepted; rejects when not paid; rejects on a price-drift (mock a changed
price → total mismatch). `reject` of a paid self-order throws. Owner-scope throughout. The webhook
`by_provider_ref` self-order fallback resolves the right cafe.
Frontend (QR render, poll, staff accept-paid) by typecheck + smoke.

## i18n
New BI: `Bayar sekarang (QRIS)`, `Bayar di kasir`, `Tunjukkan QR ini untuk membayar`, `Menunggu
pembayaran`, `Pembayaran diterima`, `QR kedaluwarsa`, `Buat ulang QR`, `Lunas (QRIS)`, `Terima (sudah
dibayar)`, server-thrown messages off-catalog. Fill `en`, compile, no em-dash.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — new modules register via the dev watcher (commit api.d.ts). No new route (extends
  `/order/$token` + `/self-orders`).
- Real-money + unauthenticated path → adversarial review. Small commits; PR → review → merge.

## Out of scope
- Auto-fire on payment without a staff step (the user chose staff-confirm); a kiosk sentinel shift.
- Auto-refund on reject (paid orders aren't rejectable; refund out-of-band).
- Pay-now for split/partial; tip-on-public; non-QRIS public payment methods.
