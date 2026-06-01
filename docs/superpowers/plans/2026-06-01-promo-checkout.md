# Promo application at checkout (Sub-project 5b) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a cashier apply one active promo to a cash sale from the cart, see the discount in totals live, and have the server recompute + record it (with a promo snapshot) on the order and receipt.

**Architecture:** A pure `promoDiscountIDR` in `convex/lib/pricing.ts` (shared by server + client). `createCashSale` gains an optional `promoId`, re-fetches the promo, recomputes the discount authoritatively, and freezes an `appliedPromo` snapshot on the order. The sale screen holds the selected promo in the cart reducer, previews the discount, and a new `PromoPickerDialog` selects it. The receipt renders a discount row.

**Tech Stack:** React 19, TanStack Router, Convex + convex-test, Tailwind v4, Lingui (id source / en target), shadcn/ui kit, Vitest, Playwright. Package manager: **pnpm**. Branch: `feat/promo-checkout` (off `main`, already created with the design-spec commit).

---

## Conventions for the implementing engineer (read once)

- **pnpm**; `~` = `src/`, `convex/...` for backend/generated. Convex codegen: `./node_modules/.bin/convex codegen` (NOT npx); commit `convex/_generated/*` drift.
- **Branch:** `feat/promo-checkout` (already created off `main`, has the design-spec commit `e02012c`). Stay on it.
- **i18n:** author Indonesian; `<Trans>` in JSX, `` t`…` `` for attributes. Task 10 runs extract/fill/compile. Server `throw new Error('…')` strings stay raw Indonesian (NOT i18n'd) — consistent with existing errors like `Keranjang kosong.`.
- **Strict TS:** `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Build optional object fields via conditional spread, never by assigning `undefined`.
- **Empty states use shadcn `Empty`** (project convention).
- **Run before any push:** `pnpm lingui:extract` → fill `en` → `pnpm typecheck && pnpm test && pnpm lingui:compile`.
- **Commit style:** small Conventional Commits, each ending with a blank line then:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File structure

**Modified:** `convex/lib/pricing.ts` (+ helper), `convex/schema.ts` (+ `orders.appliedPromo`), `convex/_generated/*`, `convex/orders.ts` (`createCashSale`), `src/components/sale/{sale-screen,cart-pane,cart-reducer,cash-payment-dialog,receipt-preview}.tsx`, `tests/convex/{pricing,orders}.test.ts`, `src/components/sale/cart-reducer.test.ts`, `tests/e2e/sale.spec.ts`, Lingui catalogs.
**New:** `src/components/sale/promo-picker-dialog.tsx`.

---

## Task 1: `promoDiscountIDR` pure helper

**Files:**
- Modify: `convex/lib/pricing.ts`
- Test: `tests/convex/pricing.test.ts` (append to the existing file)

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block at the end of `tests/convex/pricing.test.ts` (the file already imports from `'../../convex/lib/pricing'` — extend that import to include `promoDiscountIDR`):

Change the import line at the top from:
```ts
import { computeOrderTotals } from '../../convex/lib/pricing';
```
to:
```ts
import { computeOrderTotals, promoDiscountIDR } from '../../convex/lib/pricing';
```

Then append:
```ts
describe('promoDiscountIDR', () => {
  it('percent: rounds to the nearest rupiah', () => {
    // 11% of 9090 = 999.9 → 1000
    expect(promoDiscountIDR('percent', 11, 9090)).toBe(1000);
  });
  it('percent: 20% of 50000 = 10000', () => {
    expect(promoDiscountIDR('percent', 20, 50000)).toBe(10000);
  });
  it('fixed: applies the full value when under subtotal', () => {
    expect(promoDiscountIDR('fixed', 10000, 50000)).toBe(10000);
  });
  it('fixed: clamps to subtotal when value exceeds it', () => {
    expect(promoDiscountIDR('fixed', 10000, 6000)).toBe(6000);
  });
  it('returns 0 on a zero subtotal (both types)', () => {
    expect(promoDiscountIDR('percent', 20, 0)).toBe(0);
    expect(promoDiscountIDR('fixed', 5000, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- tests/convex/pricing.test.ts`
Expected: FAIL — `promoDiscountIDR is not a function` / import has no such export.

- [ ] **Step 3: Implement**

Append to `convex/lib/pricing.ts`:
```ts
/**
 * Discount amount in IDR for a promo applied to an order subtotal. Pure, so
 * `createCashSale` (authoritative) and the sale screen (preview) compute it
 * identically. Clamped to [0, subtotal] — a fixed promo never exceeds the
 * subtotal, so the discounted base floors at 0.
 */
export function promoDiscountIDR(
  type: 'percent' | 'fixed',
  value: number,
  subtotalIDR: number,
): number {
  const raw = type === 'percent' ? Math.round((subtotalIDR * value) / 100) : value;
  return Math.max(0, Math.min(raw, subtotalIDR));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- tests/convex/pricing.test.ts`
Expected: PASS (existing `computeOrderTotals` tests + 5 new `promoDiscountIDR` tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/pricing.ts tests/convex/pricing.test.ts
git commit -m "feat(promotions): add promoDiscountIDR helper with tests"
```

---

## Task 2: `orders.appliedPromo` schema field + codegen

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/_generated/*` (via codegen)

- [ ] **Step 1: Add the optional snapshot field**

In `convex/schema.ts`, inside the `orders: defineTable({ … })`, immediately after the `discountIDR: v.number(),` line, add:
```ts
    // Promo snapshot frozen at sale time (5b). Optional: omitted when no promo
    // applied, and absent on pre-5b orders. Mirrors the lines/service-charge
    // snapshots so history + receipts survive later promo edits/archival.
    appliedPromo: v.optional(
      v.object({
        promoId: v.id('promotions'),
        name: v.string(),
        type: v.union(v.literal('percent'), v.literal('fixed')),
        value: v.number(),
      })
    ),
```

- [ ] **Step 2: Codegen**

Run: `./node_modules/.bin/convex codegen`
Expected: regenerates `convex/_generated/*`; `git status` shows changes only under `convex/_generated/` (plus your `schema.ts` edit).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean (no consumer references the field yet).

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(promotions): add orders.appliedPromo snapshot field"
```

---

## Task 3: `createCashSale` promo handling

**Files:**
- Modify: `convex/orders.ts` (args at `:27-34`; totals/insert block at `:176-208`)
- Test: `tests/convex/orders.test.ts` (append tests; `requireOwned` already imported in `orders.ts`)

- [ ] **Step 1: Write the failing tests**

Append these tests inside the existing `describe('orders.createCashSale', …)` block in `tests/convex/orders.test.ts` (the `setup` helper there creates an owner, shift, cashier, and an `Espresso` item at Rp 18.000; reuse it). Add a small promo helper at the top of the block's tests by inlining `api.promotions.create`:

```ts
  it('applies a percent promo: discounts subtotal, snapshots the promo', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const promoId = await asOwner.mutation(api.promotions.create, {
      name: 'Diskon 25',
      type: 'percent',
      value: 25,
    });
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-promo-pct',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      promoId,
      createdAtClient: 1700000000000,
    });
    // subtotal 18000; 25% = 4500; no tax → total 13500
    expect(result.totalIDR).toBe(13500);
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.discountIDR).toBe(4500);
    expect(order?.appliedPromo).toEqual({
      promoId,
      name: 'Diskon 25',
      type: 'percent',
      value: 25,
    });
  });

  it('clamps a fixed promo that exceeds the subtotal', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const promoId = await asOwner.mutation(api.promotions.create, {
      name: 'Gratis',
      type: 'fixed',
      value: 50000, // > 18000 subtotal
    });
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-promo-clamp',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 0,
      promoId,
      createdAtClient: 1700000000000,
    });
    expect(result.totalIDR).toBe(0);
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.discountIDR).toBe(18000);
  });

  it('rejects an archived promo', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const promoId = await asOwner.mutation(api.promotions.create, {
      name: 'Lama',
      type: 'percent',
      value: 10,
    });
    await asOwner.mutation(api.promotions.archive, { id: promoId });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'order-promo-archived',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        promoId,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/tidak tersedia/i);
  });

  it("rejects a promo owned by another cafe", async () => {
    const t = convexTest(schema, modules);
    const a = await setup(t, { email: 'a@x.com' });
    const b = await setup(t, { email: 'b@x.com' });
    const foreignPromo = await a.asOwner.mutation(api.promotions.create, {
      name: 'A only',
      type: 'percent',
      value: 10,
    });
    await expect(
      b.asOwner.mutation(api.orders.createCashSale, {
        clientId: 'order-promo-foreign',
        shiftId: b.shiftId,
        cashierId: b.cashierId,
        lines: [{ menuItemId: b.itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        promoId: foreignPromo,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow();
  });

  it('no promoId → discountIDR 0 and no appliedPromo (regression)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-no-promo',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.discountIDR).toBe(0);
    expect(order?.appliedPromo).toBeUndefined();
    expect(result.totalIDR).toBe(18000);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- tests/convex/orders.test.ts`
Expected: FAIL — `createCashSale` does not accept `promoId` (validator rejects the arg) and `appliedPromo`/discount expectations are unmet.

- [ ] **Step 3: Add the `promoId` arg**

In `convex/orders.ts`, in the `createCashSale` `args` object (currently `:27-34`), add `promoId` after `cashTenderedIDR`:
```ts
  args: {
    clientId: v.string(),
    shiftId: v.id('shifts'),
    cashierId: v.id('cafeStaff'),
    lines: v.array(lineInput),
    cashTenderedIDR: v.number(),
    promoId: v.optional(v.id('promotions')),
    createdAtClient: v.optional(v.number()),
  },
```

- [ ] **Step 4: Compute the discount + snapshot before `computeOrderTotals`**

In `convex/orders.ts`, find this block (currently `:161-183`):
```ts
    const subtotalIDR = builtLines.reduce((sum, l) => sum + l.lineTotalIDR, 0);

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
    const scName = pay?.serviceChargeName ?? DEFAULT_SERVICE_CHARGE_NAME;

    const { serviceChargeIDR, taxIDR, totalIDR } = computeOrderTotals({
      subtotalIDR,
      discountIDR: 0,
      serviceChargeEnabled: scEnabled,
      serviceChargePct: scPct,
      taxEnabled,
      taxRatePct,
    });
```
Replace it with (adds the promo block, threads `discountIDR` + `appliedPromo`):
```ts
    const subtotalIDR = builtLines.reduce((sum, l) => sum + l.lineTotalIDR, 0);

    // Promo: re-fetch + recompute authoritatively (never trust a client amount).
    let discountIDR = 0;
    let appliedPromo: Doc<'orders'>['appliedPromo'];
    if (args.promoId) {
      const promo = await requireOwned(ctx, cafeId, args.promoId, 'Promo');
      if (promo.archived) throw new Error('Promo tidak tersedia.');
      discountIDR = promoDiscountIDR(promo.type, promo.value, subtotalIDR);
      appliedPromo = {
        promoId: promo._id,
        name: promo.name,
        type: promo.type,
        value: promo.value,
      };
    }

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
    const scName = pay?.serviceChargeName ?? DEFAULT_SERVICE_CHARGE_NAME;

    const { serviceChargeIDR, taxIDR, totalIDR } = computeOrderTotals({
      subtotalIDR,
      discountIDR,
      serviceChargeEnabled: scEnabled,
      serviceChargePct: scPct,
      taxEnabled,
      taxRatePct,
    });
```

Add `promoDiscountIDR` to the existing pricing import at the top of `convex/orders.ts` (currently `import { DEFAULT_SERVICE_CHARGE_NAME, computeOrderTotals } from './lib/pricing';`):
```ts
import { DEFAULT_SERVICE_CHARGE_NAME, computeOrderTotals, promoDiscountIDR } from './lib/pricing';
```

- [ ] **Step 5: Write `discountIDR` + `appliedPromo` on the insert**

In `convex/orders.ts`, find the `ctx.db.insert('orders', { … })` (currently `:190-208`). Change the `discountIDR: 0,` line to `discountIDR,` and add the snapshot via conditional spread (so `exactOptionalPropertyTypes` is satisfied — never assign `undefined`). The insert's discount/promo lines become:
```ts
      discountIDR,
      ...(appliedPromo ? { appliedPromo } : {}),
```
(Leave all other insert fields — `serviceChargeIDR`, `serviceChargePct`, `serviceChargeName`, `totalIDR`, etc. — unchanged.)

- [ ] **Step 6: Run to verify pass**

Run: `pnpm test -- tests/convex/orders.test.ts`
Expected: PASS — all existing order tests plus the 5 new promo tests.

- [ ] **Step 7: Commit**

```bash
git add convex/orders.ts tests/convex/orders.test.ts
git commit -m "feat(promotions): apply promo discount in createCashSale + snapshot"
```

---

## Task 4: Cart reducer promo state

**Files:**
- Modify: `src/components/sale/cart-reducer.ts`
- Test: `src/components/sale/cart-reducer.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `src/components/sale/cart-reducer.test.ts` (it already imports `cartReducer`, `initialCart`; extend that import to add `CartPromo` if needed — but tests below only need the existing names plus inline literals):

```ts
describe('cartReducer — promo', () => {
  const promo = {
    _id: 'promo_1' as unknown as import('convex/_generated/dataModel').Id<'promotions'>,
    name: 'Diskon Kopi',
    type: 'percent' as const,
    value: 20,
  };

  it('initialCart has no promo', () => {
    expect(initialCart.promo).toBeNull();
  });

  it('setPromo stores the promo', () => {
    const next = cartReducer(initialCart, { type: 'setPromo', promo });
    expect(next.promo).toEqual(promo);
  });

  it('setPromo with null clears the promo', () => {
    const withPromo = cartReducer(initialCart, { type: 'setPromo', promo });
    const cleared = cartReducer(withPromo, { type: 'setPromo', promo: null });
    expect(cleared.promo).toBeNull();
  });

  it('clearCart resets lines and promo', () => {
    const withPromo = cartReducer(initialCart, { type: 'setPromo', promo });
    const cleared = cartReducer(withPromo, { type: 'clearCart' });
    expect(cleared.lines).toEqual([]);
    expect(cleared.promo).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/components/sale/cart-reducer.test.ts`
Expected: FAIL — `initialCart.promo` is undefined and `'setPromo'` is not a valid action type.

- [ ] **Step 3: Implement the promo state**

In `src/components/sale/cart-reducer.ts`:

Add the promo type after the `CartLine` type (before `CartState`):
```ts
export type CartPromo = {
  _id: Id<'promotions'>;
  name: string;
  type: 'percent' | 'fixed';
  value: number;
};
```

Change `CartState`:
```ts
export type CartState = { lines: CartLine[]; promo: CartPromo | null };
```

Add the `setPromo` action to the `CartAction` union:
```ts
  | { type: 'setPromo'; promo: CartPromo | null }
```

Change `initialCart`:
```ts
export const initialCart: CartState = { lines: [], promo: null };
```

Every existing `case` that returns `{ lines: … }` now omits `promo`, which breaks the type. Preserve `promo` by spreading state. Update the returns:
- `addLine` merge branch: `return { ...state, lines };`
- `addLine` push branch: `return { ...state, lines: [...state.lines, { ...incoming, lineKey: action.lineKey }] };`
- `incrementQty`: `return { ...state, lines: state.lines.map(…) };`
- `decrementQty` (both returns): wrap each `{ lines: … }` as `{ ...state, lines: … }`.
- `removeLine`: `return { ...state, lines: state.lines.filter(…) };`

Add the new case and change `clearCart`:
```ts
    case 'setPromo': {
      return { ...state, promo: action.promo };
    }
    case 'clearCart': {
      return { lines: [], promo: null };
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- src/components/sale/cart-reducer.test.ts`
Expected: PASS (existing line tests + new promo tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL only in `sale-screen.tsx` / `cart-pane.tsx` if they destructure `CartState` exhaustively — those are wired in Task 7. If typecheck is clean, even better. Do NOT fix consumers here; that's Task 6/7.

- [ ] **Step 6: Commit**

```bash
git add src/components/sale/cart-reducer.ts src/components/sale/cart-reducer.test.ts
git commit -m "feat(promotions): add promo to cart reducer state"
```

---

## Task 5: `PromoPickerDialog` component

**Files:**
- Create: `src/components/sale/promo-picker-dialog.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/sale/promo-picker-dialog.tsx`:
```tsx
import { Trans } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import type { CartPromo } from './cart-reducer';
import { BadgePercent } from 'lucide-react';
import { formatPromoValue } from '~/lib/promo';

export function PromoPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (promo: CartPromo) => void;
}) {
  // Active promos only (list() defaults to non-archived).
  const promos = useQuery(api.promotions.list, open ? {} : 'skip');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            <Trans>Pilih promo</Trans>
          </DialogTitle>
        </DialogHeader>
        {promos === undefined ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Spinner />
          </div>
        ) : promos.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BadgePercent />
              </EmptyMedia>
              <EmptyTitle>
                <Trans>Belum ada promo aktif.</Trans>
              </EmptyTitle>
              <EmptyDescription>
                <Trans>Buat promo di halaman Promo & Diskon.</Trans>
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y divide-border">
            {promos.map((p) => (
              <li key={p._id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-1 py-3 text-left hover:bg-muted"
                  onClick={() => {
                    onSelect({ _id: p._id, name: p.name, type: p.type, value: p.value });
                    onOpenChange(false);
                  }}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatPromoValue(p.type, p.value)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: clean (component is self-contained; not yet rendered).

```bash
git add src/components/sale/promo-picker-dialog.tsx
git commit -m "feat(promotions): add PromoPickerDialog for the sale screen"
```

---

## Task 6: `CartPane` discount row + add/remove promo

**Files:**
- Modify: `src/components/sale/cart-pane.tsx`

- [ ] **Step 1: Add props + render the discount row / add-promo button**

In `src/components/sale/cart-pane.tsx`:

Extend the destructured props and the prop type. Add `promo`, `discountIDR`, `onAddPromo`, `onRemovePromo` to the function params after `totalIDR` / before `onBayar`:
```tsx
  promo,
  discountIDR,
  onAddPromo,
  onRemovePromo,
```
and to the prop type object (after `totalIDR: number;`):
```tsx
  promo: import('./cart-reducer').CartPromo | null;
  discountIDR: number;
  onAddPromo: () => void;
  onRemovePromo: () => void;
```

Add imports at the top:
```tsx
import { X } from 'lucide-react';
import { formatPromoValue } from '~/lib/promo';
```

In the totals block, between the `Subtotal` row and the `serviceChargeIDR > 0` block, insert:
```tsx
        {promo ? (
          <div className="flex items-center justify-between text-emerald-700">
            <span className="flex items-center gap-1">
              <Trans>Diskon</Trans> {promo.name} ({formatPromoValue(promo.type, promo.value)})
              <button
                type="button"
                onClick={onRemovePromo}
                aria-label={t`Hapus promo`}
                className="ml-0.5 rounded p-0.5 hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            </span>
            <span className="tabular-nums">−{formatIDR(discountIDR)}</span>
          </div>
        ) : !empty ? (
          <button
            type="button"
            onClick={onAddPromo}
            className="text-left text-primary hover:underline"
          >
            + <Trans>Tambah promo</Trans>
          </button>
        ) : null}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL only in `sale-screen.tsx` (it doesn't pass the new required props yet). That's wired in Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/components/sale/cart-pane.tsx
git commit -m "feat(promotions): render discount row + add-promo control in CartPane"
```

---

## Task 7: Wire `SaleScreen` + `CashPaymentDialog`

**Files:**
- Modify: `src/components/sale/sale-screen.tsx`
- Modify: `src/components/sale/cash-payment-dialog.tsx`

- [ ] **Step 1: SaleScreen — preview discount + picker state + props**

In `src/components/sale/sale-screen.tsx`:

Extend the pricing import (currently `import { DEFAULT_SERVICE_CHARGE_NAME, computeOrderTotals } from 'convex/lib/pricing';`):
```tsx
import { DEFAULT_SERVICE_CHARGE_NAME, computeOrderTotals, promoDiscountIDR } from 'convex/lib/pricing';
```
Add the picker import near the other sale imports:
```tsx
import { PromoPickerDialog } from './promo-picker-dialog';
```

Add picker open state alongside the other `useState`s (after `paymentOpen`):
```tsx
  const [promoPickerOpen, setPromoPickerOpen] = useState(false);
```

Compute the preview discount and feed it into totals. Replace the existing totals block (currently `:62-75`):
```tsx
  const subtotal = cart.lines.reduce((s, l) => s + l.qty * l.unitPriceIDR, 0);
  const taxEnabled = cafe?.taxEnabled === true;
  const taxRatePct = taxEnabled ? cafe?.taxRatePct ?? 0 : 0;
  const scEnabled = settings?.payment.serviceChargeEnabled === true;
  const scPct = scEnabled ? settings?.payment.serviceChargePct ?? 0 : 0;
  const scName = settings?.payment.serviceChargeName ?? DEFAULT_SERVICE_CHARGE_NAME;
  const { serviceChargeIDR, taxIDR: tax, totalIDR: total } = computeOrderTotals({
    subtotalIDR: subtotal,
    discountIDR: 0,
    serviceChargeEnabled: scEnabled,
    serviceChargePct: scPct,
    taxEnabled,
    taxRatePct,
  });
```
with:
```tsx
  const subtotal = cart.lines.reduce((s, l) => s + l.qty * l.unitPriceIDR, 0);
  const discount = cart.promo
    ? promoDiscountIDR(cart.promo.type, cart.promo.value, subtotal)
    : 0;
  const taxEnabled = cafe?.taxEnabled === true;
  const taxRatePct = taxEnabled ? cafe?.taxRatePct ?? 0 : 0;
  const scEnabled = settings?.payment.serviceChargeEnabled === true;
  const scPct = scEnabled ? settings?.payment.serviceChargePct ?? 0 : 0;
  const scName = settings?.payment.serviceChargeName ?? DEFAULT_SERVICE_CHARGE_NAME;
  const { serviceChargeIDR, taxIDR: tax, totalIDR: total } = computeOrderTotals({
    subtotalIDR: subtotal,
    discountIDR: discount,
    serviceChargeEnabled: scEnabled,
    serviceChargePct: scPct,
    taxEnabled,
    taxRatePct,
  });
```

Pass the new props to `<CartPane …>` (add after `totalIDR={total}`):
```tsx
        promo={cart.promo}
        discountIDR={discount}
        onAddPromo={() => setPromoPickerOpen(true)}
        onRemovePromo={() => dispatch({ type: 'setPromo', promo: null })}
```

Render the picker dialog (add just before the closing `</div>` of the returned root, e.g. after `<ReceiptPreview … />`):
```tsx
      <PromoPickerDialog
        open={promoPickerOpen}
        onOpenChange={setPromoPickerOpen}
        onSelect={(promo) => dispatch({ type: 'setPromo', promo })}
      />
```

Pass `promoId` to the payment dialog (add to `<CashPaymentDialog …>`, after `totalIDR={total}`):
```tsx
          promoId={cart.promo?._id}
```

- [ ] **Step 2: CashPaymentDialog — accept + forward `promoId`**

In `src/components/sale/cash-payment-dialog.tsx`:

Add `promoId` to the prop type (after `cashierId: Id<'cafeStaff'>;`):
```tsx
  promoId?: Id<'promotions'>;
```
Add `promoId` to the destructured params (after `cashierId,`):
```tsx
  promoId,
```
In `confirm()`, pass it into the `createCashSale({ … })` call via conditional spread (so an omitted promo doesn't send `undefined` under `exactOptionalPropertyTypes`). Add after `cashTenderedIDR: tenderedNum,`:
```tsx
        ...(promoId ? { promoId } : {}),
```

- [ ] **Step 3: Typecheck + full suite**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean; all unit + convex tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/sale/sale-screen.tsx src/components/sale/cash-payment-dialog.tsx
git commit -m "feat(promotions): wire promo picker + discount into the sale screen"
```

---

## Task 8: Receipt discount row

**Files:**
- Modify: `src/components/sale/receipt-preview.tsx` (totals block at `:69-91`)

- [ ] **Step 1: Add the discount row**

In `src/components/sale/receipt-preview.tsx`, add `formatPromoValue` to imports:
```tsx
import { formatPromoValue } from '~/lib/promo';
```

Between the `Subtotal` row (ends `:73`) and the `serviceChargeIDR` block (begins `:74`), insert:
```tsx
            {(order.discountIDR ?? 0) > 0 ? (
              <div className="flex justify-between">
                <span>
                  <Trans>Diskon</Trans>
                  {order.appliedPromo
                    ? ` ${order.appliedPromo.name} (${formatPromoValue(order.appliedPromo.type, order.appliedPromo.value)})`
                    : ''}
                </span>
                <span className="tabular-nums">−{formatIDR(order.discountIDR)}</span>
              </div>
            ) : null}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: clean.

```bash
git add src/components/sale/receipt-preview.tsx
git commit -m "feat(promotions): show discount row on the receipt"
```

---

## Task 9: Playwright smoke — promo at checkout

**Files:**
- Modify: `tests/e2e/sale.spec.ts` (add a second test in the existing `describe`)

- [ ] **Step 1: Add the test**

Append a new test inside the `test.describe('sale (auth-gated)', …)` block in `tests/e2e/sale.spec.ts`. It mirrors the existing signup→shift setup, then creates a percent promo on `/promos` and applies it at sale:

```ts
  test('apply a percent promo at checkout → reduced total + receipt discount', async ({ page }) => {
    const email = `e2e+promo+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    // Signup
    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Promo');
    await page.getByLabel('Nama kafe').fill('Kopi Promo');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    // Onboarding/profile — no PPN this time (keeps the math simple)
    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByRole('button', { name: /Lanjut/ }).click();

    // Onboarding/menu — category "Kopi", item "Espresso" Rp 20.000
    await waitForUrlHydrated(page, /\/onboarding\/menu$/);
    await page.getByRole('button', { name: /Mulai dengan kategori/ }).click();
    await waitForUrlHydrated(page, /\/menu\/categories$/);
    await page.getByLabel('Nama kategori baru').fill('Kopi');
    await page.getByRole('button', { name: /\+ Tambah/ }).click();
    await page.getByRole('link', { name: 'Items' }).click();
    await page.getByRole('link', { name: /\+ Item/ }).click();
    await page.getByLabel('Nama').fill('Espresso');
    await page.getByLabel('Kategori').selectOption({ label: 'Kopi' });
    await page.getByLabel('Harga (Rp)').fill('20000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // Onboarding/cashier — PIN 1234
    await page.goto('/onboarding/cashier');
    await waitForUrlHydrated(page, /\/onboarding\/cashier$/);
    await page.getByRole('button', { name: /Atur PIN/ }).click();
    for (const digit of '1234') await page.keyboard.type(digit);
    await expect(page.getByRole('button', { name: /Ganti PIN/ })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /Selesai/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // Create a 25% promo on /promos
    await page.goto('/promos');
    await waitForUrlHydrated(page, /\/promos$/);
    await page.getByRole('button', { name: /Tambah Promo/ }).click();
    await page.getByLabel('Nama promo').fill('Diskon Kopi');
    await page.getByLabel('Nilai (%)').fill('25');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText('Diskon Kopi')).toBeVisible();

    // Enter the sale screen (PIN + open shift)
    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/pin$/);
    await page.getByRole('button', { name: /E2E Promo/ }).click();
    for (const digit of '1234') await page.keyboard.type(digit);
    await waitForUrlHydrated(page, /\/shift\/open$/);
    await page.getByLabel('Modal awal').fill('100000');
    await page.getByRole('button', { name: /Buka Shift/ }).click();
    await waitForUrlHydrated(page, /\/shift\/close$/);
    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/sale$/);

    // Add Espresso → subtotal Rp 20.000
    await page.getByRole('button', { name: /Espresso/ }).first().click();
    await expect(page.getByText(/Rp 20\.000/).first()).toBeVisible();

    // Apply the promo → Diskon line + total Rp 15.000 (20.000 − 25%)
    await page.getByRole('button', { name: /Tambah promo/ }).click();
    await page.getByRole('button', { name: /Diskon Kopi/ }).click();
    await expect(page.getByText(/−Rp 5\.000/)).toBeVisible();
    await expect(page.getByText(/Rp 15\.000/).first()).toBeVisible();

    // Pay exact → receipt shows the discount row
    await page.getByRole('button', { name: /^Bayar$/ }).click();
    await page.getByRole('button', { name: /^Pas$/ }).click();
    await page.getByRole('button', { name: /Konfirmasi/ }).click();
    await expect(page.getByText(/Diskon Kopi/)).toBeVisible();
    await expect(page.getByText(/−Rp 5\.000/)).toBeVisible();
  });
```

- [ ] **Step 2: Typecheck the spec**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Attempt to run (auth-gated)**

Run: `RUN_AUTH_E2E=1 pnpm exec playwright test tests/e2e/sale.spec.ts -g "percent promo"`
Expected: PASS if a dev server + Convex are reachable. If the environment can't run auth e2e, that's acceptable — the test is gated by `RUN_AUTH_E2E` and will be skipped in CI just like the sibling test. Note the skip in the commit if it didn't run.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/sale.spec.ts
git commit -m "test(e2e): apply a percent promo at checkout"
```

---

## Task 10: i18n — extract, fill English, compile

**Files:** `src/locales/id/messages.po`, `src/locales/en/messages.po`

- [ ] **Step 1: Extract**

Run: `pnpm lingui:extract`
Expected: new `en` strings reported as missing.

- [ ] **Step 2: Fill English**

In `src/locales/en/messages.po`, fill each NEW empty `msgstr ""`. Mapping:
- `Pilih promo` → `Choose a promo`
- `Diskon` → `Discount`
- `Tambah promo` → `Add promo`  (may already exist from 5a — leave if filled)
- `Hapus promo` → `Remove promo`
- `Belum ada promo aktif.` → `No active promos yet.`
- `Buat promo di halaman Promo & Diskon.` → `Create one on the Promos & Discounts page.`

For any other new empty `en` msgstr, translate sensibly and note it.

- [ ] **Step 3: Compile + typecheck**

Run: `pnpm lingui:compile && pnpm typecheck`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/locales/id/messages.po src/locales/en/messages.po
git commit -m "i18n(promotions): extract + fill en for promo checkout"
```

---

## Task 11: Full local verification + integrate

**Files:** none

- [ ] **Step 1: Full gate**

Run: `pnpm typecheck && pnpm test && pnpm lingui:compile`
Expected: typecheck clean; all unit/convex tests pass (existing + `promoDiscountIDR` + `createCashSale` promo + cart reducer promo); compile clean.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: 0 errors (pre-existing warnings only; none in the new/changed promo files).

- [ ] **Step 3: Confirm clean tree + no codegen drift**

Run: `git status` then `./node_modules/.bin/convex codegen` then `git status`
Expected: clean both times (Task 2 already committed any drift).

- [ ] **Step 4: Integrate (after user OK)**

Per the trunk-based workflow, wait for the user's go-ahead, then push `feat/promo-checkout` and open a PR to `main`. Do not merge without approval; surface the squash-vs-merge tradeoff at merge time.

---

## Self-Review (performed against the spec)

**Spec coverage:**
- §2 `promoDiscountIDR` (percent round / fixed clamp / [0,subtotal]) → Task 1 (+5 tests).
- §3 `orders.appliedPromo` optional snapshot → Task 2.
- §4 `createCashSale` (`promoId` arg, re-fetch via `requireOwned`, reject archived, recompute, snapshot, thread `discountIDR`) → Task 3 (+5 tests incl. archived, foreign-cafe, regression).
- §5 cart reducer (`promo` state, `setPromo`, `clearCart` reset) → Task 4 (+tests); `PromoPickerDialog` → Task 5; `CartPane` discount row + add/remove → Task 6; `SaleScreen`/`CashPaymentDialog` wiring → Task 7.
- §6 receipt discount row → Task 8.
- §7 i18n (new strings; server throw stays raw) → Task 10.
- §8 testing (unit, convex, cart reducer, Playwright) → Tasks 1,3,4,9; gate → Task 11.
- Out-of-scope respected: no stacking/codes/scoped/min-spend/windows/auto-apply/cap; QRIS untouched; no reporting metric.

**Placeholder scan:** none — every code step shows full code; every command states expected output.

**Type consistency:** `CartPromo` (`{_id,name,type,value}`) defined in Task 4 is the exact shape consumed by `PromoPickerDialog.onSelect` (Task 5), `CartPane` props (Task 6), and `SaleScreen` dispatch (Task 7). `promoDiscountIDR(type, value, subtotalIDR)` signature is identical across pricing.ts (Task 1), `createCashSale` (Task 3), and `SaleScreen` (Task 7). `appliedPromo` object shape matches between schema (Task 2), the insert snapshot (Task 3), and receipt rendering (Task 8). `createCashSale`'s new optional `promoId` arg (Task 3) matches the `CashPaymentDialog` forward (Task 7). Conditional-spread (`...(x ? {x} : {})`) used for every optional field to satisfy `exactOptionalPropertyTypes`.
