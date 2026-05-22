# Phase 1 · Slice 3 — POS Core (Cash-only)

**Date:** 2026-05-22
**Status:** Design
**Parent spec:** `docs/superpowers/specs/2026-05-14-kodapos-v1-design.md` §2.4, §4.4, §4.7

## Goal

Take a customer order at the counter: tap items into a cart, optionally pick modifiers, accept cash, persist the order, print a receipt. Builds the first revenue-generating screen on top of Slice 1 (menu) and Slice 2 (PIN + shift). Cash-only — QRIS (static + dynamic) is deferred to Slice 5 so this slice can ship without the payments-provider integration risk.

## Scope

**In:**
- `orders` table — one row per sale, embedded `lines` array, snapshotted names + prices + modifiers + tax rate.
- `payments` table — one row per payment event, indexed for the reports queries in Slice 6.
- `/sale` POS screen: menu grid + cart pane + modifier picker dialog + cash payment dialog + receipt preview.
- `/history` (today's orders, click to view receipt).
- `orders.createCashSale` mutation — idempotent via client-generated `clientId`, server-side total recompute, single-mutation `orders` + `payments` insert.
- `orders.listForShift` + `orders.getById` queries.
- Cart state: React `useReducer` local to `<SaleScreen>` (no IndexedDB persistence for V1).
- Convex function tests (~22–28 specs) + cart-reducer unit tests + one E2E happy path.

**Out (deferred):**
- QRIS static + QRIS dynamic payment paths → Slice 5.
- Voids and refunds → Slice 5.
- Line-level or order-level discounts → Slice 5+ (parent §7.4 lists discount UI as V1.1).
- Zero-price "complimentary" items → V1.1.
- Inventory deduction on sale → Slice 4 (which will add an `ingredients` table + a `recipeSnapshot` field on `orders.lines` at that time).
- IndexedDB offline persistence of in-progress carts → Phase 2 offline-first work.
- Multi-tab cart sync (open carts in two tabs of the same cafe are independent).
- Receipt visual regression tests (parent §7.1 explicitly skips visual regression).
- Custom denominations / quick-amount configuration (chips are hard-coded: Pas, next round-up, 100k, 200k).
- Tip / service-charge prompt → not in V1.
- Customer name / order ticket label → not in V1 (counter-only assumption holds).
- Performance work for carts >20 lines.

## Success criteria

1. Cashier on an open shift can tap a no-modifier item and see it appear in the cart with qty 1, the correct unit price, and the running totals (subtotal + tax + total) updated.
2. Cashier can tap an item with modifier groups, see the picker dialog, satisfy required groups, see the live total preview, and add to the cart with the right modifier snapshot and adjusted unit price.
3. Cashier can `+`, `-`, or Remove a line; decrement past 1 removes the line; cart can be cleared.
4. Cashier hits "Bayar" → "Tunai" → cash dialog opens; tapping the "100k" denomination chip fills tendered; change line shows total − tendered; "Konfirmasi" creates the order and shows the receipt.
5. Double-click on "Konfirmasi" results in exactly one `orders` row and one `payments` row (idempotent via `clientId`).
6. After "Selesai" on the receipt, cart is empty, dialog closed, `/sale` screen ready for the next order; the just-created order is visible at `/history`.
7. `/history` lists today's orders for the active shift (most recent first); clicking one opens the receipt preview.
8. Server recomputes ALL totals — a client that sends `lineTotalIDR: 1` for an Rp 22.000 item ends up with the correct Rp 22.000 in the row.
9. Two cafes are tenant-isolated: cafe B's owner cannot see, fetch, or create orders against cafe A's shift/cashier/menu items.
10. Shift closes in another tab while the cashier is on `/sale` → server rejects the in-flight submit with "Shift sudah ditutup." and the route guard redirects to `/shift/open` on next interaction.
11. Convex function tests: ~22–28 specs (happy path, idempotency, modifiers, tax math, server-override, validation rejections, tenant isolation, race conditions).
12. Cart reducer unit tests: ~8 specs.
13. Playwright auth-gated E2E: signup → onboarding → set PIN → open shift → sale of one item → cash payment → history. Passes under `RUN_AUTH_E2E=1`.
14. `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` exit 0.

## Architecture

### Three boundaries

1. **Client cart state** — `useReducer` in `<SaleScreen>`. Holds lines with preview prices. Lost on refresh, by design for V1.
2. **Server boundary** — `orders.createCashSale` recomputes every monetary value from the menu + cafe doc at submit time. The cart payload is treated as untrusted; only `menuItemId`, `qty`, and `modifierOptionIds` are honored from the client. Prices, names, tax, and modifier metadata are all loaded server-side and snapshotted into the row.
3. **Persistence** — Two new tables (`orders`, `payments`) written in a single mutation. `paymentStatus: 'paid'` set immediately for cash (no pending state). `syncedAt: Date.now()` on insert.

### Identity stack (unchanged from Slice 2, extended)

```
Unauthenticated → SignedOutRedirect → /signin
Authenticated
  ├─ OnboardingGate → /onboarding/profile if !setupCompletedAt
  └─ Authenticated + onboarded:
       ├─ Owner-only routes (menu, settings)        → render directly
       └─ Cashier-required routes (shift/*, sale/*) →
            PinGate: if !activeCashierId           → /pin
            ShiftGate: if !shifts.current          → /shift/open
            Render
```

Slice 3 introduces the `ShiftGate` layer. `useQuery(api.shifts.current)` runs reactively in the `_pos/sale/route.tsx` `beforeLoad`/component shell; null → `<Navigate to="/shift/open" replace />`. This is what makes mid-sale shift-close in another tab automatically route this tab away.

### Idempotency

The cash payment dialog generates `clientId = crypto.randomUUID()` ONCE on first open and stores it in component state. Closing and reopening the dialog regenerates it (treated as a new sale intent). Submitting the same `clientId` twice — whether from a double-click, a network retry, or a misclick → close → retry — hits the `by_cafe_clientId` index, returns the existing order, and inserts nothing new.

`payments` rows are tied to `orderId`, so a duplicate request returns the same `orderId` and therefore reaches the same payment row.

### Server-side recompute is the security boundary

The client sends `{ clientId, shiftId, cashierId, lines: [{ menuItemId, qty, modifierOptionIds }], cashTenderedIDR }`. The server:

1. Calls `requireOwnerCafe(ctx)` → `cafeId`.
2. `requireOwned(ctx, cafeId, shiftId, 'Shift')` and verifies `closedAt === undefined`. Else throws `'Shift sudah ditutup.'`.
3. `requireActiveCashier(ctx, cafeId, cashierId)` (Slice 2 helper).
4. Checks `by_cafe_clientId(cafeId, clientId)` — if hit, return existing order summary, exit.
5. For each line:
   - Load `menuItems` by id; assert `cafeId === ctx.cafeId && isActive && !archived`. Else throws `'Item ${name ?? id} tidak tersedia.'`.
   - For each `modifierOptionId`: load option, assert option's `groupId` is attached to this item via `menuItemModifierGroups`, assert `!archived`. Otherwise throws `'Modifier tidak tersedia.'`.
   - Group selected options by `groupId`; for each attached group, assert `minSelect <= count <= maxSelect`. Else throws `'Modifier wajib pada grup ${groupName} belum dipilih.'` (for under) or `'Pilihan modifier melebihi batas pada grup ${groupName}.'` (for over).
   - Build `modifiersSnapshot: { groupName, optionName, priceAdjustmentIDR }[]`.
   - Compute `unitPriceIDR = item.priceIDR + Σ priceAdjustmentIDR`.
   - Compute `lineTotalIDR = qty * unitPriceIDR`.
6. `subtotalIDR = Σ lineTotalIDR`.
7. Load cafe doc; `taxRatePct = cafe.taxEnabled ? cafe.taxRatePct : 0`; `taxIDR = Math.round(subtotalIDR * taxRatePct / 100)`; `totalIDR = subtotalIDR + taxIDR`.
8. Assert `cashTenderedIDR >= totalIDR`. Else throws `'Uang yang diterima kurang dari total.'`.
9. Insert `orders` row (`paymentStatus: 'paid'`, `paymentMethod: 'cash'`, `syncedAt: Date.now()`, `createdAtClient: args.createdAtClient ?? Date.now()`).
10. Insert `payments` row (`method: 'cash'`, `amountIDR: totalIDR`, `cashTenderedIDR`, `changeIDR: cashTenderedIDR - totalIDR`, `confirmedAt: Date.now()`).
11. Return `{ orderId, totalIDR, changeIDR }`.

All Bahasa Indonesia error messages — they surface in the UI via the existing `<FieldError>` / inline error pattern.

## Data model

Two new tables. All amounts are Indonesian Rupiah integers (no decimal — Rupiah has no subunits in practice).

```ts
// convex/schema.ts (additions)

orders: defineTable({
  cafeId: v.id('cafes'),
  shiftId: v.id('shifts'),
  cashierId: v.id('cafeStaff'),

  clientId: v.string(),  // UUIDv4 from device, idempotency key

  lines: v.array(v.object({
    menuItemId: v.id('menuItems'),
    nameSnapshot: v.string(),
    qty: v.number(),
    unitPriceIDR: v.number(),
    modifiersSnapshot: v.array(v.object({
      groupName: v.string(),
      optionName: v.string(),
      priceAdjustmentIDR: v.number(),
    })),
    lineTotalIDR: v.number(),
  })),

  subtotalIDR: v.number(),
  taxRatePct: v.number(),       // snapshotted at sale time
  taxIDR: v.number(),
  discountIDR: v.number(),      // always 0 in Slice 3; reserved for Slice 5
  totalIDR: v.number(),

  paymentMethod: v.union(
    v.literal('cash'),
    v.literal('qris_static'),
    v.literal('qris_dynamic'),
  ),
  paymentStatus: v.union(
    v.literal('pending'),
    v.literal('paid'),
    v.literal('void'),
  ),

  createdAtClient: v.number(),  // ms epoch from device
  syncedAt: v.optional(v.number()),  // ms epoch server insert time
})
  .index('by_cafe_clientId', ['cafeId', 'clientId'])
  .index('by_shift', ['shiftId'])
  .index('by_cafe_created', ['cafeId', 'createdAtClient']),

payments: defineTable({
  cafeId: v.id('cafes'),
  orderId: v.id('orders'),
  method: v.union(
    v.literal('cash'),
    v.literal('qris_static'),
    v.literal('qris_dynamic'),
  ),
  amountIDR: v.number(),
  cashTenderedIDR: v.optional(v.number()),
  changeIDR: v.optional(v.number()),
  providerRef: v.optional(v.string()),       // Slice 5 (QRIS)
  providerStatus: v.optional(v.string()),    // Slice 5
  confirmedAt: v.optional(v.number()),
})
  .index('by_order', ['orderId'])
  .index('by_cafe_method_confirmed', ['cafeId', 'method', 'confirmedAt']),
```

**Index rationale:**

- `orders.by_cafe_clientId` — idempotency lookup on every create call.
- `orders.by_shift` — Slice 6 reports + Slice 3 `/history` page.
- `orders.by_cafe_created` — cross-shift "today's orders" listing (also used by Slice 6 for date-range queries).
- `payments.by_order` — receipt loading + reconciliation.
- `payments.by_cafe_method_confirmed` — Slice 6 reports ("total cash today", "total QRIS this week"). Indexed even though method=`cash` is the only producer in Slice 3, to avoid a migration when Slice 5 ships.

**Snapshots — what and why:**

- `nameSnapshot` on each line — if an item is renamed after the sale, the receipt still reads what the customer ordered.
- `unitPriceIDR` per line — if the menu price changes after the sale, reports still aggregate at the sold price.
- `modifiersSnapshot` (groupName, optionName, priceAdjustmentIDR) — preserves the exact modifier wording on the receipt, even if the option is later renamed or archived.
- `taxRatePct` on the order — if the owner edits PPN later, this order still says what tax was charged.
- `discountIDR` on the order — reserved at 0 for Slice 3, prevents schema migration when Slice 5 adds discounts.

## Components & routes

```
src/routes/_pos/sale/route.tsx           PinGate + ShiftGate wrapper (Outlet)
src/routes/_pos/sale/index.tsx           <SaleScreen> composition root
src/routes/_pos/history.tsx              Today's orders list + receipt drawer

src/components/sale/
  sale-screen.tsx                        Owns useReducer, composes panes + dialogs
  cart-reducer.ts                        Pure reducer (unit-testable, no React deps)
  menu-pane.tsx                          70% width — category tabs + item grid
  item-card.tsx                          Single item tile (name, price, modifier badge)
  cart-pane.tsx                          30% width — header, lines list, totals, Bayar
  cart-line-row.tsx                      One line: name, modifier chips, qty stepper, ×
  modifier-picker-dialog.tsx             Centered Dialog — group/option chips, live total
  cash-payment-dialog.tsx                Compact stacked Dialog — total, tendered, chips, numpad
  receipt-preview.tsx                    Receipt rendering — print-styled, "Cetak" / "Selesai"
```

### `<SaleScreen>` (composition root)

- Holds `useReducer(cartReducer, initialCart)` and exposes `dispatch`.
- Holds local UI state: `pickerOpenForItemId | null`, `paymentDialogOpen`, `receiptOrderId | null`.
- Loads via `useQuery`:
  - `api.menu.categories.list` (active only)
  - `api.menu.items.list({ includeInactive: false })`
  - `api.menu.modifierGroups.list` (active only, with options)
- Renders `<MenuPane onItemTap={…} />` + `<CartPane onBayar={…} cart={…} dispatch={…} totals={…} />`.
- Renders dialogs conditionally on UI state.

### `<MenuPane>`

- Category tabs at the top (horizontally scrollable on narrow screens).
- Item grid below — 3 cols at the target ≥1024px width.
- `<ItemCard>` shows name, formatted price, and a "Pilihan" badge if the item has any modifier groups (count > 0).
- `onItemTap(item)`:
  - If item has no modifier groups: build a `CartLine` from the loaded menu data (`nameSnapshot = item.name`, `unitPriceIDR = item.priceIDR`, `modifierOptionIds = []`, `modifierLabels = []`, `qty = 1`) and `dispatch({ type: 'addLine', line })`.
  - If item has modifier groups: open the picker dialog for that item.

### `<CartPane>`

- Header: "Pesanan", line count badge, "Kosongkan" button (disabled if empty, with `AlertDialog` confirm).
- Empty state: "Belum ada item." centered hint.
- Lines list scrolls.
- Totals stack at the bottom: Subtotal, PPN (label hidden if cafe.taxEnabled is false), Total (large).
- Big "Bayar" button at the bottom, disabled when cart empty.

### `<CartLineRow>`

- Item name, modifier chips (single line, truncated), unit price aside.
- Right-side controls: `−` button, qty number, `+` button (max 99), `×` Remove icon.
- Decrementing past 1 dispatches `removeLine`.

### `<ModifierPickerDialog>` (shadcn Dialog, centered)

- Title: item name; subtitle: base price.
- For each modifier group attached to this item:
  - Group label + small "Wajib (pilih X)" or "Opsional (maks X)" hint.
  - Options rendered as toggle chips:
    - `maxSelect === 1`: radio-style — tapping a second swaps the selection.
    - `maxSelect > 1`: multi-toggle with a count cap; chip disabled when cap reached.
  - Optional `priceAdjustmentIDR > 0` shown on the chip as "+Rp 3.000".
- Live total preview: `base + Σ adjustments` (qty not yet picked, defaults to 1).
- Qty stepper (1–99) under the modifiers.
- "Tambah ke pesanan" submit button — disabled until all required groups satisfied (`size >= minSelect`, `size <= maxSelect`).
- Submit dispatches `addLine` with the selected option ids and qty; closes dialog.

### `<CashPaymentDialog>` (B layout from the visual brainstorm)

Compact stacked vertical:

1. Header: "Pembayaran Tunai" + close ×.
2. Total tile (centered, large green): "Rp 64.380".
3. Tendered field (monospace, right-aligned, green border) — driven by numpad + chips.
4. Below tendered: "Kembali — Rp X" row.
5. Denomination chips row (4 wide), computed from `totalIDR` at dialog open:
   - Chip 1: "Pas" = exact `totalIDR`.
   - Chip 2: next Rp 5.000 boundary above total (`Math.ceil(total/5000)*5000`). Skipped if equal to chip 1.
   - Chip 3: next Rp 100.000 boundary at-or-above total (`Math.max(100000, Math.ceil(total/100000)*100000)`).
   - Chip 4: chip 3 + Rp 100.000 (so for typical sub-100k totals: 200.000).
   If chip 2 collapses into chip 1 (exact 5k total), render only three chips.
6. Numpad (3 × 4): `1 2 3 / 4 5 6 / 7 8 9 / 0 000 ⌫`.
7. "Konfirmasi" button (full width, brand green). Disabled while `tendered < total` OR while mutation in flight.

`clientId` generated on first open; persisted across denomination/numpad edits; regenerated on close.

On Konfirmasi:
- Disable button (covers double-click; idempotency is belt + suspenders).
- Call `convex.mutation(api.orders.createCashSale, { ...args })`.
- On success: close dialog, open `<ReceiptPreview>` with the new orderId, dispatch `clearCart`.
- On error: show inline error toast/banner inside the dialog, re-enable button.

### `<ReceiptPreview>`

- Renders a printable receipt: cafe name, date/time, cashier name, lines (name, qty × unit price, modifiers indented), subtotal, PPN, total, paid (cash), change.
- "Cetak" → `window.print()`. A `@media print` rule in `src/styles/print.css` hides everything except the receipt.
- "Selesai" → closes the receipt, returns to a clean `<SaleScreen>`.

### `/history` route

- `useQuery(api.orders.listForShift, { shiftId })` — empty state if no orders yet.
- Otherwise a vertical list: time, total, line count, payment method icon (cash for V1).
- Click a row → opens a side-drawer `<ReceiptPreview>` for that order id (loaded via `api.orders.getById`).
- "Kembali ke /sale" link at the top.

### Cart reducer

```ts
// src/components/sale/cart-reducer.ts

export type CartLine = {
  lineKey: string;                // device-local id (nanoid or uuid) for React keys + ops
  menuItemId: Id<'menuItems'>;
  nameSnapshot: string;
  qty: number;
  unitPriceIDR: number;
  modifierOptionIds: Array<Id<'modifierOptions'>>;
  modifierLabels: Array<{ groupName: string; optionName: string; priceAdjustmentIDR: number }>;
};

export type CartState = { lines: CartLine[] };

export type CartAction =
  | { type: 'addLine'; line: Omit<CartLine, 'lineKey'> }
  | { type: 'incrementQty'; lineKey: string }
  | { type: 'decrementQty'; lineKey: string }
  | { type: 'removeLine'; lineKey: string }
  | { type: 'clearCart' };
```

Rules:
- `addLine` for an item with no modifiers AND no existing line of that item (no modifiers) → push new line.
- `addLine` for an item with no modifiers AND an existing line of that item with no modifiers → bump qty on the existing line.
- `addLine` for an item with modifiers → always push a new line, even if identical to an existing one (cashier-intent ambiguity; documented choice).
- `incrementQty` capped at 99.
- `decrementQty` removes the line when qty would drop to 0.

## Data flow & error handling

### Read path

`useQuery` reads run reactively against Convex:
- `api.menu.categories.list` + `api.menu.items.list({ includeInactive: false })` + `api.menu.modifierGroups.list` — the same queries that power Slice 1 menu management, filtered to active items.
- `api.shifts.current` — drives the ShiftGate; closing the shift elsewhere causes this `useQuery` to return null and the gate redirects.
- `api.staff.list` — read by `useActiveCashier()` for the cashier name shown in cart header.

### Write path — cash sale

```
[Cashier taps item]
   → SaleScreen.onItemTap(item)
   → item has modifiers ? open <ModifierPickerDialog/> : dispatch addLine

[ModifierPickerDialog "Tambah ke pesanan"]
   → dispatch addLine with modifierOptionIds + qty
   → close dialog

[Cashier taps "Bayar" in CartPane]
   → set paymentDialogOpen = true
   → CashPaymentDialog mounts → generates clientId once

[Cashier enters tendered → taps "Konfirmasi"]
   → button disabled, mutation fires:
       convex.mutation(api.orders.createCashSale, {
         clientId, shiftId, cashierId,
         lines: cart.lines.map(l => ({
           menuItemId: l.menuItemId,
           qty: l.qty,
           modifierOptionIds: l.modifierOptionIds,
         })),
         cashTenderedIDR,
         createdAtClient: Date.now(),
       })
   → server recomputes everything, inserts orders + payments
   → returns { orderId, totalIDR, changeIDR }

[On success]
   → close CashPaymentDialog
   → open ReceiptPreview with orderId
   → dispatch clearCart

[On error]
   → re-enable Konfirmasi button
   → show inline error banner in dialog (Bahasa string from server)
```

### Validation summary

| Where | Rule | Error message |
|-------|------|---------------|
| Client (dialog disabled) | `cashTenderedIDR >= totalPreview` | n/a (button disabled) |
| Client (button disabled) | `cart.lines.length >= 1` | n/a |
| Client (modifier dialog) | All required groups satisfied | n/a (button disabled) |
| Server | `cart.lines.length >= 1` | `'Keranjang kosong.'` |
| Server | Each `qty` is integer in [1, 99] | `'Jumlah item tidak valid.'` |
| Server | `menuItemId` belongs to cafe, `isActive`, `!archived` | `'Item ${name} tidak tersedia.'` |
| Server | Each `optionId` belongs to a group attached to its item, `!archived` | `'Modifier tidak tersedia.'` |
| Server | For each required group: `size >= minSelect && size <= maxSelect` | `'Modifier wajib pada grup ${groupName} belum dipilih.'` / `'Pilihan modifier melebihi batas pada grup ${groupName}.'` |
| Server | `cashTenderedIDR` integer ≥ 0 | `'Uang yang diterima tidak valid.'` |
| Server | `cashTenderedIDR >= totalIDR` (server-computed) | `'Uang yang diterima kurang dari total.'` |
| Server | `shiftId` belongs to cafe + `closedAt === undefined` | `'Shift sudah ditutup.'` |
| Server | `cashierId` belongs to cafe + `!archived` (via `requireActiveCashier`) | `'Kasir tidak ditemukan atau sudah diarsipkan.'` |

### Race conditions

| Scenario | Handling |
|---|---|
| Double-tap "Konfirmasi" | Submitting state disables button; server `by_cafe_clientId` lookup makes it idempotent. Two-belt safety. |
| Network retry of same submit | Same `clientId` → server returns the existing order. No duplicate row. |
| Cashier archived mid-sale | `requireActiveCashier` throws at submit time. Cashier sees "Kasir tidak ditemukan atau sudah diarsipkan." |
| Shift closed mid-sale (other tab) | Reactive `api.shifts.current` becomes null → `ShiftGate` redirects to `/shift/open` on next render. If a mutation is already in flight, server throws "Shift sudah ditutup." |
| Item or option archived/deactivated mid-cart | Server-side `isActive && !archived` check throws with the item name. Cashier reopens the cart and removes that line. |
| Tax rate edited mid-sale | Server snapshots `taxRatePct` at submit time. The cart's preview total may briefly disagree with the receipt total if the owner edits during the dialog; acceptable for V1. |
| Two cashiers on the same device (shouldn't happen — single PIN session) | Out of scope; one-active-cashier-per-device is the Slice 2 invariant. |

## Testing

### Convex function tests (`tests/convex/orders.test.ts`) — ~22 specs

Happy path:
- Creates order with single line, no modifiers; row contains expected snapshots and totals.
- Creates `payments` row with `method: 'cash'`, correct `amountIDR`, `cashTenderedIDR`, `changeIDR`, `confirmedAt`.
- Returns `{ orderId, totalIDR, changeIDR }` matching the inserted row.

Idempotency:
- Same `clientId` twice → one `orders` row, one `payments` row; second call returns same `orderId`.
- Different `clientId` for otherwise identical args → two `orders` rows.

Modifiers:
- Multi-line order with one item carrying selected options — `unitPriceIDR = base + Σ adjustments`, `lineTotalIDR = qty * unitPriceIDR`.
- `modifiersSnapshot` includes `groupName`, `optionName`, `priceAdjustmentIDR` for each selected option.
- Required modifier group with no selection → throws `/wajib/i`.
- Modifier option from a group NOT attached to the item → throws `/tidak tersedia/i`.
- Modifier count > `maxSelect` → throws `/melebihi batas/i`.

Tax math:
- `cafe.taxEnabled === true`, `taxRatePct = 11` → `taxIDR = Math.round(subtotal * 11 / 100)`.
- `cafe.taxEnabled === false` → `taxIDR = 0` regardless of `cafe.taxRatePct`.
- Snapshot: `orders.taxRatePct` matches the cafe value at submit time, even after cafe doc is updated post-insert.

Server overrides:
- Client passes a line shape without prices → server-computed `unitPriceIDR`, `lineTotalIDR` end up correct.
- Client passes a wildly wrong `lineTotalIDR: 1` → server-computed value wins.

Cash math:
- `cashTenderedIDR === totalIDR` → `changeIDR === 0`.
- `cashTenderedIDR > totalIDR` → `changeIDR === cashTenderedIDR - totalIDR`.
- `cashTenderedIDR < totalIDR` → throws `/kurang/i`.

Validation rejections:
- Empty cart → throws `/kosong/i`.
- `qty: 0` → throws `/tidak valid/i`.
- `qty: 100` → throws `/tidak valid/i`.
- Archived item → throws `/tidak tersedia/i` with item name in message.
- Archived modifier option → throws `/tidak tersedia/i`.

Tenant + auth:
- Cashier id from another cafe → throws `/tidak ditemukan/i`.
- Shift id from another cafe → throws (ownership check).
- Closed shift → throws `/shift sudah ditutup/i`.
- Unauthenticated → throws (existing `requireOwnerCafe` behavior).

Read queries:
- `orders.listForShift` returns shift's orders ordered by `createdAtClient` desc.
- `orders.listForShift` rejects (returns empty / throws) a shift id from another cafe.
- `orders.getById` returns the order with all snapshot fields for own cafe.
- `orders.getById` returns `null` for an order in another cafe (consistent with existing `getById` style — non-throwing).

### Cart reducer unit tests (`src/components/sale/cart-reducer.test.ts`) — 8 specs

- `addLine` for an item with no modifiers when cart empty → 1 line, qty 1.
- `addLine` again for the same no-modifier item → existing line qty bumps to 2 (no second line).
- `addLine` for the same item WITH modifiers → adds a new line (no de-dup; documented).
- `incrementQty` bumps qty; caps at 99.
- `decrementQty` decreases qty.
- `decrementQty` when qty === 1 → removes the line.
- `removeLine` removes the line by `lineKey`.
- `clearCart` empties the lines array.

### Playwright E2E (`tests/e2e/sale.spec.ts`) — 1 happy path

Auth-gated (`test.skip(!process.env.RUN_AUTH_E2E, …)`), 180s timeout (matches existing menu spec).

Flow:
1. `gotoHydrated(page, '/signup')` → fill "E2E Owner" + "Kopi E2E S3" + email + password → click "Daftar".
2. `waitForUrlHydrated(/\/onboarding\/profile$/)` → set PPN to "11" → click "Lanjut".
3. `waitForUrlHydrated(/\/onboarding\/menu$/)` → click "Mulai dengan kategori".
4. `waitForUrlHydrated(/\/menu\/categories$/)` → add category "Kopi".
5. Click Items tab → click "+ Item" → fill name "Espresso", category "Kopi", price "18000" → "Simpan".
6. `waitForUrlHydrated(/\/menu$/)` → click "Lanjut: PIN & Kasir" (or navigate via `/onboarding/cashier`).
7. `waitForUrlHydrated(/\/onboarding\/cashier$/)` → click "Atur PIN" → type "1234" → "Selesai".
8. `waitForUrlHydrated(/\/menu$/)` → `page.goto('/sale')` → trips PinGate → `/pin`.
9. Pick owner card → type "1234".
10. Land on `/shift/open` (ShiftGate triggers because no open shift). Fill "Modal awal" 100000 → "Buka Shift" → `/shift/close`.
11. `page.goto('/sale')` → SaleScreen renders.
12. Click "Espresso" tile → expect cart line "Espresso × 1" and `text="Rp 19.980"` (subtotal 18.000 + PPN 11% = 1.980).
13. Click "Bayar" → cash dialog opens.
14. Click "100k" chip → tendered shows "100.000", change shows "Rp 80.020".
15. Click "Konfirmasi" → expect `<ReceiptPreview>` visible with "Kembalian Rp 80.020".
16. Click "Selesai" → cart empty.
17. Navigate to `/history` → expect the order in the list with the right total.

Modifier flow + idempotency + error paths are covered by Convex tests + reducer tests; not duplicated in E2E to keep the suite fast and stable.

### Out-of-scope tests

- Multi-tab cart-state drift (no IndexedDB to test).
- Discount / void / zero-price.
- QRIS payment paths.
- Inventory side effects.
- Receipt visual regression.
- Performance with very long orders.

## Open questions

None blocking. Resolved during brainstorm:

- **Tap behavior**: Uniform rule — items with no modifier groups quick-add qty 1; items with any modifier groups open the picker. No long-press / hold modifier.
- **Sale layout**: 70/30 menu/cart split with per-line `+/−`/Remove stepper inside the cart row.
- **Modifier modal**: Centered shadcn Dialog with toggle chips, qty stepper, live total.
- **Cash modal layout**: Compact stacked vertical (option B from the visual brainstorm).
- **Cart persistence**: In-memory `useReducer`. No IndexedDB until offline-first work in Phase 2.
- **`paymentStatus` for cash**: Set to `'paid'` immediately at insert time. No `'pending'` state for cash.
- **Inventory deduction**: deferred entirely to Slice 4 (which introduces both `ingredients` table and the `recipeSnapshot` field).

## Addendum touchpoints

No new addendum entries needed. Existing patterns continue to apply:

- §A.9 underscore route-groups: `_pos/sale/*`, `_pos/history` join the existing `_pos` group.
- §A.13 Lingui 6 + Vite 8 macro pipeline: all user-facing strings in new components use `<Trans>` / `t\`…\``.
- Slice 2 PIN/Auth gating composes with the new `ShiftGate` on `_pos/sale/route.tsx`.

## Plan handoff

After user review of this spec, invoke `superpowers:writing-plans` to produce `docs/superpowers/plans/2026-05-22-phase-1-slice-3-pos-core.md` with task-by-task TDD steps, then execute via `superpowers:subagent-driven-development`.
