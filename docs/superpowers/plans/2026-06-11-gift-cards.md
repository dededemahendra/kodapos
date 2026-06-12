# Gift Cards / Vouchers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). MONEY CORE — TDD-first, adversarial review before merge.

**Goal:** Prepaid gift cards: issue/topup/balance + redeem as a tender (full or partial via split), with void refunding the card.

**Architecture:** `giftCards` + `giftCardTransactions` tables; `convex/giftCards.ts` management; a shared `redeemGiftCard` helper deducts balance + writes a ledger row; `buildOrder` redeems on a giftcard tender/payment and stores `giftCardId` on the payment row; `reverseSettledSale` (void) refunds giftcard payment rows; `'giftcard'` added to the payment-method unions; reconciliation excludes it (it's not cash).

See `docs/superpowers/specs/2026-06-11-gift-cards-design.md` for exact code/shapes.

---

## File Structure
- **Create:** `convex/giftCards.ts`, `convex/lib/giftcard.ts`, `tests/convex/gift-cards.test.ts`, `src/routes/_pos/gift-cards.tsx`, `src/components/giftcard/*` (management + checkout dialogs).
- **Modify:** `convex/schema.ts`, `convex/lib/sale.ts`, `convex/orders.ts`, `convex/lib/payment.ts`, `convex/reports.ts`, `convex/_generated/api.d.ts`, `src/components/sale/split-payment-dialog.tsx`, `sale-screen.tsx`, `payment-methods.tsx`, `receipt-preview.tsx`, `src/components/app-shared.tsx`, `src/routeTree.gen.ts`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend management (TDD)
**Files:** create `convex/giftCards.ts`, `tests/convex/gift-cards.test.ts`; modify `convex/schema.ts`, `convex/_generated/api.d.ts`.

READ: `convex/suppliers.ts` (CRUD), `convex/customers.ts` (code/phone unique lookup), `convex/loyalty.ts` + the `loyaltyTransactions` ledger pattern.

- [ ] **Step 1: schema** — add `giftCards` + `giftCardTransactions` tables (spec shapes + indexes).
- [ ] **Step 2: FAILING tests** — issue/topup/getByCode/list/archive round-trip; reject duplicate code, non-positive balance, code < 4 chars; owner-scope; ledger rows written (issue/topup). Run → FAIL.
- [ ] **Step 3: `convex/giftCards.ts`** — `issue`/`topup`/`archive`/`list`/`getByCode`/`transactions` (spec). Owner-gated; code uppercased+trimmed; unique per cafe; every balance change writes a ledger row.
- [ ] **Step 4: register + tests + commit** — api.d.ts (`giftCards`); `pnpm test tests/convex/gift-cards.test.ts` + full PASS; `pnpm typecheck` PASS.
  `git add convex/giftCards.ts convex/schema.ts convex/_generated/api.d.ts tests/convex/gift-cards.test.ts && git commit -m "feat(giftcards): cards + ledger + issue/topup/balance management"`

---

### Task 2: Backend redemption + void refund (TDD)
**Files:** create `convex/lib/giftcard.ts`; modify `convex/lib/sale.ts`, `convex/orders.ts`, `convex/lib/payment.ts`, `convex/reports.ts`, `convex/schema.ts`.

READ (current state): `convex/lib/sale.ts` `PaymentInput` + the split-tender validation/payment-row insert + `reverseSettledSale`; `convex/orders.ts` `createSplitSale` tenders + `orderSummary`/`orderRow`/`orderDetail`/`search`; `convex/lib/payment.ts`; `convex/reports.ts` `payments`. Use the explore map's exact line points.

- [ ] **Step 1: schema** — `payments.method` union +`'giftcard'` + add `giftCardId: v.optional(v.id('giftCards'))`; `orders.paymentBreakdown[].method` +`'giftcard'`; `orders.paymentMethod` +`'giftcard'`.
- [ ] **Step 2: FAILING tests** (extend `tests/convex/gift-cards.test.ts`):
  - redeem full via `createGiftCardSale` (balance 100k, total 100k → paid, balance 0, redeem ledger −100k, a giftcard payment row with giftCardId).
  - redeem partial via `createSplitSale` (card 100k + cash 50k on a 150k order → card 0, reconciliation cash = 50k NOT 150k, paid).
  - insufficient balance rejected (balance unchanged).
  - void refund (void a gift-card sale → balance restored + refund ledger; double void no double-refund).
  - `reports.payments` shows a giftcard bucket with the redeemed amount.
  Run → FAIL.
- [ ] **Step 3: `convex/lib/giftcard.ts`** — `redeemGiftCard(ctx, cafeId, code, amountIDR, orderId)` (spec): resolve by `by_cafe_code` (uppercased), validate active + integer>0 + balance≥amount, deduct, write `redeem` ledger (−amount), return card._id.
- [ ] **Step 4: `convex/lib/sale.ts`** — `PaymentInput`: add `{ method:'giftcard'; giftCardCode: string }` (standalone; redeems the computed `totalIDR`) + the split tenders union gains `{ method:'giftcard'; giftCardCode; amountIDR }`. In `buildOrder` (after the order insert so `orderId` exists): for the standalone giftcard payment, `redeemGiftCard(ctx, cafeId, code, totalIDR, orderId)` + insert a `payments` row `{ method:'giftcard', giftCardId, amountIDR: totalIDR }`, `paymentBreakdown=[{method:'giftcard',amountIDR:totalIDR}]`, headline `paymentMethod:'giftcard'`. For a split giftcard leg, `redeemGiftCard(..., tender.amountIDR, orderId)` + a giftcard payment row + a `{method:'giftcard',amountIDR}` breakdown entry. Keep `Σ tenders === totalIDR`.
  `reverseSettledSale`: after the existing reversal, `payments.by_order().collect()`; for each `method==='giftcard'` row, `get(row.giftCardId)` → `patch(balanceIDR += row.amountIDR)` + a `refund` ledger row (+amount, orderId).
- [ ] **Step 5: `convex/orders.ts`** — add `createGiftCardSale({ ...saleArgs, giftCardCode })` (buildOrder giftcard + settle). Add the giftcard object to `createSplitSale` tenders union. Add `'giftcard'` to `orderSummary`/`orderRow` `paymentMethod`, `orderDetail` `payments[].method` (+ a `giftCardId`? not needed in detail), and the `search` filter. `convex/lib/payment.ts`: `PayMethod` +`'giftcard'`. `convex/reports.ts`: method union +`'giftcard'` + include it in the bucket order array.
- [ ] **Step 6: tests + commit** — `pnpm test` full PASS (existing payment/split/void tests green); `pnpm typecheck` PASS. Commit:
  `git add convex/lib/giftcard.ts convex/lib/sale.ts convex/orders.ts convex/lib/payment.ts convex/reports.ts convex/schema.ts tests/convex/gift-cards.test.ts && git commit -m "feat(giftcards): redeem as a tender (full+split) + void refund"`
> Do NOT run codegen.

---

### Task 3: Management page + nav
**Files:** create `src/routes/_pos/gift-cards.tsx`, `src/components/giftcard/gift-card-form-dialog.tsx`; modify `src/components/app-shared.tsx`; commit `routeTree.gen.ts`.

READ: `src/routes/_pos/suppliers.tsx` (CRUD page + RequirePermission canEditMenu + DataTable/FormDialog/ConfirmDialog).

- [ ] **Step 1:** `gift-cards.tsx` — RequirePermission `canEditMenu`; list `api.giftCards.list` (code, balance `formatIDR`, status); "Terbitkan kartu" (issue: code + balance), per-row "Isi saldo" (topup) + archive; mirror suppliers.
- [ ] **Step 2:** nav "Kartu Hadiah" (`CreditCard`/`Gift` icon, `requires:'canEditMenu'`).
- [ ] **Step 3:** `pnpm build` → routeTree has `/gift-cards`; stage it. typecheck + test PASS. Commit.

---

### Task 4: Checkout — standalone + split giftcard tender + receipt
**Files:** create `src/components/giftcard/gift-card-payment-dialog.tsx`; modify `payment-methods.tsx`, `sale-screen.tsx`, `split-payment-dialog.tsx`, `receipt-preview.tsx`.

READ: the 4 payment dialogs (the create-call + customer/loyalty section), `split-payment-dialog.tsx` (the `SyncMethod` + tender rows), `payment-methods.tsx`, `receipt-preview.tsx` payment render.

- [ ] **Step 1: standalone** — `gift-card-payment-dialog.tsx`: enter code → `api.giftCards.getByCode` shows balance; if `balance ≥ total` enable "Bayar" → `createGiftCardSale({ ...saleArgs, giftCardCode })` (mirror cash dialog's args incl orderType/manualDiscount/customer/tableId); else show "use split". Add a "Kartu hadiah" entry point button in `sale-screen.tsx` (near pay buttons / split button) that opens it. (Type plumbing in `payment-methods.tsx` only if needed.)
- [ ] **Step 2: split tender** — `split-payment-dialog.tsx`: `SyncMethod` += `'giftcard'`; a giftcard tender row has a code `Input` + a `getByCode` balance preview; its amount ≤ min(balance, remaining); the submitted tender is `{ method:'giftcard', giftCardCode, amountIDR }`. Show "Kartu hadiah" in the method select (gate on a settings flag or always available).
- [ ] **Step 3: receipt** — `receipt-preview.tsx`: a `payments[]` entry with `method==='giftcard'` renders `Gift card` + the amount (the payment row carries the method/amount; the code isn't on the detail — show just "Gift card {formatIDR(amount)}").
- [ ] **Step 4:** typecheck + test PASS. Commit.

---

### Task 5: i18n
New: `Kartu hadiah`, `Kode kartu`, `Saldo`, `Terbitkan kartu`, `Isi saldo`, `Belum ada kartu hadiah.`, `Kartu Hadiah` (nav) (+ reuse). Server msgs (`Saldo kartu hadiah tidak cukup.`, `Kartu hadiah tidak ditemukan.`) are off-catalog (thrown).
- [ ] `pnpm lingui:extract`; fill `en` (`Gift card`, `Card code`, `Balance`, `Issue card`, `Top up`, `No gift cards yet.`, `Gift cards`) + others; `pnpm lingui:compile` → en 0 missing. Commit.

---

### Task 6: Final verification + adversarial review
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; `git status` clean — **routeTree.gen.ts committed**.
- [ ] code-reviewer on `git diff main...HEAD`: redeem deducts atomically inside buildOrder; idempotent replay (same clientId) doesn't double-deduct; balance never goes negative (balance≥amount guard); `Σ tenders === total` with a giftcard leg; void refunds exactly once (paymentStatus guard) and credits the right card via the stored `giftCardId`; reconciliation excludes giftcard from cash; reports attribute the giftcard amount; an archived/insufficient card is rejected; the redeemed amount is server-authoritative (reads `card.balanceIDR`, the tender amount is validated ≤ balance).
- [ ] **Manual sanity:** issue a Rp 100k card; pay a Rp 80k order fully with it → balance Rp 20k, receipt shows the gift-card tender; pay a Rp 150k order with the (20k) card + cash → card 0, drawer +the cash only; void the 80k order → card back to (its then) balance + Rp 80k; reports show a gift-card bucket.

---

## Self-Review
**Spec coverage:** tables+ledger+management (T1); redeem helper + tender/split + void refund + unions (T2); management page+nav (T3); standalone+split+receipt UI (T4); tests full/partial/insufficient/void/reconcile/reports (T1,T2); i18n (T5); review (T6). ✓
**Placeholder scan:** test seeding "copy from orders/split tests"; UI "mirror suppliers/cash dialog". Else spec code.
**Type consistency:** `redeemGiftCard(ctx,cafeId,code,amountIDR,orderId)→giftCardId` used by both the standalone + split paths in buildOrder + (refund inverse) in void. payment row `{method:'giftcard',giftCardId,amountIDR}`; void reads `row.giftCardId`. tender `{method:'giftcard',giftCardCode,amountIDR}` matches the dialog + createSplitSale union. `'giftcard'` added consistently across schema + validators + payment.ts + reports. cashCollectedIDR still filters 'cash' (giftcard excluded). ✓
