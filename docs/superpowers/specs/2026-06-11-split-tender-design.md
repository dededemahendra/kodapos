# Split / Multi-Tender Payments Design Spec

**Date:** 2026-06-11
**Branch:** `feat/split-tender` (off `main`)

## Context

Today one order = one payment (one method). Customers sometimes pay one bill with two
tenders — e.g. Rp 60.000 cash + Rp 40.000 QRIS. This slice lets an order be settled by
**N tenders**, scoped to **synchronous methods only — `cash` + `qris_static`** (both settle
immediately at the register). **QRIS-dynamic (async/webhook) is explicitly excluded** from a
split — a partial async tender would need a partially-paid order + reconciliation/timeout
logic, out of scope.

Because both methods are synchronous, the whole split is collected at the register and
committed in **one atomic mutation** (`createSplitSale`): build the order once, insert N
payment rows, settle once. No partially-paid state.

## The core problem: payments are 1:1 today

The codebase assumes one `payments` row per order — `payments.by_order().unique()` appears in
`settleSale`, `voidPendingOrder`, `getById`, the build idempotency check, and `qrisDynamic`;
and cash reconciliation + the payment-method report aggregate by the order's single
`paymentMethod`. N tenders would (a) make `.unique()` THROW and (b) mis-attribute money.

## Design — `paymentBreakdown` on the order is the accounting source of truth

To keep the money-critical aggregations (cash reconciliation, reports, dashboard) reading the
**order doc** (no payment-row joins; they already load only orders) and uniform across
single/split/legacy orders:

- Add `order.paymentBreakdown: v.optional(v.array(v.object({ method, amountIDR })))` — the
  per-method amounts collected, summing to `totalIDR`. **`buildOrder` writes it for EVERY new
  order** (single-method = one entry `[{ method, amountIDR: totalIDR }]`; split = N entries).
- Add a literal **`'split'`** to `order.paymentMethod` — the *headline* method for a split
  order (display only). The breakdown, not this field, drives accounting.
- A shared helper `cashCollectedIDR(order)` and `methodTotals(order)` (in
  `convex/lib/payment.ts`) read `paymentBreakdown` when present, else fall back to the legacy
  shape (`paymentMethod === 'cash' ? totalIDR : 0` etc.). Reconciliation + reports + dashboard
  call these, so **legacy orders stay correct and splits are handled uniformly**.

Payment ROWS (N of them) are still inserted — they back the receipt and any per-tender record
— but accounting reads the order's `paymentBreakdown`.

## Backend

### Shared helper — `convex/lib/payment.ts` (new)
```ts
import type { Doc } from '../_generated/dataModel';
export type PayMethod = 'cash' | 'qris_static' | 'qris_dynamic';

/** Per-method collected amounts for an order, uniform across single/split/legacy. */
export function methodTotals(order: Doc<'orders'>): { method: PayMethod; amountIDR: number }[] {
  if (order.paymentBreakdown && order.paymentBreakdown.length > 0) return order.paymentBreakdown;
  // legacy / pre-breakdown order: derive from the single headline method.
  const m = order.paymentMethod;
  if (m === 'split') return []; // a split must always have a breakdown; defensive
  return [{ method: m, amountIDR: order.totalIDR }];
}
export function cashCollectedIDR(order: Doc<'orders'>): number {
  return methodTotals(order).filter((t) => t.method === 'cash').reduce((s, t) => s + t.amountIDR, 0);
}
```

### Schema — `convex/schema.ts`
- `orders.paymentMethod`: add `v.literal('split')` to the union.
- `orders`: add
  `paymentBreakdown: v.optional(v.array(v.object({ method: v.union(v.literal('cash'), v.literal('qris_static'), v.literal('qris_dynamic')), amountIDR: v.number() })))`.
- `payments.method` already supports the three methods (a split inserts cash + qris_static
  rows) — no change.

### Build + settle + void — `convex/lib/sale.ts`
- `PaymentInput` gains a split variant:
  ```ts
  | { method: 'split'; tenders: Array<
      | { method: 'cash'; amountIDR: number; tenderedIDR: number }
      | { method: 'qris_static'; amountIDR: number } > }
  ```
- `buildOrder`:
  - **Idempotency check** (the `existing` branch): replace `payments.by_order().unique()` with
    `.collect()` and `changeIDR = sum of rows' changeIDR` (a split's change is the sum of its
    cash legs).
  - After computing `totalIDR`, branch on `payment.method`:
    - single (`cash`/`qris_static`/`qris_dynamic`): as today — insert 1 payment row;
      `paymentBreakdown = [{ method: payment.method, amountIDR: totalIDR }]`; `orderMethod = payment.method`.
    - `split`: **validate** every tender method ∈ {cash, qris_static}; each `amountIDR` a
      positive integer; `Σ amountIDR === totalIDR` (`'Total tender tidak sama dengan total pesanan.'`);
      each cash tender `tenderedIDR ≥ amountIDR`. Insert **one payment row per tender**
      (`method`, `amountIDR`, cash legs also `cashTenderedIDR` + per-leg `changeIDR = tenderedIDR - amountIDR`).
      `changeIDR = Σ cash legs' change`; `paymentBreakdown = tenders.map(t => ({ method: t.method, amountIDR: t.amountIDR }))`;
      `orderMethod = 'split'`.
  - Store `paymentMethod: orderMethod` and `...(paymentBreakdown ? { paymentBreakdown } : {})`
    in the order insert; return `changeIDR`.
- `settleSale`: replace `payments.by_order().unique()` with `.collect()` and **loop-patch**
  each row's `confirmedAt` (+ `providerStatus:'paid'` only for a `qris_dynamic` row — N/A in a
  split but keep the per-row check).
- `voidPendingOrder`: same `.collect()` + loop-patch.
- `reverseSettledSale` (void): unchanged — it doesn't touch payment rows (documented).

### Create mutation — `convex/orders.ts`
```ts
export const createSplitSale = mutation({
  args: { ...saleArgs, tenders: v.array(v.union(
    v.object({ method: v.literal('cash'), amountIDR: v.number(), tenderedIDR: v.number() }),
    v.object({ method: v.literal('qris_static'), amountIDR: v.number() }),
  )) },
  returns: saleResult,
  handler: async (ctx, args) => {
    const res = await buildOrder(ctx, args, { method: 'split', tenders: args.tenders });
    await settleSale(ctx, res.orderId);
    return res;
  },
});
```
(`createSplitSale` is a new export in the registered `orders` module — no api.d.ts change;
`convex/lib/payment.ts` is a plain helper.)

### Read validators — `convex/orders.ts`
- Add `'split'` to `paymentMethod` in `orderSummary` and `orderRow`.
- Add `paymentBreakdown: v.optional(...)` (same shape) to `orderSummary`.
- **`getById`**: replace `payments.by_order().unique()` with `.collect()`; return
  `payments: v.array(paymentDetail)` (ordered) instead of `payment: union(obj, null)` — update
  `orderDetail` accordingly. (Receipt updated to render the array.)

### `convex/payments/qrisDynamic.ts`
`patchCharge` does `payments.by_order().unique()`; since a qris_dynamic order is never a split
(dynamic is excluded from splits), it stays 1:1 — but **narrow the query** to
`.filter(method === 'qris_dynamic')` before `.unique()` defensively. The `by_provider_ref`
lookups are inherently 1:1 (only dynamic legs have a ref) — unchanged.

### Money-critical aggregations (use the helper)
- **`convex/shifts.ts`** `shiftCashBreakdown` + `summarizeShift`: replace
  `orders.filter(paymentMethod==='cash').sum(totalIDR)` with
  `Σ cashCollectedIDR(order)` over paid orders. For the QRIS sales figure in `summarizeShift`,
  use `methodTotals` (qris_static + qris_dynamic). Legacy fallback keeps old shifts correct.
- **`convex/reports.ts`** `payments`: iterate paid orders → for each, add every
  `methodTotals(order)` entry to its method bucket (count: count a split once per method it
  uses, or count orders — KEEP `count` = number of orders touching that method; `amountIDR` =
  summed per method). `totalIDR` stays `Σ order.totalIDR`.
- **`convex/dashboard.ts`** payment channels: count/sum via `methodTotals` (a split contributes
  to both cash and qris channels).

## Frontend

### `payment-methods.tsx`
Add a non-method `PaymentMethod` value `'split'` only where needed for typing; add a **"Bagi
pembayaran"** (Split) action button to the pay row in the sale screen (shown when ≥1 tender
method is available and the cart is non-empty), opening the split dialog. (It's an action, not
a `PAYMENT_METHODS` `isReady` entry.)

### Split dialog — `src/components/sale/split-payment-dialog.tsx` (new)
- Shows the order total; a list of tender rows the cashier adds. Each row: a method select
  (Tunai / QRIS statis — only the configured/available ones), an `amountIDR` input; cash rows
  also a "tendered" input (≥ amount, shows change). A live **"Sisa: Rp X"** (remaining = total
  − Σ amounts) and a disabled submit until remaining is exactly 0 and each cash tendered ≥ its
  amount.
- Reuses the customer/loyalty section + `usePaymentTotals` for the order total (manual
  discount + promo already fold into the total via the existing `discountIDR` plumbing). The
  split is over the FINAL total (post all discounts) — so the dialog reads the same `totalIDR`
  the other dialogs compute.
- Submit → `createSplitSale({ ...saleArgs, tenders })`; on success `onPaid(orderId)`.

### Receipt — `src/components/sale/receipt-preview.tsx`
`getById` now returns `order.payments: PaymentDetail[]`. Render one line per tender
(`Tunai 60.000 / Kembalian 5.000`, `QRIS 40.000`), and the existing single-payment block
becomes a `.map`. Keep the printed strings as they are (English/off-catalog where they were).

## Testing (heavy — money path)

**`tests/convex/orders.test.ts` / a new `split-tender.test.ts`:**
- `createSplitSale` with cash 60k + qris_static 40k on a 100k order → 2 payment rows, order
  `paymentMethod === 'split'`, `paymentBreakdown` sums to 100k, order settles (`paid`),
  inventory/loyalty applied once.
- Cash overpay leg (tendered 70k for a 60k amount) → that row's `changeIDR === 10000`; returned
  `changeIDR` = 10000.
- Rejects `Σ amountIDR ≠ totalIDR`; rejects a `qris_dynamic` tender in a split; rejects a cash
  leg with `tenderedIDR < amountIDR`; rejects a non-positive amount.
- `settleSale` patches BOTH rows' `confirmedAt` (no `.unique()` throw).
- **Reconciliation:** open a shift, ring a split (cash 60k + qris 40k) + a pure-cash 50k →
  `shiftCashBreakdown`/`summarizeShift` expected cash includes 60k + 50k (NOT 100k, NOT 0 for
  the split). A legacy pure-cash order still counts fully (fallback).
- **Reports:** `reports.payments` over a range with a split → cash bucket gets 60k, qris_static
  bucket gets 40k; `totalIDR` = order total once.
- `getById` returns `payments` array of length 2.

**Frontend** (split dialog math, remaining=0 gating, receipt array) via typecheck + e2e smoke.

## i18n
New: `Bagi pembayaran`, `Tambah tender`, `Sisa`, `Tunai`/`QRIS statis` (reuse), `Metode`,
`Jumlah`, `Uang diterima`, `Tender melebihi/ kurang dari total`, etc. Extract + fill `en`
(`Split payment`, `Add tender`, `Remaining`, `Method`, `Amount`, `Cash received`, …), compile.
Receipt tender labels stay as the existing English/off-catalog style.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — schema derives; `createSplitSale` is a new export in the registered
  `orders` module; `convex/lib/payment.ts` is a plain helper.
- No new route → no `routeTree.gen.ts` change.
- **Money path** → adversarial review of the diff before merge (settle/void N rows, sum
  validation, reconciliation cash portion, report attribution, legacy fallback).
- Small conventional commits; PR → review → merge commit.

## Out of scope
- QRIS-dynamic (async) as a split leg; partially-paid orders.
- Splitting an order across multiple customers / itemized bill-splitting (this is tender-split,
  not bill-split).
- Refunding an individual tender (void reverses the whole order, as today).
- More than the existing two synchronous methods.
