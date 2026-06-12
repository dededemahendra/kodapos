# Manager (Ad-hoc Order) Discount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An ad-hoc order-level discount (percent or fixed), gated by `canDiscount`, applied post-promo, stored on the order, shown on the receipt. Money path → TDD + adversarial review.

**Architecture:** A `manualDiscount` arg threads through `saleArgs` → `buildOrder` (folded into `discountIDR` after promo, before loyalty; `manualDiscountIDR` stored separately). The client preview folds it into the existing `discount` variable (→ dialogs → `usePaymentTotals`) with no change to the totals helper. Server recomputes authoritatively.

**Tech Stack:** Convex, React + shadcn (Dialog/Select/Input/Button), Lingui, convex-test/Vitest.

---

## File Structure
- **Create:** `convex/lib/discount.ts`, `src/components/sale/manual-discount-dialog.tsx`.
- **Modify:** `convex/schema.ts`, `convex/lib/sale.ts`, `convex/orders.ts`, `src/components/sale/cart-reducer.ts`, `cart-pane.tsx`, `sale-screen.tsx`, `cash-payment-dialog.tsx`, `qris-static-payment-dialog.tsx`, `qris-dynamic-payment-dialog.tsx`, `receipt-preview.tsx`.
- **Test:** `tests/convex/orders.test.ts`. **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — manualDiscount through the sale (TDD)
**Files:** create `convex/lib/discount.ts`; modify `convex/schema.ts`, `convex/lib/sale.ts`, `convex/orders.ts`; test `tests/convex/orders.test.ts`.

READ: `convex/lib/sale.ts` lines 174–263 (promo block, loyalty block, `computeOrderTotals`, the order insert), `convex/lib/pricing.ts` (`promoDiscountIDR`), `convex/orders.ts` `orderSummary`, the existing promo-discount tests in `tests/convex/orders.test.ts`.

- [ ] **Step 1: `convex/lib/discount.ts`**
```ts
import { v } from 'convex/values';
export const manualDiscountValidator = v.object({
  type: v.union(v.literal('percent'), v.literal('fixed')),
  value: v.number(),
});
```

- [ ] **Step 2: schema** — `convex/schema.ts`: import `manualDiscountValidator`; in `orders` add
`manualDiscountIDR: v.optional(v.number())` and `manualDiscount: v.optional(manualDiscountValidator)`.

- [ ] **Step 3: FAILING tests** (append to `tests/convex/orders.test.ts`, copy the real createCashSale seeding/arg shape from neighbours):
```ts
describe('manual discount', () => {
  it('applies a fixed manual discount', async () => {
    // subtotal known (e.g. one item priceIDR 20000, qty 1), no promo, tax off:
    const { orderId } = await asOwner.mutation(api.orders.createCashSale, {
      /* base args */ manualDiscount: { type: 'fixed', value: 5000 }, cashTenderedIDR: 100000,
    });
    const o = await asOwner.query(api.orders.getById, { id: orderId });
    expect(o?.manualDiscountIDR).toBe(5000);
    expect(o?.totalIDR).toBe(15000);
  });
  it('applies a percent manual discount on the post-promo base', async () => {
    // 10% of 20000 = 2000 → total 18000
    const { orderId } = await asOwner.mutation(api.orders.createCashSale, {
      /* base */ manualDiscount: { type: 'percent', value: 10 }, cashTenderedIDR: 100000,
    });
    const o = await asOwner.query(api.orders.getById, { id: orderId });
    expect(o?.manualDiscountIDR).toBe(2000);
    expect(o?.totalIDR).toBe(18000);
  });
  it('rejects an invalid discount', async () => {
    await expect(asOwner.mutation(api.orders.createCashSale, {
      /* base */ manualDiscount: { type: 'percent', value: 150 }, cashTenderedIDR: 100000,
    })).rejects.toThrow();
  });
  it('omits manualDiscountIDR when no manual discount', async () => {
    const { orderId } = await asOwner.mutation(api.orders.createCashSale, { /* base, no manualDiscount */ cashTenderedIDR: 100000 });
    const o = await asOwner.query(api.orders.getById, { id: orderId });
    expect(o?.manualDiscountIDR).toBeUndefined();
  });
});
```
> Match the exact base createCashSale args + item price from neighbouring tests so the
> subtotal is deterministic. Run → confirm FAIL.

- [ ] **Step 4: implement** — `convex/lib/sale.ts`: import `manualDiscountValidator` from `./discount`; add `manualDiscount: v.optional(manualDiscountValidator)` to `saleArgs`; insert the manual-discount block from the design spec (after the promo block at ~line 189, before loyalty) and add the two conditional fields to the `ctx.db.insert('orders', {...})`. `convex/orders.ts`: import `manualDiscountValidator`; add `manualDiscountIDR: v.optional(v.number())` + `manualDiscount: v.optional(manualDiscountValidator)` to `orderSummary`.

- [ ] **Step 5: tests + typecheck + commit**
`pnpm test tests/convex/orders.test.ts` → PASS. `pnpm typecheck` → PASS.
```bash
git add convex/lib/discount.ts convex/schema.ts convex/lib/sale.ts convex/orders.ts tests/convex/orders.test.ts
git commit -m "feat(sale): ad-hoc manual order discount (post-promo, stored + on order)"
```
> Do NOT run codegen. `convex/_generated/api.d.ts` may pick up `lib/discount` via the dev watcher — if `git status` shows it, include it in the commit.

---

### Task 2: Cart state + manual-discount dialog
**Files:** modify `src/components/sale/cart-reducer.ts`; create `src/components/sale/manual-discount-dialog.tsx`.

- [ ] **Step 1: cart-reducer** — add:
```ts
export type ManualDiscount = { type: 'percent' | 'fixed'; value: number };
```
`CartState` gains `manualDiscount: ManualDiscount | null`; `CartAction` gains
`| { type: 'setManualDiscount'; manualDiscount: ManualDiscount | null }`; `initialCart` and the
`clearCart` literal get `manualDiscount: null`; add reducer case
`case 'setManualDiscount': return { ...state, manualDiscount: action.manualDiscount };`.

- [ ] **Step 2: manual-discount-dialog.tsx** — a dialog with a type Select (`Persen`/`Rupiah`),
a value `Input` (number, min 0), Apply + (when `current` set) a "Hapus diskon" button. Props
`{ open, current: ManualDiscount | null, onOpenChange, onApply(d), onRemove() }`. Validate
`value ≥ 0` and percent `≤ 100` (toast/inline error). On apply → `onApply({ type, value })`.

- [ ] **Step 3:** `pnpm typecheck` → PASS. Commit both files:
`git commit -m "feat(sale): cart manual-discount state + dialog"`

---

### Task 3: Checkout wiring (cart-pane + sale-screen + 3 dialogs)
**Files:** modify `cart-pane.tsx`, `sale-screen.tsx`, the 3 payment dialogs.

- [ ] **Step 1: cart-pane** — add props `manualDiscount?: ManualDiscount | null`,
`onAddManualDiscount?: () => void`, `onRemoveManualDiscount?: () => void`. Mirror the promo
control (already gated by `!empty && can('canDiscount')` at ~line 155): add a **"Diskon"**
trigger near the promo one, and when `manualDiscount` is set render a removable line
`<Trans>Diskon manual</Trans> ({formatPromoValue(manualDiscount.type, manualDiscount.value)})`
with an `onRemoveManualDiscount` ✕ (mirror the promo line at ~line 140).

- [ ] **Step 2: sale-screen** — replace the discount calc:
```ts
const promoDisc = cart.promo ? promoDiscountIDR(cart.promo.type, cart.promo.value, subtotal) : 0;
const manualDisc = cart.manualDiscount
  ? promoDiscountIDR(cart.manualDiscount.type, cart.manualDiscount.value, subtotal - promoDisc) : 0;
const discount = promoDisc + manualDisc;
```
(`discount` keeps feeding `computeOrderTotals` + the `promoDiscountIDR`/`discountIDR` props to
`CartPane` and the dialogs — preview total now includes the manual discount automatically.)
Add `manualDiscountOpen` state + render `<ManualDiscountDialog ... current={cart.manualDiscount}
onApply={(d) => dispatch({ type: 'setManualDiscount', manualDiscount: d })}
onRemove={() => dispatch({ type: 'setManualDiscount', manualDiscount: null })} />`. Pass
`manualDiscount`, `onAddManualDiscount`, `onRemoveManualDiscount` into `CartPane` (within the
`shift && cashierId` spread is fine, or always — gating is by `canDiscount` inside CartPane).

- [ ] **Step 3: 3 payment dialogs** — each create call already spreads `promoId`/`orderType`;
add `...(cart.manualDiscount ? { manualDiscount: cart.manualDiscount } : {})`.

- [ ] **Step 4:** `pnpm typecheck` → PASS. `pnpm test` → PASS. Commit the 5 files:
`git commit -m "feat(sale): apply manual discount in checkout + pass to all methods"`

---

### Task 4: Receipt
**Files:** modify `src/components/sale/receipt-preview.tsx`.

- [ ] **Step 1:** Compute `const manualDiscountIDR = order.manualDiscountIDR ?? 0;` and change the
existing promo split to `const promoDiscountIDR = (order.discountIDR ?? 0) - pointsRedeemedIDR - manualDiscountIDR;`.
In the totals block, when `manualDiscountIDR > 0`, render a line `<Trans>Diskon manual</Trans>`
with `-{formatIDR(manualDiscountIDR)}` (match the existing promo/discount line markup).
- [ ] **Step 2:** `pnpm typecheck` → PASS. Commit:
`git commit -m "feat(sale): show manual discount on receipt"`

---

### Task 5: i18n
New: `Diskon manual`, `Persen`, `Rupiah`, `Terapkan`, `Hapus diskon`, `Diskon tidak valid.`,
`Diskon persen maksimal 100.`, `Nilai diskon` (+ reuse `Diskon`, `Batal`, `Hapus`).
- [ ] `pnpm lingui:extract`; fill `en`: `Manual discount`, `Percent`, `Rupiah`, `Apply`,
`Remove discount`, `Invalid discount.`, `Percent discount max 100.`, `Discount value`. Fill any
other new empties. `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 6: Final verification + adversarial review
- [ ] `pnpm typecheck` → PASS; `pnpm test` → PASS; `pnpm lingui:compile` → en 0 missing; `git status` clean.
- [ ] Dispatch a code-reviewer agent on `git diff main...HEAD` focused on the pricing math:
  manual applies to the post-promo base; loyalty redeem applies to the post-manual remainder
  (no over-redemption / negative base); `discountIDR` aggregation correct; receipt attribution
  (promo vs manual vs points) sums to `discountIDR`; clamp at 0; percent ≤ 100 guard.
- [ ] **Manual sanity:** cashier with `canDiscount` sees a "Diskon" control → apply 10% / Rp X →
  cart total drops, receipt shows a "Diskon manual" line; a cashier without `canDiscount` sees no
  control; stacking with a promo + points keeps the total correct and non-negative.

---

## Self-Review
**Spec coverage:** validator (T1); schema + saleArgs/buildOrder post-promo block + insert +
read validators (T1); cart state + dialog (T2); cart-pane control gated by canDiscount +
sale-screen preview folding + dialogs pass-through (T3); receipt line + attribution fix (T4);
tests fixed/percent/invalid/omitted/stacking (T1); i18n (T5); adversarial review (T6). ✓
**Placeholder scan:** test base-args say "copy from neighbours" (deterministic subtotal). Else full code/snippets.
**Type consistency:** `ManualDiscount`/`manualDiscountValidator` identical members. `saleArgs.manualDiscount` matches the dialogs' create-call arg + cart state. `order.manualDiscountIDR`/`manualDiscount` optional in schema + echoed by `orderSummary` + read (guarded) in receipt. `discount` var folds promo+manual via `promoDiscountIDR`, same helper server uses. ✓
