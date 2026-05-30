# Service Charge — Design Spec

**Date:** 2026-05-30
**Slice:** Service Charge (wires the existing settings config into order pricing)
**Branch:** `feat/service-charge`

## Problem

The settings work added service-charge **configuration** —
`cafeSettings.payment.{serviceChargeEnabled, serviceChargePct, serviceChargeName}`
(default name `"Biaya Layanan"`) plus the settings UI to edit it — but nothing
consumes it. `createCashSale` computes `total = subtotal + tax` and never reads
the service-charge config, so toggling it on has no effect on any order.

## Goal

Apply the configured service charge to order pricing, end-to-end:

- Compute `serviceChargeIDR` on the order subtotal when enabled.
- Apply **PB1 (tax) AFTER service charge**: the tax base is
  `subtotal + serviceCharge`.
- Store the service charge on the order (with a pct/name snapshot for receipts).
- Surface it consistently in the live cart total, the cash-tendered validation,
  and the printed/preview receipt.

## Decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Tax ordering | PB1 applied **after** service charge (`tax = (subtotal + serviceCharge) × taxPct`) |
| Sync strategy | **Approach A** — one shared pure `computeOrderTotals` used by both server and client |
| Scope | Service charge only; **`cashRounding` is a separate later slice** |
| `taxInclusive` | Out of scope — pre-existing settings flag `createCashSale` doesn't honor today either; preserve current tax-exclusive behavior |
| Gating | Applies to every order when enabled (no dine-in/takeaway order-type exists to gate on) |
| Discount | `discountIDR` is `0` today (promo engine unbuilt) but kept in the formula so it slots in later |

### Approach A vs. alternatives

- **A (chosen):** a single pure `computeOrderTotals(...)` in `convex/lib/pricing.ts`,
  imported by `createCashSale` (server) and `sale-screen.tsx` (client). Client
  and server cannot drift; also removes the existing duplicated tax math.
- **B (rejected):** client fetches a server preview query per cart change —
  network round-trip per keystroke, overkill for 3 lines of arithmetic.
- **C (rejected):** duplicate the formula inline in both sites — perpetuates the
  drift risk that would cause the cashier to collect ≠ the recorded total.

## Pricing function — `convex/lib/pricing.ts` (new, pure)

```ts
export type PricingInput = {
  subtotalIDR: number;
  discountIDR?: number; // 0 today; kept so the promo engine slots in cleanly
  serviceChargeEnabled: boolean;
  serviceChargePct: number;
  taxEnabled: boolean;
  taxRatePct: number;
};

export type PricingResult = {
  serviceChargeIDR: number;
  taxIDR: number;
  totalIDR: number;
};

export function computeOrderTotals(input: PricingInput): PricingResult {
  const base = input.subtotalIDR - (input.discountIDR ?? 0);
  const serviceChargeIDR = input.serviceChargeEnabled
    ? Math.round((base * input.serviceChargePct) / 100)
    : 0;
  const taxIDR = input.taxEnabled
    ? Math.round(((base + serviceChargeIDR) * input.taxRatePct) / 100)
    : 0;
  return {
    serviceChargeIDR,
    taxIDR,
    totalIDR: base + serviceChargeIDR + taxIDR,
  };
}
```

Pure — no `ctx`, no React, no Convex server imports — so it bundles cleanly for
both the Convex runtime and the Vite client (the client already imports from
`convex/_generated/*`, so importing `convex/lib/pricing` is consistent).

Rounding: `Math.round` at each step (service charge, then tax), matching the
existing `taxIDR` rounding in `createCashSale`.

## Schema — `convex/schema.ts` (`orders` table)

Three new **optional** fields (optional for backward-compat with existing rows;
always written going forward, mirroring the `recipeSnapshot` pattern):

```ts
serviceChargeIDR: v.optional(v.number()),   // 0 when disabled
serviceChargePct: v.optional(v.number()),   // snapshot of the rate, for the receipt label
serviceChargeName: v.optional(v.string()),  // snapshot, e.g. "Biaya Layanan"
```

The `orderSummary` and `orderDetail` return validators in `convex/orders.ts`
gain the same three optional fields.

## Server — `convex/orders.ts` `createCashSale`

Replace the inline tax block (`orders.ts:162-166`) with:

1. Load the cafe (for `taxEnabled`/`taxRatePct`, unchanged) **and** the
   `cafeSettings` row via the `by_cafe` index for `payment.serviceCharge*`.
2. Derive: `scEnabled = payment?.serviceChargeEnabled === true`,
   `scPct = scEnabled ? payment?.serviceChargePct ?? 0 : 0`,
   `scName = payment?.serviceChargeName ?? 'Biaya Layanan'`.
3. `const { serviceChargeIDR, taxIDR, totalIDR } = computeOrderTotals({ subtotalIDR, discountIDR: 0, serviceChargeEnabled: scEnabled, serviceChargePct: scPct, taxEnabled, taxRatePct });`
4. Insert the order with `serviceChargeIDR`, `serviceChargePct: scPct`,
   `serviceChargeName: scName` alongside the existing fields. The
   `tendered < totalIDR` guard now uses the service-charge-inclusive total.

## Client — `src/components/sale/sale-screen.tsx` + cart summary

- Add `useQuery(api.settings.get, {})`; read
  `payment.serviceChargeEnabled/Pct/Name`.
- Replace the inline tax calc (`sale-screen.tsx:54-58`) with the **same**
  `computeOrderTotals(...)` call so the displayed total and the cash-tendered
  validation match the server byte-for-byte.
- Pass `serviceChargeIDR` (+ name/pct) into the cart-summary child that already
  receives `taxEnabled`/`taxRatePct`, and render a **"Biaya Layanan 5%"** line
  between Subtotal and the tax line. The `total` passed to
  `cash-payment-dialog` is the new service-charge-inclusive total (interface
  unchanged).

`api.settings.get` is owner-scoped (`requireOwnerCafe`); the POS session runs as
the owner account, so it resolves correctly.

## Receipt — `src/components/sale/receipt-preview.tsx`

Insert a service-charge line between Subtotal and the tax line, rendered only
when `(order.serviceChargeIDR ?? 0) > 0`, labeled from the order snapshot:
`{order.serviceChargeName ?? 'Biaya Layanan'} {order.serviceChargePct}%` on the
left, `formatIDR(order.serviceChargeIDR)` on the right. Line order becomes:
**Subtotal → Biaya Layanan → PB1/PPN → Total**.

## Error handling

- No new failure modes in `createCashSale`; the only behavioral change is a
  larger `totalIDR`, which the existing `tendered < totalIDR` guard already
  covers.
- A cafe with no `cafeSettings` row (service charge never configured) →
  `payment` is undefined → `scEnabled` is `false` → `serviceChargeIDR` 0 →
  behavior identical to today.

## Testing

- **`computeOrderTotals` unit tests** (`tests/convex/pricing.test.ts`, pure
  import, no convex-test harness):
  - service charge disabled → `serviceChargeIDR` 0, tax on subtotal only
  - service charge enabled + tax enabled → tax computed on `subtotal + serviceCharge` (the PB1-after-SC invariant)
  - tax disabled → `taxIDR` 0, total = subtotal + serviceCharge
  - both disabled → total = subtotal
  - rounding: non-round pct values round at each step
- **`createCashSale` integration test** (extend `tests/convex/orders.test.ts`):
  set `cafeSettings.payment` via `api.settings.updatePayment` with
  `serviceChargeEnabled: true, serviceChargePct: 5`, then assert the created
  order's `serviceChargeIDR`, `taxIDR` (on subtotal+SC), and `totalIDR`; and a
  disabled case asserting `serviceChargeIDR` 0 with tax on subtotal only.

## Verification before done (local CI)

`pnpm typecheck` · `pnpm test` · `pnpm lingui:compile` — all green before push.
(No new user-facing strings expected beyond the receipt/cart label, which reuses
the configured `serviceChargeName`; run `pnpm lingui:extract` if any `<Trans>`
is added and fill `en`.)

## Files touched

- `convex/lib/pricing.ts` — new pure pricing function
- `convex/schema.ts` — `orders` gains 3 optional service-charge fields
- `convex/orders.ts` — `createCashSale` uses `computeOrderTotals`; return
  validators gain the 3 fields
- `convex/_generated/*` — regenerated (repo tracks generated types)
- `src/components/sale/sale-screen.tsx` (+ its cart-summary child) — shared
  computation + service-charge line
- `src/components/sale/receipt-preview.tsx` — service-charge receipt line
- `tests/convex/pricing.test.ts` — new unit tests
- `tests/convex/orders.test.ts` — service-charge integration cases
