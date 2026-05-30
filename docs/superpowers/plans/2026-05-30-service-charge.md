# Service Charge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the configured service charge to order pricing end-to-end — computed via a single shared pure function used by both server and client, with PB1 tax applied on `subtotal + serviceCharge`, stored on the order, and shown in the cart total and the receipt.

**Architecture:** A pure `computeOrderTotals` in `convex/lib/pricing.ts` becomes the one source of truth, imported by `createCashSale` (server) and the sale screen (client) — eliminating the existing 3-way duplication of the tax math (server, `sale-screen`, `cart-pane`). The `orders` table gains optional service-charge fields (amount + pct/name snapshot). The cart breakdown is computed once in `sale-screen` and passed to a now-presentational `cart-pane`.

**Tech Stack:** Convex (mutations, validators, schema), React, TanStack Router, Lingui, vitest + convex-test.

**Spec:** `docs/superpowers/specs/2026-05-30-service-charge-design.md`

## Environment notes

- Regenerate Convex types with `./node_modules/.bin/convex codegen` (NOT `npx convex` — a shell hook breaks it with "Missing script: convex"). The repo tracks `convex/_generated/*`, so commit regenerated files.
- Run one test file: `pnpm vitest run tests/convex/<file>.test.ts`.

---

## File Structure

- `convex/lib/pricing.ts` — pure `computeOrderTotals`. CREATE.
- `tests/convex/pricing.test.ts` — unit tests for it. CREATE.
- `convex/schema.ts` — `orders` gains 3 optional service-charge fields. MODIFY.
- `convex/orders.ts` — `createCashSale` uses `computeOrderTotals`; `orderSummary` validator gains the 3 fields. MODIFY.
- `tests/convex/orders.test.ts` — service-charge integration cases. MODIFY.
- `src/components/sale/sale-screen.tsx` — shared computation, pass breakdown down. MODIFY.
- `src/components/sale/cart-pane.tsx` — presentational; render service-charge line. MODIFY.
- `src/components/sale/receipt-preview.tsx` — service-charge receipt line. MODIFY.
- `convex/_generated/*` — regenerated. MODIFY.

---

## Task 1: Pure pricing function + unit tests (TDD)

**Files:**
- Create: `convex/lib/pricing.ts`
- Test: `tests/convex/pricing.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/convex/pricing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeOrderTotals } from '../../convex/lib/pricing';

describe('computeOrderTotals', () => {
  it('no service charge, no tax → total equals subtotal', () => {
    expect(
      computeOrderTotals({
        subtotalIDR: 100000,
        serviceChargeEnabled: false,
        serviceChargePct: 0,
        taxEnabled: false,
        taxRatePct: 0,
      })
    ).toEqual({ serviceChargeIDR: 0, taxIDR: 0, totalIDR: 100000 });
  });

  it('tax only (no service charge) → tax on subtotal', () => {
    expect(
      computeOrderTotals({
        subtotalIDR: 100000,
        serviceChargeEnabled: false,
        serviceChargePct: 0,
        taxEnabled: true,
        taxRatePct: 11,
      })
    ).toEqual({ serviceChargeIDR: 0, taxIDR: 11000, totalIDR: 111000 });
  });

  it('service charge only (no tax)', () => {
    expect(
      computeOrderTotals({
        subtotalIDR: 100000,
        serviceChargeEnabled: true,
        serviceChargePct: 5,
        taxEnabled: false,
        taxRatePct: 0,
      })
    ).toEqual({ serviceChargeIDR: 5000, taxIDR: 0, totalIDR: 105000 });
  });

  it('PB1 applied AFTER service charge: tax computed on subtotal + service charge', () => {
    // 100000 + 5% SC (5000) = 105000 base; 11% tax = 11550; total 116550
    expect(
      computeOrderTotals({
        subtotalIDR: 100000,
        serviceChargeEnabled: true,
        serviceChargePct: 5,
        taxEnabled: true,
        taxRatePct: 11,
      })
    ).toEqual({ serviceChargeIDR: 5000, taxIDR: 11550, totalIDR: 116550 });
  });

  it('rounds service charge and tax at each step', () => {
    // 33333 * 5% = 1666.65 → 1667; taxBase 35000; 35000 * 11% = 3850; total 38850
    expect(
      computeOrderTotals({
        subtotalIDR: 33333,
        serviceChargeEnabled: true,
        serviceChargePct: 5,
        taxEnabled: true,
        taxRatePct: 11,
      })
    ).toEqual({ serviceChargeIDR: 1667, taxIDR: 3850, totalIDR: 38850 });
  });

  it('discount reduces the base before service charge and tax', () => {
    // base 80000; SC 5% = 4000; taxBase 84000; tax 11% = 9240; total 93240
    expect(
      computeOrderTotals({
        subtotalIDR: 100000,
        discountIDR: 20000,
        serviceChargeEnabled: true,
        serviceChargePct: 5,
        taxEnabled: true,
        taxRatePct: 11,
      })
    ).toEqual({ serviceChargeIDR: 4000, taxIDR: 9240, totalIDR: 93240 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/convex/pricing.test.ts`
Expected: FAIL — cannot resolve `../../convex/lib/pricing`.

- [ ] **Step 3: Implement the pure function**

Create `convex/lib/pricing.ts`:

```ts
export type PricingInput = {
  subtotalIDR: number;
  /** 0 today (promo engine unbuilt); kept so discount slots into the formula. */
  discountIDR?: number;
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

/**
 * Single source of truth for order totals. Pure (no ctx/React/convex-server
 * imports) so both `createCashSale` (server) and the sale screen (client) can
 * import it and never drift. PB1 tax is applied AFTER service charge.
 */
export function computeOrderTotals(input: PricingInput): PricingResult {
  const base = input.subtotalIDR - (input.discountIDR ?? 0);
  const serviceChargeIDR = input.serviceChargeEnabled
    ? Math.round((base * input.serviceChargePct) / 100)
    : 0;
  const taxIDR = input.taxEnabled
    ? Math.round(((base + serviceChargeIDR) * input.taxRatePct) / 100)
    : 0;
  return { serviceChargeIDR, taxIDR, totalIDR: base + serviceChargeIDR + taxIDR };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/convex/pricing.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/pricing.ts tests/convex/pricing.test.ts
git commit -m "feat(pricing): add pure computeOrderTotals (service charge + PB1-after-SC)"
```

---

## Task 2: Schema — `orders` service-charge fields

**Files:**
- Modify: `convex/schema.ts` (the `orders` table money fields)
- Modify: `convex/orders.ts` (the `orderSummary` return validator)
- Modify: `convex/_generated/*`

- [ ] **Step 1: Add the three optional fields to the schema**

In `convex/schema.ts`, in the `orders` table, immediately AFTER the
`discountIDR: v.number(),` line, add:

```ts
    // Service charge (added in the service-charge slice). Optional for
    // backward-compat with orders created before it existed; createCashSale
    // always writes them going forward (serviceChargeIDR 0 when disabled).
    serviceChargeIDR: v.optional(v.number()),
    serviceChargePct: v.optional(v.number()),
    serviceChargeName: v.optional(v.string()),
```

- [ ] **Step 2: Add the same fields to the `orderSummary` return validator**

In `convex/orders.ts`, in the `orderSummary` object validator, immediately AFTER
`discountIDR: v.number(),` add:

```ts
  serviceChargeIDR: v.optional(v.number()),
  serviceChargePct: v.optional(v.number()),
  serviceChargeName: v.optional(v.string()),
```

(The `orderDetail` validator spreads `...orderSummary.fields`, so it inherits
these automatically. No other validator change needed.)

- [ ] **Step 3: Regenerate types and typecheck**

Run: `./node_modules/.bin/convex codegen`
Run: `pnpm typecheck`
Expected: both succeed (optional fields don't break existing code).

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/orders.ts convex/_generated
git commit -m "feat(orders): add optional service-charge fields to orders"
```

---

## Task 3: Server — `createCashSale` uses `computeOrderTotals` (TDD)

**Files:**
- Modify: `convex/orders.ts` (`createCashSale` handler)
- Modify: `tests/convex/orders.test.ts`

- [ ] **Step 1: Add the failing integration tests**

In `tests/convex/orders.test.ts`, add this helper just below the existing
`setup` function:

```ts
async function enableServiceCharge(
  asOwner: Setup['asOwner'],
  pct: number
): Promise<void> {
  await asOwner.mutation(api.settings.updatePayment, {
    payment: {
      methods: {
        cash: true,
        qrisStatic: true,
        qrisDynamic: false,
        card: false,
        ewallet: false,
        transfer: false,
      },
      defaultMethod: 'cash',
      cashRounding: 'none',
      quickCashButtons: [20000, 50000, 100000],
      serviceChargeEnabled: true,
      serviceChargePct: pct,
      serviceChargeName: 'Biaya Layanan',
    },
  });
}
```

Then add a new describe block (place it after the existing
`describe('orders.createCashSale', ...)` block):

```ts
describe('orders.createCashSale service charge', () => {
  it('applies service charge then taxes subtotal + service charge (PB1 after SC)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t, {
      taxEnabled: true,
      taxRatePct: 11,
    });
    await enableServiceCharge(asOwner, 5);

    // Espresso 18000 → subtotal 18000; SC 5% = 900; taxBase 18900; tax 11% = 2079; total 20979
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sc-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 21000,
      createdAtClient: 1700000000000,
    });
    expect(result.totalIDR).toBe(20979);

    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.subtotalIDR).toBe(18000);
    expect(order?.serviceChargeIDR).toBe(900);
    expect(order?.serviceChargePct).toBe(5);
    expect(order?.serviceChargeName).toBe('Biaya Layanan');
    expect(order?.taxIDR).toBe(2079);
    expect(order?.totalIDR).toBe(20979);
  });

  it('records serviceChargeIDR 0 and taxes only the subtotal when disabled', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t, {
      taxEnabled: true,
      taxRatePct: 11,
    });
    // service charge never enabled → no cafeSettings row

    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sc-2',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    // subtotal 18000; tax 11% = 1980; total 19980
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.serviceChargeIDR).toBe(0);
    expect(order?.taxIDR).toBe(1980);
    expect(order?.totalIDR).toBe(19980);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/convex/orders.test.ts -t "service charge"`
Expected: FAIL — `serviceChargeIDR` is undefined / total still 19980 in the enabled case.

- [ ] **Step 3: Wire `createCashSale` to the shared function**

In `convex/orders.ts`, add the import near the top (with the other `./lib` imports):

```ts
import { computeOrderTotals } from './lib/pricing';
```

Replace the pricing block (currently `orders.ts:162-166`):

```ts
    const cafe = await ctx.db.get(cafeId);
    const taxEnabled = cafe?.taxEnabled === true;
    const taxRatePct = taxEnabled ? cafe?.taxRatePct ?? 0 : 0;
    const taxIDR = Math.round((subtotalIDR * taxRatePct) / 100);
    const totalIDR = subtotalIDR + taxIDR;
```

with:

```ts
    const cafe = await ctx.db.get(cafeId);
    const taxEnabled = cafe?.taxEnabled === true;
    const taxRatePct = taxEnabled ? cafe?.taxRatePct ?? 0 : 0;

    const settings = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    const pay = settings?.payment;
    const scEnabled = pay?.serviceChargeEnabled === true;
    const scPct = scEnabled ? pay?.serviceChargePct ?? 0 : 0;
    const scName = pay?.serviceChargeName ?? 'Biaya Layanan';

    const { serviceChargeIDR, taxIDR, totalIDR } = computeOrderTotals({
      subtotalIDR,
      discountIDR: 0,
      serviceChargeEnabled: scEnabled,
      serviceChargePct: scPct,
      taxEnabled,
      taxRatePct,
    });
```

Then in the `ctx.db.insert('orders', { ... })` call, AFTER the `discountIDR: 0,`
line, add:

```ts
      serviceChargeIDR,
      serviceChargePct: scPct,
      serviceChargeName: scName,
```

(`taxIDR` and `totalIDR` are now produced by `computeOrderTotals`; the rest of
the insert — and the `tendered < totalIDR` guard — is unchanged.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/convex/orders.test.ts`
Expected: PASS (all existing order tests + the 2 new service-charge tests). The
existing no-service-charge tests still pass because a cafe with no `cafeSettings`
row yields `scEnabled = false` → identical totals to before.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/orders.ts tests/convex/orders.test.ts
git commit -m "feat(orders): apply service charge in createCashSale (PB1 after SC)"
```

---

## Task 4: Client — shared computation in `sale-screen`, presentational `cart-pane`

**Files:**
- Modify: `src/components/sale/sale-screen.tsx`
- Modify: `src/components/sale/cart-pane.tsx`

- [ ] **Step 1: Compute the breakdown once in `sale-screen` and pass it down**

In `src/components/sale/sale-screen.tsx`:

Add imports near the top:
```ts
import { computeOrderTotals } from 'convex/lib/pricing';
```
Ensure `api` is imported (it already is via the existing `useQuery` calls).

Add a settings query alongside the existing `cafe` query (the component already
calls `useQuery` for the cafe; add this next to it):
```ts
  const settings = useQuery(api.settings.get, {});
```

Replace the existing inline calc (currently `sale-screen.tsx:54-58`):
```ts
  const subtotal = cart.lines.reduce((s, l) => s + l.qty * l.unitPriceIDR, 0);
  const taxEnabled = cafe?.taxEnabled === true;
  const taxRatePct = cafe?.taxRatePct ?? 0;
  const tax = taxEnabled ? Math.round((subtotal * taxRatePct) / 100) : 0;
  const total = subtotal + tax;
```
with:
```ts
  const subtotal = cart.lines.reduce((s, l) => s + l.qty * l.unitPriceIDR, 0);
  const taxEnabled = cafe?.taxEnabled === true;
  const taxRatePct = cafe?.taxRatePct ?? 0;
  const scEnabled = settings?.payment.serviceChargeEnabled === true;
  const scPct = scEnabled ? settings?.payment.serviceChargePct ?? 0 : 0;
  const scName = settings?.payment.serviceChargeName ?? 'Biaya Layanan';
  const { serviceChargeIDR, taxIDR: tax, totalIDR: total } = computeOrderTotals({
    subtotalIDR: subtotal,
    discountIDR: 0,
    serviceChargeEnabled: scEnabled,
    serviceChargePct: scPct,
    taxEnabled,
    taxRatePct,
  });
```

Update the `<CartPane .../>` usage (currently passing `taxEnabled` / `taxRatePct`)
to pass the computed breakdown instead:
```tsx
      <CartPane
        cart={cart}
        dispatch={dispatch}
        subtotalIDR={subtotal}
        serviceChargeIDR={serviceChargeIDR}
        serviceChargeName={scName}
        serviceChargePct={scPct}
        taxEnabled={taxEnabled}
        taxRatePct={taxRatePct}
        taxIDR={tax}
        totalIDR={total}
        onBayar={() => {
          if (cart.lines.length > 0) setPaymentOpen(true);
        }}
        onKosongkan={() => setClearOpen(true)}
      />
```
(`total` continues to be passed to `CashPaymentDialog` unchanged.)

- [ ] **Step 2: Make `cart-pane` presentational and render the service-charge line**

Replace the props/computation in `src/components/sale/cart-pane.tsx`. Change the
component signature and drop the internal subtotal/tax/total computation:

```tsx
export function CartPane({
  cart,
  dispatch,
  subtotalIDR,
  serviceChargeIDR,
  serviceChargeName,
  serviceChargePct,
  taxEnabled,
  taxRatePct,
  taxIDR,
  totalIDR,
  onBayar,
  onKosongkan,
}: {
  cart: CartState;
  dispatch: (a: CartAction) => void;
  subtotalIDR: number;
  serviceChargeIDR: number;
  serviceChargeName: string;
  serviceChargePct: number;
  taxEnabled: boolean;
  taxRatePct: number;
  taxIDR: number;
  totalIDR: number;
  onBayar: () => void;
  onKosongkan: () => void;
}) {
  const { t } = useLingui();
  const empty = cart.lines.length === 0;
```

(Remove the old `const subtotal = ...`, `const tax = ...`, `const total = ...`
lines — those values now arrive as props.)

Then update the summary rows (currently `cart-pane.tsx:66-68`) to:
```tsx
        <Row label={t`Subtotal`} value={formatIDR(subtotalIDR)} />
        {serviceChargeIDR > 0 ? (
          <Row
            label={`${serviceChargeName} ${serviceChargePct}%`}
            value={formatIDR(serviceChargeIDR)}
          />
        ) : null}
        {taxEnabled ? <Row label={t`PPN ${taxRatePct}%`} value={formatIDR(taxIDR)} /> : null}
        <Row label={t`Total`} value={formatIDR(totalIDR)} bold large />
```

(The service-charge label uses the cafe's configured `serviceChargeName` —
runtime data, not a translatable string — so no new i18n message is added here.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/sale/sale-screen.tsx src/components/sale/cart-pane.tsx
git commit -m "feat(sale): show service charge in cart, compute totals via shared pricing"
```

---

## Task 5: Receipt — service-charge line

**Files:**
- Modify: `src/components/sale/receipt-preview.tsx`

- [ ] **Step 1: Add the service-charge line between Subtotal and tax**

In `src/components/sale/receipt-preview.tsx`, the summary currently renders
Subtotal, then the tax line (`order.taxIDR > 0 ? ...`), then Total. Insert a
service-charge line BETWEEN the Subtotal line and the tax line:

```tsx
        {(order.serviceChargeIDR ?? 0) > 0 ? (
          <div className="flex justify-between">
            <span>
              {order.serviceChargeName ?? 'Biaya Layanan'} {order.serviceChargePct}%
            </span>
            <span className="tabular-nums">{formatIDR(order.serviceChargeIDR ?? 0)}</span>
          </div>
        ) : null}
```

Match the exact JSX/class structure of the adjacent Subtotal/tax rows in that
file (the snippet above mirrors the tax row at `receipt-preview.tsx:73-77`).

**Important:** check how `receipt-preview`'s `order` prop is typed. If it uses
the Convex query return type (e.g. `FunctionReturnType<typeof api.orders.getById>`
or the generated `Doc<'orders'>`), the three optional service-charge fields are
already present after Task 2's codegen — no type change needed. If instead it
declares a hand-written local `order` prop type (a subset of fields), ADD
`serviceChargeIDR?: number; serviceChargePct?: number; serviceChargeName?: string;`
to that local type so the new line typechecks.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (The `order` prop type already includes the optional
service-charge fields via the regenerated `orderSummary`/`orderDetail` types.)

- [ ] **Step 3: Commit**

```bash
git add src/components/sale/receipt-preview.tsx
git commit -m "feat(receipt): show service-charge line on the receipt"
```

---

## Task 6: Final verification + PR

**Files:** none (verification only)

- [ ] **Step 1: Catalog check (only if any `<Trans>`/`t\`\`` was added)**

Run: `pnpm lingui:extract`
Expected: 0 new missing `en` entries (the service-charge labels use runtime
`serviceChargeName` data, not new message ids). If any new string appears, fill
its `en` translation and re-run `pnpm lingui:compile`.

- [ ] **Step 2: Full local CI**

Run: `pnpm typecheck && pnpm test && pnpm lingui:compile`
Expected: typecheck clean; all tests pass (existing + 6 pricing unit tests + 2
createCashSale service-charge tests); catalogs compile.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: 0 errors (pre-existing warnings acceptable; none new from changed files).

- [ ] **Step 4: Manual smoke (optional but recommended)**

Settings → Tax & Payment → enable service charge at 5%. Open the sale screen, add
an item: confirm the cart shows a "Biaya Layanan 5%" line, the total = subtotal +
SC + tax-on-(subtotal+SC), the cash dialog change is correct, and the receipt
preview shows the service-charge line. Toggle it off → line disappears, total =
subtotal + tax.

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin feat/service-charge
gh pr create --base main --title "feat(service-charge): apply configured service charge to order pricing" --body "Implements docs/superpowers/specs/2026-05-30-service-charge-design.md"
```

---

## Notes for the implementer

- **PB1 after service charge** is the core invariant: tax base is `subtotal + serviceCharge`. The unit test "PB1 applied AFTER service charge" pins it.
- **Three call sites collapse to one formula:** server `createCashSale`, `sale-screen` (which now feeds `cart-pane`), all via `computeOrderTotals`. Don't reintroduce an inline tax calc.
- **Backward compat:** the new `orders` fields are optional; existing orders and a cafe with no `cafeSettings` row behave exactly as before (`serviceChargeIDR` 0).
- **`convex/lib/pricing.ts` is pure** — no `convex/server` or React imports — so both the Convex bundle and the Vite client can import it. The client imports it as `convex/lib/pricing` (same convention as importing `convex/_generated/*`).
- **Out of scope:** `cashRounding` and `taxInclusive` (pre-existing unapplied settings; separate slices).
