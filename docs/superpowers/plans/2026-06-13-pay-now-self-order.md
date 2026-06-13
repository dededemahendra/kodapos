# Pay-Now QR Self-Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Real-money on the UNAUTHENTICATED surface + webhook + order creation → TDD + adversarial review.

**Goal:** Customer pays QRIS-dynamic on the public self-order page → webhook confirms → the pre-paid self-order is in the staff queue → staff Accept creates a PAID order (their shift/cashier, no re-charge) + fires to kitchen. Coexists with pay-at-counter (#68); only offered when QRIS-dynamic is connected.

**Copy rules:** UI Bahasa via the catalog; **no em-dash `—`/`--`**; empty states shadcn `Empty` (icon+heading+desc). Receipt/PDF content English.

---

## File Structure
- **Modify:** `convex/schema.ts` (selfOrders payment fields + `by_provider_ref`), `convex/public.ts` (`createSelfOrderCharge` action + `selfOrderStatus`/`menuForTable` extend), `convex/payments/qrisDynamic.ts` (self-order webhook confirm/void + reconcile pass + a cafe-by-ref-for-selforder), `convex/http.ts` (webhook self-order fallback), `convex/selfOrders.ts` (`acceptPaid`, `queue`, `reject`), `convex/crons.ts` (reconcile note), `convex/_generated/api.d.ts`, `src/routes/_public/order.$token.tsx` + `src/components/public/*`, `src/routes/_pos/self-orders.tsx`.
- **Create:** `tests/convex/self-order-paynow.test.ts`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — public charge + webhook + reconcile (TDD)
**Files:** modify `convex/schema.ts`, `convex/public.ts`, `convex/payments/qrisDynamic.ts`, `convex/http.ts`, `convex/crons.ts`, `convex/_generated/api.d.ts`; create `tests/convex/self-order-paynow.test.ts`.

READ: `convex/payments/qrisDynamic.ts` (`createQrisDynamicSale`/`getQrisConfig`/`confirmFromWebhook`/`voidByRef`/`reconcilePending`/`getPaymentCafeByRef`/`listPendingDynamic`), `convex/payments/providers/{index,xendit,mock}.ts` (`resolveProvider`/`createCharge`/`verifyWebhook`/`fetchStatus`), `convex/http.ts` (both webhook routes), `convex/public.ts` (`submitSelfOrder`/`menuForTable`/`selfOrderStatus`, the `computeOrderTotals` usage + the cafe tax/SC config it reads), `convex/lib/pricing.ts` `computeOrderTotals`, `convex/schema.ts` `selfOrders`, `tests/convex/self-order-public.test.ts` + the qris-dynamic tests (mock provider + webhook test setup).

- [ ] **Step 1: schema** — add to `selfOrders`: `paymentMode?`('counter'|'qris'), `paymentStatus?`('unpaid'|'awaiting'|'paid'), `totalIDR?`, `providerRef?`, `qrString?`, `expiresAt?`, `paidAmountIDR?`, `acceptedOrderId?: v.id('orders')`; add `.index('by_provider_ref', ['providerRef'])`.
- [ ] **Step 2: FAILING tests** (`self-order-paynow.test.ts`, mock QRIS provider connected in cafeSettings.integrations):
  - `createSelfOrderCharge({ qrToken, selfOrderId })` → self-order `paymentStatus:'awaiting'`, `providerRef`/`qrString` set, `totalIDR` = the TRUE total (subtotal + tax + SC per the cafe settings, not just subtotal); a 2nd call returns the same charge (no 2nd provider charge, idempotent); a cafe without QRIS connected → throws `/QRIS tidak tersedia/i`; a mismatched qrToken/selfOrder → throws.
  - `confirmSelfOrderFromWebhook({ providerRef })` flips `awaiting → paid` + sets `paidAmountIDR === totalIDR`; idempotent (2nd call no-op).
  - the webhook `getSelfOrderCafeByRef` resolves the right cafe for a self-order providerRef.
  - `selfOrderStatus` returns `paymentStatus` (+ qrString/expiresAt when awaiting).
  Run → confirm FAIL.
- [ ] **Step 3: implement**
  - `convex/public.ts`: `createSelfOrderCharge` (public action) per the spec (resolve token, idempotent, recompute true total via `computeOrderTotals` over the snapshot lines + cafe settings, `getQrisConfig`, `resolveProvider().createCharge({ amountIDR: totalIDR, referenceId: 'so_'+selfOrderId })`, patch). Extend `selfOrderStatus` (+paymentStatus/qrString/expiresAt/totalIDR) + `menuForTable` (+`payNowAvailable` = QRIS-dynamic connected). Add a `getSelfOrderQrisConfig`/reuse `getQrisConfig`. (The charge action needs `referenceId` to round-trip: store the providerRef on the self-order; the webhook looks it up by providerRef.)
  - `convex/payments/qrisDynamic.ts`: `getSelfOrderCafeByRef({providerRef})` (query selfOrders.by_provider_ref → cafeId|null); `confirmSelfOrderFromWebhook({providerRef})` (internalMutation: find self-order by ref; if `awaiting` → patch paid + paidAmountIDR); `voidSelfOrderCharge({providerRef})` (→ unpaid, clear ref/qrString); extend `reconcilePending` (or add `reconcileSelfOrders`) to fetchStatus self-order awaiting charges + confirm/void + failsafe-void past expiry.
  - `convex/http.ts`: in BOTH routes, when the `payments` lookup misses, fall back to `getSelfOrderCafeByRef` + on paid call `confirmSelfOrderFromWebhook`, on expired/failed `voidSelfOrderCharge`. (For Xendit, resolve the cafe via the self-order to load its `callbackToken`.)
  - `convex/crons.ts`: ensure the self-order awaiting charges are reconciled (extend the existing cron's action).
- [ ] **Step 4: register + tests + commit** — confirm api.d.ts; `pnpm test` + `pnpm typecheck` PASS. Commit:
  `git add convex/schema.ts convex/public.ts convex/payments/qrisDynamic.ts convex/http.ts convex/crons.ts convex/_generated/api.d.ts tests/convex/self-order-paynow.test.ts && git commit -m "feat(self-order): public QRIS charge + webhook confirm + reconcile (pay-now)"`
  > Do NOT run codegen.

---

### Task 2: Backend — staff accept-paid (TDD)
**Files:** modify `convex/selfOrders.ts`; extend `tests/convex/self-order-paynow.test.ts`.

READ: `convex/selfOrders.ts` (`accept`/`getForCart`/`queue`/`reject`), `convex/lib/sale.ts` `buildOrder`/`settleSale` + the `patchCharge` logic in qrisDynamic (the payment-row patch with providerRef), how the register resolves the open shift (`shifts.current`/an open-shift query) + `cashierId`.

- [ ] **Step 1: FAILING tests** (extend): seed a PAID self-order (via Task 1 + confirm) on a table; `acceptPaid({ id, cashierId })` (open shift present) → creates an `orders` row `paymentStatus:'paid'`, a `payments` row `method:'qris_dynamic'` `confirmedAt` set `amountIDR === paidAmountIDR` with the `providerRef`, `kitchenStatus:'new'`, the self-order `status:'accepted'` + `acceptedOrderId`; the customer/stock/loyalty side effects ran (settleSale). Reject `acceptPaid` when `paymentStatus !== 'paid'`. Price-drift: mock a changed item price so the recomputed total != paidAmountIDR → throws `/harga berubah/i`, nothing created. `reject` of a paid self-order throws `/sudah dibayar/i`. Run → FAIL.
- [ ] **Step 2: implement** `acceptPaid({ id, cashierId })` per the spec (requireOwnerCafe + requireOwned the self-order; require paid; resolve open shift; `buildOrder` with the rehydrated lines + qris_dynamic; validate `totalIDR === paidAmountIDR` else throw; patch the payment row with the providerRef; `settleSale`; patch the self-order accepted + acceptedOrderId; return `{orderId}`). Extend `queue` (paymentStatus/totalIDR) + guard `reject` against paid orders.
- [ ] **Step 3: tests + typecheck + commit** — `pnpm test` + `pnpm typecheck` PASS. Commit:
  `git add convex/selfOrders.ts tests/convex/self-order-paynow.test.ts && git commit -m "feat(self-order): staff accept of a pre-paid order (creates a paid order, fires kitchen)"`

---

### Task 3: Public frontend — QRIS pay flow
**Files:** modify `src/routes/_public/order.$token.tsx`, `src/components/public/*` (the cart review + confirmation).

READ: the public page state machine + `CartReviewSheet`/confirmation (#68), `qrcode.react` `QRCodeSVG` (added #65), `api.public.createSelfOrderCharge`/`selfOrderStatus`/`menuForTable.payNowAvailable`.

- [ ] **Step 1:** in the cart review, when `payNowAvailable`, show two buttons: "Bayar sekarang (QRIS)" + "Bayar di kasir". Pay-at-counter = the existing submit. Pay-now: `submitSelfOrder` → `useAction(createSelfOrderCharge)({ qrToken, selfOrderId })` → switch to a **QR view**: `<QRCodeSVG value={qrString} size={240} />` + the amount (`formatIDR(totalIDR)`) + a countdown to `expiresAt` + "Tunjukkan QR ini untuk membayar". Poll `selfOrderStatus`; on `paymentStatus:'paid'` → "Pembayaran diterima, pesanan diproses." then reflect accepted/rejected. Expired → a "Buat ulang QR" button (re-call the charge action). If `!payNowAvailable`, only "Kirim pesanan" (unchanged).
- [ ] **Step 2:** typecheck + test PASS. Commit:
  `git add src/routes/_public/order.$token.tsx src/components/public && git commit -m "feat(self-order): public QRIS pay-now flow (QR + poll)"`

---

### Task 4: Staff frontend — accept a pre-paid order
**Files:** modify `src/routes/_pos/self-orders.tsx`.

READ: the queue card + the "Terima" button (the `/sale?selfOrder=` recall) + how `cashierId` is available (`useActiveCashier`).

- [ ] **Step 1:** a paid self-order (`paymentStatus:'paid'`) card shows a "Lunas (QRIS)" badge + the amount; its primary button is "Terima (sudah dibayar)" → `useMutation(api.selfOrders.acceptPaid)({ id, cashierId })` + a success toast; NOT the recall navigation. Unpaid/counter orders keep the existing "Terima" → `/sale?selfOrder=` recall. Hide/disable "Tolak" for paid orders.
- [ ] **Step 2:** typecheck + test PASS. Commit:
  `git add src/routes/_pos/self-orders.tsx && git commit -m "feat(self-order): staff accept-paid button in the queue"`

---

### Task 5: i18n
Public + staff strings (see spec). Extract + fill `en` (`Pay now (QRIS)`, `Pay at counter`, `Show this QR to pay`, `Awaiting payment`, `Payment received`, `QR expired`, `Regenerate QR`, `Paid (QRIS)`, `Accept (paid)`, ...); no em-dash; compile.

---

### Task 6: Final verification + adversarial review
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; clean tree.
- [ ] code-reviewer on the money + unauthenticated path (`createSelfOrderCharge`, the webhook self-order branch, `acceptPaid`): the charge amount is server-recomputed (never client-trusted) and is the TRUE total (incl tax/SC); charge creation is idempotent (no duplicate Xendit charges per self-order); the webhook stays token-verified + the self-order branch only flips awaiting→paid idempotently + resolves the right cafe; `acceptPaid` is owner-gated, creates exactly one paid order with exactly the pre-collected amount (price-drift rejected, nothing created on reject), the providerRef is recorded, settleSale runs once; a paid self-order can't be rejected or double-accepted; reconcile/expiry can't double-confirm; no credential leak to the public surface. Address findings; re-verify.
- [ ] **Manual sanity (mock provider):** connect QRIS (mock) → public order → "Bayar sekarang" shows a QR → simulate the webhook paid → public shows "Pembayaran diterima" → staff queue shows "Lunas" → "Terima (sudah dibayar)" creates a paid order + kitchen ticket, no re-charge; without QRIS connected the public page is submit-only.

---

## Self-Review
**Spec coverage:** selfOrders payment fields + index (T1); public charge action + status/menu extend + webhook self-order branch + reconcile (T1); acceptPaid + queue/reject (T2); public QR pay flow (T3); staff accept-paid (T4); i18n (T5); adversarial review (T6); tests charge/webhook/acceptPaid/drift/reject/scope (T1-T2). ✓
**Placeholder scan:** "reuse qrisDynamic / providers / buildOrder+settleSale / #68 public+queue". Else spec code.
**Type consistency:** `createSelfOrderCharge({qrToken,selfOrderId})→{qrString,expiresAt,totalIDR}`; webhook by `providerRef` ('so_' ref) → `confirmSelfOrderFromWebhook`; `acceptPaid({id,cashierId})→{orderId}` reuses buildOrder+settleSale; `selfOrderStatus`/`menuForTable`/`queue` extended fields consumed by the public + staff UIs. ✓
