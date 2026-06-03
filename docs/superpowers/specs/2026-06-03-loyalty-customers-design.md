# Design — Loyalty & Customers · 2026-06-03

## Summary

Introduce a customer directory and a points-per-spend loyalty program. Cashiers
attach a customer to a cash sale by phone lookup; identified sales **earn**
points and may **redeem** points for a discount that stacks on top of an existing
promo. Owners manage the customer directory on `/customers` and the program
config + stats on `/loyalty`. Both stub routes (`ComingSoon`) and their nav
entries (`Pelanggan`, `Loyalitas`) already exist.

This is one feature spanning two related pages — loyalty rewards sit on top of
the customer directory — so they are designed together. The implementation plan
may phase the work (directory + earn first, redeem-at-checkout second).

## Decisions (locked)

- **Mechanic:** points per spend. Owner-configurable earn rate + redemption value.
- **POS identification:** phone lookup inside the existing `CashPaymentDialog`;
  optional per sale (walk-ins leave it blank and earn nothing).
- **Redemption vs promo:** they **stack**. Order of operations: promo first, then
  points off the remainder, then service charge, then PB1 tax.
- **Earn base:** net goods value = `subtotal − promoDiscount − pointsRedeemedIDR`
  (excludes tax and service charge).
- **Redemption granularity:** whole blocks only (multiples of the configured
  block), clamped so redemption never exceeds the remaining goods value.
- **Defaults:** earn `1 pt / Rp 1.000`; redeem `100 pt = Rp 10.000` (≈10% back).
- **Page split:** Loyalty = config + stats; Customers = directory + detail.
- **Access:** `/customers` and `/loyalty` are owner-only; POS phone-capture and
  quick-create are available to any active cashier.

## Architecture

### Points storage — stored balance + ledger audit

Each `customers` doc carries denormalized aggregates (`pointsBalance`,
`visitCount`, `totalSpentIDR`); every points change also writes an immutable
`loyaltyTransactions` ledger row. Both are updated atomically inside the same
Convex mutation, so they cannot drift.

This deliberately differs from the event-sourced inventory model (`stock = Σ
movements`). Inventory has a handful of ingredients, so deriving on read is
cheap. A customer directory lists hundreds of rows with their balances, so
O(1) stored aggregates are the right call; the ledger remains the source of
truth for per-customer history and audits.

### Schema (`convex/schema.ts`)

```ts
customers: defineTable({
  cafeId: v.id('cafes'),
  name: v.string(),
  phone: v.string(),            // normalized via convex/lib/phone.ts normalizePhone
  note: v.optional(v.string()),
  pointsBalance: v.number(),     // denormalized; == Σ loyaltyTransactions.points
  visitCount: v.number(),
  totalSpentIDR: v.number(),     // Σ order.totalIDR for this customer
  lastVisitAt: v.optional(v.number()),
  archived: v.boolean(),
  createdAt: v.number(),
})
  .index('by_cafe_phone', ['cafeId', 'phone'])   // lookup + per-cafe uniqueness
  .index('by_cafe_active', ['cafeId', 'archived'])
  .index('by_cafe_points', ['cafeId', 'pointsBalance']),

loyaltyTransactions: defineTable({
  cafeId: v.id('cafes'),
  customerId: v.id('customers'),
  orderId: v.optional(v.id('orders')),   // set for earn/redeem from a sale; absent for manual adjust
  type: v.union(v.literal('earn'), v.literal('redeem'), v.literal('adjust')),
  points: v.number(),            // signed delta: earn/adjust+ positive, redeem negative
  note: v.optional(v.string()),
  at: v.number(),
})
  .index('by_customer_at', ['customerId', 'at']),
```

Program config is a new optional `loyalty` group on the existing `cafeSettings`
table (alongside `payment`/`receipt`/`integrations`):

```ts
loyalty: v.optional(
  v.object({
    enabled: v.boolean(),
    earnRatePerIDR: v.number(),   // Rp spent per 1 point earned (default 1000)
    redeemBlockPoints: v.number(),// points per redemption block (default 100)
    redeemBlockIDR: v.number(),   // Rp value per block (default 10000)
  })
),
```

Phone uniqueness per cafe is enforced in the mutation (query `by_cafe_phone`
before insert), not by a DB constraint — Convex has no unique indexes.

### Order snapshot fields (`orders`)

Optional, mirroring the promo/service-charge snapshot pattern (absent on older
orders, always written going forward when a customer is attached):

```ts
customerId: v.optional(v.id('customers')),
pointsRedeemed: v.optional(v.number()),     // points spent on this order
pointsRedeemedIDR: v.optional(v.number()),  // their Rp value (part of discountIDR)
pointsEarned: v.optional(v.number()),       // points granted by this order
```

`discountIDR` continues to be the single combined discount that feeds
`computeOrderTotals`; it now equals `promoDiscount + pointsRedeemedIDR`. The
`appliedPromo` snapshot is unchanged.

## Components & data flow

### Pure helpers — `convex/lib/loyalty.ts`

Pure (no ctx/React imports) so `createCashSale` (authoritative) and the cash
dialog (preview) compute identically, mirroring `convex/lib/pricing.ts`.

```ts
type LoyaltyConfig = { enabled: boolean; earnRatePerIDR: number;
                       redeemBlockPoints: number; redeemBlockIDR: number };

// Rp value of redeeming `points`, given config. points must be a whole multiple
// of redeemBlockPoints; returns floor(points / block) * blockIDR.
redemptionIDR(points: number, cfg: LoyaltyConfig): number

// Points earned on a net base, floored. Returns 0 when disabled or earnRate<=0.
pointsEarned(baseIDR: number, cfg: LoyaltyConfig): number

// Largest whole-block points redeemable for this customer given balance and the
// remaining goods value (afterPromo). Used for the "max" button + server clamp.
maxRedeemablePoints(balance: number, afterPromoIDR: number, cfg: LoyaltyConfig): number
```

### Backend modules

- **`convex/customers.ts`**
  - `list({ includeArchived?, search? })` — owner-scoped, id-ID sorted; search
    matches name or normalized phone.
  - `findByPhone({ phone })` — POS lookup (active cashier allowed); returns the
    active customer or null.
  - `getDetail({ id })` — profile + recent `loyaltyTransactions` (capped, e.g.
    100 rows, `truncated` flag like `ingredients.listMovements`).
  - `create` / `update` / `archive` — `assertCustomer` (name 1–60, phone valid
    after `normalizePhone`, uniqueness check). Ownership via `requireOwnerCafe` /
    `requireOwned`. `create` also allowed for active cashiers (POS quick-create).
  - `adjustPoints({ id, points, note })` — owner-only manual `adjust` ledger row +
    atomic balance update; balance may not go negative.
- **`convex/loyalty.ts`**
  - `getConfig` / `updateConfig` — read/write the `cafeSettings.loyalty` group
    (defaults-merged), owner-only, following `settings.ts` patterns.
  - `stats()` — owner-only: member count (`by_cafe_active`), points outstanding
    (Σ balances over active customers), and top customers (`by_cafe_points`,
    descending, limited). Lifetime points issued/redeemed is **deferred** to
    avoid unbounded ledger scans.

### Checkout — `createCashSale` changes

New optional args `customerId`, `redeemPoints`. After the existing promo block:

1. `afterPromo = subtotalIDR − promoDiscount`.
2. If `customerId`: re-fetch the customer (tenant-checked, not archived). Load
   the `loyalty` config.
3. If `redeemPoints > 0`: require program enabled, `redeemPoints` a whole
   multiple of `redeemBlockPoints`, `redeemPoints ≤ customer.pointsBalance`, and
   `redemptionIDR ≤ afterPromo` (else error). `pointsRedeemedIDR = redemptionIDR(...)`.
4. `discountIDR = promoDiscount + pointsRedeemedIDR` → `computeOrderTotals`.
5. After inserting the order + payment + inventory movements:
   - `base = subtotalIDR − discountIDR`; `pointsEarned = pointsEarned(base, cfg)`
     when enabled.
   - Write a `redeem` ledger row (negative) if any; write an `earn` ledger row
     (positive) if any — both with `orderId`.
   - Atomically patch the customer: `pointsBalance += earned − redeemed`,
     `visitCount += 1`, `totalSpentIDR += totalIDR`, `lastVisitAt = now`.
   - Persist the order snapshot fields (`customerId`, `pointsRedeemed`,
     `pointsRedeemedIDR`, `pointsEarned`).

**Idempotency:** the existing `clientId` short-circuit returns the existing order
*before* any of this runs, so a replay never double-earns or double-redeems.

### UI

- **`CashPaymentDialog`** (`src/components/sale/cash-payment-dialog.tsx`): a
  "Pelanggan" section — phone input → debounced `customers.findByPhone` → shows
  the found customer (name + balance) or an inline "+ Tambah pelanggan baru"
  (name + phone, calls `customers.create`). When a customer with a usable balance
  is attached and the program is enabled, a "Tukar poin" control offers block
  buttons (`100`, `200`, … up to `maxRedeemablePoints`) plus a "max" option, with
  a live discount line. The dialog already owns the total/tendered/change math; it
  now folds promo (from cart) + points into the breakdown via `computeOrderTotals`
  + the loyalty helpers, and passes `customerId` + `redeemPoints` to
  `createCashSale`.
- **Receipt** (`src/components/sale/receipt-preview.tsx`): adds a "Points
  redeemed" discount line (when `pointsRedeemedIDR > 0`) and a footer "Points
  earned: +X · Balance: Y" (when a customer is attached). Receipt copy is
  **English-only** per the project rule; on-screen UI is id/en.
- **Customers page** (`src/routes/_pos/customers.tsx`, replacing the stub): Catalog
  UI kit — `PageHeader`, search, Aktif/Arsip toolbar, `DataTable`
  (Nama · Telp · Poin · Kunjungan · Total belanja), `RowActions`
  (Ubah / Arsipkan→`ConfirmDialog`), shadcn `Empty`. Row → a detail `Sheet`:
  profile, points balance, transaction history, "Sesuaikan poin" (manual adjust),
  and edit. `CustomerFormDialog` (`src/components/customer/customer-form-dialog.tsx`)
  for create/edit.
- **Loyalty page** (`src/routes/_pos/loyalty.tsx`, replacing the stub): a program
  config card (Program aktif toggle, earn rate, redemption value) saved via
  `loyalty.updateConfig`, plus stat cards (members, points outstanding) and a top-
  customers table from `loyalty.stats`.

## Error handling

- Redemption rejected with clear Indonesian messages when: program disabled,
  points not a whole block, insufficient balance, or value exceeds remaining
  goods total. Cash-tendered validation uses the final (post-redemption) total.
- Duplicate phone on create/update → "Nomor telepon sudah terdaftar."
- Manual adjust may not drive the balance below zero.
- Attaching an archived customer at POS is rejected.

## Testing

- **Convex specs:** customers CRUD + phone uniqueness + tenant isolation;
  `adjustPoints` (positive/negative, no-negative-balance); `createCashSale` with
  customer earn-only, redeem-only, promo+redeem stacking, block/balance/over-value
  rejections, and idempotent replay asserting **no** double earn/redeem; `loyalty`
  config defaults-merge + auth guard; `stats` aggregation + tenant isolation.
- **Pure unit tests:** `convex/lib/loyalty.ts` (`pointsEarned`, `redemptionIDR`,
  `maxRedeemablePoints` — flooring, disabled, block math, clamps).
- **Playwright e2e:** create a customer; sale with an attached customer earns the
  expected points; redeem a block at checkout (with a promo also applied) and
  verify the receipt lines + updated balance.

## i18n

Indonesian source strings + filled `en` translations for all new UI; run
`lingui:extract` + fill, then `lingui:compile`. Receipt strings stay English and
out of the catalog (project rule).

## Deferred (YAGNI)

Points expiry, membership tiers, SMS/WhatsApp notifications, redemption on the
QRIS path (checkout is cash-only today), per-item/category rewards, customer CSV
export, and lifetime points-issued/redeemed trend stats.
