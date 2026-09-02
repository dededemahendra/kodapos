# Offline cash sales — design

Date: 2026-09-01
Status: approved for planning

## Problem

kodapos has no offline capability. There is no service worker, no IndexedDB
use, and no connectivity handling anywhere in `src/`, `convex/`, `public/`, or
the Vite config. Convex is websocket-first, so when the uplink drops mid-shift
the register stops working entirely and the cafe cannot sell.

For the target market — Indonesian cafes on consumer broadband and 4G — an
outage during a rush is a revenue-stopping event, not an inconvenience.

## Goal

A cashier can keep ringing **cash sales** through an outage. Each sale prints a
receipt, queues durably on the device, and posts to Convex when the connection
returns, without double-charging and without silently changing what the customer
was charged.

## Scope

**In scope**

- Cash sales only, queued and replayed.
- Menu, prices, modifiers, variants, price categories, active promos, cafe
  settings, open shift, and staff readable from cache while offline.
- Receipt printing offline.
- Shift close while sales are still queued.

**Out of scope (v1)**

- Gift cards, loyalty redemption, and dynamic QRIS while offline. All three need
  a server round-trip to be correct (balance checks, point ledgers, payment
  provider confirmation). They are hidden, not silently failing, when offline.
- Loyalty point *earning* offline. v1 offline sales carry no `customerId`, which
  keeps `settleSale`'s loyalty branch out of the replay path entirely.
- Refunds, voids, and held orders offline.
- Every screen other than the register. Reports, inventory, purchasing, and
  scheduling have no reason to be used during an outage.

## Decisions

Three decisions were made explicitly and drive the rest of the design.

1. **Cash sales only, queued.** Not read-only survival, not a full offline
   register.
2. **Replay always posts; discrepancies are flagged, never rejected and never
   re-priced.** The cash is in the drawer and the goods left the shop, so the
   books must match the till. Stock drift is corrected later by stock opname,
   which already exists.
3. **Shift close is allowed with sales still queued**, counted locally so the
   drawer count matches what the cashier actually took. Blocking close would
   strand staff at the till at exactly the wrong moment.

## What already exists

Investigation found substantially more groundwork than expected. None of the
following needs to be built.

- **Idempotency.** `orders.clientId` is documented in `convex/schema.ts` as an
  idempotency key (browser UUID) with a `by_cafe_clientId` index, and
  `buildOrder` (`convex/lib/sale.ts:89`) already looks up an existing order by
  it and returns the original rather than double-inserting. Exactly-once
  replay — normally the hardest part of an outbox — is already solved.
- **Shared pricing.** `convex/lib/pricing.ts` is a pure module
  (`computeOrderTotals`, `promoDiscountIDR`, `scopedSubtotalIDR`) whose stated
  purpose is that server and sale screen "never drift". The register already
  imports it, and line pricing (base + modifier adjustments) is already computed
  client-side in `src/components/sale/modifier-picker-dialog.tsx:101`. The
  client can therefore price a cart offline using the same code the server uses.
- **Client timestamps.** `saleArgs.createdAtClient` already exists, so a
  replayed sale can record when the till rang it rather than when it landed.
- **Negative stock tolerated.** `settleSale` inserts `inventoryMovements` rows
  without checking stock levels, so a replay that drives stock negative posts
  cleanly with no relaxation.

## Architecture

Five new client modules under `src/lib/offline/`, one new server mutation, and
UI surface. No existing module is restructured.

### `outbox.ts`

Durable FIFO queue over IndexedDB, keyed by `clientId`. Surface: `enqueue`,
`list`, `remove`, `size`.

IndexedDB rather than `localStorage`: the queue must survive a reload, and
`localStorage` is synchronous and size-capped. This is the only component
holding money-bearing state and gets the heaviest test coverage.

### `connectivity.ts`

Single source of truth for "can a mutation land right now".

Deliberately **not** `navigator.onLine`, which reports `true` on a captive
portal or a dead uplink. Convex's client exposes its websocket connection
state, which is what actually determines whether a mutation can reach the
server, so that is what we key on.

### `register-cache.ts`

Snapshot of the read data the register needs: menu items, categories, modifier
groups and options, variants, price categories, active promos, cafe settings,
the open shift, and staff. Written on every successful online load, read when
offline. Scoped to the register screen only.

**Staleness.** Each snapshot is stamped with the time it was written. A snapshot
older than 24 hours is treated as unusable: the register refuses to start an
offline sale against it and says the cached menu is too old, rather than ringing
sales at prices that may be days out of date. The bound is a guess at what a
realistic outage looks like and is worth revisiting once there is field data.

### `replay.ts`

Drains the outbox in FIFO order when connectivity returns, calling
`createReplayedCashSale` per entry with retry and backoff. Because `clientId`
dedup makes retries safe, this can be aggressive: an entry is removed only on
confirmed server success.

### UI surface

- A persistent offline banner on the register.
- Per-sale "queued" state instead of "paid" confirmation.
- A pending-count indicator, and a queued-sales list the cashier can inspect.
- Shift close showing local totals including queued sales, marked "pending
  sync".
- Gift card, loyalty, and dynamic QRIS controls hidden (not merely disabled)
  while offline.

## Server contract

`buildOrder` re-derives everything from current server state and throws on
anything stale. Three of those throws are fatal to replay:

1. **`'Shift sudah ditutup.'`** (`buildOrder`, shift-status check). Because
   decision 3 allows closing the shift with sales queued, replay runs *after*
   close. Under the current contract every queued sale would be rejected
   permanently — a poison message the outbox retries forever. This is a direct
   collision between decision 3 and the existing server contract, and it is the
   single most important thing this design fixes.
2. **Re-pricing.** `lineInput` carries only `menuItemId`, `qty`,
   `modifierOptionIds`, and `variantId` — no prices. The server recomputes from
   current item docs, so a price changed during the outage would produce a total
   that disagrees with the printed receipt. That is the "re-price on the server"
   behaviour decision 2 rejected.
3. **Stale references.** An item, variant, or modifier deactivated during the
   outage throws `'... tidak tersedia.'`; an archived promo throws too.

### `createReplayedCashSale`

A sibling mutation to `createCashSale`, taking existing `saleArgs` plus a
line-level price snapshot and a replay marker. It:

- skips the shift-open check, posting into a closed shift;
- trusts the client's price snapshot rather than re-deriving;
- accepts deactivated items, variants, modifiers, and archived promos, using the
  snapshot for display fields;
- still dedups on `clientId`;
- writes a reconciliation row whenever what it accepted differs from what
  current server state would have produced.

Kept **separate from `createCashSale`** deliberately: the online path retains
every validation it has today, so a bug in the replay contract cannot weaken a
live sale.

### Reconciliation

A new `saleReconciliations` table, indexed `by_cafe`, with one row per replayed
sale that differed from what current server state would have produced. Each row
records the `orderId`, the `clientId`, and a discrepancy kind: `price_drift`,
`item_unavailable`, `promo_archived`, or `negative_stock` — plus the rung value
and the current-state value for the first of those. Surfaced on a "needs
attention" view for the owner. This is what makes decision 2's "flag the
discrepancy" real rather than aspirational.

## Receipt numbering

There is no order-number sequence. The printed number is derived from the
Convex document id — `${orderPrefix}${order._id.slice(-4).toUpperCase()}`
(`src/components/sale/receipt-preview.tsx:117`) — and that id does not exist
until the server inserts.

No clean option exists. The chosen approach:

- Offline receipts print `${orderPrefix}${clientId.slice(-4).toUpperCase()}`
  with an explicit "OFFLINE" mark.
- Order search learns to resolve that code, so the receipt in the customer's
  hand stays lookupable permanently.

Two numbering schemes therefore coexist. Accepted, because the alternative —
switching all orders to `clientId`-derived numbers — would change the printed
number of every historical order, so a reprint would no longer match the receipt
originally given to the customer.

## Error handling

- **Queue write fails** (IndexedDB unavailable, quota, private browsing): the
  sale must not be silently lost. The register refuses to complete the sale and
  says so, rather than printing a receipt for something it cannot store.
- **Replay fails with a permanent error** (validation the replay contract does
  not relax): the entry moves to a dead-letter list surfaced to the owner. It is
  never silently dropped and never retried forever.
- **Replay fails with a transient error** (network, timeout): retry with
  exponential backoff, order preserved.
- **Device lost with a non-empty queue**: unrecoverable. See limitations.
- **Two devices offline simultaneously**: both queues post independently. Each
  sale is distinct with its own `clientId`, so no dedup collision occurs.
  Combined stock drift is reconciled by opname as usual.

## Testing strategy

- **`outbox.ts`** — unit tests against a real IndexedDB (fake-indexeddb) for
  ordering, durability across reloads, removal semantics, and quota failure.
  Heaviest coverage in the feature; it holds money.
- **`createReplayedCashSale`** — `convex-test` cases for each relaxation: closed
  shift, price drift, deactivated item, archived promo, negative stock, and
  `clientId` dedup on double-replay. The dedup test is the critical one.
- **Pricing parity** — a property-style test asserting that the client's offline
  total and the server's recorded total agree for the same cart, guarding the
  invariant the whole design rests on.
- **`replay.ts`** — retry, backoff, ordering, and dead-lettering against a
  faked transport.
- **e2e** — deferred. The auth-gated Playwright suite is currently broken (see
  Known issues), so an offline e2e test would have nowhere to run. This is
  called out rather than quietly skipped.

## Accepted limitations (v1)

- **Device loss loses the queue.** An outbox in IndexedDB on one tablet means a
  cracked screen, a cleared browser, or a reinstalled app is unrecoverable lost
  revenue, with no server record the sales ever existed. Accepted for v1 and
  stated here so it is a decision rather than a later discovery.
- Two numbering schemes coexist (above).
- Offline stock is unaware of concurrent sales on other devices.
- No offline gift cards, loyalty, dynamic QRIS, refunds, voids, or held orders.

## Known issues this design depends on

The auth-gated Playwright suite (17 specs covering sale, shifts, menu,
inventory) has been failing since 2026-06-30 and reports as skipped because CI
does not set `RUN_AUTH_E2E`. Every spec opens with `goto('/signup')`, but the
signup page was removed in `0e18b00`. Until that is repaired there is no
end-to-end coverage of the sale path this feature modifies. The unit and
`convex-test` coverage above is written knowing that gap exists.
