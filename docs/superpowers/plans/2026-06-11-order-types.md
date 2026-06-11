# Order Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Capture an `orderType` (dine_in | takeaway | pickup) at checkout, store it on the order, print it on the receipt, and filter/show it in order history — without affecting pricing.

**Architecture:** A shared Convex validator (`convex/lib/orderType.ts`) threads through `saleArgs` → `buildOrder` insert; schema field + read validators are `v.optional` for legacy tolerance; `buildOrder` defaults to `'dine_in'` so existing callers/tests stay green. Frontend holds the choice in cart state, a segmented toggle in the cart header sets it, the 3 payment dialogs pass `cart.orderType` to their create calls, and the order-history report gains a filter + a list label.

**Tech Stack:** Convex, React + shadcn (Button/Select/Badge), Lingui, convex-test/Vitest.

---

## File Structure

- **Create:** `convex/lib/orderType.ts` — shared union validator + `ORDER_TYPES` + type.
- **Modify:** `convex/schema.ts` (orders field), `convex/lib/sale.ts` (saleArgs + buildOrder insert), `convex/orders.ts` (3 read validators + search arg/filter).
- **Create:** `src/components/sale/order-types.ts` — frontend `OrderType` + labelled options.
- **Modify:** `src/components/sale/cart-reducer.ts`, `cart-pane.tsx`, `cash-payment-dialog.tsx`, `qris-static-payment-dialog.tsx`, `qris-dynamic-payment-dialog.tsx`, `receipt-preview.tsx`, `src/routes/_pos/reports/orders.tsx`.
- **Test:** `tests/convex/orders.test.ts` (additions only; never edit existing cases).
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — orderType end-to-end (TDD)

**Files:** Create `convex/lib/orderType.ts`; modify `convex/schema.ts`, `convex/lib/sale.ts`, `convex/orders.ts`; test `tests/convex/orders.test.ts`.

READ first: `convex/lib/sale.ts` lines 1–60 (`saleArgs`, `buildOrder` signature; insert block is ~lines 277–298 — find the `paymentMethod: payment.method,` line), `convex/orders.ts` lines 1–170 (the `orderSummary`/`orderDetail`/`orderRow` validators and the `search` query), `convex/schema.ts` `orders` table, and the existing `createCashSale` tests in `tests/convex/orders.test.ts` (mirror their setup + how they read an order back via `orders.getById`/`listForShift`).

- [ ] **Step 1: Create the shared module**

`convex/lib/orderType.ts`:
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

- [ ] **Step 2: Write FAILING tests**

Append to `tests/convex/orders.test.ts` a `describe('order types', ...)` using the file's
existing owner/shift/menu setup helpers (mirror an existing `createCashSale` test for the
seed; reuse its helper for creating a sellable item + open shift). Cover:

```ts
describe('order types', () => {
  it('stores the given orderType', async () => {
    // ...standard setup: owner, open shift, one menu item, cashier...
    const { orderId } = await asOwner.mutation(api.orders.createCashSale, {
      /* existing required args (clientId, shiftId, cashierId, lines, cashTenderedIDR) */
      orderType: 'takeaway',
    });
    const order = await asOwner.query(api.orders.getById, { id: orderId });
    expect(order?.orderType).toBe('takeaway');
  });

  it('defaults to dine_in when orderType is omitted', async () => {
    const { orderId } = await asOwner.mutation(api.orders.createCashSale, {
      /* existing required args, NO orderType */
    });
    const order = await asOwner.query(api.orders.getById, { id: orderId });
    expect(order?.orderType).toBe('dine_in');
  });

  it('search filters by orderType', async () => {
    // create one takeaway + one (default) dine_in order in the same range
    const res = await asOwner.query(api.orders.search, {
      range: { preset: 'today' }, // match the rangeArg shape the other search tests use
      orderType: 'takeaway',
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(res.page.every((o) => o.orderType === 'takeaway')).toBe(true);
    expect(res.page.length).toBeGreaterThanOrEqual(1);
  });
});
```
> Match the exact arg shapes the existing tests use for `createCashSale` (clientId/shiftId/
> cashierId/lines/cashTenderedIDR) and for `orders.search` (the `range`/`rangeArg` shape and
> `paginationOpts`). Copy them from a neighbouring test — do not invent shapes.

Run `pnpm test tests/convex/orders.test.ts` → these new cases FAIL (orderType unknown arg /
undefined on the returned order).

- [ ] **Step 3: Implement**

**`convex/schema.ts`** — import + add field to `orders` (before `paymentStatus`):
```ts
import { orderTypeValidator } from './lib/orderType';
// ...
orderType: v.optional(orderTypeValidator),
```

**`convex/lib/sale.ts`** — import, extend `saleArgs`, default in the insert:
```ts
import { orderTypeValidator } from './orderType';
// in saleArgs object:
  orderType: v.optional(orderTypeValidator),
// in buildOrder's ctx.db.insert('orders', { ... }), next to paymentMethod:
  orderType: args.orderType ?? 'dine_in',
```

**`convex/orders.ts`** — import `orderTypeValidator`; add
`orderType: v.optional(orderTypeValidator)` to each of `orderSummary`, `orderDetail`,
`orderRow`. In `search`: add `orderType: v.optional(orderTypeValidator)` to args, and after
the existing `paymentMethod` filter line add:
```ts
if (orderType) q = q.filter((f) => f.eq(f.field('orderType'), orderType));
```
(destructure `orderType` from the handler args alongside `paymentMethod`/`status`).

- [ ] **Step 4: Tests + typecheck**

Run `pnpm test tests/convex/orders.test.ts` → all PASS (new + existing).
Run `pnpm typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/orderType.ts convex/schema.ts convex/lib/sale.ts convex/orders.ts tests/convex/orders.test.ts
git commit -m "feat(orders): orderType field threaded through sale + search (default dine_in)"
```

> Do NOT run `convex codegen` — schema change derives automatically; validator/arg additions
> are to already-registered modules; `lib/orderType.ts` is a plain helper (not a function module).

---

### Task 2: Frontend state — labels + cart

**Files:** Create `src/components/sale/order-types.ts`; modify `src/components/sale/cart-reducer.ts`.

- [ ] **Step 1: `src/components/sale/order-types.ts`**

```tsx
import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

export type OrderType = 'dine_in' | 'takeaway' | 'pickup';

export const ORDER_TYPE_OPTIONS: { value: OrderType; label: ReactNode }[] = [
  { value: 'dine_in', label: <Trans>Makan di tempat</Trans> },
  { value: 'takeaway', label: <Trans>Bawa pulang</Trans> },
  { value: 'pickup', label: <Trans>Ambil di tempat</Trans> },
];
```
> File must be `.tsx` (it contains JSX). If lint prefers, the array can also be built in a
> component; keep it as a module-level const — `PAYMENT_METHODS` in `payment-methods.tsx`
> does the same.

- [ ] **Step 2: `cart-reducer.ts` — add orderType to state/actions**

- Add import: `import type { OrderType } from './order-types';`
- `CartState`:
```ts
export type CartState = { lines: CartLine[]; promo: CartPromo | null; orderType: OrderType };
```
- `CartAction`: add `| { type: 'setOrderType'; orderType: OrderType }`
- `initialCart`:
```ts
export const initialCart: CartState = { lines: [], promo: null, orderType: 'dine_in' };
```
- In `cartReducer`, add a case (before `clearCart`):
```ts
    case 'setOrderType': {
      return { ...state, orderType: action.orderType };
    }
```
- `clearCart` case → return the full initial shape:
```ts
    case 'clearCart': {
      return { lines: [], promo: null, orderType: 'dine_in' };
    }
```

> NOTE: the other reducer cases use `{ ...state, ... }` so they already preserve `orderType`.
> Only `clearCart` (which builds a literal) needs the new field added.

- [ ] **Step 3: Typecheck + commit**

`pnpm typecheck` → PASS (the file is consumed by sale-screen; if `order-types.ts` is renamed
to `.tsx`, update any import path — keep the import as `'./order-types'` which resolves either way).
```bash
git add src/components/sale/order-types.tsx src/components/sale/cart-reducer.ts
git commit -m "feat(sale): cart holds orderType (default dine_in)"
```

---

### Task 3: Checkout UI — selector + dialog pass-through

**Files:** modify `src/components/sale/cart-pane.tsx`, `cash-payment-dialog.tsx`, `qris-static-payment-dialog.tsx`, `qris-dynamic-payment-dialog.tsx`.

READ `cart-pane.tsx` (it has `cart: CartState` + `dispatch` in scope; find the "Pesanan"
header) and the three dialogs (each imports `CartState`, has `cart` prop, and calls
`create*Sale({ ... clientId, shiftId, cashierId, lines: cart.lines.map(...) ... })`).

- [ ] **Step 1: Cart header segmented toggle (`cart-pane.tsx`)**

Add `import { ORDER_TYPE_OPTIONS } from './order-types';` and render, under the "Pesanan"
heading:
```tsx
<div className="mt-2 flex gap-1">
  {ORDER_TYPE_OPTIONS.map((o) => (
    <Button
      key={o.value}
      type="button"
      size="sm"
      variant={cart.orderType === o.value ? 'default' : 'outline'}
      onClick={() => dispatch({ type: 'setOrderType', orderType: o.value })}
    >
      {o.label}
    </Button>
  ))}
</div>
```
(`Button` is already imported in this file; if not, add it from `~/components/ui/button`.)

- [ ] **Step 2: Pass `orderType` in each create call**

In `cash-payment-dialog.tsx` (the `createCashSale({...})` call, ~line 108),
`qris-static-payment-dialog.tsx` (~line 84), and `qris-dynamic-payment-dialog.tsx` (its
create/charge call): add to the args object:
```ts
        orderType: cart.orderType,
```
(Place it alongside the other top-level args like `clientId`/`shiftId`. The dialogs already
hold `cart`.)

- [ ] **Step 3: Typecheck + commit**

`pnpm typecheck` → PASS.
```bash
git add src/components/sale/cart-pane.tsx src/components/sale/cash-payment-dialog.tsx src/components/sale/qris-static-payment-dialog.tsx src/components/sale/qris-dynamic-payment-dialog.tsx
git commit -m "feat(sale): order-type toggle in cart + pass to all payment methods"
```

---

### Task 4: Receipt line + order-history filter/label

**Files:** modify `src/components/sale/receipt-preview.tsx`, `src/routes/_pos/reports/orders.tsx`.

- [ ] **Step 1: Receipt line (English, off-catalog)**

In `receipt-preview.tsx`, add a local map near the top-level of the module:
```ts
const ORDER_TYPE_RECEIPT_LABEL: Record<'dine_in' | 'takeaway' | 'pickup', string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  pickup: 'Pickup',
};
```
In the header meta block (right after the `Kasir: {order.cashierName}` line, ~line 63), add:
```tsx
{order.orderType ? (
  <div className="text-xs text-muted-foreground">
    Order type: {ORDER_TYPE_RECEIPT_LABEL[order.orderType]}
  </div>
) : null}
```
(Receipt text stays hardcoded English — matches the existing convention in this file.)

- [ ] **Step 2: Order-history filter + label (`reports/orders.tsx`)**

- Import: `import { ORDER_TYPE_OPTIONS } from '~/components/sale/order-types';`
- State: `const [orderType, setOrderType] = useState<string>(ALL);`
- In the `usePaginatedQuery` args object, add:
```ts
      ...(orderType !== ALL
        ? { orderType: orderType as 'dine_in' | 'takeaway' | 'pickup' }
        : {}),
```
- Add a `Select` after the method `Select` (before the status `Select`):
```tsx
        <Select value={orderType} onValueChange={setOrderType}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t`Semua tipe pesanan`}</SelectItem>
            {ORDER_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
```
- In the list row's muted meta line (the `flex items-center gap-2 flex-wrap` div, after the
  `{o.lineCount} item` span), add a guarded order-type label:
```tsx
                  {o.orderType ? (
                    <span>
                      · {ORDER_TYPE_OPTIONS.find((x) => x.value === o.orderType)?.label}
                    </span>
                  ) : null}
```

- [ ] **Step 3: Typecheck + test + commit**

`pnpm typecheck` → PASS. `pnpm test` → PASS (full suite).
```bash
git add src/components/sale/receipt-preview.tsx src/routes/_pos/reports/orders.tsx
git commit -m "feat(orders): order type on receipt + history filter/label"
```

---

### Task 5: i18n

**Files:** `src/locales/{id,en}/messages.po` (+ compiled).

New strings: `Makan di tempat`, `Bawa pulang`, `Ambil di tempat`, `Semua tipe pesanan`.
(Receipt labels are off-catalog; no `Order type` string needed there.)

- [ ] **Step 1:** `pnpm lingui:extract` — note paths + new entries.
- [ ] **Step 2:** Fill `en` for the new empty entries only:

| msgid | en |
|---|---|
| `Makan di tempat` | `Dine-in` |
| `Bawa pulang` | `Takeaway` |
| `Ambil di tempat` | `Pickup` |
| `Semua tipe pesanan` | `All order types` |

- [ ] **Step 3:** `pnpm lingui:compile` → `en` 0 missing.
- [ ] **Step 4:** `git add src/locales && git commit -m "i18n(orders): order-type strings + en fill"`

---

### Task 6: Final verification

- [ ] `pnpm typecheck` → PASS
- [ ] `pnpm test` → PASS (all suites; existing order tests untouched + green)
- [ ] `pnpm lingui:compile` → `en` 0 missing
- [ ] `git status` → clean (commit any compile output)
- [ ] **Manual sanity (described):** On `/sale`, the cart header shows a 3-way order-type
  toggle (defaults dine-in); completing a sale stores the chosen type; the printed receipt
  shows "Order type: …"; `/reports/orders` has an order-type filter and each row shows its
  type; legacy orders (no type) show no order-type line and are excluded by a set filter.

---

## Self-Review

**Spec coverage:** shared validator (T1); schema optional + default-in-builder + read
validators + search filter (T1) — backward-compat constraint honored; cart state + toggle
(T2/T3); all 3 payment paths pass it (T3); receipt line guarded (T4); history filter + label
guarded (T4); tests for store/default/filter (T1); i18n (T5). ✓

**Placeholder scan:** none — full code given. The only "copy from neighbour" instructions
(T1 test arg shapes) are deliberate: the exact `createCashSale`/`search` arg shapes live in
the existing tests and must match them, not a guessed shape.

**Type consistency:** `OrderType = 'dine_in'|'takeaway'|'pickup'` defined in
`order-types.tsx` (frontend) and as `orderTypeValidator` in `convex/lib/orderType.ts`
(backend) — identical members. `CartState.orderType: OrderType` (T2) read as `cart.orderType`
in toggle + all 3 dialogs (T3) + passed as the `orderType` mutation arg (saleArgs accepts
`v.optional(orderTypeValidator)`, T1). `order.orderType` is `optional` on read validators
(T1) → every UI read guards `undefined` (T4). Consistent.
