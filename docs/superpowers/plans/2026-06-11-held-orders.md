# Held / Parked Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Park the current cart server-side under a label, start fresh, and recall it later into the cart — all off the money/inventory path.

**Architecture:** A new `heldOrders` table stores a cart snapshot (lines + promo + orderType). `convex/heldOrders.ts` provides `hold` (looks up the open shift server-side, like `cashMovements.record`), `listForShift`, and `remove`. The client parks via a label dialog (then clears the cart), recalls via a picker that rebuilds `CartState` and dispatches a new `load` reducer action (then deletes the held row), with a confirm when replacing a non-empty cart. Payment is the unchanged existing flow.

**Tech Stack:** Convex (table + 3 functions), React + shadcn (Dialog/AlertDialog/Empty/Button/Input), Lingui, convex-test/Vitest.

---

## File Structure
- **Create:** `convex/lib/heldOrder.ts`, `convex/heldOrders.ts`, `tests/convex/heldOrders.test.ts`, `src/components/sale/hold-order-dialog.tsx`, `src/components/sale/held-orders-dialog.tsx`.
- **Modify:** `convex/schema.ts`, `convex/_generated/api.d.ts`, `src/components/sale/cart-reducer.ts`, `src/components/sale/cart-pane.tsx`, `src/components/sale/sale-screen.tsx`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — heldOrders table + functions (TDD)

**Files:** create `convex/lib/heldOrder.ts`, `convex/heldOrders.ts`, `tests/convex/heldOrders.test.ts`; modify `convex/schema.ts`, `convex/_generated/api.d.ts`.

READ first: `convex/cashMovements.ts` (the `by_cafe_status` open-shift lookup + `requireOwnerCafe` pattern), `convex/lib/orderType.ts`, `convex/lib/auth.ts` (`requireOwned` signature), `tests/convex/cash-movements.test.ts` (the `setup` helper returning `{ asOwner, cafeId, cashierId, shiftId }` with an open shift + a menu item via `api.menu.items` if needed — check how orders tests create a sellable item).

- [ ] **Step 1: `convex/lib/heldOrder.ts`**
```ts
import { v } from 'convex/values';
import { orderTypeValidator } from './orderType';

export const heldLineValidator = v.object({
  menuItemId: v.id('menuItems'),
  nameSnapshot: v.string(),
  qty: v.number(),
  unitPriceIDR: v.number(),
  modifierOptionIds: v.array(v.id('modifierOptions')),
  modifierLabels: v.array(
    v.object({
      groupName: v.string(),
      optionName: v.string(),
      priceAdjustmentIDR: v.number(),
    })
  ),
});

export const heldPromoValidator = v.object({
  promoId: v.id('promotions'),
  name: v.string(),
  type: v.union(v.literal('percent'), v.literal('fixed')),
  value: v.number(),
});

export { orderTypeValidator };
```

- [ ] **Step 2: schema — `convex/schema.ts`**
Import the validators and add the table:
```ts
import { heldLineValidator, heldPromoValidator } from './lib/heldOrder';
import { orderTypeValidator } from './lib/orderType'; // already imported from order-types slice — reuse the existing import
// ...
  heldOrders: defineTable({
    cafeId: v.id('cafes'),
    shiftId: v.id('shifts'),
    cashierId: v.id('cafeStaff'),
    label: v.string(),
    orderType: orderTypeValidator,
    lines: v.array(heldLineValidator),
    promo: v.optional(heldPromoValidator),
    createdAt: v.number(),
  })
    .index('by_shift', ['shiftId'])
    .index('by_cafe', ['cafeId']),
```
(If `orderTypeValidator` is already imported in schema.ts from the order-types slice, don't double-import.)

- [ ] **Step 3: Write FAILING tests — `tests/convex/heldOrders.test.ts`**
Copy the `setup` helper from `tests/convex/cash-movements.test.ts` (owner + open shift). Add a helper to create a sellable menu item (copy from an orders/menu test — needs `api.menu.categories.create` + `api.menu.items.create` or similar; check the real API). Then:
```ts
const sampleLines = (menuItemId) => [{
  menuItemId, nameSnapshot: 'Kopi', qty: 2, unitPriceIDR: 18000,
  modifierOptionIds: [], modifierLabels: [],
}];

describe('heldOrders', () => {
  it('holds a cart and lists it for the shift', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId } = await setup(t);
    const itemId = await makeItem(asOwner); // a menuItems id
    const id = await asOwner.mutation(api.heldOrders.hold, {
      cashierId, label: 'Meja 4', orderType: 'dine_in', lines: sampleLines(itemId),
    });
    expect(id).toBeTruthy();
    const list = await asOwner.query(api.heldOrders.listForShift, { shiftId });
    expect(list).toHaveLength(1);
    expect(list[0]?.label).toBe('Meja 4');
    expect(list[0]?.lines[0]?.qty).toBe(2);
  });

  it('rejects an empty cart', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId } = await setup(t);
    await expect(
      asOwner.mutation(api.heldOrders.hold, {
        cashierId, label: '', orderType: 'dine_in', lines: [],
      })
    ).rejects.toThrow();
  });

  it('rejects when there is no open shift', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId } = await setup(t);
    // close the shift first (use the real close mutation + its required args; copy from shifts test)
    await closeShift(asOwner, shiftId);
    const itemId = await makeItem(asOwner);
    await expect(
      asOwner.mutation(api.heldOrders.hold, {
        cashierId, label: 'x', orderType: 'dine_in', lines: sampleLines(itemId),
      })
    ).rejects.toThrow();
  });

  it('removes a held order (owner-scoped)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId } = await setup(t);
    const itemId = await makeItem(asOwner);
    const id = await asOwner.mutation(api.heldOrders.hold, {
      cashierId, label: 'a', orderType: 'takeaway', lines: sampleLines(itemId),
    });
    await asOwner.mutation(api.heldOrders.remove, { id });
    const list = await asOwner.query(api.heldOrders.listForShift, { shiftId });
    expect(list).toHaveLength(0);

    // foreign owner cannot remove
    const { asOwner: asOther } = await setup(t, { email: 'other@x.com' });
    const itemId2 = await makeItem(asOwnerForOther /* or reuse asOther helper */);
    // (simplest foreign test: hold under asOwner again, then expect asOther.remove to throw)
  });
});
```
> Adapt `makeItem`/`closeShift`/foreign-owner specifics to the REAL APIs — copy exact calls
> from `tests/convex/orders.test.ts` (item creation) and `tests/convex/shifts.test.ts` (close).
> Keep the four behaviors: hold+list, empty-reject, no-open-shift-reject, remove+owner-scope.

Run `pnpm test tests/convex/heldOrders.test.ts` → FAIL (module doesn't exist).

- [ ] **Step 4: Implement `convex/heldOrders.ts`**
```ts
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { heldLineValidator, heldPromoValidator } from './lib/heldOrder';
import { orderTypeValidator } from './lib/orderType';

export const hold = mutation({
  args: {
    cashierId: v.id('cafeStaff'),
    label: v.string(),
    orderType: orderTypeValidator,
    lines: v.array(heldLineValidator),
    promo: v.optional(heldPromoValidator),
  },
  returns: v.id('heldOrders'),
  handler: async (ctx, { cashierId, label, orderType, lines, promo }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    if (lines.length === 0) throw new Error('Keranjang kosong.');
    await requireOwned(ctx, cafeId, cashierId, 'Kasir');
    const shift = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .first();
    if (!shift) throw new Error('Tidak ada shift terbuka.');
    return await ctx.db.insert('heldOrders', {
      cafeId,
      shiftId: shift._id,
      cashierId,
      label: label.trim(),
      orderType,
      lines,
      ...(promo ? { promo } : {}),
      createdAt: Date.now(),
    });
  },
});

const heldRow = v.object({
  _id: v.id('heldOrders'),
  label: v.string(),
  orderType: orderTypeValidator,
  lines: v.array(heldLineValidator),
  promo: v.optional(heldPromoValidator),
  createdAt: v.number(),
});

export const listForShift = query({
  args: { shiftId: v.id('shifts') },
  returns: v.array(heldRow),
  handler: async (ctx, { shiftId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('heldOrders')
      .withIndex('by_shift', (q) => q.eq('shiftId', shiftId))
      .collect();
    return rows
      .filter((r) => r.cafeId === cafeId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        _id: r._id,
        label: r.label,
        orderType: r.orderType,
        lines: r.lines,
        ...(r.promo ? { promo: r.promo } : {}),
        createdAt: r.createdAt,
      }));
  },
});

export const remove = mutation({
  args: { id: v.id('heldOrders') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Pesanan ditahan');
    await ctx.db.delete(id);
    return null;
  },
});
```

- [ ] **Step 5: Register in `convex/_generated/api.d.ts`**
The dev watcher usually adds `heldOrders` and `lib/heldOrder` (import lines + `fullApi`
entries, alphabetical). If `git status` shows `api.d.ts` modified with those, keep it. If
NOT present after running the tests, add them manually (mirror the existing `lib/orderType`
+ a top-level module like `forecast`). Verify `pnpm typecheck` passes.

- [ ] **Step 6: Tests + typecheck + commit**
`pnpm test tests/convex/heldOrders.test.ts` → PASS. `pnpm typecheck` → PASS.
```bash
git add convex/lib/heldOrder.ts convex/heldOrders.ts convex/schema.ts convex/_generated/api.d.ts tests/convex/heldOrders.test.ts
git commit -m "feat(sale): heldOrders table + hold/list/remove (off the money path)"
```
> Do NOT run `convex codegen`.

---

### Task 2: Cart reducer — `load` action

**Files:** modify `src/components/sale/cart-reducer.ts`.

- [ ] **Step 1:** Add to `CartAction`: `| { type: 'load'; state: CartState }`
- [ ] **Step 2:** Add a reducer case (before `clearCart`): 
```ts
    case 'load': {
      return action.state;
    }
```
- [ ] **Step 3:** `pnpm typecheck` → PASS. Commit:
```bash
git add src/components/sale/cart-reducer.ts
git commit -m "feat(sale): cart 'load' action for recalling held orders"
```

---

### Task 3: Hold (park) dialog

**Files:** create `src/components/sale/hold-order-dialog.tsx`.

READ `src/components/sale/cart-reducer.ts` (CartState/CartLine/CartPromo) and
`stock-adjust-dialog.tsx` (Dialog/submit/toast/Spinner pattern).

- [ ] **Step 1: Write the component**
```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { type FormEvent, useEffect, useState } from 'react';
import type { CartState } from './cart-reducer';
import { Button } from '~/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

export function HoldOrderDialog({
  open, cart, cashierId, onOpenChange, onHeld,
}: {
  open: boolean;
  cart: CartState;
  cashierId: Id<'cafeStaff'>;
  onOpenChange: (open: boolean) => void;
  onHeld: () => void;
}) {
  const { t } = useLingui();
  const hold = useMutation(api.heldOrders.hold);
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) setLabel(''); }, [open]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || cart.lines.length === 0) return;
    setSubmitting(true);
    try {
      await hold({
        cashierId,
        label: label.trim(),
        orderType: cart.orderType,
        lines: cart.lines.map((l) => ({
          menuItemId: l.menuItemId,
          nameSnapshot: l.nameSnapshot,
          qty: l.qty,
          unitPriceIDR: l.unitPriceIDR,
          modifierOptionIds: l.modifierOptionIds,
          modifierLabels: l.modifierLabels,
        })),
        ...(cart.promo
          ? { promo: { promoId: cart.promo._id, name: cart.promo.name, type: cart.promo.type, value: cart.promo.value } }
          : {}),
      });
      toast.success(t`Pesanan ditahan.`);
      onHeld(); // parent clears the cart + closes
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal menahan pesanan.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle><Trans>Tahan pesanan</Trans></DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <Field>
            <FieldLabel htmlFor="hold-label"><Trans>Nama / meja</Trans></FieldLabel>
            <Input
              id="hold-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              autoFocus
              placeholder={t`Nama / meja`}
            />
          </Field>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              <Trans>Batal</Trans>
            </Button>
            <Button type="submit" disabled={submitting || cart.lines.length === 0}>
              {submitting && <Spinner data-icon="inline-start" />}
              <Trans>Tahan</Trans>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```
- [ ] **Step 2:** `pnpm typecheck` → PASS. Commit:
```bash
git add src/components/sale/hold-order-dialog.tsx
git commit -m "feat(sale): hold-order dialog (park current cart)"
```

---

### Task 4: Held-orders picker dialog

**Files:** create `src/components/sale/held-orders-dialog.tsx`.

READ `src/components/sale/cart-reducer.ts` (CartState/CartLine), `order-types.tsx`
(`ORDER_TYPE_OPTIONS`), `src/components/ui/empty.tsx`, and `~/lib/money` (`formatIDR`).

The parent passes the already-fetched `held` list and a `genLineKey` factory (so keys are
consistent with the rest of the screen) plus `onRecall(state: CartState)`.

- [ ] **Step 1: Write the component**
```tsx
import { Trans } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { useState } from 'react';
import type { CartState } from './cart-reducer';
import { ORDER_TYPE_OPTIONS } from './order-types';
import { Button } from '~/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '~/components/ui/dialog';
import { Empty, EmptyHeader, EmptyTitle } from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

type HeldRow = {
  _id: Id<'heldOrders'>;
  label: string;
  orderType: 'dine_in' | 'takeaway' | 'pickup';
  lines: CartState['lines'] extends Array<infer L> ? never : never; // replaced below
};

export function HeldOrdersDialog({
  open, held, onOpenChange, onRecall, genLineKey,
}: {
  open: boolean;
  held:
    | {
        _id: Id<'heldOrders'>;
        label: string;
        orderType: 'dine_in' | 'takeaway' | 'pickup';
        lines: Array<{
          menuItemId: Id<'menuItems'>;
          nameSnapshot: string;
          qty: number;
          unitPriceIDR: number;
          modifierOptionIds: Array<Id<'modifierOptions'>>;
          modifierLabels: Array<{ groupName: string; optionName: string; priceAdjustmentIDR: number }>;
        }>;
        promo?: { promoId: Id<'promotions'>; name: string; type: 'percent' | 'fixed'; value: number };
        createdAt: number;
      }[]
    | undefined;
  onOpenChange: (open: boolean) => void;
  onRecall: (state: CartState) => void;
  genLineKey: () => string;
}) {
  const remove = useMutation(api.heldOrders.remove);
  const [busy, setBusy] = useState<Id<'heldOrders'> | null>(null);

  async function recall(h: NonNullable<typeof held>[number]) {
    setBusy(h._id);
    try {
      const state: CartState = {
        orderType: h.orderType,
        promo: h.promo
          ? { _id: h.promo.promoId, name: h.promo.name, type: h.promo.type, value: h.promo.value }
          : null,
        lines: h.lines.map((l) => ({ ...l, lineKey: genLineKey() })),
      };
      onRecall(state);
      await remove({ id: h._id });
      onOpenChange(false);
    } finally {
      setBusy(null);
    }
  }

  async function discard(id: Id<'heldOrders'>) {
    setBusy(id);
    try { await remove({ id }); } finally { setBusy(null); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle><Trans>Pesanan ditahan</Trans></DialogTitle>
        </DialogHeader>
        {held === undefined ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : held.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle><Trans>Tidak ada pesanan ditahan.</Trans></EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {held.map((h) => {
              const subtotal = h.lines.reduce((s, l) => s + l.qty * l.unitPriceIDR, 0);
              const itemCount = h.lines.reduce((s, l) => s + l.qty, 0);
              const typeLabel = ORDER_TYPE_OPTIONS.find((x) => x.value === h.orderType)?.label;
              return (
                <div key={h._id} className="flex items-center gap-2 rounded-md border border-border p-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-sm">
                      {h.label || <Trans>Tanpa nama</Trans>}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {typeLabel} · <Trans>{itemCount} item</Trans> · {formatIDR(subtotal)}
                    </div>
                  </div>
                  <Button type="button" size="sm" disabled={busy === h._id} onClick={() => recall(h)}>
                    <Trans>Muat</Trans>
                  </Button>
                  <Button
                    type="button" size="sm" variant="ghost" disabled={busy === h._id}
                    onClick={() => discard(h._id)} className="text-muted-foreground"
                  >
                    <Trans>Buang</Trans>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```
> DELETE the bogus `HeldRow` type at the top (it's a placeholder) — the inline prop type is
> the real one. Confirm `Empty`/`EmptyHeader`/`EmptyTitle` import names against
> `src/components/ui/empty.tsx`. The `{itemCount} item` / `{...}` use `<Trans>` — the count
> placeholder follows the repo's lingui usage.

- [ ] **Step 2:** `pnpm typecheck` → PASS. Commit:
```bash
git add src/components/sale/held-orders-dialog.tsx
git commit -m "feat(sale): held-orders picker (recall / discard)"
```

---

### Task 5: Wire into cart pane + sale screen

**Files:** modify `src/components/sale/cart-pane.tsx`, `src/components/sale/sale-screen.tsx`.

- [ ] **Step 1: CartPane buttons**
Add optional props to `CartPane`'s prop type: `onHold?: () => void; onShowHeld?: () => void; heldCount?: number;`. In the header action row (where `onKas`/`onSwitch`/`Kosongkan`
live), add (guarded):
```tsx
{onShowHeld ? (
  <Button type="button" size="sm" variant="outline" onClick={onShowHeld}>
    <Trans>Ditahan ({heldCount ?? 0})</Trans>
  </Button>
) : null}
{onHold ? (
  <Button type="button" size="sm" variant="outline" onClick={onHold} disabled={empty}>
    <Trans>Tahan</Trans>
  </Button>
) : null}
```
(`empty` is already computed in CartPane for the Kosongkan button; reuse it.)

- [ ] **Step 2: sale-screen wiring**
In `src/components/sale/sale-screen.tsx`:
- Add imports: `HoldOrderDialog`, `HeldOrdersDialog`, and `type CartState` from `./cart-reducer`.
- Add state: `const [holdOpen, setHoldOpen] = useState(false); const [heldOpen, setHeldOpen] = useState(false); const [recallTarget, setRecallTarget] = useState<CartState | null>(null);`
- Add query: `const held = useQuery(api.heldOrders.listForShift, shift ? { shiftId: shift._id } : 'skip');`
- In the `CartPane` props, inside the existing `{...(shift && cashierId ? { onKas, onSwitch } : {})}` add `onHold`/`onShowHeld`/`heldCount`. Simplest: extend that spread:
```tsx
        {...(shift && cashierId
          ? {
              onKas: () => setKasOpen(true),
              onSwitch: true,
              onHold: () => setHoldOpen(true),
              onShowHeld: () => setHeldOpen(true),
              heldCount: held?.length ?? 0,
            }
          : {})}
```
- Inside the `{shift && cashierId ? (<>...</>) : null}` block, render:
```tsx
          <HoldOrderDialog
            open={holdOpen}
            cart={cart}
            cashierId={cashierId}
            onOpenChange={setHoldOpen}
            onHeld={() => { dispatch({ type: 'clearCart' }); setHoldOpen(false); }}
          />
          <HeldOrdersDialog
            open={heldOpen}
            held={held}
            genLineKey={genLineKey}
            onOpenChange={setHeldOpen}
            onRecall={(state) => {
              if (cart.lines.length > 0) setRecallTarget(state);
              else dispatch({ type: 'load', state });
            }}
          />
```
- Add a confirm `AlertDialog` (mirror the existing Kosongkan one) driven by `recallTarget`:
```tsx
      <AlertDialog open={recallTarget !== null} onOpenChange={(o) => { if (!o) setRecallTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle><Trans>Ganti keranjang saat ini?</Trans></AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>Keranjang berisi item. Memuat pesanan ditahan akan menggantinya.</Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel><Trans>Batal</Trans></AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (recallTarget) dispatch({ type: 'load', state: recallTarget });
                setRecallTarget(null);
              }}
            >
              <Trans>Muat</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 3:** `pnpm typecheck` → PASS. `pnpm test` → PASS.
```bash
git add src/components/sale/cart-pane.tsx src/components/sale/sale-screen.tsx
git commit -m "feat(sale): park + recall held orders in the sale screen"
```

---

### Task 6: i18n

New strings: `Tahan`, `Pesanan ditahan`, `Ditahan ({heldCount})` (or `{0}`),
`Tahan pesanan`, `Nama / meja`, `Tanpa nama`, `Pesanan ditahan.`, `Gagal menahan pesanan.`,
`Tidak ada pesanan ditahan.`, `Ganti keranjang saat ini?`,
`Keranjang berisi item. Memuat pesanan ditahan akan menggantinya.`, `Muat`, `Buang`,
`{itemCount} item` (may already exist as `{0} item`).

- [ ] **Step 1:** `pnpm lingui:extract` — note new entries + placeholder syntax actually emitted.
- [ ] **Step 2:** Fill `en` for new empties:

| id | en |
|---|---|
| `Tahan` | `Hold` |
| `Pesanan ditahan` | `Held orders` |
| `Ditahan ({heldCount})` (match emitted placeholder) | `Held ({heldCount})` |
| `Tahan pesanan` | `Hold order` |
| `Nama / meja` | `Name / table` |
| `Tanpa nama` | `Unnamed` |
| `Pesanan ditahan.` | `Order held.` |
| `Gagal menahan pesanan.` | `Could not hold the order.` |
| `Tidak ada pesanan ditahan.` | `No held orders.` |
| `Ganti keranjang saat ini?` | `Replace the current cart?` |
| `Keranjang berisi item. Memuat pesanan ditahan akan menggantinya.` | `The cart has items. Loading a held order will replace it.` |
| `Muat` | `Load` |
| `Buang` | `Discard` |

(Leave any already-present entry like `{0} item` untouched. Match the real placeholder tokens.)

- [ ] **Step 3:** `pnpm lingui:compile` → `en` 0 missing.
- [ ] **Step 4:** `git add src/locales && git commit -m "i18n(sale): held-orders strings + en fill"`

---

### Task 7: Final verification

- [ ] `pnpm typecheck` → PASS
- [ ] `pnpm test` → PASS (all suites; existing untouched)
- [ ] `pnpm lingui:compile` → `en` 0 missing
- [ ] `git status` → clean
- [ ] **Manual sanity (described):** On `/sale` with an open shift: build a cart → "Tahan"
  → enter a label → cart clears and "Ditahan (1)" appears; ring another order; open
  "Ditahan" → "Muat" loads the parked cart back (confirming replace if the cart isn't
  empty) and removes it from the list; "Buang" discards one; paying a recalled order works
  through the normal flow.

---

## Self-Review

**Spec coverage:** new table + shared validators (T1); hold (open-shift lookup, empty
guard, handoff-aware cashier) / listForShift (owner-scoped, newest-first) / remove
(owner-scoped) (T1); `load` reducer action (T2); park dialog clearing the cart (T3); picker
with recall+discard + estimated subtotal + empty state (T4); cart-pane buttons + screen
wiring + replace-confirm (T5); tests for hold/list/empty/no-shift/remove-scope (T1); i18n
(T6). ✓

**Placeholder scan:** the `HeldRow` placeholder type in Task 4 is explicitly called out to
be DELETED; everything else is full code. Test helper specifics (`makeItem`/`closeShift`/
foreign) intentionally say "copy the real call from <file>" because those exact API shapes
must match existing tests, not be invented.

**Type consistency:** `heldLineValidator`/`heldPromoValidator` (T1) shape == the held-line
object built in `HoldOrderDialog` (T3) and consumed in `HeldOrdersDialog` (T4) and the
`listForShift` `heldRow` return (T1). `CartState` (lines+promo+orderType) is what `load`
replaces (T2) and what the picker rebuilds (T4). `api.heldOrders.hold` args
(`cashierId,label,orderType,lines,promo?`) match the dialog's call (T3). `held` query result
type flows from `listForShift` returns (T1) → `held` prop (T4/T5). Consistent.
