# Manager (Ad-hoc Order) Discount Design Spec

**Date:** 2026-06-11
**Branch:** `feat/manager-discount` (off `main`)

## Context

Cashiers can apply a **predefined promo** (a `promotions` row) to an order, but there's no
way to apply an **ad-hoc** discount — "10% off for the wait", "Rp 5.000 goodwill" — without
first creating a promotion. This slice adds a **manager order-level discount**: an ad-hoc
percent or fixed amount applied to the current order, gated by the existing `canDiscount`
permission, stored on the order, and shown on the receipt.

**Scope:** order-level ad-hoc discount only. **Per-line discounts are deferred** (more
surface, lower marginal value over promos). This is a money-path change → built TDD-first
with an adversarial review pass, like the void slice.

## Pricing model (where it slots in)

The discount pipeline is `subtotal → promo → MANUAL → loyalty-redeem → service charge →
tax`. The manual discount applies to the **post-promo** base and floors at 0; loyalty
redemption then applies to the remainder (unchanged ordering relative to promo). It reuses
the existing `promoDiscountIDR(type, value, base)` clamp helper so client preview and server
never drift.

`order.discountIDR` already aggregates promo + loyalty; the manual discount is **added into
`discountIDR`** too, with a separate `manualDiscountIDR` stored so the receipt can attribute
each source. Reports/dashboard use `order.totalIDR` (already net of all discounts) — no
report change needed; a manager discount simply lowers revenue, correctly.

## Shared validator — `convex/lib/discount.ts` (new)
```ts
import { v } from 'convex/values';
export const manualDiscountValidator = v.object({
  type: v.union(v.literal('percent'), v.literal('fixed')),
  value: v.number(),
});
```
Imported by `convex/schema.ts`, `convex/lib/sale.ts`, `convex/orders.ts`.

## Data model — `convex/schema.ts` (orders)
Add two optional fields (legacy-tolerant):
```ts
manualDiscountIDR: v.optional(v.number()),
manualDiscount: v.optional(manualDiscountValidator),
```

## Backend — `convex/lib/sale.ts`
- `saleArgs`: add `manualDiscount: v.optional(manualDiscountValidator)`.
- `buildOrder`, immediately AFTER the promo block (line ~189) and BEFORE the loyalty block:
  ```ts
  let manualDiscountIDR = 0;
  let manualDiscount: { type: 'percent' | 'fixed'; value: number } | undefined;
  if (args.manualDiscount) {
    const { type, value } = args.manualDiscount;
    if (!Number.isInteger(value) || value < 0) throw new Error('Diskon tidak valid.');
    if (type === 'percent' && value > 100) throw new Error('Diskon persen maksimal 100.');
    const base = subtotalIDR - discountIDR; // post-promo remainder
    manualDiscountIDR = promoDiscountIDR(type, value, base);
    discountIDR += manualDiscountIDR;
    manualDiscount = { type, value };
  }
  ```
- In the `ctx.db.insert('orders', { ... })`: add
  `...(manualDiscountIDR > 0 ? { manualDiscountIDR } : {})` and
  `...(manualDiscount ? { manualDiscount } : {})`.
  (The loyalty `afterPromo = subtotalIDR - discountIDR` already reads the updated
  `discountIDR`, so redemption correctly applies to the post-manual remainder — verify the
  loyalty block sits AFTER this insertion of `discountIDR += manualDiscountIDR`.)

## Backend — `convex/orders.ts` read validators
Add `manualDiscountIDR: v.optional(v.number())` + `manualDiscount: v.optional(manualDiscountValidator)`
to `orderSummary` (so `getById`/`orderDetail` echo them for the receipt).

## Frontend

### Cart state — `src/components/sale/cart-reducer.ts`
```ts
export type ManualDiscount = { type: 'percent' | 'fixed'; value: number };
// CartState gains: manualDiscount: ManualDiscount | null
// CartAction gains: | { type: 'setManualDiscount'; manualDiscount: ManualDiscount | null }
// initialCart + clearCart: manualDiscount: null
// reducer case setManualDiscount → { ...state, manualDiscount: action.manualDiscount }
```

### Manual-discount dialog — `src/components/sale/manual-discount-dialog.tsx` (new)
A dialog: a type toggle (Persen / Rupiah), a value `Input`, Apply + (when one is set)
Remove. On apply → `dispatch({ type: 'setManualDiscount', manualDiscount: { type, value } })`.
Validate `value ≥ 0`, percent `≤ 100`.

### Checkout wiring — `src/components/sale/cart-pane.tsx` + `sale-screen.tsx`
- A **"Diskon"** control in the cart, shown only when `useCan('canDiscount')` (mirror how the
  promo control is gated in the permission slice). Opens the manual-discount dialog. When a
  manual discount is set, show it as a removable line (like the promo line) with its computed
  IDR.
- In `sale-screen.tsx`, extend the existing discount computation:
  ```ts
  const promoDisc = cart.promo ? promoDiscountIDR(cart.promo.type, cart.promo.value, subtotal) : 0;
  const manualDisc = cart.manualDiscount
    ? promoDiscountIDR(cart.manualDiscount.type, cart.manualDiscount.value, subtotal - promoDisc) : 0;
  const discount = promoDisc + manualDisc;
  ```
  `discount` continues to feed `computeOrderTotals` and the `promoDiscountIDR` prop passed to
  the payment dialogs + `CartPane` — so the preview total already includes the manual
  discount with zero changes to `usePaymentTotals`.
- The 3 payment dialogs already pass `promoId`/`orderType` to their create calls; add
  `...(cart.manualDiscount ? { manualDiscount: cart.manualDiscount } : {})` alongside.

### Receipt — `src/components/sale/receipt-preview.tsx`
Currently `promoDiscountIDR = (order.discountIDR ?? 0) - pointsRedeemedIDR`. Subtract the
manual discount too, and render a separate line:
```tsx
const manualDiscountIDR = order.manualDiscountIDR ?? 0;
const promoDiscountIDR = (order.discountIDR ?? 0) - pointsRedeemedIDR - manualDiscountIDR;
// ...in the totals block, when manualDiscountIDR > 0, a "Diskon" line showing -manualDiscountIDR
```
Receipt content stays English/off-catalog where it already is; the on-screen labels use the
existing `<Trans>` style in that file.

## Testing

**`tests/convex/orders.test.ts`** (extend; mirror existing promo/discount tests):
- `createCashSale` with `manualDiscount: { type: 'fixed', value: 5000 }` → order
  `manualDiscountIDR === 5000`, `discountIDR` includes it, `totalIDR` reduced accordingly.
- `manualDiscount: { type: 'percent', value: 10 }` on a known subtotal → correct IDR
  (post-promo base), and stacks correctly **with** a promo (manual applies to post-promo
  remainder).
- Rejects `value < 0` and percent `> 100`.
- Omitted `manualDiscount` → no `manualDiscountIDR` on the order (back-compat; existing tests
  stay green).
- A manual + loyalty-redeem case: redemption applies to the post-manual remainder (no
  over-redemption).

Frontend (dialog, gating by `canDiscount`, preview total, receipt line) by typecheck + the
sale e2e smoke.

## i18n
New Bahasa Indonesia: `Diskon`, `Diskon manual`, `Persen`, `Rupiah`, `Terapkan`, `Hapus diskon`,
`Diskon tidak valid.`, `Diskon persen maksimal 100.`, `Nilai diskon`. Run extract, fill `en`
(`Discount`, `Manual discount`, `Percent`, `Rupiah`, `Apply`, `Remove discount`,
`Invalid discount.`, `Percent discount max 100.`, `Discount value`), compile.

## Conventions
- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run `convex codegen` — schema derives; `manualDiscount` args/validators are additions
  to registered modules; `convex/lib/discount.ts` is a plain helper.
- No new route → no `routeTree.gen.ts` change.
- Money path → an adversarial review pass on the diff before merge.
- Small conventional commits; PR → review → merge commit.

## Out of scope
- Per-line discounts.
- A discount-reason field / audit (could pair with the void-reason pattern later).
- A max-discount cap or manager-PIN re-auth beyond the `canDiscount` flag.
- Stacking rules UI (manual always applies to the post-promo remainder).
