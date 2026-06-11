# Held / Parked Orders Design Spec

**Date:** 2026-06-11
**Branch:** `feat/held-orders` (off `main`)

## Context

A cashier often needs to set an order aside (customer steps away, waiting on the
kitchen, a table not ready to pay) and ring up someone else, then come back. Today the
only options are to keep the cart on screen (blocking the register) or clear it (losing
the work). This slice adds **held / parked orders**: save the current cart server-side
under a label, start fresh, and **recall** it later into the cart to complete payment
normally.

## Core principle — held orders are saved carts, OFF the money path

A held order is a **pre-checkout cart snapshot**, not an order. It carries no totals, no
payment, no inventory deduction, and no loyalty effect. The existing `buildOrder` /
`settleSale` flow is untouched: recall just repopulates the client cart, and the real sale
goes through `createCashSale`/`createQrisStaticSale`/`createQrisDynamicSale` exactly as
before (which re-validates prices server-side). This keeps the risky paths unchanged.

## Data model — new `heldOrders` table

Scoped to a cafe + the open shift. Stores the cart snapshot needed to rebuild the client
`CartState` (`lines`, `promo`, `orderType`).

Shared validators in **`convex/lib/heldOrder.ts`** (new, dependency-free) so the schema
and the mutation args never drift:
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

Schema (`convex/schema.ts`):
```ts
heldOrders: defineTable({
  cafeId: v.id('cafes'),
  shiftId: v.id('shifts'),
  cashierId: v.id('cafeStaff'),
  label: v.string(), // free text; '' allowed (UI shows a fallback)
  orderType: orderTypeValidator,
  lines: v.array(heldLineValidator),
  promo: v.optional(heldPromoValidator),
  createdAt: v.number(),
})
  .index('by_shift', ['shiftId'])
  .index('by_cafe', ['cafeId']),
```
The `lines` shape mirrors `CartLine` minus the client-only `lineKey` (regenerated on
recall). `promo` mirrors `CartPromo` (`_id` stored as `promoId`).

## Backend — `convex/heldOrders.ts` (new)

All owner-gated via `requireOwnerCafe`; `remove` also `requireOwned`.

- **`hold({ shiftId, cashierId, label, orderType, lines, promo? })`** (mutation): assert
  the shift belongs to the cafe and is `open` (reuse the shift lookup pattern from
  `orders`/`cashMovements`); reject an empty `lines` array (`'Keranjang kosong.'`); insert
  `{ cafeId, shiftId, cashierId, label: label.trim(), orderType, lines, ...(promo ? {promo} : {}), createdAt: Date.now() }`. Returns the new id.
- **`listForShift({ shiftId })`** (query): the shift's held orders via `by_shift`,
  newest-first, returned as **full docs** (`_id, label, orderType, lines, promo?, createdAt`)
  so the picker can both summarize (label, line count, estimated subtotal computed
  client-side) and recall (the same `lines`) without a second round-trip. Owner-scoped
  (assert the shift's `cafeId` matches).
- **`remove({ id })`** (mutation): `requireOwned(ctx, cafeId, id, 'Pesanan ditahan')`,
  then `ctx.db.delete(id)`. Returns null.

`convex/heldOrders.ts` is a NEW function module referenced via `api.heldOrders.*` → add it
to `convex/_generated/api.d.ts` (import + `fullApi` entry, alphabetical) and the new
`convex/lib/heldOrder.ts` helper too; the dev watcher usually does this — commit it.

## Frontend

### Cart reducer — `src/components/sale/cart-reducer.ts`
Add a whole-cart replace action (for recall):
```ts
| { type: 'load'; state: CartState }
// case:
    case 'load': {
      return action.state;
    }
```

### Hold (park) — `src/components/sale/hold-order-dialog.tsx` (new)
A small dialog: an optional **label** `Input` (placeholder e.g. "Nama / meja") + Save. On
save, call `api.heldOrders.hold` with the current cart snapshot (map `cart.lines` → held
lines dropping `lineKey`; map `cart.promo` → `{ promoId: promo._id, name, type, value }`),
then `dispatch({ type: 'clearCart' })`, `toast.success(t\`Pesanan ditahan.\`)`, close. The
parent passes `cart`, `shiftId`, `cashierId`.

### Recall / discard — `src/components/sale/held-orders-dialog.tsx` (new)
Lists `api.heldOrders.listForShift` for the open shift. Each entry shows the label (or a
`Tanpa nama` fallback), order-type label (reuse `ORDER_TYPE_OPTIONS`), item count, an
estimated subtotal (`Σ qty × unitPriceIDR`, `formatIDR`), and time. Two actions per row:
- **Recall** → rebuild a `CartState` (lines with fresh `lineKey`s via the screen's
  `genLineKey`; `promo` → `{ _id: promo.promoId, name, type, value }`; `orderType`) and
  hand it to the parent's `onRecall(state)`; then `remove({ id })`; close. If the current
  cart is non-empty, the parent guards with a confirm before replacing (see wiring).
- **Discard** → `remove({ id })` (with a confirm), stays open.
Empty state: shadcn `Empty` ("Tidak ada pesanan ditahan.").

### Cart header buttons — `src/components/sale/cart-pane.tsx`
Add two optional props consumed only when a shift+cashier are active:
- `onHold?: () => void` → a **"Tahan"** button (disabled when the cart is empty), beside
  "Kosongkan".
- `onShowHeld?: () => void` + `heldCount?: number` → a **"Ditahan (N)"** button (always
  enabled; shows the count). Hidden when `heldCount` is 0 *and* there's nothing to show.

### Sale screen — `src/components/sale/sale-screen.tsx`
- `const [holdOpen, setHoldOpen] = useState(false); const [heldOpen, setHeldOpen] = useState(false); const [recallTarget, setRecallTarget] = useState<CartState | null>(null);`
- `const held = useQuery(api.heldOrders.listForShift, shift ? { shiftId: shift._id } : 'skip');`
- Pass to `CartPane` (only when `shift && cashierId`): `onHold: () => setHoldOpen(true)`,
  `onShowHeld: () => setHeldOpen(true)`, `heldCount: held?.length ?? 0`.
- Render `<HoldOrderDialog open={holdOpen} ... cart={cart} shiftId={shift._id} cashierId={cashierId} onOpenChange={setHoldOpen} />`
  and `<HeldOrdersDialog open={heldOpen} ... shiftId={shift._id} held={held} onOpenChange={setHeldOpen} onRecall={(state) => { if (cart.lines.length > 0) setRecallTarget(state); else dispatch({ type: 'load', state }); }} />`.
- A confirm `AlertDialog` (mirroring the existing "Kosongkan" one): when `recallTarget`
  is set, "Ganti keranjang saat ini?" → on confirm `dispatch({ type: 'load', state: recallTarget }); setRecallTarget(null);`.
- The recall handler builds fresh `lineKey`s via the existing `genLineKey()` in this file.

## Testing

**`tests/convex/heldOrders.test.ts`** (new; mirror an existing convex-test file's setup —
owner + open shift + a menu item):
- `hold` inserts a held order with the given lines/label/orderType; `listForShift` returns
  it; line/promo snapshot round-trips.
- `hold` rejects an empty `lines` array.
- `hold` on a foreign/closed shift is rejected (owner scope + open-shift guard).
- `remove` deletes it; `listForShift` no longer returns it; `remove` is owner-scoped
  (foreign id throws).
- `listForShift` returns newest-first and only the given shift's orders.

Frontend (park, recall-into-cart, discard, confirm-on-replace) validated by typecheck +
the existing sale e2e flow.

## i18n

New Bahasa Indonesia strings: `Tahan`, `Pesanan ditahan`, `Ditahan ({count})`,
`Tahan pesanan`, `Nama / meja`, `Tanpa nama`, `Pesanan ditahan.`,
`Tidak ada pesanan ditahan.`, `Ganti keranjang saat ini?`,
`Keranjang berisi item. Memuat pesanan ditahan akan menggantinya.`, `Muat`, `Buang`,
`Buang pesanan ditahan?`. Run `pnpm lingui:extract`, fill `en`, then `pnpm lingui:compile`.

## Conventions

- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`;
  `git status` clean before push.
- `convex/heldOrders.ts` is a NEW function module → register in
  `convex/_generated/api.d.ts` (import + `fullApi`, alphabetical) along with the
  `convex/lib/heldOrder.ts` helper; the dev watcher may do it — commit it. Do NOT run
  `convex codegen` (interactive auth unavailable). The schema change derives automatically.
- No new route → no `routeTree.gen.ts` change.
- Small conventional commits; PR → review → merge commit.

## Out of scope

- Held orders surviving shift close (they're scoped to the open shift; orphaned rows are
  ignored by `listForShift` and can be GC'd in a later slice).
- Reserving/decrementing stock while held.
- Editing a held order in place (recall → edit → re-hold is the path).
- Customer/loyalty selection in the snapshot (chosen at payment time, as today).
- Table-management semantics beyond a free-text label (separate slice).
- Auto-expiry / max-held limits.
