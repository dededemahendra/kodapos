# Offline Cash Sales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a cashier keep ringing cash sales through a network outage — each sale prints, queues durably on the device, and posts to Convex on reconnect without double-charging or re-pricing.

**Architecture:** Five new client modules under `src/lib/offline/` (durable IndexedDB outbox, connectivity, register cache, replay worker, offline receipt numbering), one new Convex mutation `createReplayedCashSale` that relaxes exactly three validations for queued sales, and a `saleReconciliations` table recording what differed. The online sale path is untouched.

**Tech Stack:** TypeScript, Convex 1.39, React 19 + TanStack Router, Vitest 4 (edge-runtime), convex-test 0.0.53, lingui for i18n, Biome for lint/format.

**Spec:** `docs/superpowers/specs/2026-09-01-offline-cash-sales-design.md`

## Global Constraints

- **Convex function syntax:** object form only — `mutation({ args, returns, handler })`. Read `convex/_generated/ai/guidelines.md` before writing any Convex code; it overrides training-data patterns.
- **All user-facing copy is Indonesian source text** wrapped in lingui macros (`` t`...` `` in logic, `<Trans>` in JSX, `` msg`...` `` for constants). English lives in `src/locales/en/messages.po`, never inline. Source strings are Indonesian because `DEFAULT_LOCALE` is `'id'`.
- **Money is integer IDR.** Every amount field is named `*IDR` and is a whole number. Never use floats for money.
- **Every Convex mutation declares `returns:`.** Validators are mandatory on args and returns.
- **Test locations:** Convex tests in `tests/convex/*.test.ts`, client-logic tests in `tests/lib/*.test.ts` or colocated `src/**/*.test.ts`. Vitest `include` is `['tests/**/*.test.ts', 'src/**/*.test.ts']`.
- **Test environment is `edge-runtime`** — there is no DOM and no IndexedDB. Tests needing IndexedDB must `import 'fake-indexeddb/auto'` as their first import.
- **Gate before every commit:** `pnpm typecheck && pnpm test && pnpm lint`. All three must exit 0.
- **Offline scope is cash sales only.** Gift cards, loyalty, and dynamic QRIS are out of scope and must be hidden while offline, not silently failing.

---

### Task 1: Durable outbox

The only component holding money-bearing state. Gets the heaviest coverage.

**Files:**
- Create: `src/lib/offline/outbox.ts`
- Create: `tests/lib/offline-outbox.test.ts`
- Modify: `package.json` (add `idb`, `fake-indexeddb`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type QueuedSale = { clientId: string; payload: ReplayPayload; queuedAt: number; attempts: number }`
  - `enqueue(sale: Omit<QueuedSale, 'attempts'>): Promise<void>`
  - `list(): Promise<QueuedSale[]>` — FIFO by `queuedAt`
  - `remove(clientId: string): Promise<void>`
  - `size(): Promise<number>`
  - `recordAttempt(clientId: string): Promise<void>`
  - `ReplayPayload` is defined in Task 4 and imported from `convex/lib/replay`. For this task, type it structurally as `Record<string, unknown>` is NOT acceptable — import the real type.

Task 4 defines `ReplayPayload`. Implement Task 4 first if executing out of order, or stub the import and fix it in Task 4's commit.

- [ ] **Step 1: Install dependencies**

```bash
pnpm add idb
pnpm add -D fake-indexeddb
```

- [ ] **Step 2: Write the failing test**

Create `tests/lib/offline-outbox.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { enqueue, list, recordAttempt, remove, size, _resetForTests } from '~/lib/offline/outbox';

const payload = (n: number) =>
  ({
    shiftId: `shift${n}`,
    cashierId: `cashier${n}`,
    lines: [],
    cashTenderedIDR: 1000 * n,
    totalIDR: 1000 * n,
    createdAtClient: n,
  }) as never;

describe('outbox', () => {
  beforeEach(async () => {
    await _resetForTests();
  });

  it('returns queued sales in FIFO order', async () => {
    await enqueue({ clientId: 'a', payload: payload(1), queuedAt: 100 });
    await enqueue({ clientId: 'b', payload: payload(2), queuedAt: 200 });
    expect((await list()).map((s) => s.clientId)).toEqual(['a', 'b']);
  });

  it('survives a fresh connection to the same database', async () => {
    await enqueue({ clientId: 'a', payload: payload(1), queuedAt: 100 });
    await _resetForTests({ keepData: true });
    expect(await size()).toBe(1);
  });

  it('remove deletes only the named entry', async () => {
    await enqueue({ clientId: 'a', payload: payload(1), queuedAt: 100 });
    await enqueue({ clientId: 'b', payload: payload(2), queuedAt: 200 });
    await remove('a');
    expect((await list()).map((s) => s.clientId)).toEqual(['b']);
  });

  it('enqueue is idempotent on clientId', async () => {
    await enqueue({ clientId: 'a', payload: payload(1), queuedAt: 100 });
    await enqueue({ clientId: 'a', payload: payload(1), queuedAt: 100 });
    expect(await size()).toBe(1);
  });

  it('recordAttempt increments the attempt counter', async () => {
    await enqueue({ clientId: 'a', payload: payload(1), queuedAt: 100 });
    await recordAttempt('a');
    await recordAttempt('a');
    expect((await list())[0].attempts).toBe(2);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/offline-outbox.test.ts`
Expected: FAIL — cannot resolve `~/lib/offline/outbox`.

- [ ] **Step 4: Implement the outbox**

Create `src/lib/offline/outbox.ts`:

```ts
import { type IDBPDatabase, openDB } from 'idb';
import type { ReplayPayload } from 'convex/lib/replay';

export type QueuedSale = {
  clientId: string;
  payload: ReplayPayload;
  queuedAt: number;
  attempts: number;
};

const DB_NAME = 'kodapos-offline';
const STORE = 'outbox';
const VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          const store = database.createObjectStore(STORE, { keyPath: 'clientId' });
          store.createIndex('by_queuedAt', 'queuedAt');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Queue a sale for replay. Keyed by `clientId`, so enqueuing the same sale
 * twice (a double-tap, a re-render) stores one entry — mirroring the
 * server-side `by_cafe_clientId` dedup in `convex/lib/sale.ts`.
 */
export async function enqueue(sale: Omit<QueuedSale, 'attempts'>): Promise<void> {
  const d = await db();
  const existing = await d.get(STORE, sale.clientId);
  if (existing) return;
  await d.put(STORE, { ...sale, attempts: 0 });
}

/** Queued sales oldest-first. Replay must preserve the order they were rung. */
export async function list(): Promise<QueuedSale[]> {
  const d = await db();
  return (await d.getAllFromIndex(STORE, 'by_queuedAt')) as QueuedSale[];
}

export async function remove(clientId: string): Promise<void> {
  const d = await db();
  await d.delete(STORE, clientId);
}

export async function size(): Promise<number> {
  const d = await db();
  return await d.count(STORE);
}

export async function recordAttempt(clientId: string): Promise<void> {
  const d = await db();
  const existing = (await d.get(STORE, clientId)) as QueuedSale | undefined;
  if (!existing) return;
  await d.put(STORE, { ...existing, attempts: existing.attempts + 1 });
}

/** Test-only. Drops the cached connection, optionally wiping stored rows. */
export async function _resetForTests(opts: { keepData?: boolean } = {}): Promise<void> {
  if (!opts.keepData) {
    const d = await db();
    await d.clear(STORE);
  }
  const d = await dbPromise;
  d?.close();
  dbPromise = null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/offline-outbox.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Run the gate**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: all exit 0. If `convex/lib/replay` does not exist yet, complete Task 4 first.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/offline/outbox.ts tests/lib/offline-outbox.test.ts
git commit -m "feat(offline): durable IndexedDB outbox for queued sales"
```

---

### Task 2: Connectivity signal

**Files:**
- Create: `src/lib/offline/connectivity.ts`
- Create: `tests/lib/offline-connectivity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ConnectionState = 'online' | 'offline'`
  - `deriveState(input: { convexConnected: boolean; browserOnline: boolean }): ConnectionState` — pure, testable
  - `useConnectionState(): ConnectionState` — React hook wrapping the Convex client

Why not `navigator.onLine` alone: it reports `true` on a captive portal or a dead uplink. The authority is whether Convex's websocket is connected, because that is what determines if a mutation can land. `navigator.onLine === false` is treated as a fast negative signal only.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/offline-connectivity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveState } from '~/lib/offline/connectivity';

describe('deriveState', () => {
  it('is online only when the Convex socket is connected', () => {
    expect(deriveState({ convexConnected: true, browserOnline: true })).toBe('online');
  });

  it('is offline when the socket is down even if the browser claims online', () => {
    // The captive-portal case: the OS reports a network, but nothing reaches Convex.
    expect(deriveState({ convexConnected: false, browserOnline: true })).toBe('offline');
  });

  it('is offline when the browser reports no network', () => {
    expect(deriveState({ convexConnected: true, browserOnline: false })).toBe('offline');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/offline-connectivity.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

Create `src/lib/offline/connectivity.ts`:

```ts
import { useConvex } from 'convex/react';
import { useEffect, useState } from 'react';

export type ConnectionState = 'online' | 'offline';

/**
 * Pure decision so it can be tested without a Convex client or a browser.
 *
 * The Convex websocket is the authority: it is what actually determines
 * whether a mutation can land. `navigator.onLine` only ever contributes a
 * fast negative — it reports `true` on a captive portal or a dead uplink,
 * so it can never on its own justify calling us online.
 */
export function deriveState(input: {
  convexConnected: boolean;
  browserOnline: boolean;
}): ConnectionState {
  return input.convexConnected && input.browserOnline ? 'online' : 'offline';
}

export function useConnectionState(): ConnectionState {
  const convex = useConvex();
  const [state, setState] = useState<ConnectionState>('online');

  useEffect(() => {
    const read = () =>
      setState(
        deriveState({
          convexConnected: convex.connectionState().isWebSocketConnected,
          browserOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
        })
      );
    read();
    const id = setInterval(read, 2000);
    window.addEventListener('online', read);
    window.addEventListener('offline', read);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', read);
      window.removeEventListener('offline', read);
    };
  }, [convex]);

  return state;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/offline-connectivity.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Verify the Convex client API**

Run: `grep -rn "isWebSocketConnected" node_modules/convex/dist/cjs-types/browser/*.d.ts | head -3`
Expected: the property exists on the object returned by `connectionState()`. If the shape differs in convex 1.39, adjust `useConnectionState` to match and note it in the commit message. Do not guess — read the type.

- [ ] **Step 6: Commit**

```bash
git add src/lib/offline/connectivity.ts tests/lib/offline-connectivity.test.ts
git commit -m "feat(offline): connectivity signal keyed on the Convex socket"
```

---

### Task 3: `saleReconciliations` table

**Files:**
- Modify: `convex/schema.ts`

**Interfaces:**
- Produces: table `saleReconciliations`, index `by_cafe` on `['cafeId']`.

- [ ] **Step 1: Add the table**

In `convex/schema.ts`, alongside the other table definitions:

```ts
  // One row per replayed offline sale whose recorded values differ from what
  // current server state would have produced. The sale still posts — the cash
  // is in the drawer — so this is the owner's record of what drifted.
  saleReconciliations: defineTable({
    cafeId: v.id('cafes'),
    orderId: v.id('orders'),
    clientId: v.string(),
    kind: v.union(
      v.literal('price_drift'),
      v.literal('item_unavailable'),
      v.literal('promo_archived'),
      v.literal('negative_stock')
    ),
    /** What the till charged, in IDR. Set for price_drift only. */
    rungIDR: v.optional(v.number()),
    /** What current prices would have charged, in IDR. price_drift only. */
    currentIDR: v.optional(v.number()),
    /** Human-readable detail, e.g. the item name that was unavailable. */
    detail: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  }).index('by_cafe', ['cafeId']),
```

- [ ] **Step 2: Verify the schema compiles**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(offline): saleReconciliations table for replay discrepancies"
```

---

### Task 4: Replay payload type and server contract

The heart of the feature. Three relaxations, each independently tested.

**Files:**
- Create: `convex/lib/replay.ts`
- Modify: `convex/lib/sale.ts` (add optional `replay` parameter to `buildOrder`)
- Modify: `convex/orders.ts` (add `createReplayedCashSale`)
- Create: `tests/convex/replay-sale.test.ts`

**Interfaces:**
- Consumes: `buildOrder`, `settleSale` from `convex/lib/sale.ts`; `saleArgs` shape.
- Produces:
  - `ReplayPayload` — the serializable payload the outbox stores
  - `replayLineSnapshot` validator
  - `api.orders.createReplayedCashSale` mutation

**Design note:** the *mutation* is separate so the online path keeps every validation it has today. Internally it reuses `buildOrder` via a new optional `replay` parameter rather than duplicating 485 lines. The separation that matters is the public surface.

- [ ] **Step 1: Define the payload type**

Create `convex/lib/replay.ts`:

```ts
import { v } from 'convex/values';

/**
 * Per-line price snapshot taken at the till. A replayed sale is recorded
 * exactly as it was rung — the customer already paid this amount and left —
 * so the server trusts these numbers instead of re-deriving them from item
 * docs that may have changed during the outage.
 */
export const replayLineSnapshot = v.object({
  menuItemId: v.id('menuItems'),
  qty: v.number(),
  modifierOptionIds: v.array(v.id('modifierOptions')),
  variantId: v.optional(v.id('menuItemVariants')),
  /** Name as printed on the receipt, used if the item is since archived. */
  nameSnapshot: v.string(),
  unitPriceIDR: v.number(),
  lineTotalIDR: v.number(),
});

export const replayArgs = {
  clientId: v.string(),
  shiftId: v.id('shifts'),
  cashierId: v.id('cafeStaff'),
  lines: v.array(replayLineSnapshot),
  promoId: v.optional(v.id('promotions')),
  discountIDR: v.number(),
  serviceChargeIDR: v.number(),
  taxIDR: v.number(),
  totalIDR: v.number(),
  cashTenderedIDR: v.number(),
  createdAtClient: v.number(),
  orderType: v.optional(v.string()),
  priceCategoryId: v.optional(v.id('priceCategories')),
};

export type ReplayPayload = {
  clientId: string;
  shiftId: string;
  cashierId: string;
  lines: Array<{
    menuItemId: string;
    qty: number;
    modifierOptionIds: string[];
    variantId?: string;
    nameSnapshot: string;
    unitPriceIDR: number;
    lineTotalIDR: number;
  }>;
  promoId?: string;
  discountIDR: number;
  serviceChargeIDR: number;
  taxIDR: number;
  totalIDR: number;
  cashTenderedIDR: number;
  createdAtClient: number;
  orderType?: string;
  priceCategoryId?: string;
};
```

- [ ] **Step 2: Write the failing tests**

Create `tests/convex/replay-sale.test.ts`. Reuse the `setup()` helper pattern from `tests/convex/sale-core.test.ts` — copy it in, adjusting for what these tests need.

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

// Copy the `setup()` helper from tests/convex/sale-core.test.ts here.
// It returns { asOwner, cafeId, cashierId, shiftId, categoryId, itemId }.

describe('createReplayedCashSale', () => {
  it('posts into a CLOSED shift', async () => {
    // The reason this mutation exists: shift close is allowed with sales still
    // queued, so replay always runs after the shift closed. buildOrder's
    // `Shift sudah ditutup.` would otherwise reject every queued sale forever.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.shifts.close, { shiftId: s.shiftId, countedCashIDR: 0 });

    const res = await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-1',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [
        {
          menuItemId: s.itemId,
          qty: 1,
          modifierOptionIds: [],
          nameSnapshot: 'Kopi',
          unitPriceIDR: 20000,
          lineTotalIDR: 20000,
        },
      ],
      discountIDR: 0,
      serviceChargeIDR: 0,
      taxIDR: 0,
      totalIDR: 20000,
      cashTenderedIDR: 20000,
      createdAtClient: Date.now(),
    });
    expect(res.totalIDR).toBe(20000);
  });

  it('records the price it was rung at, not the current price', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    // Price rises during the outage.
    await s.asOwner.mutation(api.menu.updateItemPrice, { itemId: s.itemId, priceIDR: 30000 });

    const res = await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-2',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [
        {
          menuItemId: s.itemId,
          qty: 1,
          modifierOptionIds: [],
          nameSnapshot: 'Kopi',
          unitPriceIDR: 20000,
          lineTotalIDR: 20000,
        },
      ],
      discountIDR: 0,
      serviceChargeIDR: 0,
      taxIDR: 0,
      totalIDR: 20000,
      cashTenderedIDR: 20000,
      createdAtClient: Date.now(),
    });

    expect(res.totalIDR).toBe(20000);
    const recon = await t.run((ctx) => ctx.db.query('saleReconciliations').collect());
    expect(recon).toHaveLength(1);
    expect(recon[0].kind).toBe('price_drift');
    expect(recon[0].rungIDR).toBe(20000);
    expect(recon[0].currentIDR).toBe(30000);
  });

  it('is idempotent — replaying the same clientId twice posts one order', async () => {
    // The single most important test in the feature. A retry after a timeout
    // must never charge the customer twice.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const args = {
      clientId: 'offline-3',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [
        {
          menuItemId: s.itemId,
          qty: 1,
          modifierOptionIds: [],
          nameSnapshot: 'Kopi',
          unitPriceIDR: 20000,
          lineTotalIDR: 20000,
        },
      ],
      discountIDR: 0,
      serviceChargeIDR: 0,
      taxIDR: 0,
      totalIDR: 20000,
      cashTenderedIDR: 20000,
      createdAtClient: Date.now(),
    };
    const a = await s.asOwner.mutation(api.orders.createReplayedCashSale, args);
    const b = await s.asOwner.mutation(api.orders.createReplayedCashSale, args);

    expect(b.orderId).toBe(a.orderId);
    const orders = await t.run((ctx) => ctx.db.query('orders').collect());
    expect(orders).toHaveLength(1);
  });

  it('accepts a line whose item was archived during the outage', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.menu.archiveItem, { itemId: s.itemId });

    const res = await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-4',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [
        {
          menuItemId: s.itemId,
          qty: 1,
          modifierOptionIds: [],
          nameSnapshot: 'Kopi',
          unitPriceIDR: 20000,
          lineTotalIDR: 20000,
        },
      ],
      discountIDR: 0,
      serviceChargeIDR: 0,
      taxIDR: 0,
      totalIDR: 20000,
      cashTenderedIDR: 20000,
      createdAtClient: Date.now(),
    });

    expect(res.totalIDR).toBe(20000);
    const recon = await t.run((ctx) => ctx.db.query('saleReconciliations').collect());
    expect(recon.some((r) => r.kind === 'item_unavailable')).toBe(true);
  });

  it('settles the sale so it counts as paid revenue', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const res = await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId: 'offline-5',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [
        {
          menuItemId: s.itemId,
          qty: 1,
          modifierOptionIds: [],
          nameSnapshot: 'Kopi',
          unitPriceIDR: 20000,
          lineTotalIDR: 20000,
        },
      ],
      discountIDR: 0,
      serviceChargeIDR: 0,
      taxIDR: 0,
      totalIDR: 20000,
      cashTenderedIDR: 20000,
      createdAtClient: Date.now(),
    });
    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    expect(order?.paymentStatus).toBe('paid');
  });
});
```

Before running: confirm the mutation names used above (`api.shifts.close`, `api.menu.updateItemPrice`, `api.menu.archiveItem`) exist with those argument shapes. Run `grep -nE "^export const (close|updateItemPrice|archiveItem)" convex/shifts.ts convex/menu.ts` and adjust the test calls to the real signatures. Do not invent mutations.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run tests/convex/replay-sale.test.ts`
Expected: FAIL — `createReplayedCashSale` is not a function.

- [ ] **Step 4: Add the `replay` parameter to `buildOrder`**

In `convex/lib/sale.ts`, extend the signature:

```ts
export type ReplayContext = {
  /** Per-line snapshot taken at the till, trusted over current item docs. */
  lines: Array<{ nameSnapshot: string; unitPriceIDR: number; lineTotalIDR: number }>;
  discountIDR: number;
  serviceChargeIDR: number;
  taxIDR: number;
  totalIDR: number;
};

export async function buildOrder(
  ctx: MutationCtx,
  args: SaleArgs,
  payment: PaymentInput,
  replay?: ReplayContext
): Promise<{ orderId: Id<'orders'>; totalIDR: number; changeIDR: number }> {
```

Then apply exactly three relaxations, each guarded by `if (!replay)` or `replay ? ... : ...`:

1. **Shift check.** Change `if (shift.status !== 'open') throw new Error('Shift sudah ditutup.');` to `if (!replay && shift.status !== 'open') throw new Error('Shift sudah ditutup.');`
2. **Item / variant / modifier availability.** Each `throw new Error('... tidak tersedia.')` becomes a no-op under replay, falling back to the snapshot's `nameSnapshot` and `unitPriceIDR`.
3. **Promo archived.** `if (promo.archived) throw ...` becomes `if (!replay && promo.archived) throw ...`.

Totals: when `replay` is set, use `replay.totalIDR`, `replay.discountIDR`, `replay.serviceChargeIDR`, and `replay.taxIDR` verbatim instead of the computed values.

- [ ] **Step 5: Add the mutation**

In `convex/orders.ts`:

```ts
export const createReplayedCashSale = mutation({
  args: replayArgs,
  returns: saleResult,
  handler: async (ctx, args) => {
    const res = await buildOrder(
      ctx,
      toSaleArgs(args),
      { method: 'cash', tenderedIDR: args.cashTenderedIDR },
      {
        lines: args.lines,
        discountIDR: args.discountIDR,
        serviceChargeIDR: args.serviceChargeIDR,
        taxIDR: args.taxIDR,
        totalIDR: args.totalIDR,
      }
    );
    await settleSale(ctx, res.orderId);
    await recordReconciliations(ctx, args, res.orderId);
    return res;
  },
});
```

`toSaleArgs` maps the replay payload onto `SaleArgs` by dropping the snapshot-only fields. `recordReconciliations` compares each line's `unitPriceIDR` against the current item price and inserts a `saleReconciliations` row per discrepancy. Write both as local helpers in `convex/orders.ts`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run tests/convex/replay-sale.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Verify the online path is unchanged**

Run: `pnpm vitest run tests/convex/sale-core.test.ts tests/convex/orders.test.ts tests/convex/sale-price-categories.test.ts`
Expected: PASS, unchanged counts. If any online test now fails, a relaxation leaked outside its `if (!replay)` guard — fix before continuing.

- [ ] **Step 8: Run the gate and commit**

```bash
pnpm typecheck && pnpm test && pnpm lint
git add convex/lib/replay.ts convex/lib/sale.ts convex/orders.ts tests/convex/replay-sale.test.ts
git commit -m "feat(offline): createReplayedCashSale posts queued sales as rung"
```

---

### Task 5: Register cache

**Files:**
- Create: `src/lib/offline/register-cache.ts`
- Create: `tests/lib/offline-register-cache.test.ts`

**Interfaces:**
- Consumes: `outbox.ts`'s IndexedDB helper style (same `openDB` pattern, separate object store).
- Produces:

```ts
import type { Doc } from 'convex/_generated/dataModel';

export type RegisterSnapshot = {
  items: Doc<'menuItems'>[];
  categories: Doc<'categories'>[];
  modifierGroups: Doc<'modifierGroups'>[];
  modifierOptions: Doc<'modifierOptions'>[];
  variants: Doc<'menuItemVariants'>[];
  priceCategories: Doc<'priceCategories'>[];
  promos: Doc<'promotions'>[];
  settings: Doc<'cafeSettings'>;
  shift: Doc<'shifts'>;
  staff: Doc<'cafeStaff'>[];
  writtenAt: number;
};
```

  - `save(snapshot: Omit<RegisterSnapshot, 'writtenAt'>): Promise<void>`
  - `load(): Promise<RegisterSnapshot | null>`
  - `isUsable(snapshot: RegisterSnapshot | null, now: number): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { isUsable } from '~/lib/offline/register-cache';

const DAY = 24 * 60 * 60 * 1000;

describe('isUsable', () => {
  it('rejects a null snapshot', () => {
    expect(isUsable(null, 0)).toBe(false);
  });

  it('accepts a snapshot written just now', () => {
    expect(isUsable({ writtenAt: 1000 } as never, 1000)).toBe(true);
  });

  it('accepts a snapshot just under 24 hours old', () => {
    expect(isUsable({ writtenAt: 0 } as never, DAY - 1)).toBe(true);
  });

  it('rejects a snapshot at or past 24 hours', () => {
    // Prices days out of date are worse than refusing the sale: the cashier
    // can fall back to a manual receipt, but a wrong price is a silent loss.
    expect(isUsable({ writtenAt: 0 } as never, DAY)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/lib/offline-register-cache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Mirror `outbox.ts`'s `openDB` structure with a `register` object store holding a single row under key `'current'`. `isUsable`:

```ts
export const MAX_SNAPSHOT_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * A snapshot older than a day is refused. The bound is a judgement call about
 * what a realistic outage looks like, not a derived number — revisit once
 * there is field data. Refusing is the safe direction: the cashier can write a
 * manual receipt, but a sale rung at a stale price is a silent loss.
 */
export function isUsable(snapshot: RegisterSnapshot | null, now: number): boolean {
  if (!snapshot) return false;
  return now - snapshot.writtenAt < MAX_SNAPSHOT_AGE_MS;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/lib/offline-register-cache.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/register-cache.ts tests/lib/offline-register-cache.test.ts
git commit -m "feat(offline): register read-cache with a 24h staleness bound"
```

---

### Task 6: Replay worker

**Files:**
- Create: `src/lib/offline/replay.ts`
- Create: `tests/lib/offline-replay.test.ts`

**Interfaces:**
- Consumes: `list`, `remove`, `recordAttempt` from `outbox.ts`.
- Produces:
  - `type ReplayResult = { posted: number; deadLettered: string[] }`
  - `drain(deps: { list; remove; recordAttempt; post: (p: ReplayPayload) => Promise<void>; maxAttempts?: number }): Promise<ReplayResult>`

Dependencies are injected so the worker is testable without IndexedDB or a Convex client.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { drain } from '~/lib/offline/replay';

const entry = (clientId: string, attempts = 0) => ({
  clientId,
  payload: {} as never,
  queuedAt: 1,
  attempts,
});

describe('drain', () => {
  it('posts every queued sale and removes each on success', async () => {
    const remove = vi.fn(async () => {});
    const res = await drain({
      list: async () => [entry('a'), entry('b')],
      remove,
      recordAttempt: async () => {},
      post: async () => {},
    });
    expect(res.posted).toBe(2);
    expect(remove.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });

  it('keeps an entry queued when posting fails', async () => {
    const remove = vi.fn(async () => {});
    const res = await drain({
      list: async () => [entry('a')],
      remove,
      recordAttempt: async () => {},
      post: async () => {
        throw new Error('network');
      },
    });
    expect(res.posted).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });

  it('stops at the first failure to preserve order', async () => {
    // Sales must post in the order they were rung; posting 'b' after 'a'
    // failed would reorder the day's takings.
    const post = vi.fn(async (_p: never) => {
      throw new Error('network');
    });
    await drain({
      list: async () => [entry('a'), entry('b')],
      remove: async () => {},
      recordAttempt: async () => {},
      post: post as never,
    });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('dead-letters an entry past maxAttempts instead of retrying forever', async () => {
    const remove = vi.fn(async () => {});
    const res = await drain({
      list: async () => [entry('a', 5)],
      remove,
      recordAttempt: async () => {},
      post: async () => {
        throw new Error('permanent');
      },
      maxAttempts: 5,
    });
    expect(res.deadLettered).toEqual(['a']);
    expect(remove).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/lib/offline-replay.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { ReplayPayload } from 'convex/lib/replay';
import type { QueuedSale } from './outbox';

export type ReplayResult = { posted: number; deadLettered: string[] };

const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Drain the outbox oldest-first, stopping at the first failure so sales post
 * in the order they were rung. An entry is removed only after the server
 * confirms it; `clientId` dedup makes a retry harmless, so erring toward
 * retrying is always safer than erring toward dropping.
 */
export async function drain(deps: {
  list: () => Promise<QueuedSale[]>;
  remove: (clientId: string) => Promise<void>;
  recordAttempt: (clientId: string) => Promise<void>;
  post: (payload: ReplayPayload) => Promise<void>;
  maxAttempts?: number;
}): Promise<ReplayResult> {
  const max = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const queued = await deps.list();
  let posted = 0;
  const deadLettered: string[] = [];

  for (const sale of queued) {
    if (sale.attempts >= max) {
      deadLettered.push(sale.clientId);
      break;
    }
    try {
      await deps.post(sale.payload);
      await deps.remove(sale.clientId);
      posted += 1;
    } catch {
      await deps.recordAttempt(sale.clientId);
      break;
    }
  }

  return { posted, deadLettered };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/lib/offline-replay.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire the trigger**

`drain` is inert until something calls it. Add to the same file:

```ts
import { useConvex } from 'convex/react';
import { useEffect, useRef } from 'react';
import { api } from 'convex/_generated/api';
import { list, recordAttempt, remove } from './outbox';
import { useConnectionState } from './connectivity';

/**
 * Drains the outbox on every offline→online transition, and retries on an
 * interval while online in case a drain stopped partway. Guarded by a ref so
 * two drains never run concurrently — concurrent drains would post the same
 * sale twice, which `clientId` dedup would absorb, but the wasted round-trips
 * and reordering are worth avoiding.
 */
export function useReplayOnReconnect(): void {
  const convex = useConvex();
  const state = useConnectionState();
  const running = useRef(false);

  useEffect(() => {
    if (state !== 'online') return;
    const run = async () => {
      if (running.current) return;
      running.current = true;
      try {
        await drain({
          list,
          remove,
          recordAttempt,
          post: async (payload) => {
            await convex.mutation(api.orders.createReplayedCashSale, payload as never);
          },
        });
      } finally {
        running.current = false;
      }
    };
    void run();
    const id = setInterval(run, 30_000);
    return () => clearInterval(id);
  }, [state, convex]);
}
```

Call `useReplayOnReconnect()` from the POS shell so it runs on every register
screen — locate it with `grep -rln "_pos/route" src/routes` and mount the hook
in that layout component.

- [ ] **Step 6: Verify the trigger compiles and the gate passes**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/offline/replay.ts tests/lib/offline-replay.test.ts src/routes
git commit -m "feat(offline): replay worker with ordered drain and dead-lettering"
```

---

### Task 7: Offline receipt numbering

**Files:**
- Create: `src/lib/offline/receipt-number.ts`
- Create: `tests/lib/offline-receipt-number.test.ts`
- Modify: `src/components/sale/receipt-preview.tsx:117`

**Interfaces:**
- Produces: `offlineReceiptNumber(prefix: string, clientId: string): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { offlineReceiptNumber } from '~/lib/offline/receipt-number';

describe('offlineReceiptNumber', () => {
  it('uses the last four characters of the clientId, uppercased', () => {
    expect(offlineReceiptNumber('K-', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeef12')).toBe('K-EF12');
  });

  it('works with no configured prefix', () => {
    expect(offlineReceiptNumber('', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeef12')).toBe('EF12');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/lib/offline-receipt-number.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Receipt number for a sale rung offline.
 *
 * Online receipts derive their number from the Convex document id
 * (`receipt-preview.tsx`), which does not exist until the server inserts. The
 * `clientId` is the only stable identifier the till has at print time, so
 * offline receipts use its last four characters. Two schemes therefore
 * coexist; switching all orders to clientId-derived numbers would change the
 * printed number of every historical order, so a reprint would no longer match
 * the receipt the customer was originally handed.
 */
export function offlineReceiptNumber(prefix: string, clientId: string): string {
  return `${prefix}${clientId.slice(-4).toUpperCase()}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/lib/offline-receipt-number.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Wire it into the receipt**

In `src/components/sale/receipt-preview.tsx`, where `orderNumber` is built (line 117), branch on whether the order came from the outbox: use `offlineReceiptNumber(orderPrefix, clientId)` and render an "OFFLINE" mark beside it. Wrap the mark in `<Trans>`.

- [ ] **Step 6: Run the gate and commit**

```bash
pnpm typecheck && pnpm test && pnpm lint
git add src/lib/offline/receipt-number.ts tests/lib/offline-receipt-number.test.ts src/components/sale/receipt-preview.tsx
git commit -m "feat(offline): clientId-derived receipt numbers for offline sales"
```

---

### Task 8: Order search resolves offline receipt numbers

**Files:**
- Modify: `convex/orders.ts` (the `search` query, line 242)
- Create: `tests/convex/order-search-offline.test.ts`

Without this, a customer holding an offline receipt cannot be found — which breaks refunds for exactly the sales most likely to need one.

- [ ] **Step 1: Write the failing test**

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

// Copy the `setup()` helper from tests/convex/sale-core.test.ts.

describe('orders.search', () => {
  it('finds an offline sale by its printed clientId code', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const clientId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeef12';
    await s.asOwner.mutation(api.orders.createReplayedCashSale, {
      clientId,
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [
        {
          menuItemId: s.itemId,
          qty: 1,
          modifierOptionIds: [],
          nameSnapshot: 'Kopi',
          unitPriceIDR: 20000,
          lineTotalIDR: 20000,
        },
      ],
      discountIDR: 0,
      serviceChargeIDR: 0,
      taxIDR: 0,
      totalIDR: 20000,
      cashTenderedIDR: 20000,
      createdAtClient: Date.now(),
    });

    const found = await s.asOwner.query(api.orders.search, { q: 'EF12' });
    expect(found.length).toBeGreaterThan(0);
  });
});
```

Check `api.orders.search`'s real argument name before running — read `convex/orders.ts:242`. Adjust `{ q: 'EF12' }` to match.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/convex/order-search-offline.test.ts`
Expected: FAIL — no results.

- [ ] **Step 3: Implement**

Extend `search` so a 4-character query is also matched against the last four characters of `clientId`, case-insensitively, alongside the existing `_id` suffix match.

- [ ] **Step 4: Run to verify it passes, then the gate**

```bash
pnpm vitest run tests/convex/order-search-offline.test.ts
pnpm typecheck && pnpm test && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add convex/orders.ts tests/convex/order-search-offline.test.ts
git commit -m "feat(offline): resolve offline receipt codes in order search"
```

---

### Task 9: Register UI integration

**Files:**
- Modify: `src/components/sale/sale-screen.tsx`
- Modify: `src/components/sale/payment-methods.tsx`
- Modify: `src/components/sale/register-top-bar.tsx`
- Create: `src/components/sale/offline-banner.tsx`

**Interfaces:**
- Consumes: `useConnectionState` (Task 2), `enqueue`/`size` (Task 1), `load`/`isUsable` (Task 5), `offlineReceiptNumber` (Task 7).

- [ ] **Step 1: Offline banner component**

Create `src/components/sale/offline-banner.tsx` — a persistent bar shown when `useConnectionState() === 'offline'`, stating that sales are being saved on the device and will sync, plus the pending count from `size()`. All copy in `<Trans>`.

- [ ] **Step 2: Gate the unsupported payment methods**

In `payment-methods.tsx`, hide gift card and dynamic QRIS when offline. Hide, not disable — a disabled control invites the cashier to keep tapping it during a rush. Static QRIS is also hidden: it cannot be confirmed offline.

- [ ] **Step 3: Route the cash sale through the outbox when offline**

In `sale-screen.tsx`, where the cash sale is submitted: when `useConnectionState() === 'offline'`, build a `ReplayPayload` from the cart (totals already computed via `convex/lib/pricing`), `enqueue` it, print with `offlineReceiptNumber`, and show a "queued" confirmation instead of "paid". When online, the existing path runs unchanged.

- [ ] **Step 4: Refuse the sale when the cache is unusable**

If `isUsable(await load(), Date.now())` is false, block the offline sale and explain that the cached menu is too old. Do not print a receipt for a sale that cannot be stored or priced reliably.

- [ ] **Step 5: Refuse the sale when the queue write fails**

Wrap `enqueue` in try/catch. On failure (quota, private browsing, IndexedDB unavailable) show an error and do **not** print. A printed receipt for a sale that was never stored is money lost with no record.

- [ ] **Step 6: Extract lingui messages**

```bash
pnpm lingui:extract
```
Then translate the new entries in `src/locales/en/messages.po`. Leave no `msgstr ""` for the strings this task added.

- [ ] **Step 7: Run the gate and commit**

```bash
pnpm typecheck && pnpm test && pnpm lint && pnpm lint:i18n
git add src/components/sale src/locales
git commit -m "feat(offline): register rings cash sales into the outbox when offline"
```

---

### Task 10: Shift close with queued sales, and the reconciliation view

**Files:**
- Modify: `src/routes/_pos/shift/` (the close screen — locate with `grep -rln "shift/close\|closeShift" src/routes`)
- Create: `src/routes/_pos/reports/reconciliation.tsx`
- Create: `convex/reconciliation.ts`
- Create: `tests/convex/reconciliation.test.ts`

- [ ] **Step 1: Write the failing query test**

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

// Copy the `setup()` helper from tests/convex/sale-core.test.ts.

describe('reconciliation.listOpen', () => {
  it('returns only unresolved rows for the caller cafe', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('saleReconciliations', {
        cafeId: s.cafeId,
        orderId: (await ctx.db.query('orders').first())?._id ?? ('x' as never),
        clientId: 'c1',
        kind: 'price_drift',
        rungIDR: 20000,
        currentIDR: 30000,
        createdAt: Date.now(),
      });
      await ctx.db.insert('saleReconciliations', {
        cafeId: s.cafeId,
        orderId: (await ctx.db.query('orders').first())?._id ?? ('x' as never),
        clientId: 'c2',
        kind: 'price_drift',
        createdAt: Date.now(),
        resolvedAt: Date.now(),
      });
    });

    const rows = await s.asOwner.query(api.reconciliation.listOpen, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].clientId).toBe('c1');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/convex/reconciliation.test.ts`
Expected: FAIL — `api.reconciliation` does not exist.

- [ ] **Step 3: Implement the query**

Create `convex/reconciliation.ts` with `listOpen` (owner-scoped via `requireActiveOutlet`, filtering `resolvedAt === undefined`) and `resolve` (marks one row resolved). Both need `args` and `returns` validators.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/convex/reconciliation.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Shift close counts queued sales**

On the shift-close screen, add queued-sale totals from the outbox to the expected-cash figure so the drawer count matches what the cashier actually took, and label the shift "pending sync" while `size() > 0`. Copy in `<Trans>`.

- [ ] **Step 6: Reconciliation route**

Create `src/routes/_pos/reports/reconciliation.tsx` listing open rows — kind, rung vs current amount, order link, and a resolve action. Follow the existing patterns in `src/routes/_pos/reports/`.

- [ ] **Step 6b: Surface dead-lettered sales**

`drain` returns `deadLettered` (Task 6) — sales that failed `maxAttempts` times and will never retry. These are unposted revenue and must not stay invisible. On the same reconciliation route, render a distinct section listing dead-lettered `clientId`s read from the outbox (`list()` filtered to `attempts >= 5`), with the queued timestamp and amount, so the owner can key them in manually. Without this, a permanently failing sale is silently lost — the exact failure mode the spec's error handling forbids.

- [ ] **Step 7: Extract messages, run the gate, commit**

```bash
pnpm lingui:extract
pnpm typecheck && pnpm test && pnpm lint && pnpm lint:i18n
git add convex/reconciliation.ts src/routes/_pos tests/convex/reconciliation.test.ts src/locales
git commit -m "feat(offline): shift close with queued sales, reconciliation view"
```

---

## Verification

After Task 10, the whole feature should be exercisable by hand:

```bash
pnpm dev:all
```

1. Open the register, ring a cash sale — normal path, unchanged.
2. Kill the network (DevTools → Network → Offline).
3. Confirm the offline banner appears and gift card / QRIS controls disappear.
4. Ring a cash sale; confirm the receipt prints with an OFFLINE-marked number and the pending count increments.
5. Close the shift; confirm expected cash includes the queued sale.
6. Restore the network; confirm the pending count drains to zero.
7. Confirm the sale appears in history with the price it was rung at, and search finds it by the printed code.

**Not covered:** there is no working end-to-end harness for this. The auth-gated Playwright suite (17 specs including `sale.spec.ts` and `shifts.spec.ts`) has been broken since 2026-06-30 — every spec opens with `goto('/signup')`, a page removed in `0e18b00`, and they report as skipped because CI never sets `RUN_AUTH_E2E`. Repairing that suite is a prerequisite for automated coverage of this feature and is deliberately **not** in this plan; it needs its own decision about how tests create accounts.
