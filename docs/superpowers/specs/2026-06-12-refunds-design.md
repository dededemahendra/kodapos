# Refunds / Returns Design Spec

**Date:** 2026-06-12
**Branch:** `feat/refunds` (off `main`)

## Context

kodapos can **void** a paid order — a full reversal (restock ingredients, claw back loyalty,
refund gift-card balance) that drops the order from all revenue. But there's no way to refund
**part** of an order (a customer returns one item), no explicit **cash-drawer audit trail** for
returned money, and refunds aren't distinguishable from mistake-voids in reporting.

This slice adds **full + partial refunds**: select whole order or specific lines/quantities,
refund to an original tender, restock only the returned items, and reflect refunds in the
money-truth reports. **QRIS refunds are record-only** (logged + netted from revenue; the
operator pushes QRIS money back out-of-band via Xendit — no provider API call). Cash refunds
write a real drawer outflow.

Money path → built TDD-first with an adversarial review of the refund mutation.

## Decisions (locked)
- **Scope:** full + partial (per-line, per-qty).
- **QRIS:** record-only (no Xendit reversal call); cash hits the drawer.
- **Accounting model:** a refund is a **dated event at refund time** — it reduces revenue/COGS
  in the *refund's* period and removes cash from the *current* shift's drawer (not the original
  sale's period). This matches the cash-out movement.

## Model

### New `refunds` table
```ts
refunds: defineTable({
  cafeId: v.id('cafes'),
  orderId: v.id('orders'),
  shiftId: v.id('shifts'),                 // the shift the refund is processed in
  cashierId: v.id('cafeStaff'),            // who processed it
  clientId: v.string(),                    // idempotency key
  method: v.union(
    v.literal('cash'), v.literal('qris_static'),
    v.literal('qris_dynamic'), v.literal('giftcard')
  ),                                       // tender refunded to
  amountIDR: v.number(),                   // total refunded this transaction
  lines: v.array(v.object({
    lineIndex: v.number(),                 // index into order.lines
    nameSnapshot: v.string(),
    qty: v.number(),                       // qty refunded in this transaction
    lineRefundIDR: v.number(),
  })),
  reason: v.optional(v.string()),
  at: v.number(),
})
  .index('by_cafe_clientId', ['cafeId', 'clientId'])
  .index('by_order', ['orderId'])
  .index('by_cafe_at', ['cafeId', 'at'])
  .index('by_shift', ['shiftId']),
```

### `orders` gains
- `refundedIDR: v.optional(v.number())` — materialized cumulative refunded total (for the
  fully-refunded check + the receipt badge). Per-line refunded qty is **derived** by scanning
  `refunds.by_order` (no change to `orders.lines`).

`paymentStatus` is **unchanged** — a refunded order stays `'paid'`. Refund effects are tracked
in the `refunds` ledger + `refundedIDR`, so existing `paymentStatus === 'paid'` filters keep
working and revenue reports subtract refunds separately (see Reporting).

## Backend — `convex/refunds.ts` (new) + `convex/lib/refund.ts` (pure helpers)

### `refunds.create` mutation (the money path)
**Args:** `{ orderId, clientId, cashierId, method, lines: [{ lineIndex, qty }], reason? }`.

**Auth/guards** (mirror `voidSale`):
- `requireOwnerCafe`; `requireOwned(order)`; `requireOwned(cashier)`.
- **Idempotency:** if a `refunds` row exists for `(cafeId, clientId)`, return it unchanged.
- Order must be `paymentStatus === 'paid'` (`'Hanya pesanan lunas yang bisa direfund.'`).
- `method` must be one of the order's tenders (from `paymentBreakdown`, or the headline
  `paymentMethod` for legacy single-method orders) (`'Metode refund tidak cocok.'`).
- **Cash refunds require an open shift:** look up the cafe's open shift; if none,
  `'Buka shift untuk refund tunai.'`. Non-cash refunds use the order's `shiftId` (or current
  open shift if available) for the ledger `shiftId`.

**Validation + amount (pure `convex/lib/refund.ts`):**
- For each requested `{ lineIndex, qty }`: `lineIndex` in range; `qty` integer > 0; and
  `qty ≤ remaining` where `remaining = order.lines[lineIndex].qty − alreadyRefundedQty`
  (alreadyRefundedQty summed from prior `refunds.by_order`). Reject over-refund
  (`'Melebihi jumlah yang bisa direfund.'`). Reject empty/all-zero (`'Pilih item untuk direfund.'`).
- **Per-unit refund value** allocates the order's discounts/tax/service-charge proportionally:
  `unitRefundIDR(line) = round(line.unitPriceIDR × order.totalIDR / order.subtotalIDR)`;
  `lineRefundIDR = unitRefundIDR × qty`; `amountIDR = Σ lineRefundIDR`.
- **Exact full-refund:** if this transaction returns the *last remaining* qty of *every* line
  (the order becomes fully refunded), set `amountIDR = order.totalIDR − (order.refundedIDR ?? 0)`
  to absorb rounding (so cumulative refunds equal `totalIDR` exactly). Cumulative
  `refundedIDR + amountIDR` must never exceed `totalIDR`.

**Side effects (mirror `reverseSettledSale`, scaled to returned qty):**
1. **Inventory restock:** for each refunded line, for each `order.lines[lineIndex].recipeSnapshot`
   ingredient: insert `inventoryMovements` `{ delta: +(qty × rl.qty × rl.wastageFactor),
   reason: 'adjustment', reasonLabel: 'Pengembalian pesanan', refType: 'order', refId: orderId }`.
2. **Loyalty (pro-rated)** when `order.customerId`: `fraction = amountIDR / order.totalIDR`;
   `clawback = round((order.pointsEarned ?? 0) × fraction)`;
   `recredit = round((order.pointsRedeemed ?? 0) × fraction)`;
   `newBalance = max(0, balance − clawback + recredit)`; if changed, insert
   `loyaltyTransactions { type: 'adjust', points: newBalance − balance, note: 'Pengembalian pesanan' }`
   and patch `customer.pointsBalance = newBalance`, `totalSpentIDR = max(0, totalSpentIDR − amountIDR)`.
   (`visitCount` unchanged — a return doesn't un-visit.)
3. **Gift card** when `method === 'giftcard'`: find the order's `payments` row with
   `method==='giftcard' && giftCardId`; patch `card.balanceIDR += amountIDR`; insert
   `giftCardTransactions { type: 'refund', amountIDR, orderId }`.
4. **Cash** when `method === 'cash'`: insert `cashMovements { direction: 'out', amountIDR,
   note: 'Refund pesanan', shiftId, cashierId, at }` (the drawer audit trail void lacks).
5. Insert the `refunds` row; patch `order.refundedIDR = (refundedIDR ?? 0) + amountIDR`.

Returns the refund id.

### `orders.refundInfo` query (new, owner-gated)
`{ orderId }` → `{ refundedIDR, fullyRefunded, methods: [...order tenders],
lines: [{ lineIndex, nameSnapshot, qty, refundedQty, remainingQty, unitRefundIDR }] }` —
drives the refund dialog (remaining-refundable per line + the proportional unit value).

## Reporting (money-truth reports only; analytical breakdowns stay gross — see Out of scope)
A refund is a dated event: subtract refunds (by `refund.at` in range) from revenue, and subtract
the **returned items' COGS** (from the order line's `recipeSnapshot × refunded qty × current
ingredient cost`).

- **`reports.profitLoss`:** add `refundsIDR` (Σ refund `amountIDR` in range) and `refundCogsIDR`;
  `revenueIDR` (gross) unchanged but add `netRevenueIDR = revenueIDR − refundsIDR`; `cogsIDR`
  reduced by `refundCogsIDR`; `grossProfitIDR = netRevenue − netCogs`; net profit flows down.
  Add `refundsIDR` to the returns + a P&L "− Pengembalian" line.
- **`reports.overview`** + **`dashboard` kpis:** `revenueIDR` becomes **net** (gross − refunds
  in range); expose a `refundsIDR` field.
- **Shift reconciliation:** automatic — the cash refund's `cashMovements{out}` row reduces
  `expectedCashIDR` via the existing `shiftCashBreakdown` (no shifts.ts change). QRIS/giftcard
  refunds don't touch the drawer.

## Frontend

### Refund dialog — `src/components/sale/refund-dialog.tsx` (new)
Props `{ orderId, open, onOpenChange, onDone }`. `orders.refundInfo` → a line list: each line a
checkbox + a qty stepper (default = `remainingQty`, clamp `0..remainingQty`; lines with
`remainingQty===0` shown disabled/"Sudah direfund"); a method `Select` (the order's tenders);
a reason `Input`; a live refund total (Σ selected `unitRefundIDR × qty`, or "seluruh sisa" exact
on full). Submit → `refunds.create` with a generated `clientId` (idempotent), `cashierId` from
`useActiveCashier`; disable while in-flight; toast; `onDone`.

### Wire into `receipt-preview.tsx`
Next to "Batalkan pesanan", add a **"Refund / Pengembalian"** button shown when
`order.paymentStatus === 'paid' && can('canVoid') && !fullyRefunded` (reuse the `canVoid`
permission — refund and void are both money-reversal; a dedicated `canRefund` is out of scope).
Opens the refund dialog. Show a **"Direfund {formatIDR(refundedIDR)}"** badge on partially/fully
refunded orders (and keep the existing void badge logic).

### Nav / history
No new route — refunds are initiated from the existing order views (reports/orders, shift order
list, sale screen) that already render `receipt-preview`.

## Testing
**`tests/convex/refunds.test.ts`** (new) — the money path, exhaustively:
- **Partial line refund:** return 1 of a 3-qty line → `refunds` row + `order.refundedIDR`
  bumped; ingredient `currentStockQty` up by exactly that line's `recipeSnapshot × 1`; loyalty
  pro-rated; `refundInfo` shows `remainingQty` reduced.
- **Full refund (all lines):** cumulative `refundedIDR === order.totalIDR` exactly (rounding
  absorbed); stock fully restored; gift-card/cash effects correct.
- **Over-refund rejected:** `qty > remaining` (and a second refund exceeding remaining) →
  throws `/melebihi/i`; nothing applied (stock/refundedIDR unchanged).
- **Idempotency:** same `clientId` twice → one refund, side effects applied once.
- **Cash refund:** writes a `cashMovements{out}` of `amountIDR`; with no open shift → throws.
- **Gift-card refund:** card `balanceIDR` rises by `amountIDR`; a `giftCardTransactions.refund` row.
- **Method guard:** a method not used by the order → throws.
- **Non-paid guard:** refunding a `void`/`pending` order → throws.
- **Owner-scope:** a foreign order/cashier → throws.
- **P&L:** revenue + a refund in range → `profitLoss.refundsIDR` set, `netRevenue`/COGS/net
  profit reduced by the refund + its COGS.

Frontend (dialog, line/qty selection, method, P&L line) by typecheck + smoke.

## i18n
New BI: `Refund`, `Pengembalian`, `Refund pesanan`, `Jumlah refund`, `Refund ke`, `Sudah direfund`,
`Direfund {0}`, `Pilih item untuk direfund.`, `Seluruh sisa`, `− Pengembalian`, server-thrown
`'Hanya pesanan lunas yang bisa direfund.'`/`'Melebihi jumlah yang bisa direfund.'`/`'Buka shift
untuk refund tunai.'`/`'Metode refund tidak cocok.'` (off-catalog). Extract + fill `en`
(`Refund`, `Refund order`, `Refund amount`, `Refund to`, `Already refunded`, `Refunded {0}`,
`Select items to refund.`, `All remaining`, `− Refunds`), compile.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — `refunds` is a NEW module (register in `api.d.ts`; dev watcher does it —
  commit). No new route → no `routeTree.gen.ts` change.
- Inventory-cost + cash + loyalty + gift-card path → **adversarial review** of `refunds.create`.
- Small conventional commits; PR → review → merge commit.

## Out of scope
- Xendit/QRIS automated reversal (record-only).
- A dedicated `canRefund` permission (reuse `canVoid`).
- Per-tender refund caps (operator picks the tender; only the order total is capped).
- Reflecting refunds in the per-product / margin / cashier / payments **breakdown** reports
  (they stay gross-of-refunds this slice; the money-truth reports — P&L, overview, dashboard,
  shift drawer — are net). Documented; a follow-up can thread refunds through the rest.
- Re-printing a refund receipt; refunding service-charge/tax independently of items; returning
  to a *different* tender than was paid; editing/reversing a refund (refunds are terminal).
