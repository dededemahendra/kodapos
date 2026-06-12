# Split / Multi-Tender Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. MONEY PATH — TDD-first, adversarial review before merge.

**Goal:** Let one order be settled by N tenders (cash + qris_static only), atomically. Keep cash reconciliation + payment-method reporting correct via a `paymentBreakdown` on the order read through a shared helper (legacy-safe).

**Architecture:** See `docs/superpowers/specs/2026-06-11-split-tender-design.md`. `buildOrder` writes `paymentBreakdown` for every order + N payment rows for a split; `settleSale`/`voidPendingOrder` loop-patch rows (no `.unique()`); `cashCollectedIDR`/`methodTotals` (new `convex/lib/payment.ts`) drive reconciliation + reports + dashboard with a legacy fallback. New `createSplitSale` mutation; a split dialog; receipt renders a tender array.

---

## File Structure
- **Create:** `convex/lib/payment.ts`, `src/components/sale/split-payment-dialog.tsx`, `tests/convex/split-tender.test.ts`.
- **Modify:** `convex/schema.ts`, `convex/lib/sale.ts`, `convex/orders.ts`, `convex/payments/qrisDynamic.ts`, `convex/shifts.ts`, `convex/reports.ts`, `convex/dashboard.ts`, `convex/_generated/api.d.ts`, `src/components/sale/receipt-preview.tsx`, `payment-methods.tsx`, `sale-screen.tsx`, `tests/convex/orders.test.ts`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Payment model — N tenders through build/settle/void (TDD)
**Files:** create `convex/lib/payment.ts`, `tests/convex/split-tender.test.ts`; modify `convex/schema.ts`, `convex/lib/sale.ts`, `convex/orders.ts`, `convex/payments/qrisDynamic.ts`.

READ: `convex/lib/sale.ts` (`PaymentInput` ~39, the idempotency `existing` branch ~65–79, the payment insert ~303–314, `settleSale` ~404–413, `voidPendingOrder` ~493–497); `convex/orders.ts` (`createCashSale`/`createQrisStaticSale`, `orderSummary`/`orderRow`/`orderDetail`, `getById` ~202–231); `convex/payments/qrisDynamic.ts` `patchCharge`; the existing cash-sale tests (seeding) in `tests/convex/orders.test.ts`.

- [ ] **Step 1: `convex/lib/payment.ts`** — exact code from the spec (`methodTotals`, `cashCollectedIDR`, `PayMethod`).

- [ ] **Step 2: schema** — `convex/schema.ts`: add `v.literal('split')` to `orders.paymentMethod`; add `paymentBreakdown: v.optional(v.array(v.object({ method: v.union(v.literal('cash'), v.literal('qris_static'), v.literal('qris_dynamic')), amountIDR: v.number() })))` to `orders`.

- [ ] **Step 3: FAILING tests — `tests/convex/split-tender.test.ts`** (copy seeding from orders.test.ts: owner, open shift, item, cashier). Cover:
  - split cash 60000 + qris_static 40000 on a 100000-total order → `createSplitSale` returns; `t.run` shows 2 payment rows for the order summing 100000; order `paymentMethod==='split'`, `paymentBreakdown` length 2 summing 100000, `paymentStatus==='paid'` (settled), each payment row has `confirmedAt`.
  - cash overpay: cash leg `{ amountIDR: 60000, tenderedIDR: 70000 }` → that row `changeIDR===10000`; returned `changeIDR===10000`.
  - rejects `Σ amountIDR ≠ total` (e.g. 60000+30000); rejects a `qris_dynamic` tender; rejects cash leg `tenderedIDR < amountIDR`; rejects non-positive amount.
  > Make the order total deterministic: use a no-recipe item at a known price, tax off; if the seeded item price isn't 100000, set tenders to match the REAL subtotal (keep Σ == total). Run → confirm FAIL.

- [ ] **Step 4: implement build/settle/void** — `convex/lib/sale.ts`:
  - `PaymentInput`: add the `split` variant (spec).
  - Idempotency `existing` branch: `payments.by_order().collect()`; `changeIDR = rows.reduce((s,p)=>s+(p.changeIDR??0),0)`.
  - Single-method path: keep the 1-row insert; additionally set local `paymentBreakdown = [{ method: payment.method, amountIDR: totalIDR }]` and `orderMethod = payment.method`.
  - Split path: validate (every tender method ∈ {cash,qris_static}; `Number.isInteger(amountIDR) && amountIDR>0`; `Σ amountIDR === totalIDR` else throw `'Total tender tidak sama dengan total pesanan.'`; cash `tenderedIDR ≥ amountIDR` else throw). For each tender insert a `payments` row (`cafeId, orderId, method, amountIDR`, cash also `cashTenderedIDR: tenderedIDR, changeIDR: tenderedIDR-amountIDR`). `changeIDR = Σ cash changes`; `paymentBreakdown = tenders.map(t=>({method:t.method, amountIDR:t.amountIDR}))`; `orderMethod='split'`.
  - Order insert: `paymentMethod: orderMethod`, `...(paymentBreakdown ? { paymentBreakdown } : {})`. (The single-method insert previously used `payment.method`; now use `orderMethod`.) Move the payment-row insert(s) to a small branch before/after the order insert as today (order first, then rows referencing orderId — keep the existing ordering: order insert returns orderId, then insert payment rows).
  - `settleSale`: `payments.by_order().collect()`; `for (const p of rows) ctx.db.patch(p._id, { confirmedAt: now, ...(p.method==='qris_dynamic' ? { providerStatus:'paid' } : {}) })`.
  - `voidPendingOrder`: `.collect()` + loop patch `{ providerStatus }` per row.
  - `convex/payments/qrisDynamic.ts` `patchCharge`: narrow the `by_order` query with `.filter((q)=>q.eq(q.field('method'),'qris_dynamic'))` before `.unique()`.

- [ ] **Step 5: createSplitSale + validators** — `convex/orders.ts`: add `createSplitSale` (spec). Add `'split'` to `paymentMethod` in `orderSummary` + `orderRow`; add `paymentBreakdown` optional (same shape) to `orderSummary`.

- [ ] **Step 6: tests + typecheck + commit**
`pnpm test tests/convex/split-tender.test.ts` → PASS; `pnpm test` → full PASS (existing untouched). `pnpm typecheck` → PASS. Include any dev-watcher `api.d.ts` (lib/payment). Commit:
`git commit -m "feat(payments): split/multi-tender create + N-payment settle/void + breakdown"`

---

### Task 2: getById payments array + receipt
**Files:** modify `convex/orders.ts` (`getById`/`orderDetail`), `src/components/sale/receipt-preview.tsx`.

- [ ] **Step 1:** `getById`: replace `payments.by_order().unique()` with `.collect()`; map to a `payments: PaymentDetail[]` (each `{ method, amountIDR, cashTenderedIDR?, changeIDR?, confirmedAt? }`, sorted by `_creationTime`). Change `orderDetail`'s `payment: union(obj,null)` to `payments: v.array(paymentDetailObj)` (the obj's `method` union stays cash/qris_static/qris_dynamic — payment ROWS never have 'split'). Update the return object key from `payment` to `payments`.
- [ ] **Step 2:** `receipt-preview.tsx`: the existing `order.payment?.method === 'cash'` block becomes `order.payments.map(...)` rendering per tender: cash → `Tunai {cashTenderedIDR}` + `Kembalian {changeIDR}`; non-cash → `Payment {LABEL}` + the amount. Keep printed English/off-catalog strings. (Any other reader of `order.payment` — grep — update to `order.payments`.)
- [ ] **Step 3:** `pnpm typecheck` → PASS; `pnpm test` → PASS. Commit:
`git commit -m "feat(payments): getById returns tender array + receipt renders splits"`

---

### Task 3: Reconciliation + reports + dashboard via the helper (TDD)
**Files:** modify `convex/shifts.ts`, `convex/reports.ts`, `convex/dashboard.ts`; test `tests/convex/split-tender.test.ts` (+ maybe `shifts.test.ts`/`reports.test.ts`).

READ: `convex/shifts.ts` `shiftCashBreakdown` + `summarizeShift`; `convex/reports.ts` `payments`; `convex/dashboard.ts` payment channel loop.

- [ ] **Step 1: FAILING tests** — extend split-tender tests:
  - reconciliation: open shift, ring a split (cash 60000 + qris 40000) + a pure-cash 50000; the shift cash breakdown / summary expected cash = openingFloat + 110000 (60000 + 50000), NOT 150000 and NOT 100000.
  - reports: `reports.payments` over today with that split + pure-cash → cash bucket amount = 110000, qris_static bucket = 40000; `totalIDR` = 150000.
  Run → FAIL (current logic mis-attributes).
- [ ] **Step 2: implement** — import `cashCollectedIDR`/`methodTotals` from `./lib/payment`:
  - `shifts.ts`: `cashSalesIDR = paidOrders.reduce((s,o)=>s+cashCollectedIDR(o),0)`; in `summarizeShift`, `cashSalesIDR += cashCollectedIDR(o)` and `qrisSalesIDR += methodTotals(o).filter(t=>t.method!=='cash').reduce(...)`.
  - `reports.ts` `payments`: for each paid order, for each `methodTotals(o)` entry add to that method's bucket (`amountIDR += entry.amountIDR`; `count` += 1 once per method the order uses). `totalIDR = Σ o.totalIDR`. Add `'split'` is NOT a bucket (buckets are the real methods).
  - `dashboard.ts`: in the channel loop, use `methodTotals(o)` — a split increments both cash and qris channels by its amounts/counts.
- [ ] **Step 3:** tests + typecheck + full test. Commit:
`git commit -m "feat(payments): cash reconciliation + reports + dashboard handle splits (legacy-safe)"`

---

### Task 4: Frontend — split dialog + entry point
**Files:** create `src/components/sale/split-payment-dialog.tsx`; modify `payment-methods.tsx`, `sale-screen.tsx`.

READ: `cash-payment-dialog.tsx` + `qris-static-payment-dialog.tsx` (the customer/loyalty section + `usePaymentTotals` + the create-call arg shape incl `promoId`/`orderType`/`manualDiscount`), `sale-screen.tsx` (how dialogs are opened + the `payMethods`/`onPay` wiring).

- [ ] **Step 1: split-payment-dialog.tsx** — props mirror the other dialogs (subtotalIDR, discount, serviceCharge/tax props, `cart`, `shiftId`, `cashierId`, `onPaid`). Compute the order `totalIDR` via `usePaymentTotals` (same as the others). A tender-row editor: each row a method select (only the *available* sync methods — cash if enabled; qris_static if enabled + a QR configured), an amount input (integer), cash rows a tendered input (≥ amount → change shown). Live "Sisa: {total − Σ amounts}"; submit disabled until remaining === 0 and every cash tendered ≥ amount. On submit → `createSplitSale({ clientId, shiftId, cashierId, lines: cart.lines.map(...), tenders, ...(promoId)/(orderType)/(manualDiscount)/(customer/redeem) })`; `onPaid(orderId)`.
  > Reuse the customer/loyalty section the other dialogs use so a split can still attach a customer + redeem points. The split is over the FINAL total (post promo/manual/redeem) — `usePaymentTotals` already yields that `totalIDR`.
- [ ] **Step 2: entry point** — in `sale-screen.tsx`, add a **"Bagi pembayaran"** button near the pay buttons (shown when the cart is non-empty and ≥2 sync methods, or always when ≥1 — your call; minimum: when cash and/or qris_static are usable). It opens the split dialog. Add `splitOpen` state + render `<SplitPaymentDialog ... onPaid={(id)=>{ setReceiptOrderId(id); dispatch({type:'clearCart'}); }} />`. `payment-methods.tsx`: add the `'split'` literal to the `PaymentMethod` type only if needed for typing.
- [ ] **Step 3:** `pnpm typecheck` → PASS; `pnpm test` → PASS. Commit:
`git commit -m "feat(sale): split-payment dialog + entry point"`

---

### Task 5: i18n
New: `Bagi pembayaran`, `Tambah tender`, `Sisa`, `Metode`, `Jumlah`, `Uang diterima`,
`Tender melebihi total`, `Hapus tender`, etc. + reuse `Tunai`, `QRIS statis`, `Kembalian`.
- [ ] `pnpm lingui:extract`; fill `en` (`Split payment`, `Add tender`, `Remaining`, `Method`, `Amount`, `Cash received`, `Tender exceeds total`, `Remove tender`, …) + any other new empties; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 6: Final verification + adversarial review
- [ ] `pnpm typecheck` → PASS; `pnpm test` → PASS; `pnpm lingui:compile` → en 0 missing; `git status` clean.
- [ ] Dispatch a code-reviewer on `git diff main...HEAD` focused on: settle/void loop-patch all rows (no `.unique()` throw remains on `by_order` except the dynamic-narrowed one); `Σ amountIDR === totalIDR` enforced; cash reconciliation counts ONLY cash legs (split + legacy); reports attribute each method its amount and totalIDR once; `methodTotals` legacy fallback correct for pre-breakdown orders; idempotent replay of `createSplitSale` (same clientId) returns the existing order with correct summed change; a split never includes qris_dynamic.
- [ ] **Manual sanity:** ring a 100k order, "Bagi pembayaran" → cash 60k (tender 70k → 10k change) + QRIS 40k → submits, receipt shows both tenders, shift expected cash rises by 60k (not 100k), payments report shows cash 60k + QRIS 40k.

---

## Self-Review
**Spec coverage:** helper (T1); schema split+breakdown (T1); build N-rows + breakdown + validation, settle/void loop, idempotency collect, dynamic narrow (T1); createSplitSale + validators (T1); getById array + receipt (T2); reconciliation + reports + dashboard via helper, legacy-safe (T3); split dialog + entry (T4); tests for create/overpay/reject/settle/reconcile/report/getById (T1,T3); i18n (T5); adversarial review (T6). ✓
**Placeholder scan:** test totals say "match the REAL seeded price". Else concrete.
**Type consistency:** `PaymentInput.split.tenders` shape == `createSplitSale.tenders` arg == the dialog's submitted `tenders`. `paymentBreakdown` shape identical in schema + orderSummary + helper. `methodTotals`/`cashCollectedIDR` consume `Doc<'orders'>` with the optional breakdown + legacy fallback. `getById` returns `payments[]` (rows never 'split'); receipt maps it. ✓
