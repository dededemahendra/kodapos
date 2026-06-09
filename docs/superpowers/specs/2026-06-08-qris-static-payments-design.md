# Static QRIS payments (Slice 5 — static)

**Date:** 2026-06-08
**Status:** Approved design, ready for implementation plan
**Branch:** `feat/qris-static-payments` (off `main`)
**Depends on:** the cash checkout path — `createCashSale`, `computeOrderTotals` (`convex/lib/pricing.ts`), `CashPaymentDialog`, `SaleScreen`, `receipt-preview`, and the loyalty `CustomerSection` (all merged, PR #31). The payment config schema (`cafeSettings.payment.*`) and the "Pajak & Pembayaran" settings page (`settings/tax.tsx`).

## Context

The V1 design (§5.2) splits non-cash payments into **static QRIS** (an uploaded QR image, no payment provider, reconciliation on the cafe) and **dynamic QRIS** (provider-backed via Xendit/Midtrans — charge API, webhooks, reconciliation cron). This slice is **static only**; dynamic QRIS is a later slice that needs provider credentials.

The groundwork is already in place and mostly unused:

- `cafeSettings.payment` already has `methods` (cash, qrisStatic, qrisDynamic, card, ewallet, transfer), `defaultMethod`, `qrisMerchantName`, `qrisNmid`, and `qrisImageStorageId` — all in the schema and in `updatePayment`'s validator.
- `orders.paymentMethod` and `payments.method` already include `qris_static`; `orders.paymentStatus` already supports `paid` (and reserves `pending`/`void` for dynamic + voids).
- `reports/payments` already aggregates by all three methods.
- The "Pajak & Pembayaran" page (`settings/tax.tsx`) already renders the method toggles, `defaultMethod`, cash rounding, quick-cash buttons, service charge, and the merchant-name/NMID inputs.

What's **missing**: the static-QR **image upload** UI (`qrisImageStorageId` is not in the settings form). What's **dead** (edited but never consumed): the method toggles + `defaultMethod` (checkout is cash-only), and `quickCashButtons` / `cashRounding` (the cash dialog ignores both).

**Key property: no schema migration.** Every field exists. This slice is wiring + UI + one new mutation.

## Goal

A cafe can take a static-QRIS payment end-to-end: the owner enables QRIS and uploads the QR image in settings; the cashier picks **Tunai** or **QRIS** at checkout; the QRIS dialog shows the QR for the customer to scan and pay; the cashier confirms → the order is recorded as `qris_static` / `paid`. Loyalty (earn + redeem) works exactly as it does for cash. As a coupled cleanup, the owner-configured `quickCashButtons` become live in the cash dialog.

## Decisions (from brainstorming)

- **Static QRIS = paid-on-confirm.** No provider/webhook; the cashier manually confirms. Order saves directly at `paymentStatus: 'paid'`. The reserved `pending` state stays unused until dynamic QRIS. Works fully offline, like cash.
- **Loyalty applies to QRIS** — the dialog reuses `CustomerSection`. Indonesian static QRIS is amount-less (the customer types the amount), so a redemption-reduced total is simply what the cashier tells them to enter.
- **Checkout method selection = two pay buttons** in the cart footer — one per enabled+supported method, `defaultMethod` first. Supported set this slice: `cash`, `qris_static`.
- **Scope = core + quick-cash buttons.** Wire `quickCashButtons` into the cash dialog. **`cashRounding` is deferred** to its own slice (it changes totals math + needs care).
- **Unsupported method toggles** (QRIS dinamis, Kartu, E-wallet, Transfer) are **disabled with a "Segera hadir" hint** so an owner can't enable a method with no checkout flow (per the V1 §5.2 EDC pattern).
- **Confirm-button wording: "Sudah dibayar".**

## Backend — sale mutation (shared core extraction)

`createCashSale` (`convex/orders.ts`, ~300 lines) currently does: idempotency check → shift/cashier guards → line build + modifier validation → subtotal → promo recompute → loyalty redemption fold → settings/tax/service-charge → `computeOrderTotals` → tendered check → insert `orders` + `payments` → inventory movements → loyalty transactions → customer patch.

Everything except the **payment-method-specific** bits is shared. Extract the shared core into a module-level helper in `orders.ts` (e.g. `buildAndInsertSale(ctx, cafeId, args, payment)`), where `payment` carries the method and method-specific values. Two thin mutations call it:

- **`createCashSale`** — unchanged contract. Method-specific: validate `cashTenderedIDR`, guard `tendered < total`, compute change, insert `payments` row with `cashTenderedIDR` + `changeIDR`.
- **`createQrisStaticSale`** (new) — args are `createCashSale`'s minus `cashTenderedIDR`. Method-specific: defensively assert `settings.payment.methods.qrisStatic === true` (else throw); insert order `paymentMethod: 'qris_static'`, `paymentStatus: 'paid'`; insert `payments` row `method: 'qris_static'`, `amountIDR: totalIDR`, `confirmedAt: now`, no `cashTenderedIDR`/`changeIDR`.

Both keep the same idempotency (`clientId` + `by_cafe_clientId`) and the same loyalty path (redeem fold before totals, earn on `subtotal − discount`, customer patch). The refactor must keep `createCashSale` byte-identical in behavior — existing cash tests stay green unchanged.

## Settings — QR image upload (`settings/tax.tsx`)

Under "Metode pembayaran", add a **QRIS Statis** sub-card shown when the `qrisStatic` toggle is on:

- **Image upload** reusing the existing pattern: `cafes.generateUploadUrl` (generic) → POST the file → store the returned `storageId` into the draft as `qrisImageStorageId`. This mirrors the logo upload in `settings/profile.tsx`.
- **Preview** of the current QR image.
- The existing **merchant name** + **NMID** inputs move under this card.

Changes:
- `settings.get` resolves and returns `payment.qrisImageUrl` (via `ctx.storage.getUrl(qrisImageStorageId)`) for preview, alongside the raw id — same shape as `cafes` logo resolution.
- The `tax.tsx` draft gains `qrisImageStorageId`; `handleSave` passes it through `updatePayment` (validator already accepts it).
- The **unsupported method toggles** (`qrisDynamic`, `card`, `ewallet`, `transfer`) render **disabled** with a "Segera hadir" caption.

## Checkout — two pay buttons (cart footer)

`SaleScreen` already has `subtotal`, `discount`, service-charge + tax flags. It reads `settings.payment.methods` + `defaultMethod` (new `useQuery` or extend an existing one) and renders one pay button per **enabled + supported** method:

- `cash` → "Tunai" → opens `CashPaymentDialog` (existing).
- `qris_static` → "QRIS" → opens `QrisStaticPaymentDialog` (new). Shown only when `methods.qrisStatic` **and** a QR image is configured.

`defaultMethod` orders the buttons (default first/left). If only one qualifies, it's a single full-width button. The current single-`onBayar` path becomes per-method open handlers. Empty-cart guard unchanged.

## QRIS-static dialog (`qris-static-payment-dialog.tsx`)

New component mirroring `CashPaymentDialog`'s props (subtotal/promoDiscount/serviceCharge*/tax*/cart/shift/cashier/promoId/onPaid) minus tendered. Layout, top to bottom:

1. `CustomerSection` (loyalty) — identical wiring to the cash dialog.
2. Redeem line (if any) + **Total tagihan** — same `computeOrderTotals` math.
3. The **QR image, large** (scannable) + merchant name + NMID.
4. **"Sudah dibayar"** confirm button → `createQrisStaticSale({...lines, customerId?, redeemPoints?, promoId?, clientId, createdAtClient})` → `onPaid(orderId)`.

Same `clientId` generated-once-on-open pattern, same error toast handling, same submitting spinner as the cash dialog.

## Receipt (`receipt-preview.tsx`)

Already special-cases `method === 'cash'` for the Tunai/Kembalian lines. For `qris_static`: render a payment-method line ("QRIS") and **no** tendered/change. Loyalty points-earned/redeemed lines are unchanged. Receipt stays English and off the i18n catalog per the receipt convention.

## Quick-cash wiring (coupled cleanup)

`CashPaymentDialog` swaps its ad-hoc `computeDenominations(total)` for the owner's configured **`quickCashButtons`** (passed from `SaleScreen`, which already reads settings). Fallback to `computeDenominations` when the configured list is empty. Keep an "Uang pas" (exact total) option. `quickCashButtons` are fixed tender presets (e.g. 20k/50k/100k), not denominations-of-total — the standard POS pattern.

## Error handling, edge cases, offline

- **Offline-first:** static QRIS is local-only; the mutation queues and replays offline exactly like cash, idempotent via `clientId`.
- **Method disabled server-side:** `createQrisStaticSale` throws if `methods.qrisStatic` is false (defensive — UI shouldn't allow it).
- **No QR image configured:** the QRIS pay button doesn't render (gated on `qrisImageUrl`). The image is display-only and never required server-side, so a sale can't be blocked by a missing image once the button is shown.
- **Redeem without customer:** existing server guard (`Penukaran poin memerlukan pelanggan.`) applies unchanged.
- **Shift closed / cashier inactive:** existing guards in the shared core apply to both methods.

## Testing

- **Convex (`tests/convex/orders-qris.test.ts` or extend orders tests):**
  - `createQrisStaticSale` happy path — `orders` row (`qris_static`/`paid`) + `payments` row (`qris_static`, no tendered/change), inventory movements, loyalty earn/redeem transactions, customer patch (balance/visit/spend).
  - Idempotency on repeated `clientId`.
  - `qrisStatic`-disabled guard throws.
  - Redeem-without-customer guard throws.
  - **Totals parity:** cash and QRIS produce identical `totalIDR`/`discountIDR` for the same cart + promo + redemption.
- **Settings:** `qrisImageStorageId` save round-trip via `updatePayment`; `settings.get` returns a resolved `qrisImageUrl`.
- **e2e (light, `tests/e2e/sale.spec.ts`):** enable QRIS + upload image in settings → checkout via the QRIS button → confirm → receipt shows QRIS.
- **i18n:** new Bahasa strings, then `pnpm lingui:extract` + fill `en` (not just compile).

## Out of scope (explicit)

- Dynamic QRIS (provider integration, webhooks, reconciliation cron) — later slice.
- `cashRounding` application — deferred to its own slice.
- Card / e-wallet / transfer / GoPay-OVO-DANA flows — toggles disabled "Segera hadir".
- The cosmetic `settings/integrations.tsx` page — untouched.

## Suggested implementation order (for the plan)

1. Settings: `settings.get` `qrisImageUrl` + QR upload card + disable unsupported toggles.
2. Backend: extract shared sale core + `createQrisStaticSale` (+ tests).
3. Checkout: method-aware pay buttons + `QrisStaticPaymentDialog`.
4. Receipt `qris_static` variant + quick-cash wiring in the cash dialog.
5. i18n extract/fill + e2e smoke.
