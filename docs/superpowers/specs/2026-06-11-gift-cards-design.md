# Gift Cards / Vouchers Design Spec

**Date:** 2026-06-11
**Branch:** `feat/gift-cards` (off `main`)

## Context

Prepaid gift cards: issue a card with a balance, redeem it as a **tender** at checkout (full
or partial — composing with the split-tender flow), top it up, check its balance. Money-core
(real prepaid value) → TDD-first + an adversarial review, like split-tender.

## Model — two tables

```ts
giftCards: defineTable({
  cafeId: v.id('cafes'),
  code: v.string(),          // unique per cafe, stored UPPERCASED
  balanceIDR: v.number(),    // current redeemable balance (mutable, like customer.pointsBalance)
  status: v.union(v.literal('active'), v.literal('archived')),
  createdAt: v.number(),
}).index('by_cafe_code', ['cafeId', 'code'])
  .index('by_cafe_status', ['cafeId', 'status']),

giftCardTransactions: defineTable({   // audit ledger
  cafeId: v.id('cafes'),
  giftCardId: v.id('giftCards'),
  type: v.union(v.literal('issue'), v.literal('topup'), v.literal('redeem'), v.literal('refund')),
  amountIDR: v.number(),     // signed delta (+issue/+topup/+refund, −redeem)
  orderId: v.optional(v.id('orders')),
  at: v.number(),
}).index('by_card_at', ['giftCardId', 'at']),
```
The stored `balanceIDR` is the source of truth; the ledger is the audit trail (every balance
change writes a ledger row whose `amountIDR` matches the applied delta).

## Backend — management (`convex/giftCards.ts`, new, owner-gated)
- `issue({ code, balanceIDR })` — uppercase+trim the code (≥ 4 chars); `balanceIDR` integer
  > 0; reject a duplicate code in the cafe (`by_cafe_code`); insert the card (`active`) + an
  `issue` ledger row (+balance). Returns id.
- `topup({ id, amountIDR })` — `requireOwned`; amount integer > 0; `balanceIDR += amount` + a
  `topup` ledger row.
- `archive({ id })` — `requireOwned`; set `status:'archived'` (a redeemable card can't be
  used once archived).
- `list({ includeArchived? })` — cafe's cards, newest-first.
- `getByCode({ code })` — resolve a card by code (uppercased) for the checkout balance preview;
  returns `{ _id, code, balanceIDR, status } | null` (owner-scoped).
- `transactions({ id })` — the card's ledger (newest-first) for the detail/audit view.

## Backend — redemption (the money path)

### Shared helper — `convex/lib/giftcard.ts` (new) or in `sale.ts`
`redeemGiftCard(ctx, cafeId, code, amountIDR, orderId)`:
- Resolve the card by `by_cafe_code` (uppercased code); throw `'Kartu hadiah tidak ditemukan.'`
  if missing or `status !== 'active'`.
- `if (!Number.isInteger(amountIDR) || amountIDR <= 0) throw 'Jumlah tidak valid.'`
- `if (card.balanceIDR < amountIDR) throw 'Saldo kartu hadiah tidak cukup.'`
- `ctx.db.patch(card._id, { balanceIDR: card.balanceIDR - amountIDR })`
- insert a `redeem` ledger row (`amountIDR: -amountIDR`, `orderId`).
- return `card._id` (so the payment row can store it).

### `PaymentInput` + tenders — `convex/lib/sale.ts`
- Add a standalone variant `{ method: 'giftcard'; giftCardCode: string; amountIDR: number }`
  (the full-payment case; `amountIDR` must equal `totalIDR`).
- The `split` `tenders` union gains `{ method: 'giftcard'; giftCardCode: string; amountIDR: number }`.
- `buildOrder`: when a tender/payment is `giftcard`, call `redeemGiftCard(...)` (after the
  order is inserted so `orderId` exists, alongside the payment-row insert) and insert the
  `payments` row with `method:'giftcard', giftCardId: <resolved>, amountIDR`. For a split, a
  giftcard leg contributes its `amountIDR` to `Σ === totalIDR` like any tender; `paymentBreakdown`
  includes a `{ method:'giftcard', amountIDR }` entry; the headline `paymentMethod` is `'split'`
  for a multi-tender order, or `'giftcard'` for a standalone full gift-card payment.
- **Idempotency:** the existing `clientId` guard returns the existing order without re-running
  buildOrder, so a replay never double-deducts (the redeem happens once, inside the single
  buildOrder mutation that also inserts the order+payments).

### Create mutation — `convex/orders.ts`
- `createGiftCardSale({ ...saleArgs, giftCardCode })` — `buildOrder(ctx, args, { method:'giftcard', giftCardCode, amountIDR: <total> })` then `settleSale`. (The handler can't know the total
  up front; pass the code and let buildOrder compute the total + redeem the full amount —
  i.e. the giftcard standalone variant carries only the code, and buildOrder redeems `totalIDR`.
  Simpler: the `giftcard` PaymentInput carries `{ giftCardCode }` only; buildOrder redeems the
  computed `totalIDR`.)
- `createSplitSale` `tenders` arg union gains the giftcard object `{ method:'giftcard', giftCardCode, amountIDR }`.

### Void refund — `convex/lib/sale.ts` `reverseSettledSale`
After the existing inventory + loyalty reversal and before/with the status patch, **read the
order's payment rows** (`payments.by_order().collect()`) and for each `method:'giftcard'` row:
`const card = await ctx.db.get(row.giftCardId)`; if present `patch(card._id, { balanceIDR: card.balanceIDR + row.amountIDR })` + insert a `refund` ledger row (`+row.amountIDR`, `orderId`).
(Idempotent overall via the `paymentStatus !== 'paid'` guard — a double void can't double-refund.)

### Schema + read-validator + report unions (add `'giftcard'`)
- `convex/schema.ts`: `payments.method` union + add `giftCardId: v.optional(v.id('giftCards'))`;
  `orders.paymentBreakdown[].method` union; `orders.paymentMethod` union (add `'giftcard'` for
  the standalone headline).
- `convex/orders.ts`: `orderSummary`/`orderRow` `paymentMethod` (+`'giftcard'`); `orderDetail`
  `payments[].method` (+`'giftcard'`); the `search` filter `paymentMethod` (+`'giftcard'`).
- `convex/lib/payment.ts`: `PayMethod` (+`'giftcard'`) so `methodTotals` can return a giftcard
  entry — but **`cashCollectedIDR` still filters `'cash'` only**, so a gift card is correctly
  excluded from cash reconciliation (verify in a test).
- `convex/reports.ts` `payments`: method union (+`'giftcard'`) + include `'giftcard'` in the
  bucket order array so it reports as its own method.

## Frontend

### Management page — `src/routes/_pos/gift-cards.tsx` (new route, owner-gated `canEditMenu`)
Issue (code + balance), top up, list (code, balance, status, archive), and a balance/ledger
peek. Mirror the suppliers admin pattern. Nav: a "Kartu Hadiah" entry.
> New route → commit `routeTree.gen.ts`.

### Checkout
- **Standalone**: a "Kartu hadiah" pay button (in the sale pay row) → a small dialog: enter
  code → `getByCode` shows the balance → if `balance ≥ total`, "Bayar" calls
  `createGiftCardSale({ ...saleArgs, giftCardCode })`; if balance < total, prompt to use the
  split flow.
- **Partial (split)**: `split-payment-dialog.tsx` gains a `giftcard` tender type — a method
  option "Kartu hadiah" with a code input + a `getByCode` balance preview; the leg's amount ≤
  min(balance, remaining). The submitted tender is `{ method:'giftcard', giftCardCode, amountIDR }`.
- Receipt: a giftcard payment row renders as `Gift card {code}` (the order detail `payments[]`
  carries the method; show the amount). Keep printed strings as the file does.

## Testing (heavy — money path)
**`tests/convex/gift-cards.test.ts` (new) + extend orders:**
- issue/topup/getByCode/list/archive round-trip; reject duplicate code, non-positive balance,
  too-short code; owner-scope.
- **Redeem full** (`createGiftCardSale`): card balance 100k, order total 100k → order paid,
  card balance 0, a `redeem` ledger row (−100k), a `giftcard` payment row with `giftCardId`.
- **Redeem partial via split**: card 100k, order 150k, split giftcard 100k + cash 50k → card 0,
  cash leg in the drawer (reconciliation cash = 50k, NOT 150k), order paid.
- **Insufficient balance** rejected (card 40k, redeem 50k → throw; balance unchanged).
- **Void refund**: void a gift-card-paid order → card balance restored + a `refund` ledger row;
  double void doesn't double-refund.
- **Reconciliation**: a gift-card tender is NOT counted as cash (`cashCollectedIDR`/shift).
- **Reports**: `reports.payments` shows a `giftcard` bucket with the redeemed amount.

Frontend (management, standalone dialog, split giftcard tender, receipt) by typecheck + smoke.

## i18n
New BI: `Kartu hadiah`, `Kode kartu`, `Saldo`, `Terbitkan kartu`, `Isi saldo`, `Saldo kartu hadiah tidak cukup.` (server), `Kartu hadiah tidak ditemukan.` (server), `Belum ada kartu hadiah.`,
etc. Extract + fill `en` (`Gift card`, `Card code`, `Balance`, `Issue card`, `Top up`, …), compile.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — `convex/giftCards.ts` is a NEW module (register in `api.d.ts`). **New
  route** → commit `routeTree.gen.ts`.
- **Money core** → adversarial review (deduct atomicity/idempotency, void refund, Σ tenders ==
  total, balance never negative, reconciliation excludes giftcard, no double-deduct/refund).
- Small conventional commits; PR → review → merge commit.

## Out of scope
- Gift card expiry; physical card printing/barcodes; selling a gift card AS a menu item
  (issuance is an admin action, not a sale line); partial refund of a single tender; transferring
  balance between cards; multi-currency; a gift-card-as-qris_dynamic async leg.
