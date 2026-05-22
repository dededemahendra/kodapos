# Phase 1 · Slice 3 — POS Core (Cash-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the cash-only POS sale flow — tap items into a cart, optionally pick modifiers, accept cash, persist the order, print a receipt — on top of Slice 1 (menu) + Slice 2 (PIN + shift).

**Architecture:** Two new Convex tables (`orders` with embedded `lines`; `payments`). One mutation (`orders.createCashSale`) recomputes ALL totals server-side and is idempotent via a device-generated `clientId`. Cart lives in a React `useReducer` local to `<SaleScreen>` — no IndexedDB. POS-side routes (`/sale/*`, `/history`) layer a new `<ShiftGate>` on top of Slice 2's `<PinGate>`.

**Tech Stack:** Convex (schema + mutations + reactive queries) · TanStack Start + TanStack Router (file routes, `_pos` group) · convex-test + vitest (server-side specs) · vitest (cart reducer unit tests) · Playwright (auth-gated E2E) · shadcn/ui Dialog + Field + Spinner.

**Spec:** `docs/superpowers/specs/2026-05-22-phase-1-slice-3-pos-core-design.md`

**Branch:** `phase-1-slice-3-pos-core` (already checked out).

---

## File map

**New (server):**
- `convex/orders.ts` — `createCashSale` mutation + `listForShift` query + `getById` query
- `tests/convex/orders.test.ts` — convex-test specs for all of the above
- Modified: `convex/schema.ts` — add `orders` + `payments` tables
- Modified: `convex/menu/items.ts` — add `listForSale` query for the POS read

**New (client):**
- `src/components/sale/cart-reducer.ts` — pure reducer; no React deps
- `src/components/sale/cart-reducer.test.ts` — vitest unit specs
- `src/components/sale/sale-screen.tsx` — composition root; owns reducer + data loads
- `src/components/sale/menu-pane.tsx` + `item-card.tsx` — left 70% (menu)
- `src/components/sale/cart-pane.tsx` + `cart-line-row.tsx` — right 30% (cart)
- `src/components/sale/modifier-picker-dialog.tsx`
- `src/components/sale/cash-payment-dialog.tsx`
- `src/components/sale/receipt-preview.tsx`
- `src/components/shift/shift-gate.tsx` — reactive gate redirecting to `/shift/open` when no open shift
- `src/routes/_pos/sale/route.tsx` — PinGate + ShiftGate wrapper
- `src/routes/_pos/sale/index.tsx` — renders `<SaleScreen>`
- `src/routes/_pos/history.tsx` — orders list + receipt drawer
- `src/styles/print.css` — `@media print` rule
- Modified: `src/styles/app.css` (or wherever globals are imported) — import `print.css`
- New: `tests/e2e/sale.spec.ts` — auth-gated happy path

---

## Task 1: Schema — add `orders` and `payments`

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Edit `convex/schema.ts`** — append the two tables before the closing brace of `defineSchema({ ... })`.

```ts
  orders: defineTable({
    cafeId: v.id('cafes'),
    shiftId: v.id('shifts'),
    cashierId: v.id('cafeStaff'),
    clientId: v.string(),
    lines: v.array(
      v.object({
        menuItemId: v.id('menuItems'),
        nameSnapshot: v.string(),
        qty: v.number(),
        unitPriceIDR: v.number(),
        modifiersSnapshot: v.array(
          v.object({
            groupName: v.string(),
            optionName: v.string(),
            priceAdjustmentIDR: v.number(),
          })
        ),
        lineTotalIDR: v.number(),
      })
    ),
    subtotalIDR: v.number(),
    taxRatePct: v.number(),
    taxIDR: v.number(),
    discountIDR: v.number(),
    totalIDR: v.number(),
    paymentMethod: v.union(
      v.literal('cash'),
      v.literal('qris_static'),
      v.literal('qris_dynamic')
    ),
    paymentStatus: v.union(v.literal('pending'), v.literal('paid'), v.literal('void')),
    createdAtClient: v.number(),
    syncedAt: v.optional(v.number()),
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
      v.literal('qris_dynamic')
    ),
    amountIDR: v.number(),
    cashTenderedIDR: v.optional(v.number()),
    changeIDR: v.optional(v.number()),
    providerRef: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    confirmedAt: v.optional(v.number()),
  })
    .index('by_order', ['orderId'])
    .index('by_cafe_method_confirmed', ['cafeId', 'method', 'confirmedAt']),
```

- [ ] **Step 2: Push schema to dev deployment + regenerate types.**

Run: `pnpm exec convex dev --once`
Expected: prints "Convex functions ready!" and updates `convex/_generated/dataModel.d.ts` to include the new tables. No errors.

- [ ] **Step 3: Typecheck.**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(slice-3): schema — orders + payments tables"
```

---

## Task 2: `orders.createCashSale` — happy path + tax + modifiers

Build the mutation incrementally: happy path → tax math → modifiers. All sub-steps in this one task because they all extend the same function. The test setup helper is built up alongside.

**Files:**
- Create: `convex/orders.ts`
- Create: `tests/convex/orders.test.ts`

- [ ] **Step 1: Create `tests/convex/orders.test.ts` with setup helper + happy-path test.**

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

type Setup = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
  shiftId: Id<'shifts'>;
  categoryId: Id<'categories'>;
  itemId: Id<'menuItems'>;
};

async function setup(
  t: ReturnType<typeof convexTest>,
  opts: { email?: string; taxEnabled?: boolean; taxRatePct?: number } = {}
): Promise<Setup> {
  const email = opts.email ?? 'o@x.com';
  const taxEnabled = opts.taxEnabled ?? false;
  const taxRatePct = opts.taxRatePct ?? 0;
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: 'Asia/Jakarta',
    taxRatePct,
    taxEnabled,
  });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, {
    cashierId,
    openingFloatIDR: 100000,
  });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: 18000,
  });
  return { asOwner, cafeId, cashierId, shiftId, categoryId, itemId };
}

describe('orders.createCashSale', () => {
  it('creates an order with a single no-modifier line and a paired cash payment', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    expect(result.totalIDR).toBe(18000);
    expect(result.changeIDR).toBe(2000);

    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.paymentStatus).toBe('paid');
    expect(order?.paymentMethod).toBe('cash');
    expect(order?.subtotalIDR).toBe(18000);
    expect(order?.taxIDR).toBe(0);
    expect(order?.totalIDR).toBe(18000);
    expect(order?.discountIDR).toBe(0);
    expect(order?.lines).toHaveLength(1);
    expect(order?.lines[0].nameSnapshot).toBe('Espresso');
    expect(order?.lines[0].unitPriceIDR).toBe(18000);
    expect(order?.lines[0].lineTotalIDR).toBe(18000);
    expect(order?.lines[0].modifiersSnapshot).toEqual([]);

    const payments = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', result.orderId))
        .collect()
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].method).toBe('cash');
    expect(payments[0].amountIDR).toBe(18000);
    expect(payments[0].cashTenderedIDR).toBe(20000);
    expect(payments[0].changeIDR).toBe(2000);
    expect(payments[0].confirmedAt).toEqual(expect.any(Number));
  });
});
```

- [ ] **Step 2: Run the test — verify it fails.**

Run: `pnpm test tests/convex/orders.test.ts`
Expected: FAIL with `api.orders.createCashSale` not defined.

- [ ] **Step 3: Create `convex/orders.ts` with the happy-path implementation.**

```ts
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { requireActiveCashier } from './lib/staff';

const lineInput = v.object({
  menuItemId: v.id('menuItems'),
  qty: v.number(),
  modifierOptionIds: v.array(v.id('modifierOptions')),
});

const createCashSaleResult = v.object({
  orderId: v.id('orders'),
  totalIDR: v.number(),
  changeIDR: v.number(),
});

function assertIDR(n: number, label: string): number {
  if (!Number.isInteger(n)) throw new Error(`${label} harus berupa angka bulat (rupiah).`);
  if (n < 0) throw new Error(`${label} tidak boleh negatif.`);
  return n;
}

export const createCashSale = mutation({
  args: {
    clientId: v.string(),
    shiftId: v.id('shifts'),
    cashierId: v.id('cafeStaff'),
    lines: v.array(lineInput),
    cashTenderedIDR: v.number(),
    createdAtClient: v.optional(v.number()),
  },
  returns: createCashSaleResult,
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);

    // Idempotency check first — return existing order if clientId already used.
    const existing = await ctx.db
      .query('orders')
      .withIndex('by_cafe_clientId', (q) =>
        q.eq('cafeId', cafeId).eq('clientId', args.clientId)
      )
      .unique();
    if (existing) {
      const payment = await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', existing._id))
        .unique();
      return {
        orderId: existing._id,
        totalIDR: existing.totalIDR,
        changeIDR: payment?.changeIDR ?? 0,
      };
    }

    if (args.lines.length < 1) throw new Error('Keranjang kosong.');

    const shift = await requireOwned(ctx, cafeId, args.shiftId, 'Shift');
    if (shift.status !== 'open') throw new Error('Shift sudah ditutup.');

    await requireActiveCashier(ctx, cafeId, args.cashierId);

    const tendered = assertIDR(args.cashTenderedIDR, 'Uang yang diterima');

    const builtLines: Doc<'orders'>['lines'] = [];
    for (const line of args.lines) {
      if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 99) {
        throw new Error('Jumlah item tidak valid.');
      }
      const item = await ctx.db.get(line.menuItemId);
      if (!item || item.cafeId !== cafeId || item.archived || !item.isActive) {
        throw new Error(`Item ${item?.name ?? ''} tidak tersedia.`.replace(/\s+/g, ' ').trim());
      }

      const modifiersSnapshot: Doc<'orders'>['lines'][number]['modifiersSnapshot'] = [];
      let modifierAdjustments = 0;
      for (const optionId of line.modifierOptionIds) {
        const option = await ctx.db.get(optionId);
        if (!option || option.cafeId !== cafeId || option.archived) {
          throw new Error('Modifier tidak tersedia.');
        }
        const group = await ctx.db.get(option.groupId);
        if (!group) throw new Error('Modifier tidak tersedia.');
        const attachment = await ctx.db
          .query('menuItemModifierGroups')
          .withIndex('by_item', (q) => q.eq('menuItemId', item._id))
          .filter((q) => q.eq(q.field('modifierGroupId'), group._id))
          .unique();
        if (!attachment) throw new Error('Modifier tidak tersedia.');
        modifiersSnapshot.push({
          groupName: group.name,
          optionName: option.name,
          priceAdjustmentIDR: option.priceAdjustmentIDR,
        });
        modifierAdjustments += option.priceAdjustmentIDR;
      }

      const unitPriceIDR = item.priceIDR + modifierAdjustments;
      const lineTotalIDR = line.qty * unitPriceIDR;
      builtLines.push({
        menuItemId: item._id,
        nameSnapshot: item.name,
        qty: line.qty,
        unitPriceIDR,
        modifiersSnapshot,
        lineTotalIDR,
      });
    }

    const subtotalIDR = builtLines.reduce((sum, l) => sum + l.lineTotalIDR, 0);

    const cafe = await ctx.db.get(cafeId);
    const taxEnabled = cafe?.taxEnabled === true;
    const taxRatePct = taxEnabled ? cafe?.taxRatePct ?? 0 : 0;
    const taxIDR = Math.round((subtotalIDR * taxRatePct) / 100);
    const totalIDR = subtotalIDR + taxIDR;

    if (tendered < totalIDR) {
      throw new Error('Uang yang diterima kurang dari total.');
    }

    const now = Date.now();
    const orderId = await ctx.db.insert('orders', {
      cafeId,
      shiftId: shift._id,
      cashierId: args.cashierId,
      clientId: args.clientId,
      lines: builtLines,
      subtotalIDR,
      taxRatePct,
      taxIDR,
      discountIDR: 0,
      totalIDR,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      createdAtClient: args.createdAtClient ?? now,
      syncedAt: now,
    });

    const changeIDR = tendered - totalIDR;
    await ctx.db.insert('payments', {
      cafeId,
      orderId,
      method: 'cash',
      amountIDR: totalIDR,
      cashTenderedIDR: tendered,
      changeIDR,
      confirmedAt: now,
    });

    return { orderId, totalIDR, changeIDR };
  },
});
```

- [ ] **Step 4: Run the test — verify it passes.**

Run: `pnpm test tests/convex/orders.test.ts`
Expected: PASS (1 spec).

- [ ] **Step 5: Add tax math specs to `tests/convex/orders.test.ts`** — append inside the `describe('orders.createCashSale', () => { ... })` block.

```ts
  it('applies tax when cafe.taxEnabled is true; snapshots taxRatePct at sale time', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t, {
      taxEnabled: true,
      taxRatePct: 11,
    });
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-tax',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 30000,
      createdAtClient: 1700000000000,
    });
    // 18000 * 11 / 100 = 1980; total = 19980.
    expect(result.totalIDR).toBe(19980);
    expect(result.changeIDR).toBe(10020);
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.taxRatePct).toBe(11);
    expect(order?.taxIDR).toBe(1980);

    // Owner later edits PPN; the existing order still snapshots the original rate.
    await asOwner.mutation(api.cafes.updateProfile, {
      name: 'Kopi Senja',
      timezone: 'Asia/Jakarta',
      taxRatePct: 5,
      taxEnabled: true,
    });
    const orderAgain = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(orderAgain?.taxRatePct).toBe(11);
  });

  it('zero tax when cafe.taxEnabled is false even if taxRatePct is non-zero', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t, {
      taxEnabled: false,
      taxRatePct: 11,
    });
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-notax',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 18000,
      createdAtClient: 1700000000000,
    });
    expect(result.totalIDR).toBe(18000);
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.taxRatePct).toBe(0);
    expect(order?.taxIDR).toBe(0);
  });
```

- [ ] **Step 6: Run the tax tests — verify they pass.**

Run: `pnpm test tests/convex/orders.test.ts`
Expected: PASS (3 specs).

- [ ] **Step 7: Add modifier specs** — append inside the same `describe` block.

```ts
  it('multi-line order with modifiers — snapshot + unit price calculation', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);

    // Build a modifier group with two options, attach to the item.
    const groupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Susu',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: 'Reguler', priceAdjustmentIDR: 0, position: 0 },
        { name: 'Oat (+5k)', priceAdjustmentIDR: 5000, position: 1 },
      ],
    });
    await asOwner.mutation(api.menu.itemGroups.attach, {
      menuItemId: itemId,
      modifierGroupId: groupId,
    });

    const group = await asOwner.query(api.menu.modifierGroups.getById, { id: groupId });
    const oat = group!.options.find((o) => o.name === 'Oat (+5k)')!;
    const regular = group!.options.find((o) => o.name === 'Reguler')!;

    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'order-mod',
      shiftId,
      cashierId,
      lines: [
        { menuItemId: itemId, qty: 2, modifierOptionIds: [oat._id] },
        { menuItemId: itemId, qty: 1, modifierOptionIds: [regular._id] },
      ],
      cashTenderedIDR: 100000,
      createdAtClient: 1700000000000,
    });
    // line 1: qty 2 * (18000 + 5000) = 46000
    // line 2: qty 1 * (18000 + 0)    = 18000
    // subtotal = 64000; tax disabled; total = 64000
    expect(result.totalIDR).toBe(64000);
    expect(result.changeIDR).toBe(36000);

    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.lines).toHaveLength(2);
    expect(order?.lines[0].unitPriceIDR).toBe(23000);
    expect(order?.lines[0].lineTotalIDR).toBe(46000);
    expect(order?.lines[0].modifiersSnapshot).toEqual([
      { groupName: 'Susu', optionName: 'Oat (+5k)', priceAdjustmentIDR: 5000 },
    ]);
    expect(order?.lines[1].unitPriceIDR).toBe(18000);
    expect(order?.lines[1].modifiersSnapshot).toEqual([
      { groupName: 'Susu', optionName: 'Reguler', priceAdjustmentIDR: 0 },
    ]);
  });
```

> Note: this test calls `api.menu.itemGroups.attach`. Verify that mutation exists by reading `convex/menu/itemGroups.ts` before running — if the actual name differs (e.g. `link`, `upsert`), update the test call accordingly. The existing file is the source of truth.

- [ ] **Step 8: Run the modifier test — verify it passes.**

Run: `pnpm test tests/convex/orders.test.ts`
Expected: PASS (4 specs).

- [ ] **Step 9: Commit.**

```bash
git add convex/orders.ts tests/convex/orders.test.ts
git commit -m "feat(slice-3): orders.createCashSale — happy path + tax + modifiers"
```

---

## Task 3: `orders.createCashSale` — idempotency + validation

Same `convex/orders.ts` file as Task 2. Adds tests for every rejection branch and confirms idempotency behaviour. The handler from Task 2 already implements all of these; this task is mostly test additions with one or two impl tweaks if the assertions surface gaps.

**Files:**
- Modify: `convex/orders.ts` (only if a test surfaces a missing check)
- Modify: `tests/convex/orders.test.ts`

- [ ] **Step 1: Add idempotency specs to `tests/convex/orders.test.ts`** — append inside the `describe('orders.createCashSale', …)` block.

```ts
  it('idempotent: same clientId twice → one order, one payment, returns same orderId', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId, cafeId } = await setup(t);
    const args = {
      clientId: 'dup-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    } as const;
    const first = await asOwner.mutation(api.orders.createCashSale, args);
    const second = await asOwner.mutation(api.orders.createCashSale, args);
    expect(second.orderId).toBe(first.orderId);
    expect(second.totalIDR).toBe(first.totalIDR);
    expect(second.changeIDR).toBe(first.changeIDR);

    const allOrders = await t.run(async (ctx) =>
      await ctx.db
        .query('orders')
        .withIndex('by_cafe_clientId', (q) => q.eq('cafeId', cafeId).eq('clientId', 'dup-1'))
        .collect()
    );
    expect(allOrders).toHaveLength(1);
    const allPayments = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', first.orderId))
        .collect()
    );
    expect(allPayments).toHaveLength(1);
  });

  it('different clientId for otherwise identical args → two orders', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const base = {
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    } as const;
    const a = await asOwner.mutation(api.orders.createCashSale, { ...base, clientId: 'A' });
    const b = await asOwner.mutation(api.orders.createCashSale, { ...base, clientId: 'B' });
    expect(b.orderId).not.toBe(a.orderId);
  });
```

- [ ] **Step 2: Run them.**

Run: `pnpm test tests/convex/orders.test.ts`
Expected: PASS (6 specs).

- [ ] **Step 3: Add validation rejection specs** — append inside the same describe block.

```ts
  it('rejects empty cart', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId } = await setup(t);
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'empty',
        shiftId,
        cashierId,
        lines: [],
        cashTenderedIDR: 0,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/kosong/i);
  });

  it('rejects qty < 1 or qty > 99 or fractional', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    for (const qty of [0, -1, 100, 1.5]) {
      await expect(
        asOwner.mutation(api.orders.createCashSale, {
          clientId: `qty-${qty}`,
          shiftId,
          cashierId,
          lines: [{ menuItemId: itemId, qty, modifierOptionIds: [] }],
          cashTenderedIDR: 1000000,
          createdAtClient: 1700000000000,
        })
      ).rejects.toThrow(/tidak valid/i);
    }
  });

  it('rejects archived item', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.menu.items.archive, { id: itemId });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'arch-item',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/tidak tersedia/i);
  });

  it('rejects inactive item', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.menu.items.setActive, { id: itemId, isActive: false });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'inactive',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/tidak tersedia/i);
  });

  it('rejects modifier option from a group not attached to the item', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const detachedGroupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Detached',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'Solo', priceAdjustmentIDR: 1000, position: 0 }],
    });
    const detached = await asOwner.query(api.menu.modifierGroups.getById, { id: detachedGroupId });
    const opt = detached!.options[0];
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'detached-opt',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [opt._id] }],
        cashTenderedIDR: 100000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/tidak tersedia/i);
  });

  it('rejects insufficient cash tender', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'short',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 10000, // < 18000
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/kurang dari total/i);
  });

  it('rejects fractional or negative tendered amount', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'frac',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000.5,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/bulat|rupiah/i);
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'neg',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: -1,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/negatif/i);
  });

  it('rejects closed shift', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 100000 });
    await expect(
      asOwner.mutation(api.orders.createCashSale, {
        clientId: 'closed',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/sudah ditutup/i);
  });

  it('rejects cashier from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA, shiftId: shiftA, itemId: itemA } = await setup(t, { email: 'a@x.com' });
    const { cashierId: cashierB } = await setup(t, { email: 'b@x.com' });
    await expect(
      ownerA.mutation(api.orders.createCashSale, {
        clientId: 'cross-cashier',
        shiftId: shiftA,
        cashierId: cashierB,
        lines: [{ menuItemId: itemA, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/tidak ditemukan/i);
  });

  it('rejects shift from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA, cashierId: cashierA, itemId: itemA } = await setup(t, { email: 'a@x.com' });
    const { shiftId: shiftB } = await setup(t, { email: 'b@x.com' });
    await expect(
      ownerA.mutation(api.orders.createCashSale, {
        clientId: 'cross-shift',
        shiftId: shiftB,
        cashierId: cashierA,
        lines: [{ menuItemId: itemA, qty: 1, modifierOptionIds: [] }],
        cashTenderedIDR: 20000,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/tidak ditemukan/i);
  });

  it('server recomputes — client-provided prices are ignored', async () => {
    // The mutation signature only accepts menuItemId/qty/modifierOptionIds
    // from the client. There is no way to pass a price. This test simply
    // re-asserts that totals match the menu, even when the client used the
    // mutation contract correctly.
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const result = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'override',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      cashTenderedIDR: 100000,
      createdAtClient: 1700000000000,
    });
    expect(result.totalIDR).toBe(54000); // 3 * 18000
    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.lines[0].unitPriceIDR).toBe(18000);
    expect(order?.lines[0].lineTotalIDR).toBe(54000);
  });
```

- [ ] **Step 4: Run the validation tests.**

Run: `pnpm test tests/convex/orders.test.ts`
Expected: PASS (all 16 specs). If any fail because the handler's branch is missing or returns the wrong message, fix `convex/orders.ts` minimally to make them pass.

- [ ] **Step 5: Lint + typecheck.**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add convex/orders.ts tests/convex/orders.test.ts
git commit -m "feat(slice-3): orders.createCashSale — idempotency + validation"
```

---

## Task 4: `orders.listForShift` + `orders.getById` queries

**Files:**
- Modify: `convex/orders.ts`
- Modify: `tests/convex/orders.test.ts`

- [ ] **Step 1: Append tests to `tests/convex/orders.test.ts`** in a new `describe` block.

```ts
describe('orders read queries', () => {
  it('listForShift returns shift orders in createdAtClient desc', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const a = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'A',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    const b = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'B',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 2, modifierOptionIds: [] }],
      cashTenderedIDR: 50000,
      createdAtClient: 1700000001000,
    });
    const rows = await asOwner.query(api.orders.listForShift, { shiftId });
    expect(rows.map((r) => r._id)).toEqual([b.orderId, a.orderId]);
    expect(rows[0].totalIDR).toBe(36000);
    expect(rows[1].totalIDR).toBe(18000);
  });

  it('listForShift rejects a shift from another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setup(t, { email: 'a@x.com' });
    const { shiftId: shiftB } = await setup(t, { email: 'b@x.com' });
    await expect(ownerA.query(api.orders.listForShift, { shiftId: shiftB })).rejects.toThrow(
      /tidak ditemukan/i
    );
  });

  it('getById returns null for an order in another cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner: ownerA } = await setup(t, { email: 'a@x.com' });
    const { asOwner: ownerB, shiftId: shiftB, cashierId: cashierB, itemId: itemB } = await setup(t, {
      email: 'b@x.com',
    });
    const created = await ownerB.mutation(api.orders.createCashSale, {
      clientId: 'B-only',
      shiftId: shiftB,
      cashierId: cashierB,
      lines: [{ menuItemId: itemB, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: 1700000000000,
    });
    expect(await ownerA.query(api.orders.getById, { id: created.orderId })).toBeNull();
    const own = await ownerB.query(api.orders.getById, { id: created.orderId });
    expect(own?._id).toBe(created.orderId);
    expect(own?.payment?.method).toBe('cash');
    expect(own?.cashierName).toBe('Andi');
  });
});
```

- [ ] **Step 2: Run — verify they fail (`api.orders.listForShift / getById` not defined).**

Run: `pnpm test tests/convex/orders.test.ts`
Expected: FAIL.

- [ ] **Step 3: Append the two queries to `convex/orders.ts`.**

```ts
const orderSummary = v.object({
  _id: v.id('orders'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  shiftId: v.id('shifts'),
  cashierId: v.id('cafeStaff'),
  clientId: v.string(),
  lines: v.array(
    v.object({
      menuItemId: v.id('menuItems'),
      nameSnapshot: v.string(),
      qty: v.number(),
      unitPriceIDR: v.number(),
      modifiersSnapshot: v.array(
        v.object({
          groupName: v.string(),
          optionName: v.string(),
          priceAdjustmentIDR: v.number(),
        })
      ),
      lineTotalIDR: v.number(),
    })
  ),
  subtotalIDR: v.number(),
  taxRatePct: v.number(),
  taxIDR: v.number(),
  discountIDR: v.number(),
  totalIDR: v.number(),
  paymentMethod: v.union(
    v.literal('cash'),
    v.literal('qris_static'),
    v.literal('qris_dynamic')
  ),
  paymentStatus: v.union(v.literal('pending'), v.literal('paid'), v.literal('void')),
  createdAtClient: v.number(),
  syncedAt: v.optional(v.number()),
});

const orderDetail = v.object({
  ...orderSummary.fields,
  cashierName: v.string(),
  payment: v.union(
    v.object({
      method: v.union(
        v.literal('cash'),
        v.literal('qris_static'),
        v.literal('qris_dynamic')
      ),
      amountIDR: v.number(),
      cashTenderedIDR: v.optional(v.number()),
      changeIDR: v.optional(v.number()),
      confirmedAt: v.optional(v.number()),
    }),
    v.null()
  ),
});

export const listForShift = query({
  args: { shiftId: v.id('shifts') },
  returns: v.array(orderSummary),
  handler: async (ctx, { shiftId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, shiftId, 'Shift');
    const rows = await ctx.db
      .query('orders')
      .withIndex('by_shift', (q) => q.eq('shiftId', shiftId))
      .collect();
    return rows.sort((a, b) => b.createdAtClient - a.createdAtClient);
  },
});

export const getById = query({
  args: { id: v.id('orders') },
  returns: v.union(orderDetail, v.null()),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const order = await ctx.db.get(id);
    if (!order || order.cafeId !== cafeId) return null;
    const cashier = await ctx.db.get(order.cashierId);
    const payment = await ctx.db
      .query('payments')
      .withIndex('by_order', (q) => q.eq('orderId', order._id))
      .unique();
    return {
      ...order,
      cashierName: cashier?.name ?? '—',
      payment: payment
        ? {
            method: payment.method,
            amountIDR: payment.amountIDR,
            cashTenderedIDR: payment.cashTenderedIDR,
            changeIDR: payment.changeIDR,
            confirmedAt: payment.confirmedAt,
          }
        : null,
    };
  },
});
```

- [ ] **Step 4: Codegen + test + commit.**

Run: `pnpm exec convex dev --once && pnpm test tests/convex/orders.test.ts`
Expected: PASS (19 specs total).

```bash
git add convex/orders.ts convex/_generated tests/convex/orders.test.ts
git commit -m "feat(slice-3): orders.listForShift + orders.getById queries"
```

---

## Task 5: `menu.items.listForSale` — items + attached groups in one query

The POS screen needs every active item plus its modifier groups + options in one round-trip. Reuses the existing `menuItemModifierGroups` join logic from `items.getById`.

**Files:**
- Modify: `convex/menu/items.ts`
- Modify: `tests/convex/menu/items.test.ts` (if present — else add a new file `tests/convex/menu/items.listForSale.test.ts`)

- [ ] **Step 1: Locate the existing items test file.**

Run: `ls tests/convex/menu/`
Expected: shows one or more `.test.ts` files. Use `items.test.ts` if it exists, otherwise create `tests/convex/menu/items.listForSale.test.ts`.

- [ ] **Step 2: Add test spec.** (Create file if needed; otherwise append.)

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../../convex/_generated/api';
import schema from '../../../convex/schema';

const modules = import.meta.glob('../../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

describe('menu.items.listForSale', () => {
  it('returns active items with their attached modifier groups + options, sorted by position', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    const espressoId = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Espresso',
      priceIDR: 18000,
    });
    const latteId = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Latte',
      priceIDR: 28000,
    });
    const susuGroupId = await asOwner.mutation(api.menu.modifierGroups.upsert, {
      name: 'Susu',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: 'Reguler', priceAdjustmentIDR: 0, position: 0 },
        { name: 'Oat', priceAdjustmentIDR: 5000, position: 1 },
      ],
    });
    await asOwner.mutation(api.menu.itemGroups.attach, {
      menuItemId: latteId,
      modifierGroupId: susuGroupId,
    });

    const rows = await asOwner.query(api.menu.items.listForSale, {});
    expect(rows).toHaveLength(2);
    const espresso = rows.find((r) => r.item._id === espressoId)!;
    const latte = rows.find((r) => r.item._id === latteId)!;
    expect(espresso.attachedGroups).toEqual([]);
    expect(latte.attachedGroups).toHaveLength(1);
    expect(latte.attachedGroups[0].group.name).toBe('Susu');
    expect(latte.attachedGroups[0].options.map((o) => o.name)).toEqual(['Reguler', 'Oat']);
  });

  it('excludes archived and inactive items', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
    const a = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Active',
      priceIDR: 1000,
    });
    const inactive = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Off',
      priceIDR: 1000,
    });
    await asOwner.mutation(api.menu.items.setActive, { id: inactive, isActive: false });
    const archived = await asOwner.mutation(api.menu.items.create, {
      categoryId,
      name: 'Arsip',
      priceIDR: 1000,
    });
    await asOwner.mutation(api.menu.items.archive, { id: archived });

    const rows = await asOwner.query(api.menu.items.listForSale, {});
    expect(rows.map((r) => r.item._id)).toEqual([a]);
  });
});
```

- [ ] **Step 3: Run — verify it fails.**

Run: `pnpm test tests/convex/menu/items.listForSale.test.ts`
Expected: FAIL — `api.menu.items.listForSale` not defined.

- [ ] **Step 4: Add the query to `convex/menu/items.ts`** — append before the closing of the file.

```ts
const groupWithOptionsForSale = v.object({
  group: modifierGroupDoc,
  options: v.array(modifierOptionDoc),
  position: v.number(),
});

const itemForSale = v.object({
  item: menuItemDoc,
  attachedGroups: v.array(groupWithOptionsForSale),
});

export const listForSale = query({
  args: {},
  returns: v.array(itemForSale),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const items = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    const active = items.filter((i) => i.isActive).sort((a, b) => a.position - b.position);
    const result: Array<{
      item: Doc<'menuItems'>;
      attachedGroups: Array<{
        group: Doc<'modifierGroups'>;
        options: Doc<'modifierOptions'>[];
        position: number;
      }>;
    }> = [];
    for (const item of active) {
      const joins = await ctx.db
        .query('menuItemModifierGroups')
        .withIndex('by_item', (q) => q.eq('menuItemId', item._id))
        .collect();
      joins.sort((a, b) => a.position - b.position);
      const attachedGroups: Array<{
        group: Doc<'modifierGroups'>;
        options: Doc<'modifierOptions'>[];
        position: number;
      }> = [];
      for (const j of joins) {
        const group = await ctx.db.get(j.modifierGroupId);
        if (!group || group.archived) continue;
        const options = await ctx.db
          .query('modifierOptions')
          .withIndex('by_group_active', (q) => q.eq('groupId', group._id).eq('archived', false))
          .collect();
        attachedGroups.push({
          group,
          options: options.sort((a, b) => a.position - b.position),
          position: j.position,
        });
      }
      result.push({ item, attachedGroups });
    }
    return result;
  },
});
```

- [ ] **Step 5: Codegen + test + commit.**

Run: `pnpm exec convex dev --once && pnpm test tests/convex/menu/items.listForSale.test.ts`
Expected: PASS.

```bash
git add convex/menu/items.ts convex/_generated tests/convex/menu/items.listForSale.test.ts
git commit -m "feat(slice-3): menu.items.listForSale — items + attached modifier groups"
```

---

## Task 6: Pure cart reducer + unit tests

Self-contained module, no React imports. Lives in `src/components/sale/cart-reducer.ts`. Eight unit specs verify the rules.

**Files:**
- Create: `src/components/sale/cart-reducer.ts`
- Create: `src/components/sale/cart-reducer.test.ts`

- [ ] **Step 1: Create the reducer file.**

```ts
// src/components/sale/cart-reducer.ts
import type { Id } from 'convex/_generated/dataModel';

export type CartLineModifier = {
  groupName: string;
  optionName: string;
  priceAdjustmentIDR: number;
};

export type CartLine = {
  lineKey: string;
  menuItemId: Id<'menuItems'>;
  nameSnapshot: string;
  qty: number;
  unitPriceIDR: number;
  modifierOptionIds: Array<Id<'modifierOptions'>>;
  modifierLabels: CartLineModifier[];
};

export type CartState = { lines: CartLine[] };

export type CartAction =
  | { type: 'addLine'; line: Omit<CartLine, 'lineKey'>; lineKey: string }
  | { type: 'incrementQty'; lineKey: string }
  | { type: 'decrementQty'; lineKey: string }
  | { type: 'removeLine'; lineKey: string }
  | { type: 'clearCart' };

export const initialCart: CartState = { lines: [] };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'addLine': {
      const incoming = action.line;
      // De-dup only when the line has NO modifiers and an existing line of the
      // same item also has no modifiers. With modifiers, always push a new line
      // because the cashier might intend different selections.
      if (incoming.modifierOptionIds.length === 0) {
        const idx = state.lines.findIndex(
          (l) => l.menuItemId === incoming.menuItemId && l.modifierOptionIds.length === 0
        );
        if (idx !== -1) {
          const merged = { ...state.lines[idx], qty: Math.min(99, state.lines[idx].qty + incoming.qty) };
          const lines = [...state.lines];
          lines[idx] = merged;
          return { lines };
        }
      }
      return {
        lines: [...state.lines, { ...incoming, lineKey: action.lineKey }],
      };
    }
    case 'incrementQty': {
      return {
        lines: state.lines.map((l) =>
          l.lineKey === action.lineKey ? { ...l, qty: Math.min(99, l.qty + 1) } : l
        ),
      };
    }
    case 'decrementQty': {
      const line = state.lines.find((l) => l.lineKey === action.lineKey);
      if (!line) return state;
      if (line.qty <= 1) {
        return { lines: state.lines.filter((l) => l.lineKey !== action.lineKey) };
      }
      return {
        lines: state.lines.map((l) =>
          l.lineKey === action.lineKey ? { ...l, qty: l.qty - 1 } : l
        ),
      };
    }
    case 'removeLine': {
      return { lines: state.lines.filter((l) => l.lineKey !== action.lineKey) };
    }
    case 'clearCart': {
      return initialCart;
    }
  }
}

export function subtotalOf(state: CartState): number {
  return state.lines.reduce((sum, l) => sum + l.qty * l.unitPriceIDR, 0);
}
```

- [ ] **Step 2: Create the test file.**

```ts
// src/components/sale/cart-reducer.test.ts
import { describe, expect, it } from 'vitest';
import type { Id } from 'convex/_generated/dataModel';
import { cartReducer, initialCart, subtotalOf, type CartLine } from './cart-reducer';

const item = 'item-1' as unknown as Id<'menuItems'>;
const item2 = 'item-2' as unknown as Id<'menuItems'>;
const optA = 'opt-a' as unknown as Id<'modifierOptions'>;

function lineFor(menuItemId: Id<'menuItems'>, qty: number, modOptionIds: Id<'modifierOptions'>[] = []): Omit<CartLine, 'lineKey'> {
  return {
    menuItemId,
    nameSnapshot: 'Espresso',
    qty,
    unitPriceIDR: 18000,
    modifierOptionIds: modOptionIds,
    modifierLabels: [],
  };
}

describe('cartReducer', () => {
  it('addLine into empty cart for a no-modifier item creates one line qty 1', () => {
    const state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 1), lineKey: 'k1' });
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0].qty).toBe(1);
  });

  it('addLine again for the same no-modifier item bumps qty on the existing line', () => {
    let state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 1), lineKey: 'k1' });
    state = cartReducer(state, { type: 'addLine', line: lineFor(item, 1), lineKey: 'k2' });
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0].qty).toBe(2);
  });

  it('addLine for the same item WITH modifiers always creates a new line', () => {
    let state = cartReducer(initialCart, {
      type: 'addLine',
      line: lineFor(item, 1, [optA]),
      lineKey: 'k1',
    });
    state = cartReducer(state, {
      type: 'addLine',
      line: lineFor(item, 1, [optA]),
      lineKey: 'k2',
    });
    expect(state.lines).toHaveLength(2);
  });

  it('incrementQty bumps qty and caps at 99', () => {
    let state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 98), lineKey: 'k1' });
    state = cartReducer(state, { type: 'incrementQty', lineKey: 'k1' });
    expect(state.lines[0].qty).toBe(99);
    state = cartReducer(state, { type: 'incrementQty', lineKey: 'k1' });
    expect(state.lines[0].qty).toBe(99);
  });

  it('decrementQty decreases qty', () => {
    let state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 3), lineKey: 'k1' });
    state = cartReducer(state, { type: 'decrementQty', lineKey: 'k1' });
    expect(state.lines[0].qty).toBe(2);
  });

  it('decrementQty at qty 1 removes the line', () => {
    let state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 1), lineKey: 'k1' });
    state = cartReducer(state, { type: 'decrementQty', lineKey: 'k1' });
    expect(state.lines).toHaveLength(0);
  });

  it('removeLine removes the line by lineKey', () => {
    let state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 1), lineKey: 'k1' });
    state = cartReducer(state, { type: 'addLine', line: lineFor(item2, 1), lineKey: 'k2' });
    state = cartReducer(state, { type: 'removeLine', lineKey: 'k1' });
    expect(state.lines.map((l) => l.lineKey)).toEqual(['k2']);
  });

  it('clearCart empties the lines array', () => {
    let state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 1), lineKey: 'k1' });
    state = cartReducer(state, { type: 'clearCart' });
    expect(state.lines).toHaveLength(0);
  });

  it('subtotalOf sums qty * unitPriceIDR across lines', () => {
    let state = cartReducer(initialCart, { type: 'addLine', line: lineFor(item, 2), lineKey: 'k1' });
    state = cartReducer(state, { type: 'addLine', line: lineFor(item2, 1, [optA]), lineKey: 'k2' });
    expect(subtotalOf(state)).toBe(2 * 18000 + 1 * 18000);
  });
});
```

- [ ] **Step 3: Run tests.**

Run: `pnpm test src/components/sale/cart-reducer.test.ts`
Expected: PASS (9 specs — 8 reducer + 1 subtotal).

- [ ] **Step 4: Commit.**

```bash
git add src/components/sale/cart-reducer.ts src/components/sale/cart-reducer.test.ts
git commit -m "feat(slice-3): pure cart reducer + unit specs"
```

---

## Task 7: `<ShiftGate>` + `/sale` route shell

A reusable shift gate (reactive — closing the shift in another tab redirects this one) wraps the new sale routes.

**Files:**
- Create: `src/components/shift/shift-gate.tsx`
- Create: `src/routes/_pos/sale/route.tsx`
- Create: `src/routes/_pos/sale/index.tsx` (placeholder; SaleScreen wired in Task 8)

- [ ] **Step 1: Create `src/components/shift/shift-gate.tsx`.**

```tsx
import { Navigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import type { ReactNode } from 'react';
import { Spinner } from '~/components/ui/spinner';

export function ShiftGate({ children }: { children: ReactNode }) {
  const current = useQuery(api.shifts.current, {});
  if (current === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-2 text-fg-muted">
        <Spinner />
        <span>Memuat shift…</span>
      </div>
    );
  }
  if (current === null) {
    return <Navigate to="/shift/open" replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 2: Create `src/routes/_pos/sale/route.tsx`.**

```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { PinGate } from '~/components/staff/pin-gate';
import { ShiftGate } from '~/components/shift/shift-gate';

export const Route = createFileRoute('/_pos/sale')({
  component: SaleLayout,
});

function SaleLayout() {
  return (
    <PinGate>
      <ShiftGate>
        <Outlet />
      </ShiftGate>
    </PinGate>
  );
}
```

- [ ] **Step 3: Create `src/routes/_pos/sale/index.tsx` placeholder.**

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_pos/sale/')({
  component: SaleIndex,
});

function SaleIndex() {
  return <div className="p-6 text-fg-muted">Sale screen — coming up next.</div>;
}
```

- [ ] **Step 4: Regenerate route tree.**

Run: `pnpm dev` in one terminal (or `pnpm exec tsr generate` if that script exists; check `package.json`). The route tree file `src/routeTree.gen.ts` is auto-generated when the dev server runs. Alternatively let the next `pnpm typecheck` flush it.

Run: `pnpm typecheck`
Expected: PASS (route tree updated).

- [ ] **Step 5: Quick manual smoke — start dev server and verify `/sale` lands on shift gate (or pin gate) without crashing.**

This is optional but recommended. Run `pnpm dev:all`, sign in, visit `/sale`. With no PIN: redirect to `/pin`. With PIN but no shift: redirect to `/shift/open`. With shift: see the placeholder text. Stop the server.

- [ ] **Step 6: Commit.**

```bash
git add src/components/shift/shift-gate.tsx src/routes/_pos/sale src/routeTree.gen.ts
git commit -m "feat(slice-3): /sale route shell + ShiftGate component"
```

---

## Task 8: `<SaleScreen>` + `<MenuPane>` + `<ItemCard>` — quick-add for no-modifier items

This task wires the composition root + the menu side of the screen. Modifier items show a "Pilihan" badge but tapping them is a no-op until Task 10 (modifier dialog).

**Files:**
- Create: `src/components/sale/sale-screen.tsx`
- Create: `src/components/sale/menu-pane.tsx`
- Create: `src/components/sale/item-card.tsx`
- Modify: `src/routes/_pos/sale/index.tsx` — render `<SaleScreen>`

- [ ] **Step 1: Create `src/components/sale/item-card.tsx`.**

```tsx
import type { Doc } from 'convex/_generated/dataModel';
import { formatIDR } from '~/lib/money';

export function ItemCard({
  item,
  hasModifiers,
  onTap,
}: {
  item: Doc<'menuItems'>;
  hasModifiers: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="text-left rounded-md border border-border bg-bg p-3 hover:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <div className="font-medium leading-tight">{item.name}</div>
      <div className="text-sm text-fg-muted mt-1">{formatIDR(item.priceIDR)}</div>
      {hasModifiers ? (
        <div className="mt-2 inline-block text-[10px] uppercase tracking-wide text-brand-700 bg-brand-50 rounded px-1.5 py-0.5">
          Pilihan
        </div>
      ) : null}
    </button>
  );
}
```

- [ ] **Step 2: Create `src/components/sale/menu-pane.tsx`.**

```tsx
import type { Doc, Id } from 'convex/_generated/dataModel';
import { useMemo, useState } from 'react';
import { ItemCard } from './item-card';

export type ItemForSale = {
  item: Doc<'menuItems'>;
  attachedGroups: Array<{
    group: Doc<'modifierGroups'>;
    options: Doc<'modifierOptions'>[];
    position: number;
  }>;
};

export function MenuPane({
  categories,
  items,
  onItemTap,
}: {
  categories: Doc<'categories'>[];
  items: ItemForSale[];
  onItemTap: (item: ItemForSale) => void;
}) {
  const [activeCategoryId, setActiveCategoryId] = useState<Id<'categories'> | 'all'>('all');
  const visible = useMemo(() => {
    if (activeCategoryId === 'all') return items;
    return items.filter((row) => row.item.categoryId === activeCategoryId);
  }, [items, activeCategoryId]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 overflow-x-auto px-3 py-2 border-b border-border">
        <CategoryTab
          label={`Semua (${items.length})`}
          active={activeCategoryId === 'all'}
          onClick={() => setActiveCategoryId('all')}
        />
        {categories.map((c) => {
          const count = items.filter((r) => r.item.categoryId === c._id).length;
          return (
            <CategoryTab
              key={c._id}
              label={`${c.name} (${count})`}
              active={activeCategoryId === c._id}
              onClick={() => setActiveCategoryId(c._id)}
            />
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {visible.length === 0 ? (
          <p className="text-fg-muted text-sm">Tidak ada item di kategori ini.</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {visible.map((row) => (
              <ItemCard
                key={row.item._id}
                item={row.item}
                hasModifiers={row.attachedGroups.length > 0}
                onTap={() => onItemTap(row)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 text-sm px-3 py-1.5 rounded-md ${
        active
          ? 'bg-brand-600 text-white'
          : 'bg-surface text-fg-muted hover:bg-bg hover:text-fg'
      }`}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 3: Create `src/components/sale/sale-screen.tsx`.**

```tsx
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { useReducer } from 'react';
import { Spinner } from '~/components/ui/spinner';
import { cartReducer, initialCart } from './cart-reducer';
import { MenuPane, type ItemForSale } from './menu-pane';

function genLineKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SaleScreen() {
  const categories = useQuery(api.menu.categories.list, {});
  const items = useQuery(api.menu.items.listForSale, {});
  const [_cart, dispatch] = useReducer(cartReducer, initialCart);

  if (categories === undefined || items === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-2 text-fg-muted">
        <Spinner />
        <span>Memuat menu…</span>
      </div>
    );
  }

  function onItemTap(row: ItemForSale) {
    if (row.attachedGroups.length > 0) {
      // Modifier dialog wired in Task 10. No-op for now.
      return;
    }
    dispatch({
      type: 'addLine',
      lineKey: genLineKey(),
      line: {
        menuItemId: row.item._id,
        nameSnapshot: row.item.name,
        qty: 1,
        unitPriceIDR: row.item.priceIDR,
        modifierOptionIds: [],
        modifierLabels: [],
      },
    });
  }

  return (
    <div className="grid grid-cols-[1fr_minmax(320px,30%)] h-[calc(100vh-3rem)]">
      <MenuPane categories={categories} items={items} onItemTap={onItemTap} />
      <aside className="border-l border-border p-3 overflow-y-auto">
        <h2 className="text-sm font-semibold mb-2">Pesanan</h2>
        <p className="text-fg-muted text-sm">Cart pane — wired in Task 9.</p>
      </aside>
    </div>
  );
}
```

- [ ] **Step 4: Replace placeholder in `src/routes/_pos/sale/index.tsx`.**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { SaleScreen } from '~/components/sale/sale-screen';

export const Route = createFileRoute('/_pos/sale/')({
  component: SaleIndex,
});

function SaleIndex() {
  return <SaleScreen />;
}
```

- [ ] **Step 5: Typecheck.**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/components/sale src/routes/_pos/sale/index.tsx
git commit -m "feat(slice-3): SaleScreen + MenuPane + ItemCard (no-mod quick-add)"
```

---

## Task 9: `<CartPane>` + `<CartLineRow>`

**Files:**
- Create: `src/components/sale/cart-pane.tsx`
- Create: `src/components/sale/cart-line-row.tsx`
- Modify: `src/components/sale/sale-screen.tsx` — wire `<CartPane>`

- [ ] **Step 1: Create `src/components/sale/cart-line-row.tsx`.**

```tsx
import type { CartLine } from './cart-reducer';
import { Button } from '~/components/ui/button';
import { formatIDR } from '~/lib/money';

export function CartLineRow({
  line,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  line: CartLine;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="border-b border-border py-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium leading-tight">{line.nameSnapshot}</div>
        <div className="text-sm tabular-nums">{formatIDR(line.qty * line.unitPriceIDR)}</div>
      </div>
      {line.modifierLabels.length > 0 ? (
        <ul className="text-xs text-fg-muted mt-0.5">
          {line.modifierLabels.map((m, i) => (
            <li key={`${line.lineKey}-mod-${i}`}>
              • {m.groupName}: {m.optionName}
              {m.priceAdjustmentIDR > 0 ? ` (+${formatIDR(m.priceAdjustmentIDR)})` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center justify-between mt-1.5">
        <div className="text-xs text-fg-muted">{formatIDR(line.unitPriceIDR)} / item</div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onDecrement}
            aria-label="Kurangi jumlah"
          >
            −
          </Button>
          <span className="w-7 text-center text-sm tabular-nums" aria-label={`Jumlah ${line.qty}`}>
            {line.qty}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onIncrement}
            aria-label="Tambah jumlah"
            disabled={line.qty >= 99}
          >
            +
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onRemove}
            aria-label="Hapus baris"
            className="text-fg-muted hover:text-red-600"
          >
            ×
          </Button>
        </div>
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Create `src/components/sale/cart-pane.tsx`.**

```tsx
import { Button } from '~/components/ui/button';
import { formatIDR } from '~/lib/money';
import type { CartAction, CartState } from './cart-reducer';
import { CartLineRow } from './cart-line-row';

export function CartPane({
  cart,
  dispatch,
  taxEnabled,
  taxRatePct,
  onBayar,
  onKosongkan,
}: {
  cart: CartState;
  dispatch: (a: CartAction) => void;
  taxEnabled: boolean;
  taxRatePct: number;
  onBayar: () => void;
  onKosongkan: () => void;
}) {
  const subtotal = cart.lines.reduce((s, l) => s + l.qty * l.unitPriceIDR, 0);
  const tax = taxEnabled ? Math.round((subtotal * taxRatePct) / 100) : 0;
  const total = subtotal + tax;
  const empty = cart.lines.length === 0;

  return (
    <aside className="border-l border-border flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h2 className="text-sm font-semibold">Pesanan ({cart.lines.length})</h2>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onKosongkan}
          disabled={empty}
          className="text-fg-muted"
        >
          Kosongkan
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-3">
        {empty ? (
          <p className="text-fg-muted text-sm mt-6 text-center">Belum ada item.</p>
        ) : (
          <ul>
            {cart.lines.map((line) => (
              <CartLineRow
                key={line.lineKey}
                line={line}
                onIncrement={() => dispatch({ type: 'incrementQty', lineKey: line.lineKey })}
                onDecrement={() => dispatch({ type: 'decrementQty', lineKey: line.lineKey })}
                onRemove={() => dispatch({ type: 'removeLine', lineKey: line.lineKey })}
              />
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-border px-3 py-3 space-y-1 text-sm">
        <Row label="Subtotal" value={formatIDR(subtotal)} />
        {taxEnabled ? <Row label={`PPN ${taxRatePct}%`} value={formatIDR(tax)} /> : null}
        <Row label="Total" value={formatIDR(total)} bold large />
        <Button
          type="button"
          onClick={onBayar}
          disabled={empty}
          className="w-full mt-2"
          size="lg"
        >
          Bayar
        </Button>
      </div>
    </aside>
  );
}

function Row({ label, value, bold, large }: { label: string; value: string; bold?: boolean; large?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : ''} ${large ? 'text-base' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
```

- [ ] **Step 3: Replace `src/components/sale/sale-screen.tsx`** to wire the cart pane. Note the cart total currently has no `Bayar` target (Task 11 hooks the cash dialog); for this task `onBayar` opens a `console.log` stub.

```tsx
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { useReducer, useState } from 'react';
import { Spinner } from '~/components/ui/spinner';
import { ConfirmArchive } from '~/components/menu/confirm-archive';
import { cartReducer, initialCart } from './cart-reducer';
import { CartPane } from './cart-pane';
import { MenuPane, type ItemForSale } from './menu-pane';

function genLineKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SaleScreen() {
  const categories = useQuery(api.menu.categories.list, {});
  const items = useQuery(api.menu.items.listForSale, {});
  const cafe = useQuery(api.cafes.myCafe, {});
  const [cart, dispatch] = useReducer(cartReducer, initialCart);
  const [clearOpen, setClearOpen] = useState(false);

  if (categories === undefined || items === undefined || cafe === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-2 text-fg-muted">
        <Spinner />
        <span>Memuat menu…</span>
      </div>
    );
  }

  function onItemTap(row: ItemForSale) {
    if (row.attachedGroups.length > 0) return; // wired in Task 10
    dispatch({
      type: 'addLine',
      lineKey: genLineKey(),
      line: {
        menuItemId: row.item._id,
        nameSnapshot: row.item.name,
        qty: 1,
        unitPriceIDR: row.item.priceIDR,
        modifierOptionIds: [],
        modifierLabels: [],
      },
    });
  }

  return (
    <div className="grid grid-cols-[1fr_minmax(320px,30%)] h-[calc(100vh-3rem)]">
      <MenuPane categories={categories} items={items} onItemTap={onItemTap} />
      <CartPane
        cart={cart}
        dispatch={dispatch}
        taxEnabled={cafe?.taxEnabled === true}
        taxRatePct={cafe?.taxRatePct ?? 0}
        onBayar={() => {
          /* wired in Task 11 */
          console.warn('Bayar — wired in Task 11');
        }}
        onKosongkan={() => setClearOpen(true)}
      />
      <ConfirmArchive
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Kosongkan keranjang?"
        description="Semua item akan dihapus dari pesanan ini."
        confirmLabel="Kosongkan"
        onConfirm={() => {
          dispatch({ type: 'clearCart' });
          setClearOpen(false);
        }}
      />
    </div>
  );
}
```

> Note: `<ConfirmArchive>` is the existing shadcn AlertDialog wrapper from Slice 1. If its prop signature differs from the call above, open `src/components/menu/confirm-archive.tsx` and adapt (the wrapper is small).

- [ ] **Step 4: Typecheck + commit.**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add src/components/sale src/routes/_pos/sale/index.tsx
git commit -m "feat(slice-3): CartPane + CartLineRow (qty stepper + remove)"
```

---

## Task 10: `<ModifierPickerDialog>`

**Files:**
- Create: `src/components/sale/modifier-picker-dialog.tsx`
- Modify: `src/components/sale/sale-screen.tsx` — open on items with modifiers

- [ ] **Step 1: Create `src/components/sale/modifier-picker-dialog.tsx`.**

```tsx
import type { Id } from 'convex/_generated/dataModel';
import { useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { formatIDR } from '~/lib/money';
import type { CartLineModifier } from './cart-reducer';
import type { ItemForSale } from './menu-pane';

export type ModifierPickResult = {
  qty: number;
  modifierOptionIds: Id<'modifierOptions'>[];
  modifierLabels: CartLineModifier[];
  unitPriceIDR: number;
};

export function ModifierPickerDialog({
  open,
  onOpenChange,
  row,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ItemForSale | null;
  onConfirm: (pick: ModifierPickResult) => void;
}) {
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [qty, setQty] = useState(1);

  // Reset on open/close.
  // biome-ignore lint/correctness/useExhaustiveDependencies: row id is the key
  // that determines a "fresh" dialog state.
  useMemo(() => {
    if (open) {
      setSelected({});
      setQty(1);
    }
  }, [open, row?.item._id]);

  if (!row) return null;

  function toggle(groupId: string, optionId: string, maxSelect: number) {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[groupId] ?? []);
      if (set.has(optionId)) {
        set.delete(optionId);
      } else {
        if (maxSelect === 1) {
          set.clear();
        }
        if (set.size >= maxSelect) {
          // Already at cap; tapping a new chip on max>1 group is a no-op.
          return prev;
        }
        set.add(optionId);
      }
      next[groupId] = set;
      return next;
    });
  }

  const adjustments: CartLineModifier[] = [];
  let allRequiredSatisfied = true;
  for (const ag of row.attachedGroups) {
    const set = selected[ag.group._id] ?? new Set<string>();
    if (set.size < ag.group.minSelect || set.size > ag.group.maxSelect) {
      allRequiredSatisfied = false;
    }
    for (const opt of ag.options) {
      if (set.has(opt._id)) {
        adjustments.push({
          groupName: ag.group.name,
          optionName: opt.name,
          priceAdjustmentIDR: opt.priceAdjustmentIDR,
        });
      }
    }
  }
  const unitPriceIDR =
    row.item.priceIDR + adjustments.reduce((s, m) => s + m.priceAdjustmentIDR, 0);

  function submit() {
    const ids: Id<'modifierOptions'>[] = [];
    for (const ag of row.attachedGroups) {
      const set = selected[ag.group._id] ?? new Set<string>();
      for (const opt of ag.options) {
        if (set.has(opt._id)) ids.push(opt._id);
      }
    }
    onConfirm({ qty, modifierOptionIds: ids, modifierLabels: adjustments, unitPriceIDR });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row.item.name}</DialogTitle>
          <p className="text-sm text-fg-muted">Harga dasar {formatIDR(row.item.priceIDR)}</p>
        </DialogHeader>
        <div className="space-y-4 max-h-[50vh] overflow-y-auto">
          {row.attachedGroups.map((ag) => {
            const isRequired = ag.group.required || ag.group.minSelect >= 1;
            return (
              <div key={ag.group._id}>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-medium">{ag.group.name}</h3>
                  <span className="text-xs text-fg-muted">
                    {isRequired
                      ? `Wajib (pilih ${ag.group.minSelect}${
                          ag.group.maxSelect > ag.group.minSelect ? `–${ag.group.maxSelect}` : ''
                        })`
                      : `Opsional (maks ${ag.group.maxSelect})`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {ag.options.map((opt) => {
                    const checked = selected[ag.group._id]?.has(opt._id) ?? false;
                    return (
                      <button
                        type="button"
                        key={opt._id}
                        onClick={() => toggle(ag.group._id, opt._id, ag.group.maxSelect)}
                        className={`text-sm px-3 py-1.5 rounded-full border ${
                          checked
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-bg text-fg border-border hover:border-brand-400'
                        }`}
                      >
                        {opt.name}
                        {opt.priceAdjustmentIDR > 0
                          ? ` (+${formatIDR(opt.priceAdjustmentIDR)})`
                          : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <span className="text-sm">Jumlah</span>
            <div className="flex items-center gap-1 ml-auto">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </Button>
              <span className="w-7 text-center tabular-nums">{qty}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setQty((q) => Math.min(99, q + 1))}
              >
                +
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between">
          <div className="text-sm">
            Total <span className="font-semibold tabular-nums">{formatIDR(qty * unitPriceIDR)}</span>
          </div>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Batal
              </Button>
            </DialogClose>
            <Button type="button" onClick={submit} disabled={!allRequiredSatisfied}>
              Tambah ke pesanan
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

> Note: if `~/components/ui/dialog.tsx` does not export `DialogHeader` / `DialogFooter` / `DialogTitle`, check the file and import the exact names it does export (Radix wrappers sometimes ship without these — in that case, write the header/footer inline as `<div className="...">`).

- [ ] **Step 2: Wire it into `SaleScreen`.** Edit `src/components/sale/sale-screen.tsx`:

```tsx
import { ModifierPickerDialog } from './modifier-picker-dialog';
// ...
const [pickerRow, setPickerRow] = useState<ItemForSale | null>(null);
// ...
function onItemTap(row: ItemForSale) {
  if (row.attachedGroups.length > 0) {
    setPickerRow(row);
    return;
  }
  dispatch({
    type: 'addLine',
    lineKey: genLineKey(),
    line: {
      menuItemId: row.item._id,
      nameSnapshot: row.item.name,
      qty: 1,
      unitPriceIDR: row.item.priceIDR,
      modifierOptionIds: [],
      modifierLabels: [],
    },
  });
}
// And in JSX, before closing tag:
<ModifierPickerDialog
  open={pickerRow !== null}
  onOpenChange={(open) => {
    if (!open) setPickerRow(null);
  }}
  row={pickerRow}
  onConfirm={(pick) => {
    if (!pickerRow) return;
    dispatch({
      type: 'addLine',
      lineKey: genLineKey(),
      line: {
        menuItemId: pickerRow.item._id,
        nameSnapshot: pickerRow.item.name,
        qty: pick.qty,
        unitPriceIDR: pick.unitPriceIDR,
        modifierOptionIds: pick.modifierOptionIds,
        modifierLabels: pick.modifierLabels,
      },
    });
    setPickerRow(null);
  }}
/>
```

- [ ] **Step 3: Typecheck + commit.**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add src/components/sale
git commit -m "feat(slice-3): ModifierPickerDialog with live total + required-group gating"
```

---

## Task 11: `<CashPaymentDialog>` — denominations + numpad + `clientId`

**Files:**
- Create: `src/components/sale/cash-payment-dialog.tsx`
- Modify: `src/components/sale/sale-screen.tsx` — open on Bayar; call mutation; capture orderId for receipt

- [ ] **Step 1: Create `src/components/sale/cash-payment-dialog.tsx`.**

```tsx
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';
import type { CartState } from './cart-reducer';

function genUUID(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function computeDenominations(total: number): number[] {
  const nextFive = Math.ceil(total / 5000) * 5000;
  const nextHundred = Math.max(100000, Math.ceil(total / 100000) * 100000);
  const out: number[] = [total];
  if (nextFive !== total) out.push(nextFive);
  if (!out.includes(nextHundred)) out.push(nextHundred);
  const fourth = nextHundred + 100000;
  if (!out.includes(fourth)) out.push(fourth);
  return out.slice(0, 4);
}

export function CashPaymentDialog({
  open,
  onOpenChange,
  totalIDR,
  cart,
  shiftId,
  cashierId,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  totalIDR: number;
  cart: CartState;
  shiftId: Id<'shifts'>;
  cashierId: Id<'cafeStaff'>;
  onPaid: (orderId: Id<'orders'>, totalIDR: number, changeIDR: number) => void;
}) {
  const createCashSale = useMutation(api.orders.createCashSale);
  const [tendered, setTendered] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientIdRef = useRef<string>('');

  // Generate clientId once when the dialog opens; reset on close.
  useEffect(() => {
    if (open) {
      clientIdRef.current = genUUID();
      setTendered('');
      setError(null);
    }
  }, [open]);

  const tenderedNum = useMemo(() => {
    if (!tendered) return 0;
    const n = Number.parseInt(tendered, 10);
    return Number.isFinite(n) ? n : 0;
  }, [tendered]);
  const changeNum = tenderedNum - totalIDR;
  const denoms = computeDenominations(totalIDR);

  async function confirm() {
    if (tenderedNum < totalIDR || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createCashSale({
        clientId: clientIdRef.current,
        shiftId,
        cashierId,
        lines: cart.lines.map((l) => ({
          menuItemId: l.menuItemId,
          qty: l.qty,
          modifierOptionIds: l.modifierOptionIds,
        })),
        cashTenderedIDR: tenderedNum,
        createdAtClient: Date.now(),
      });
      onPaid(result.orderId, result.totalIDR, result.changeIDR);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses pembayaran.');
    } finally {
      setSubmitting(false);
    }
  }

  function pressKey(key: string) {
    if (key === '⌫') {
      setTendered((s) => s.slice(0, -1));
    } else {
      setTendered((s) => (s + key).slice(0, 12));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pembayaran Tunai</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-surface px-3 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wide text-fg-muted">Total tagihan</div>
            <div className="text-2xl font-semibold text-brand-700 tabular-nums">
              {formatIDR(totalIDR)}
            </div>
          </div>

          <div
            className={`rounded-md border-2 px-3 py-2 text-right font-mono text-2xl tabular-nums ${
              tenderedNum >= totalIDR && tenderedNum > 0
                ? 'border-brand-600 bg-brand-50 text-brand-800'
                : 'border-border text-fg'
            }`}
          >
            {tenderedNum > 0 ? tenderedNum.toLocaleString('id-ID') : '0'}
          </div>
          <div className="flex justify-between text-xs px-1">
            <span className="text-fg-muted">Kembalian</span>
            <span className="font-semibold tabular-nums">
              {changeNum >= 0 ? formatIDR(changeNum) : '—'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {denoms.map((d, i) => (
              <button
                type="button"
                key={`${d}-${i}`}
                onClick={() => setTendered(String(d))}
                className="text-xs px-2 py-2 rounded-md border border-border bg-bg hover:bg-surface"
              >
                {d === totalIDR ? 'Pas' : `${(d / 1000).toLocaleString('id-ID')}k`}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '000', '⌫'].map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => pressKey(k)}
                className="text-base px-2 py-3 rounded-md border border-border bg-bg hover:bg-surface font-medium"
              >
                {k}
              </button>
            ))}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button
            type="button"
            onClick={confirm}
            disabled={tenderedNum < totalIDR || submitting}
            className="w-full"
            size="lg"
          >
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            {submitting ? 'Memproses…' : 'Konfirmasi'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire `<CashPaymentDialog>` into `<SaleScreen>`** (and the active-cashier + shift). Patch `src/components/sale/sale-screen.tsx`:

```tsx
import { useActiveCashier } from '~/lib/active-cashier';
import { CashPaymentDialog } from './cash-payment-dialog';
// ...
const { cashierId } = useActiveCashier();
const shift = useQuery(api.shifts.current, {});
const [paymentOpen, setPaymentOpen] = useState(false);
// ...
// In the loading branch, also wait on `shift === undefined`.
// onBayar={() => setPaymentOpen(true)}
// And in the JSX:
{shift && cashierId ? (
  <CashPaymentDialog
    open={paymentOpen}
    onOpenChange={setPaymentOpen}
    totalIDR={
      cart.lines.reduce((s, l) => s + l.qty * l.unitPriceIDR, 0) +
      (cafe?.taxEnabled
        ? Math.round(
            (cart.lines.reduce((s, l) => s + l.qty * l.unitPriceIDR, 0) *
              (cafe.taxRatePct ?? 0)) /
              100
          )
        : 0)
    }
    cart={cart}
    shiftId={shift._id}
    cashierId={cashierId}
    onPaid={(orderId, totalIDR, changeIDR) => {
      // ReceiptPreview hooked in Task 12; for now log + clear.
      console.warn('paid', orderId, totalIDR, changeIDR);
      dispatch({ type: 'clearCart' });
    }}
  />
) : null}
```

- [ ] **Step 3: Typecheck + commit.**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add src/components/sale
git commit -m "feat(slice-3): CashPaymentDialog — chips, numpad, idempotent clientId"
```

---

## Task 12: `<ReceiptPreview>` + print CSS + post-payment flow

**Files:**
- Create: `src/components/sale/receipt-preview.tsx`
- Create: `src/styles/print.css`
- Modify: wherever globals are imported (likely `src/styles/app.css` or the root layout) — add `@import './print.css';`
- Modify: `src/components/sale/sale-screen.tsx` — open `<ReceiptPreview>` after payment

- [ ] **Step 1: Create `src/styles/print.css`.**

```css
@media print {
  body * {
    visibility: hidden;
  }
  [data-print-receipt],
  [data-print-receipt] * {
    visibility: visible;
  }
  [data-print-receipt] {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
  }
}
```

- [ ] **Step 2: Wire the import.**

Run: `grep -n "@import" src/styles/*.css`
Then add `@import './print.css';` to whichever file currently imports the global stylesheet (likely `src/styles/app.css`). If no global stylesheet exists, locate the root CSS imported by `src/routes/__root.tsx` and append the import there.

- [ ] **Step 3: Create `src/components/sale/receipt-preview.tsx`.**

```tsx
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent } from '~/components/ui/dialog';
import { formatIDR } from '~/lib/money';

export function ReceiptPreview({
  open,
  onOpenChange,
  orderId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: Id<'orders'> | null;
  onDone: () => void;
}) {
  const cafe = useQuery(api.cafes.myCafe, {});
  const order = useQuery(api.orders.getById, orderId ? { id: orderId } : 'skip');

  if (!orderId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {order === undefined || cafe === undefined ? (
          <p className="text-fg-muted">Memuat struk…</p>
        ) : !order ? (
          <p className="text-red-600">Pesanan tidak ditemukan.</p>
        ) : (
          <div data-print-receipt className="font-mono text-sm">
            <div className="text-center mb-3">
              <div className="font-semibold">{cafe?.name}</div>
              <div className="text-xs text-fg-muted">
                {new Date(order.createdAtClient).toLocaleString('id-ID')}
              </div>
              <div className="text-xs text-fg-muted">Kasir: {order.cashierName}</div>
            </div>
            <hr className="border-dashed border-border my-2" />
            {order.lines.map((line, i) => (
              <div key={`${order._id}-line-${i}`} className="mb-1.5">
                <div className="flex justify-between">
                  <span>
                    {line.qty}× {line.nameSnapshot}
                  </span>
                  <span className="tabular-nums">{formatIDR(line.lineTotalIDR)}</span>
                </div>
                {line.modifiersSnapshot.length > 0 ? (
                  <ul className="text-xs text-fg-muted ml-3">
                    {line.modifiersSnapshot.map((m, j) => (
                      <li key={`${order._id}-line-${i}-mod-${j}`}>
                        + {m.groupName}: {m.optionName}
                        {m.priceAdjustmentIDR > 0 ? ` (+${formatIDR(m.priceAdjustmentIDR)})` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
            <hr className="border-dashed border-border my-2" />
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatIDR(order.subtotalIDR)}</span>
            </div>
            {order.taxIDR > 0 ? (
              <div className="flex justify-between">
                <span>PPN {order.taxRatePct}%</span>
                <span className="tabular-nums">{formatIDR(order.taxIDR)}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span className="tabular-nums">{formatIDR(order.totalIDR)}</span>
            </div>
            {order.payment?.method === 'cash' ? (
              <>
                <div className="flex justify-between mt-1">
                  <span>Tunai</span>
                  <span className="tabular-nums">{formatIDR(order.payment.cashTenderedIDR ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Kembalian</span>
                  <span className="tabular-nums">{formatIDR(order.payment.changeIDR ?? 0)}</span>
                </div>
              </>
            ) : null}
          </div>
        )}
        <div className="flex gap-2 justify-end mt-4">
          <Button type="button" variant="outline" onClick={() => window.print()}>
            Cetak
          </Button>
          <Button type="button" onClick={onDone}>
            Selesai
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Wire ReceiptPreview into SaleScreen.** Replace the temporary `console.warn('paid', …)` in `src/components/sale/sale-screen.tsx`:

```tsx
import { ReceiptPreview } from './receipt-preview';
// ...
const [receiptOrderId, setReceiptOrderId] = useState<Id<'orders'> | null>(null);
// ...
// In onPaid:
onPaid={(orderId) => {
  setReceiptOrderId(orderId);
  dispatch({ type: 'clearCart' });
}}
// And JSX:
<ReceiptPreview
  open={receiptOrderId !== null}
  onOpenChange={(open) => {
    if (!open) setReceiptOrderId(null);
  }}
  orderId={receiptOrderId}
  onDone={() => setReceiptOrderId(null)}
/>
```

Add the missing `Id` import: `import type { Id } from 'convex/_generated/dataModel';`.

- [ ] **Step 5: Typecheck + commit.**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add src/components/sale src/styles/print.css src/styles
git commit -m "feat(slice-3): ReceiptPreview + print CSS + post-payment flow"
```

---

## Task 13: `/history` route

**Files:**
- Create: `src/routes/_pos/history.tsx`

- [ ] **Step 1: Create the file.**

```tsx
import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { useState } from 'react';
import { PinGate } from '~/components/staff/pin-gate';
import { ReceiptPreview } from '~/components/sale/receipt-preview';
import { ShiftGate } from '~/components/shift/shift-gate';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/history')({
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <PinGate>
      <ShiftGate>
        <HistoryList />
      </ShiftGate>
    </PinGate>
  );
}

function HistoryList() {
  const shift = useQuery(api.shifts.current, {});
  const [openId, setOpenId] = useState<Id<'orders'> | null>(null);
  const orders = useQuery(
    api.orders.listForShift,
    shift ? { shiftId: shift._id } : 'skip'
  );

  if (shift === undefined || orders === undefined) {
    return (
      <div className="p-6 flex gap-2 text-fg-muted items-center">
        <Spinner />
        <span>Memuat riwayat…</span>
      </div>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Riwayat shift ini</h1>
        <Link to="/sale" className="text-sm underline text-brand-700">
          Kembali ke /sale
        </Link>
      </div>
      {orders.length === 0 ? (
        <p className="text-fg-muted">Belum ada pesanan di shift ini.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md">
          {orders.map((o) => (
            <li key={o._id}>
              <button
                type="button"
                onClick={() => setOpenId(o._id)}
                className="w-full text-left p-3 hover:bg-surface"
              >
                <div className="flex justify-between">
                  <span className="text-sm">
                    {new Date(o.createdAtClient).toLocaleTimeString('id-ID')}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatIDR(o.totalIDR)}
                  </span>
                </div>
                <div className="text-xs text-fg-muted mt-0.5">
                  {o.lines.length} item · {o.paymentMethod === 'cash' ? 'Tunai' : o.paymentMethod}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ReceiptPreview
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        orderId={openId}
        onDone={() => setOpenId(null)}
      />
    </main>
  );
}
```

- [ ] **Step 2: Typecheck.**

Run: `pnpm typecheck`
Expected: PASS (route tree picks up `/history`).

- [ ] **Step 3: Commit.**

```bash
git add src/routes/_pos/history.tsx src/routeTree.gen.ts
git commit -m "feat(slice-3): /history — today's orders + receipt drawer"
```

---

## Task 14: Auth-gated E2E happy path

**Files:**
- Create: `tests/e2e/sale.spec.ts`

- [ ] **Step 1: Create the spec.**

```ts
import { expect, test } from '@playwright/test';
import { gotoHydrated, waitForUrlHydrated } from './_helpers';

test.describe('sale (auth-gated)', () => {
  test.skip(!process.env.RUN_AUTH_E2E, 'set RUN_AUTH_E2E=1 to run');
  test.setTimeout(180_000);

  test('signup → onboarding → PIN → open shift → cash sale → history', async ({ page }) => {
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Owner');
    await page.getByLabel('Nama kafe').fill('Kopi E2E S3');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    // Onboarding: profile (PPN 11)
    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByLabel('Persentase PPN').fill('11');
    await page.getByRole('button', { name: /Lanjut/ }).click();

    // Onboarding: menu — add category + item
    await waitForUrlHydrated(page, /\/onboarding\/menu$/);
    await page.getByRole('button', { name: /Mulai dengan kategori/ }).click();
    await waitForUrlHydrated(page, /\/menu\/categories$/);
    await page.getByLabel('Nama kategori baru').fill('Kopi');
    await page.getByRole('button', { name: /\+ Tambah/ }).click();
    await page.getByRole('link', { name: 'Items' }).click();
    await page.getByRole('link', { name: /\+ Item/ }).click();
    await page.getByLabel('Nama').fill('Espresso');
    await page.getByLabel('Kategori').selectOption({ label: 'Kopi' });
    await page.getByLabel('Harga (Rp)').fill('18000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // Onboarding: cashier (PIN)
    await page.goto('/onboarding/cashier');
    await waitForUrlHydrated(page, /\/onboarding\/cashier$/);
    await page.getByRole('button', { name: /Atur PIN/ }).click();
    for (const digit of '1234') {
      await page.keyboard.type(digit);
    }
    await expect(page.getByRole('button', { name: /Ganti PIN/ })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /Selesai/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // Hit /sale → PIN gate → enter PIN.
    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/pin$/);
    await page.getByRole('button', { name: /E2E Owner/ }).click();
    for (const digit of '1234') {
      await page.keyboard.type(digit);
    }

    // ShiftGate redirects to /shift/open. Open shift Rp 100.000.
    await waitForUrlHydrated(page, /\/shift\/open$/);
    await page.getByLabel('Modal awal').fill('100000');
    await page.getByRole('button', { name: /Buka Shift/ }).click();
    await waitForUrlHydrated(page, /\/shift\/close$/);

    // Now hit /sale again.
    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/sale$/);

    // Tap Espresso tile.
    await page.getByRole('button', { name: /Espresso/ }).click();
    // Cart shows Espresso × 1.
    await expect(page.getByText(/Espresso/).first()).toBeVisible();
    // Total: 18.000 + 11% PPN = 19.980.
    await expect(page.getByText(/Rp 19\.980/).first()).toBeVisible();

    // Bayar → dialog.
    await page.getByRole('button', { name: /^Bayar$/ }).click();
    // Tap 100k chip.
    await page.getByRole('button', { name: /100k/ }).click();
    // Change should be 80.020.
    await expect(page.getByText(/Rp 80\.020/)).toBeVisible();
    // Konfirmasi.
    await page.getByRole('button', { name: /Konfirmasi/ }).click();

    // Receipt preview opens.
    await expect(page.getByText(/Rp 19\.980/).first()).toBeVisible();
    await page.getByRole('button', { name: /Selesai/ }).click();

    // Cart empty.
    await expect(page.getByText(/Belum ada item\./)).toBeVisible();

    // Navigate to /history; the order is there with the right total.
    await page.goto('/history');
    await waitForUrlHydrated(page, /\/history$/);
    await expect(page.getByText(/Rp 19\.980/).first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the E2E suite.**

Run: `RUN_AUTH_E2E=1 pnpm test:e2e tests/e2e/sale.spec.ts`
Expected: PASS.

> If the test fails on selectors (label text mismatch, button accessible name differs), inspect the rendered DOM with `page.pause()` or `playwright codegen`, adjust selectors to match what's actually on screen, and rerun. Don't change feature behavior to suit the test.

- [ ] **Step 3: Run full quality gate.**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: ALL PASS.

- [ ] **Step 4: Commit.**

```bash
git add tests/e2e/sale.spec.ts
git commit -m "test(e2e): sale happy path — cash sale + receipt + history"
```

---

## After all tasks

Run the spec self-review against the plan:

**Spec coverage:**
- ✅ `orders` + `payments` schema (spec §Data model) — Task 1
- ✅ Idempotency via clientId (spec §Architecture, §Data flow) — Tasks 2–3
- ✅ Server-side recompute (spec §Architecture) — Task 2 builds it; Task 3 asserts client can't override
- ✅ Tax snapshot (spec §Snapshots) — Task 2 step 5–6
- ✅ Modifier snapshot + price calc (spec §Snapshots, §Server step 5) — Task 2 step 7–8
- ✅ All validation rejections (spec §Validation summary) — Task 3
- ✅ Shift + cashier race handling (spec §Race conditions) — Task 3
- ✅ `orders.listForShift` + `orders.getById` (spec §API) — Task 4
- ✅ Cart reducer behaviour (spec §Cart reducer) — Task 6
- ✅ `<PinGate>` + `<ShiftGate>` (spec §Identity stack) — Task 7
- ✅ MenuPane + ItemCard + quick-add (spec §Components) — Task 8
- ✅ CartPane + line stepper + Kosongkan (spec §Components) — Task 9
- ✅ ModifierPickerDialog (spec §Components) — Task 10
- ✅ CashPaymentDialog (spec §Components) — Task 11
- ✅ ReceiptPreview + print (spec §Components) — Task 12
- ✅ `/history` route (spec §Components) — Task 13
- ✅ E2E happy path (spec §Testing) — Task 14

After all tasks complete:

- Use `superpowers:finishing-a-development-branch` to do the final review + open the PR against `main`.
