# Order Types (Dine-in / Takeaway / Pickup) Design Spec

**Date:** 2026-06-11
**Branch:** `feat/order-types` (off `main`)

## Context

Every order today is undifferentiated — there's no record of whether it was eaten in,
taken away, or a pickup. Order type is basic POS metadata: it shows on the receipt (so
staff/kitchen know how to serve), and it's a useful slice in order history. This slice
adds an `orderType` of `dine_in | takeaway | pickup` captured at checkout, printed on the
receipt, and filterable in the order-history report.

Order type does **not** affect pricing, tax, service charge, inventory, or loyalty — it's
pure metadata threaded through the existing sale flow.

## Backward compatibility (the load-bearing constraint)

Existing `orders` rows have no `orderType`, and the entire `tests/convex/orders.test.ts`
suite calls `createCashSale`/`createQrisStaticSale` without it. Therefore:

- The **schema field is `v.optional`** (a required field would fail schema validation
  against legacy rows on deploy).
- The three **read validators** in `convex/orders.ts` (`orderSummary`, `orderDetail`,
  `orderRow`) mark `orderType` `v.optional` (they echo legacy rows).
- `saleArgs.orderType` is **optional**; `buildOrder` writes `args.orderType ?? 'dine_in'`
  — so new orders always store a concrete type while existing tests/callers that omit it
  keep working (defaulting to dine-in).
- Receipt + history UI **guard** `orderType` for `undefined` (legacy orders render no
  order-type line / a "—").

## Shared definition — `convex/lib/orderType.ts` (new)

A tiny dependency-free module so the union never drifts:

```ts
import { v } from 'convex/values';
export const ORDER_TYPES = ['dine_in', 'takeaway', 'pickup'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];
export const orderTypeValidator = v.union(
  v.literal('dine_in'),
  v.literal('takeaway'),
  v.literal('pickup')
);
```

Imported by `convex/schema.ts`, `convex/orders.ts`, and `convex/lib/sale.ts`.

## Backend

### Schema — `convex/schema.ts`
Add to the `orders` table (before `paymentStatus`):
```ts
orderType: v.optional(orderTypeValidator),
```
No index change (filters are post-fetch on the existing `by_cafe_created` scan).

### Shared args + builder — `convex/lib/sale.ts`
- `saleArgs`: add `orderType: v.optional(orderTypeValidator)`.
- `buildOrder` insert: add `orderType: args.orderType ?? 'dine_in'` (next to
  `paymentMethod`). `settleSale` is unchanged.

### Read validators — `convex/orders.ts`
Add `orderType: v.optional(orderTypeValidator)` to `orderSummary`, `orderDetail`, and
`orderRow` (so `listForShift` / `getById` / `search` echo it). The QRIS-dynamic path
(`convex/payments/qrisDynamic.ts`) already builds on `saleArgs`/`buildOrder`, so it
inherits the field with no change.

### Search filter — `convex/orders.ts` `search`
- Args: add `orderType: v.optional(orderTypeValidator)`.
- Handler: after the existing `paymentMethod` filter, add
  `if (orderType) q = q.filter((f) => f.eq(f.field('orderType'), orderType));`
  (mirrors the `paymentMethod`/`status` filters; legacy rows with no `orderType` simply
  never match a set filter, which is correct).

## Frontend

### Shared labels — `src/components/sale/order-types.ts` (new)
Mirror the `PAYMENT_METHODS` pattern (`src/components/sale/payment-methods.tsx`):
```ts
import { Trans } from '@lingui/react/macro';
import type { OrderType } from '~/...'; // local copy of the union (see note)
export const ORDER_TYPE_OPTIONS: { value: OrderType; label: React.ReactNode }[] = [
  { value: 'dine_in',  label: <Trans>Makan di tempat</Trans> },
  { value: 'takeaway', label: <Trans>Bawa pulang</Trans> },
  { value: 'pickup',   label: <Trans>Ambil di tempat</Trans> },
];
```
> Frontend can't import from `convex/lib/*` cleanly for the *type*; define
> `export type OrderType = 'dine_in' | 'takeaway' | 'pickup'` in this file and reuse it
> across the cart/dialogs. (The Convex validator stays the source of truth server-side;
> the two unions are trivially identical and both are exercised by typecheck where the
> mutation arg is passed.)

### Cart state — `src/components/sale/cart-reducer.ts`
- `CartState` gains `orderType: OrderType`.
- `initialCart` sets `orderType: 'dine_in'`.
- New action `{ type: 'setOrderType'; orderType: OrderType }` → `{ ...state, orderType }`.
- `clearCart` returns `initialCart` (order type resets to dine-in for the next order — it
  already returns the initial state; just ensure the new field is included).

### Cart header selector — `src/components/sale/cart-pane.tsx`
A compact **segmented toggle** in the cart header (a row of 3 `Button`s, `size="sm"`,
`variant={cart.orderType === value ? 'default' : 'outline'}`, dispatching
`setOrderType`), rendering `ORDER_TYPE_OPTIONS`. `CartPane` already has `cart` + `dispatch`
in scope. Place it under the "Pesanan" heading so it's visible through checkout.

### Payment dialogs — pass `orderType` into the create calls
`cash-payment-dialog.tsx`, `qris-static-payment-dialog.tsx`, and the QRIS-dynamic dialog
already receive the `cart`. In each `create*Sale({...})` call, add
`orderType: cart.orderType`. No new props (read from the `cart` they already hold).

### Receipt — `src/components/sale/receipt-preview.tsx`
Receipt content is **English, off the i18n catalog** (project rule). Add a line in the
header/meta block, guarded for legacy orders:
```tsx
{order.orderType ? (
  <div>Order type: {ORDER_TYPE_RECEIPT_LABEL[order.orderType]}</div>
) : null}
```
with a local English map `{ dine_in: 'Dine-in', takeaway: 'Takeaway', pickup: 'Pickup' }`.
Match the surrounding hardcoded-English label style already in this file.

### Order history — `src/routes/_pos/reports/orders.tsx`
- Add an `orderType` filter `Select` (mirroring the existing payment-method/status
  selects): options `Semua tipe pesanan` (the `ALL` sentinel) + the three types
  (`ORDER_TYPE_OPTIONS` labels). Thread it into the `usePaginatedQuery` args
  (`...(orderType !== ALL ? { orderType } : {})`).
- Add an **order-type column** to the table (a small `Badge`/text), rendering the type's
  label or "—" when `undefined` (legacy). Reuse `ORDER_TYPE_OPTIONS` for label lookup.

## Testing

**`tests/convex/orders.test.ts`** (extend; existing tests must stay green unchanged):
- `createCashSale` with `orderType: 'takeaway'` → the created order's `orderType` is
  `'takeaway'` (assert via `orders.getById` / `listForShift`).
- `createCashSale` **without** `orderType` → order stores `'dine_in'` (the default). This
  guards backward compatibility.
- `orders.search` with `{ orderType: 'takeaway' }` returns only takeaway orders; a
  dine-in/legacy order is excluded; without the filter all are returned. (Seed a couple
  of orders of differing types via `createCashSale`.)

(The existing suite, which never passes `orderType`, exercises the default path and must
remain green — do not modify those tests.)

Frontend (toggle, dialog pass-through, receipt line, history filter/column) validated by
typecheck + the existing sale e2e flow.

## i18n

New Bahasa Indonesia UI strings: `Makan di tempat`, `Bawa pulang`, `Ambil di tempat`,
`Semua tipe pesanan`, `Tipe pesanan` (column header). Run `pnpm lingui:extract`, fill
`en` (`Dine-in`, `Takeaway`, `Pickup`, `All order types`, `Order type`), then
`pnpm lingui:compile`. Receipt labels stay English/off-catalog.

## Conventions

- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`;
  `git status` clean before push.
- Do NOT run `convex codegen`. The schema change needs none (dataModel derives from
  `typeof schema`); `orderType` args/validators are additions to already-registered
  modules — no `api.d.ts` change. The new `convex/lib/orderType.ts` is a plain helper
  module (imported by registered modules), not a Convex function module, so it also needs
  no registration.
- No new route → no `routeTree.gen.ts` change.
- Small conventional commits; PR → review → merge commit.

## Out of scope

- Per-order-type pricing, tax, or service-charge rules.
- Table numbers / seating (separate "table management" slice).
- Pickup scheduling / ready-time, customer notifications.
- Order-type analytics beyond the history filter/column (e.g. a dashboard breakdown).
- Defaulting the order type from a cafe-level setting (always defaults to dine-in).
