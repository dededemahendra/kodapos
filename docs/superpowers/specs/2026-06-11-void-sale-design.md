# Void / Refund a Paid Sale Design Spec

**Date:** 2026-06-11
**Branch:** `feat/void-sale` (off `main`)

## Context

`paymentStatus: 'void'` already exists and is used for *pending* QRIS orders that time
out (`voidPendingOrder`). But there is **no way to reverse a PAID order** — a mis-rung
sale, a wrong item, a customer return. This slice adds a **void** action on a paid order
that symmetrically undoes everything `settleSale` did: restores inventory, reverses
loyalty points + customer stats, and flips the order to `void` (which removes it from
revenue, since reports/dashboard filter `paymentStatus === 'paid'`). The action is gated
in the UI by the existing `canVoid` permission.

This is the **inverse of `settleSale`** — same recipe math, same loyalty fields, run
backwards. Treating it as one symmetric helper keeps the two in lockstep.

## Money-path care

This touches inventory, loyalty balances, and revenue. Guards:
- Only a `paid` order can be voided (a `pending` order uses the existing
  `voidPendingOrder`; an already-`void` order is rejected). The status guard is the
  re-entrancy lock — a double void throws on the second call.
- Customer stat decrements are floored at 0 (`Math.max(0, …)`) so a reversal can never
  push a balance/visit/spend negative even with odd legacy data.
- Inventory is restored by recomputing `consumed = line.qty × recipeLine.qty ×
  recipeLine.wastageFactor` from the order's frozen `recipeSnapshot` — identical to what
  `settleSale` deducted — and inserting **positive** compensating movements.

## What `settleSale` did (and the void reverses)

| settleSale | void (reverseSettledSale) |
|---|---|
| `inventoryMovements` `delta: -consumed`, `reason:'sale'` per recipe line | insert `delta:+consumed`, `reason:'adjustment'`, `reasonLabel:'Pembatalan pesanan'`, `refType:'order'`, `refId:orderId` |
| `loyaltyTransactions` redeem `-pointsRedeemed` and earn `+earned` | insert one `type:'adjust'` txn `points = pointsRedeemed − earned` (net), `note:'Pembatalan pesanan'`, `orderId` |
| customer `pointsBalance += earned − pointsRedeemed`, `visitCount += 1`, `totalSpentIDR += totalIDR` | `pointsBalance = max(0, balance − earned + pointsRedeemed)`, `visitCount = max(0, visitCount − 1)`, `totalSpentIDR = max(0, totalSpentIDR − totalIDR)` |
| order `paymentStatus:'paid'` | `paymentStatus:'void'` + `voidedAt`, optional `voidReason`, optional `voidedByCashierId` |

(The `payments` row is left as-is — it remains the historical record of the tender; the
order status is the source of truth for "this sale no longer counts".)

## Data model — `convex/schema.ts` (orders)

Add three optional fields to the `orders` table (legacy-tolerant, like the other
incremental order fields):
```ts
voidedAt: v.optional(v.number()),
voidReason: v.optional(v.string()),
voidedByCashierId: v.optional(v.id('cafeStaff')),
```
No index change.

## Backend

### Shared reversal helper — `convex/lib/sale.ts`
Add `reverseSettledSale(ctx, orderId, opts)` next to `settleSale` (symmetric), per the
table above:
```ts
export async function reverseSettledSale(
  ctx: MutationCtx,
  orderId: Id<'orders'>,
  opts: { reason?: string; cashierId?: Id<'cafeStaff'> }
): Promise<void> {
  const order = await ctx.db.get(orderId);
  if (!order) throw new Error('Pesanan tidak ditemukan.');
  if (order.paymentStatus !== 'paid') throw new Error('Hanya pesanan lunas yang bisa dibatalkan.');
  const now = Date.now();
  for (const line of order.lines) {
    for (const rl of line.recipeSnapshot ?? []) {
      const consumed = line.qty * rl.qty * rl.wastageFactor;
      await ctx.db.insert('inventoryMovements', {
        cafeId: order.cafeId, ingredientId: rl.ingredientId, delta: consumed,
        reason: 'adjustment', reasonLabel: 'Pembatalan pesanan',
        refType: 'order', refId: orderId as unknown as string, at: now,
      });
    }
  }
  if (order.customerId) {
    const customer = await ctx.db.get(order.customerId);
    if (customer) {
      const redeemed = order.pointsRedeemed ?? 0;
      const earned = order.pointsEarned ?? 0;
      const net = redeemed - earned;
      if (net !== 0) {
        await ctx.db.insert('loyaltyTransactions', {
          cafeId: order.cafeId, customerId: customer._id, orderId,
          type: 'adjust', points: net, note: 'Pembatalan pesanan', at: now,
        });
      }
      await ctx.db.patch(customer._id, {
        pointsBalance: Math.max(0, customer.pointsBalance - earned + redeemed),
        visitCount: Math.max(0, customer.visitCount - 1),
        totalSpentIDR: Math.max(0, customer.totalSpentIDR - order.totalIDR),
      });
    }
  }
  await ctx.db.patch(orderId, {
    paymentStatus: 'void',
    voidedAt: now,
    ...(opts.reason?.trim() ? { voidReason: opts.reason.trim() } : {}),
    ...(opts.cashierId ? { voidedByCashierId: opts.cashierId } : {}),
  });
}
```

### Public mutation — `convex/orders.ts`
```ts
export const voidSale = mutation({
  args: {
    orderId: v.id('orders'),
    reason: v.optional(v.string()),
    cashierId: v.optional(v.id('cafeStaff')),
  },
  returns: v.null(),
  handler: async (ctx, { orderId, reason, cashierId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const order = await ctx.db.get(orderId);
    if (!order || order.cafeId !== cafeId) throw new Error('Pesanan tidak ditemukan.');
    if (cashierId) await requireOwned(ctx, cafeId, cashierId, 'Kasir');
    await reverseSettledSale(ctx, orderId, {
      ...(reason ? { reason } : {}),
      ...(cashierId ? { cashierId } : {}),
    });
    return null;
  },
});
```
Import `reverseSettledSale` from `./lib/sale`.

### Read validators — `convex/orders.ts`
Add `voidedAt: v.optional(v.number())`, `voidReason: v.optional(v.string())`,
`voidedByCashierId: v.optional(v.id('cafeStaff'))` to `orderSummary` (so `getById`/
`orderDetail` echo them for the receipt display). `orderRow` (search) needs no change —
the existing `paymentStatus` already drives the history badge.

## Frontend — void action in `ReceiptPreview`

`ReceiptPreview` (`src/components/sale/receipt-preview.tsx`) renders the order detail
(opened from `/reports/orders`, `/history`, and post-sale) and already has a footer with
Cetak / Selesai. Add:

- Imports: `useActiveCashier` (`~/lib/active-cashier`), `usePermissions` (`~/lib/permissions`),
  `useMutation`, `toast`, `Spinner`, an `AlertDialog`, an `Input`.
- `const { can } = usePermissions(); const { cashierId } = useActiveCashier();`
- A **"Batalkan pesanan"** destructive button on the LEFT of the footer, rendered only when
  `order.paymentStatus === 'paid' && can('canVoid')`. It opens a confirm `AlertDialog` with
  an optional **reason** `Input` → on confirm calls
  `voidSale({ orderId, ...(reason.trim() ? { reason } : {}), ...(cashierId ? { cashierId } : {}) })`,
  toasts `t\`Pesanan dibatalkan.\``, and `onDone()` (closes; the reactive `getById` updates).
- **Voided banner:** when `order.paymentStatus === 'void'`, show a prominent
  `DIBATALKAN` marker near the top of the receipt body (English on the printed receipt:
  `** VOID **`, off-catalog) and, in the dialog chrome (not the printed area), the
  `voidReason` if present. Keep the printed-receipt void marker English/off-catalog;
  the on-screen "Dibatalkan" label + reason use `<Trans>`.

> The void button appears post-sale too (immediate undo) — that's intended and still
> gated by `canVoid`. No second confirm beyond the AlertDialog.

## Testing

**`tests/convex/orders.test.ts`** (extend; mirror the existing recipe/sale tests for
seeding an item with a recipe + an ingredient, then `createCashSale` which settles +
deducts):
- **Inventory restored:** seed ingredient (stock S) + item + recipe; sell qty N (stock
  drops by N×recipeQty×wastage); `voidSale`; assert `currentStockQty` back to S.
- **Status + revenue:** after `voidSale`, `getById` → `paymentStatus:'void'`, `voidedAt`
  set; the order no longer counts in a paid-only aggregate (assert via `reports`/
  `dashboard` paid filter, or by re-querying and checking the status).
- **Loyalty reversed:** with a customer + loyalty enabled, sell (earns/redeems), capture
  the customer's `pointsBalance`/`visitCount`/`totalSpentIDR`, `voidSale`, assert they
  return to their pre-sale values and an `adjust` loyaltyTransaction exists.
- **Rejects non-paid:** voiding a `pending` order throws; voiding an already-`void` order
  throws (re-entrancy).
- **Owner-scoped:** a foreign cafe's order id throws.

Frontend (void button gating by `canVoid`, confirm+reason, voided banner) validated by
typecheck + the existing sale e2e flow.

## i18n

New Bahasa Indonesia strings: `Batalkan pesanan`, `Batalkan pesanan ini?`,
`Stok akan dikembalikan dan poin loyalitas dibatalkan. Tindakan ini tidak bisa diurungkan.`,
`Alasan (opsional)`, `Pesanan dibatalkan.`, `Gagal membatalkan pesanan.`, `Dibatalkan`,
`Batal`, `Batalkan`. Run `pnpm lingui:extract`, fill `en` (`Void order`, `Void this order?`,
`Stock will be restored and loyalty points reversed. This cannot be undone.`,
`Reason (optional)`, `Order voided.`, `Could not void the order.`, `Voided`), then
`pnpm lingui:compile`. The printed-receipt `** VOID **` marker stays English/off-catalog.

## Conventions

- Run CI locally before push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`;
  `git status` clean.
- Do NOT run `convex codegen` — schema change derives automatically; `voidSale` is a new
  export in the already-registered `orders` module; `reverseSettledSale` is a helper in the
  already-registered `lib/sale`. No `api.d.ts` change.
- No new route → no `routeTree.gen.ts` change.
- Small conventional commits; PR → review → merge commit.

## Out of scope

- **Partial** refunds / per-line voids (full-order void only this slice).
- A separate "refund where goods were consumed, don't restock" mode (void always restores
  stock — the wrong-order case; a no-restock variant is a later slice).
- Refunding the actual tender via a payment provider (Xendit refund API) — this records
  the void in our books; provider-side money movement is out of scope.
- A void audit report / who-voided-what dashboard (the `voidedAt`/`voidedByCashierId`/
  `voidReason` fields are stored for a later reporting slice).
- Re-opening / un-voiding an order.
