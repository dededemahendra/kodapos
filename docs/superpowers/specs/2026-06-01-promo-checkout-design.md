# Promo application at checkout (Sub-project 5b)

**Date:** 2026-06-01
**Status:** Approved design, ready for implementation plan
**Branch:** `feat/promo-checkout` (off `main`)
**Depends on:** 5a — Promotions admin (`promotions` table + CRUD + `formatPromoValue`, merged in PR #20). The sale screen, `createCashSale`, `computeOrderTotals`, and `receipt-preview` (all merged).

## Context

Sub-project 5 was split into **5a — promo-rules admin** (done) and **5b — cashier application** (this spec). 5a defined the `promotions` table (percent/fixed, value, archived) and CRUD; it deliberately deferred the discount math to 5b. The checkout path is already shaped for it: `computeOrderTotals` (`convex/lib/pricing.ts`) takes a `discountIDR` and applies service charge + tax on the discounted base, and both `createCashSale` (`convex/orders.ts`) and `SaleScreen` import it. `discountIDR` is currently hardcoded `0` in three spots (the client `computeOrderTotals` call, and the server's `computeOrderTotals` call + order insert).

Decisions from brainstorming (5a + 5b): **order-level, manually applied**, one promo per order; types **percent** and **fixed**; **no max-discount cap**; fixed discounts **clamp to subtotal**; server is **authoritative** for the amount.

## Goal

Let a cashier apply one active promo to a cash sale from the cart, see the discount reflected live in totals, and have it recorded on the order and receipt. The server recomputes the discount from the promo's current value (never trusts a client-sent amount) and freezes a promo snapshot on the order.

## Pure helper — `promoDiscountIDR`

Add to **`convex/lib/pricing.ts`** (next to `computeOrderTotals` — the established home for shared pure-totals math importable by both server and client):

```ts
export function promoDiscountIDR(
  type: 'percent' | 'fixed',
  value: number,
  subtotalIDR: number,
): number {
  const raw = type === 'percent' ? Math.round((subtotalIDR * value) / 100) : value;
  return Math.max(0, Math.min(raw, subtotalIDR)); // clamp to [0, subtotal]
}
```

- **percent:** `round(subtotal × value / 100)`.
- **fixed:** `min(value, subtotal)` — never exceeds subtotal, so a fully-discounted order floors at Rp 0.
- Pure; unit-tested. Runs identically on server (authoritative) and client (preview).

> Placement note: 5a's spec parenthetically suggested this would live in `src/lib/promo.ts`. It moved to `convex/lib/pricing.ts` because it must be server-authoritative and `convex/lib/pricing.ts` is the shared-math module both layers already import (`src/lib` is client-only). `formatPromoValue` (display-only) stays in `src/lib/promo.ts`.

## Schema — promo snapshot on `orders`

Add one optional field to the `orders` table in `convex/schema.ts` (optional for backward-compat with pre-5b orders, same convention as the `serviceCharge*` fields):

```ts
appliedPromo: v.optional(
  v.object({
    promoId: v.id('promotions'),
    name: v.string(),
    type: v.union(v.literal('percent'), v.literal('fixed')),
    value: v.number(),
  }),
),
```

`discountIDR` already exists on the table. A no-promo order keeps `discountIDR: 0` and omits `appliedPromo`. The snapshot freezes what actually applied, so history and receipts stay accurate after the promo is later edited or archived (mirrors the existing `lines` / service-charge snapshots). Run `./node_modules/.bin/convex codegen` and commit any drift.

## Backend — `createCashSale` (`convex/orders.ts`)

- **New arg:** `promoId: v.optional(v.id('promotions'))`.
- After `subtotalIDR` is computed and before `computeOrderTotals`:
  - If `promoId` is present → `const promo = await requireOwned(ctx, cafeId, promoId, 'Promo')`.
  - If `promo.archived` → `throw new Error('Promo tidak tersedia.')` (raw Indonesian throw, consistent with `Keranjang kosong.` etc.). Cashier re-picks.
  - Otherwise → `discountIDR = promoDiscountIDR(promo.type, promo.value, subtotalIDR)`; build `appliedPromo` from the **current** promo (`{ promoId, name: promo.name, type: promo.type, value: promo.value }`). Edited-but-active promos silently recompute at the new value — the snapshot records what applied.
  - If no `promoId` → `discountIDR = 0`, no `appliedPromo`.
- Pass the computed `discountIDR` into `computeOrderTotals` (replacing the hardcoded `0`).
- Write `discountIDR` and (when set) `appliedPromo` on the order insert.
- The idempotency short-circuit (existing order for `clientId`) is unchanged — a replayed `createCashSale` returns the already-stored order.

## Client

| Unit | File | Change |
|---|---|---|
| Cart state | `src/components/sale/cart-reducer.ts` | Add `promo: { _id; name; type; value } \| null` to `CartState`; `setPromo` action; `clearCart` resets it to `null`. |
| Sale screen | `src/components/sale/sale-screen.tsx` | Compute preview `discountIDR` via `promoDiscountIDR(promo.type, promo.value, subtotal)`; feed into `computeOrderTotals`; pass promo + discount + `onAddPromo`/`onRemovePromo` to `CartPane`; pass `promoId` to `CashPaymentDialog`. |
| Cart pane | `src/components/sale/cart-pane.tsx` | Between Subtotal and service charge: if a promo is set, a `Diskon {name} ({formatPromoValue}) −Rp…  [×]` row (remove clears it); else a `+ Tambah promo` button, shown only when the cart is non-empty. |
| Promo picker | `src/components/sale/promo-picker-dialog.tsx` (**new**) | Queries `api.promotions.list({})` (active only), lists promos with name + `formatPromoValue`, `onSelect(promo)` closes and applies. shadcn `Empty` when none. Mirrors the kit dialog pattern. |
| Payment dialog | `src/components/sale/cash-payment-dialog.tsx` | New `promoId` prop forwarded to `createCashSale`. Its `totalIDR` already reflects the discount (computed upstream in `SaleScreen`). |

The cart's `discountIDR` preview is advisory; the server's recomputation is authoritative. If they diverge (promo edited mid-sale), the server value wins and is what gets stored — the `totalIDR` returned by `createCashSale` drives the receipt.

## Receipt — `receipt-preview.tsx`

Add a Discount row immediately after Subtotal, rendered only when `(order.discountIDR ?? 0) > 0`: label from `order.appliedPromo` (`Diskon {name} ({formatPromoValue(type, value)})`), value `−{formatIDR(discountIDR)}`. Match the neighboring rows' existing `<Trans>` pattern (the live `receipt-preview` is i18n'd via `<Trans>` throughout; we follow the live code).

## i18n

New Indonesian source strings via Lingui: `Tambah promo`, `Pilih promo`, `Diskon`, `Hapus` (remove-promo control), the picker dialog title, and its empty-state text (e.g. `Belum ada promo aktif.`). After implementation: `pnpm lingui:extract`, fill `en`, `pnpm lingui:compile`. The server throw `Promo tidak tersedia.` is **not** i18n'd (raw throw, consistent with existing server errors). Receipt content unaffected beyond the new discount row.

## Testing

- **Pure** (extend `tests/convex/pricing.test.ts`): `promoDiscountIDR` — percent rounding (e.g. 11% of Rp 9.090 → rounded), fixed under subtotal, fixed clamped to subtotal, fixed/percent on zero subtotal → 0.
- **Convex** (`tests/convex/orders.test.ts`): `createCashSale` with a percent promo → correct `discountIDR`, `totalIDR` (SC/tax on discounted base), and `appliedPromo` snapshot; with a fixed promo that exceeds subtotal → clamped; with an archived promo → throws `Promo tidak tersedia.`; with a promo owned by another cafe → `requireOwned` throws; **regression:** no `promoId` → `discountIDR 0`, no `appliedPromo`, totals unchanged.
- **Cart reducer** (extend `src/components/sale/cart-reducer.test.ts`): `setPromo` sets the promo; `clearCart` resets both lines and promo.
- **Playwright** (extend the sale e2e, auth-gated): add an item → open the promo picker → apply a percent promo → see the Diskon line and reduced Total → pay → receipt shows the discount row.
- Gate: `pnpm typecheck && pnpm test && pnpm lingui:compile`; `convex codegen` → commit drift.

## Affected / new files (anticipated)

**Modified**
- `convex/lib/pricing.ts` (+ `promoDiscountIDR`), `convex/schema.ts` (`orders.appliedPromo`), `convex/_generated/*`.
- `convex/orders.ts` (`createCashSale` promo handling).
- `src/components/sale/sale-screen.tsx`, `cart-pane.tsx`, `cart-reducer.ts`, `cash-payment-dialog.tsx`, `receipt-preview.tsx`.
- `tests/convex/orders.test.ts`, `tests/convex/pricing.test.ts` (+ `promoDiscountIDR` cases), `src/components/sale/cart-reducer.test.ts` (+ promo action), the sale e2e spec, Lingui catalogs.

**New**
- `src/components/sale/promo-picker-dialog.tsx`.

## Out of scope

- Multiple/stacked promos, promo codes, item- or category-scoped promos, min-spend, date/time windows, auto-apply, max-discount cap.
- The QRIS payment path (only the cash sale exists today; promo plugs into `createCashSale`).
- Discount reporting metrics (gross-vs-net, total discounts) — reports already consume `totalIDR`, which now reflects the discount; a dedicated discount metric is a later slice.
- Editing/deleting promos applied to past orders (the snapshot makes history immutable by design).
