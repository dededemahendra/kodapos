# Static QRIS Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a cashier take a static-QRIS payment end-to-end — owner uploads the QR + enables the method, cashier picks Tunai/QRIS at checkout, the QRIS dialog shows the QR, and confirming saves the order as `qris_static`/`paid` with loyalty working as for cash.

**Architecture:** No schema migration — every field already exists. Extract the shared body of `createCashSale` into a `buildAndInsertSale` helper and add a thin `createQrisStaticSale` mutation. Add the missing static-QR image upload to the existing "Pajak & Pembayaran" settings page, wire the method toggles into a two-button checkout, add a `QrisStaticPaymentDialog`, a `qris_static` receipt variant, and make the owner-configured `quickCashButtons` live in the cash dialog.

**Tech Stack:** Convex (mutations/queries, file storage), TanStack Start + React, Lingui i18n, shadcn/ui, Vitest + convex-test, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-08-qris-static-payments-design.md`

**Branch:** `feat/qris-static-payments` (already created off `main`, spec committed).

**Conventions to follow:**
- Run CI locally before any push: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`.
- Convex codegen if function signatures change: `./node_modules/.bin/convex codegen` (npx is broken by a shell hook); commit the generated files.
- New UI strings are Bahasa Indonesia via Lingui `<Trans>`/`t\`...\``; run `pnpm lingui:extract` and fill the `en` catalog (not just compile). Receipt content stays English and off-catalog.
- Small conventional commits per task.

---

## File Structure

**Backend (modify):**
- `convex/orders.ts` — extract `buildAndInsertSale`; refactor `createCashSale` to call it; add `createQrisStaticSale`.
- `convex/settings.ts` — `get` resolves and returns `qrisImageUrl`.

**Backend (test):**
- `tests/convex/orders.test.ts` — add a `createQrisStaticSale` describe block.
- `tests/convex/settings.test.ts` — create (or extend) for the `qrisImageUrl` round-trip.

**Frontend (create):**
- `src/components/sale/qris-static-payment-dialog.tsx` — the QRIS payment dialog.

**Frontend (modify):**
- `src/routes/_pos/settings/tax.tsx` — QRIS-static card (image upload + merchant/NMID), disable unsupported method toggles.
- `src/components/sale/sale-screen.tsx` — method-aware pay buttons; mount `QrisStaticPaymentDialog`; pass `quickCashButtons`.
- `src/components/sale/cart-pane.tsx` — render one pay button per enabled+supported method.
- `src/components/sale/cash-payment-dialog.tsx` — use `quickCashButtons` for the quick-amount buttons.
- `src/components/sale/receipt-preview.tsx` — `qris_static` payment-method line.

**Frontend (test):**
- `tests/e2e/sale.spec.ts` — extend with a QRIS-static smoke.

---

## Task 1: Backend — extract `buildAndInsertSale` + add `createQrisStaticSale`

**Files:**
- Modify: `convex/orders.ts` (handler at `:27-335`, header at `:1-25`)
- Test: `tests/convex/orders.test.ts`

This is the highest-blast-radius change. The rule: **`createCashSale` behavior stays identical** — the existing cash tests must pass unchanged.

- [ ] **Step 1: Write the failing test for `createQrisStaticSale`**

Add this describe block to the end of `tests/convex/orders.test.ts` (it reuses the existing `setup`, `convexTest`, `schema`, `modules`, and `api` already imported at the top of that file):

```typescript
describe('orders.createQrisStaticSale', () => {
  it('creates a qris_static/paid order with a qris_static payment (no tendered/change)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const result = await asOwner.mutation(api.orders.createQrisStaticSale, {
      clientId: 'qris-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 2, modifierOptionIds: [] }],
      createdAtClient: 1700000000000,
    });
    expect(result.totalIDR).toBe(36000);
    expect(result.changeIDR).toBe(0);

    const order = await t.run(async (ctx) => await ctx.db.get(result.orderId));
    expect(order?.paymentMethod).toBe('qris_static');
    expect(order?.paymentStatus).toBe('paid');
    expect(order?.totalIDR).toBe(36000);

    const payments = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', result.orderId))
        .collect()
    );
    expect(payments).toHaveLength(1);
    expect(payments?.[0]?.method).toBe('qris_static');
    expect(payments?.[0]?.amountIDR).toBe(36000);
    expect(payments?.[0]?.cashTenderedIDR).toBeUndefined();
    expect(payments?.[0]?.changeIDR).toBeUndefined();
    expect(payments?.[0]?.confirmedAt).toEqual(expect.any(Number));
  });

  it('is idempotent on repeated clientId', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const args = {
      clientId: 'qris-dupe',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      createdAtClient: 1700000000000,
    };
    const a = await asOwner.mutation(api.orders.createQrisStaticSale, args);
    const b = await asOwner.mutation(api.orders.createQrisStaticSale, args);
    expect(b.orderId).toBe(a.orderId);
    const orders = await t.run(async (ctx) =>
      await ctx.db.query('orders').collect()
    );
    expect(orders).toHaveLength(1);
  });

  it('throws when qrisStatic method is disabled in settings', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await asOwner.mutation(api.settings.updatePayment, {
      payment: {
        methods: { cash: true, qrisStatic: false, qrisDynamic: false, card: false, ewallet: false, transfer: false },
        defaultMethod: 'cash',
        cashRounding: 'none',
        quickCashButtons: [20000, 50000, 100000],
        serviceChargeEnabled: false,
        serviceChargePct: 0,
        serviceChargeName: 'Biaya Layanan',
      },
    });
    await expect(
      asOwner.mutation(api.orders.createQrisStaticSale, {
        clientId: 'qris-off',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow();
  });

  it('rejects point redemption without a customer', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await expect(
      asOwner.mutation(api.orders.createQrisStaticSale, {
        clientId: 'qris-redeem',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        redeemPoints: 100,
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow();
  });

  it('produces the same totals as a cash sale for the same cart', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t, { taxEnabled: true, taxRatePct: 11 });
    const lines = [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }];
    const cash = await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'parity-cash', shiftId, cashierId, lines, cashTenderedIDR: 100000, createdAtClient: 1700000000000,
    });
    const qris = await asOwner.mutation(api.orders.createQrisStaticSale, {
      clientId: 'parity-qris', shiftId, cashierId, lines, createdAtClient: 1700000000000,
    });
    expect(qris.totalIDR).toBe(cash.totalIDR);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- orders`
Expected: FAIL — `api.orders.createQrisStaticSale` is undefined / not a function.

- [ ] **Step 3: Add the `MutationCtx` import to `convex/orders.ts`**

Change the top imports (`convex/orders.ts:1-7`) — add the `MutationCtx` type import:

```typescript
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { DEFAULT_LOYALTY, pointsEarned, redemptionIDR } from './lib/loyalty';
import { DEFAULT_SERVICE_CHARGE_NAME, computeOrderTotals, promoDiscountIDR } from './lib/pricing';
import { requireActiveCashier } from './lib/staff';
```

- [ ] **Step 4: Extract `buildAndInsertSale` and rewrite `createCashSale`**

Replace the entire `createCashSale` mutation (`convex/orders.ts:27-335`, from `export const createCashSale = mutation({` through its closing `});`) with the helper + two thin mutations below. The body is the existing logic verbatim, with only the payment-method-specific bits parameterized (marked with `// ← method-specific`).

```typescript
type SaleArgs = {
  clientId: string;
  shiftId: Id<'shifts'>;
  cashierId: Id<'cafeStaff'>;
  lines: Array<{
    menuItemId: Id<'menuItems'>;
    qty: number;
    modifierOptionIds: Array<Id<'modifierOptions'>>;
  }>;
  promoId?: Id<'promotions'>;
  customerId?: Id<'customers'>;
  redeemPoints?: number;
  createdAtClient?: number;
};

type PaymentInput =
  | { method: 'cash'; tenderedIDR: number }
  | { method: 'qris_static' };

/**
 * Shared checkout core for every payment method. Validates the cart, recomputes
 * promo + loyalty + totals authoritatively, inserts the order + payment +
 * inventory movements + loyalty transactions, and patches the customer. The only
 * per-method differences are the funds check, the order's paymentMethod, and the
 * payment row's tendered/change fields.
 */
async function buildAndInsertSale(
  ctx: MutationCtx,
  args: SaleArgs,
  payment: PaymentInput
): Promise<{ orderId: Id<'orders'>; totalIDR: number; changeIDR: number }> {
  const { cafeId } = await requireOwnerCafe(ctx);

  // Idempotency check first — return existing order if clientId already used.
  const existing = await ctx.db
    .query('orders')
    .withIndex('by_cafe_clientId', (q) =>
      q.eq('cafeId', cafeId).eq('clientId', args.clientId)
    )
    .unique();
  if (existing) {
    const existingPayment = await ctx.db
      .query('payments')
      .withIndex('by_order', (q) => q.eq('orderId', existing._id))
      .unique();
    return {
      orderId: existing._id,
      totalIDR: existing.totalIDR,
      changeIDR: existingPayment?.changeIDR ?? 0,
    };
  }

  if (args.lines.length < 1) throw new Error('Keranjang kosong.');

  const shift = await requireOwned(ctx, cafeId, args.shiftId, 'Shift');
  if (shift.status !== 'open') throw new Error('Shift sudah ditutup.');

  await requireActiveCashier(ctx, cafeId, args.cashierId);

  const builtLines: Doc<'orders'>['lines'] = [];
  for (const line of args.lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 99) {
      throw new Error('Jumlah item tidak valid.');
    }
    const item = await ctx.db.get(line.menuItemId);
    if (!item || item.cafeId !== cafeId || item.archived || !item.isActive) {
      const name = item?.name ? ` ${item.name}` : '';
      throw new Error(`Item${name} tidak tersedia.`);
    }

    const modifiersSnapshot: Doc<'orders'>['lines'][number]['modifiersSnapshot'] = [];
    let modifierAdjustments = 0;

    const attachments = await ctx.db
      .query('menuItemModifierGroups')
      .withIndex('by_item', (q) => q.eq('menuItemId', item._id))
      .collect();
    const attachedGroupIds = new Set(attachments.map((a) => a.modifierGroupId));

    const countByGroup = new Map<string, number>();
    for (const optionId of line.modifierOptionIds) {
      const option = await ctx.db.get(optionId);
      if (!option || option.cafeId !== cafeId || option.archived) {
        throw new Error('Modifier tidak tersedia.');
      }
      const group = await ctx.db.get(option.groupId);
      if (!group || !attachedGroupIds.has(group._id)) {
        throw new Error('Modifier tidak tersedia.');
      }
      countByGroup.set(group._id, (countByGroup.get(group._id) ?? 0) + 1);
      modifiersSnapshot.push({
        groupName: group.name,
        optionName: option.name,
        priceAdjustmentIDR: option.priceAdjustmentIDR,
      });
      modifierAdjustments += option.priceAdjustmentIDR;
    }

    for (const attachment of attachments) {
      const group = await ctx.db.get(attachment.modifierGroupId);
      if (!group || group.archived) continue;
      const count = countByGroup.get(group._id) ?? 0;
      if (count < group.minSelect) {
        throw new Error(`Modifier wajib pada grup ${group.name} belum dipilih.`);
      }
      if (count > group.maxSelect) {
        throw new Error(`Pilihan modifier melebihi batas pada grup ${group.name}.`);
      }
    }

    const unitPriceIDR = item.priceIDR + modifierAdjustments;
    const lineTotalIDR = line.qty * unitPriceIDR;

    const recipe = await ctx.db
      .query('recipes')
      .withIndex('by_cafe_item', (q) =>
        q.eq('cafeId', cafeId).eq('menuItemId', item._id)
      )
      .unique();
    const recipeSnapshot: Array<{
      ingredientId: Id<'ingredients'>;
      qty: number;
      wastageFactor: number;
    }> = [];
    if (recipe) {
      for (const recipeLine of recipe.lines) {
        const ing = await ctx.db.get(recipeLine.ingredientId);
        if (!ing || ing.cafeId !== cafeId || ing.archived) continue;
        recipeSnapshot.push({
          ingredientId: recipeLine.ingredientId,
          qty: recipeLine.qty,
          wastageFactor: recipeLine.wastageFactor,
        });
      }
    }

    builtLines.push({
      menuItemId: item._id,
      nameSnapshot: item.name,
      qty: line.qty,
      unitPriceIDR,
      modifiersSnapshot,
      lineTotalIDR,
      recipeSnapshot,
    });
  }

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

  if ((args.redeemPoints ?? 0) > 0 && !args.customerId) {
    throw new Error('Penukaran poin memerlukan pelanggan.');
  }

  // Single cafeSettings read for the whole checkout path.
  const settings = await ctx.db
    .query('cafeSettings')
    .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
    .first();

  // ← method-specific: a qris_static sale requires the method to be enabled.
  // Default settings enable qrisStatic, so treat "no row / unset" as enabled.
  if (payment.method === 'qris_static' && settings?.payment?.methods.qrisStatic === false) {
    throw new Error('Metode QRIS statis tidak aktif.');
  }

  // Loyalty: resolve customer + program config, then fold any point redemption
  // into discountIDR (promo first, points off the remainder) BEFORE totals.
  let customer: Doc<'customers'> | null = null;
  let loyaltyCfg = DEFAULT_LOYALTY;
  let pointsRedeemed = 0;
  let pointsRedeemedIDR = 0;
  if (args.customerId) {
    const c = await requireOwned(ctx, cafeId, args.customerId, 'Pelanggan');
    if (c.archived) throw new Error('Pelanggan sudah diarsipkan.');
    customer = c;
    loyaltyCfg = { ...DEFAULT_LOYALTY, ...(settings?.loyalty ?? {}) };

    const redeem = args.redeemPoints ?? 0;
    if (redeem > 0) {
      if (!loyaltyCfg.enabled) throw new Error('Program loyalitas tidak aktif.');
      if (!Number.isInteger(redeem) || redeem % loyaltyCfg.redeemBlockPoints !== 0) {
        throw new Error('Poin harus kelipatan blok penukaran.');
      }
      if (redeem > customer.pointsBalance) throw new Error('Poin tidak mencukupi.');
      const afterPromo = subtotalIDR - discountIDR;
      const redeemIDR = redemptionIDR(redeem, loyaltyCfg);
      if (redeemIDR > afterPromo) throw new Error('Penukaran poin melebihi total.');
      pointsRedeemed = redeem;
      pointsRedeemedIDR = redeemIDR;
      discountIDR += redeemIDR;
    }
  }

  const cafe = await ctx.db.get(cafeId);
  const taxEnabled = cafe?.taxEnabled === true;
  const taxRatePct = taxEnabled ? cafe?.taxRatePct ?? 0 : 0;

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

  // ← method-specific: funds check + change only for cash.
  let changeIDR = 0;
  if (payment.method === 'cash') {
    const tendered = assertIDR(payment.tenderedIDR, 'Uang yang diterima');
    if (tendered < totalIDR) {
      throw new Error('Uang yang diterima kurang dari total.');
    }
    changeIDR = tendered - totalIDR;
  }

  const earnBase = subtotalIDR - discountIDR;
  const earned = customer ? pointsEarned(earnBase, loyaltyCfg) : 0;

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
    discountIDR,
    ...(appliedPromo ? { appliedPromo } : {}),
    serviceChargeIDR,
    serviceChargePct: scPct,
    serviceChargeName: scName,
    ...(customer ? { customerId: customer._id, pointsEarned: earned } : {}),
    ...(pointsRedeemed > 0 ? { pointsRedeemed, pointsRedeemedIDR } : {}),
    totalIDR,
    paymentMethod: payment.method, // ← method-specific
    paymentStatus: 'paid',
    createdAtClient: args.createdAtClient ?? now,
    syncedAt: now,
  });

  // ← method-specific: cash records tendered/change; qris_static does not.
  await ctx.db.insert('payments', {
    cafeId,
    orderId,
    method: payment.method,
    amountIDR: totalIDR,
    ...(payment.method === 'cash'
      ? { cashTenderedIDR: payment.tenderedIDR, changeIDR }
      : {}),
    confirmedAt: now,
  });

  // Inventory deduction: one inventoryMovements row per (line × ingredient).
  for (const builtLine of builtLines) {
    for (const recipeLine of builtLine.recipeSnapshot ?? []) {
      const consumed = builtLine.qty * recipeLine.qty * recipeLine.wastageFactor;
      await ctx.db.insert('inventoryMovements', {
        cafeId,
        ingredientId: recipeLine.ingredientId,
        delta: -consumed,
        reason: 'sale',
        refType: 'order',
        refId: orderId as unknown as string,
        at: now,
      });
    }
  }

  if (customer) {
    if (pointsRedeemed > 0) {
      await ctx.db.insert('loyaltyTransactions', {
        cafeId,
        customerId: customer._id,
        orderId,
        type: 'redeem',
        points: -pointsRedeemed,
        at: now,
      });
    }
    if (earned > 0) {
      await ctx.db.insert('loyaltyTransactions', {
        cafeId,
        customerId: customer._id,
        orderId,
        type: 'earn',
        points: earned,
        at: now,
      });
    }
    await ctx.db.patch(customer._id, {
      pointsBalance: customer.pointsBalance + earned - pointsRedeemed,
      visitCount: customer.visitCount + 1,
      totalSpentIDR: customer.totalSpentIDR + totalIDR,
      lastVisitAt: now,
    });
  }

  return { orderId, totalIDR, changeIDR };
}

const saleArgs = {
  clientId: v.string(),
  shiftId: v.id('shifts'),
  cashierId: v.id('cafeStaff'),
  lines: v.array(lineInput),
  promoId: v.optional(v.id('promotions')),
  customerId: v.optional(v.id('customers')),
  redeemPoints: v.optional(v.number()),
  createdAtClient: v.optional(v.number()),
};

export const createCashSale = mutation({
  args: { ...saleArgs, cashTenderedIDR: v.number() },
  returns: createCashSaleResult,
  handler: async (ctx, args) =>
    buildAndInsertSale(ctx, args, { method: 'cash', tenderedIDR: args.cashTenderedIDR }),
});

export const createQrisStaticSale = mutation({
  args: saleArgs,
  returns: createCashSaleResult,
  handler: async (ctx, args) => buildAndInsertSale(ctx, args, { method: 'qris_static' }),
});
```

Note: the `assertIDR` helper (`convex/orders.ts:21`) and `lineInput`/`createCashSaleResult` (`:9-19`) are unchanged and still referenced.

- [ ] **Step 5: Regenerate Convex types (new mutation added)**

Run: `./node_modules/.bin/convex codegen`
Expected: updates `convex/_generated/api.d.ts` with `createQrisStaticSale`.

- [ ] **Step 6: Run the full orders test file**

Run: `pnpm test -- orders`
Expected: PASS — all existing `createCashSale` tests AND the new `createQrisStaticSale` block pass.

- [ ] **Step 7: Commit**

```bash
git add convex/orders.ts convex/_generated tests/convex/orders.test.ts
git commit -m "feat(payments): createQrisStaticSale via shared sale core"
```

---

## Task 2: Backend — `settings.get` returns a resolved `qrisImageUrl`

**Files:**
- Modify: `convex/settings.ts` (`settingsValidator` at `:114-123`, `get` at `:125-147`)
- Test: `tests/convex/settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/convex/settings.test.ts`:

```typescript
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>) {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

describe('settings.get qrisImageUrl', () => {
  it('omits qrisImageUrl when no QR image is set', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const s = await asOwner.query(api.settings.get, {});
    expect(s.qrisImageUrl).toBeUndefined();
  });

  it('resolves qrisImageUrl after a QR image is saved', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const storageId = await t.run(async (ctx) =>
      await ctx.storage.store(new Blob(['fake-qr'], { type: 'image/png' }))
    );
    await asOwner.mutation(api.settings.updatePayment, {
      payment: {
        methods: { cash: true, qrisStatic: true, qrisDynamic: false, card: false, ewallet: false, transfer: false },
        defaultMethod: 'cash',
        cashRounding: 'none',
        quickCashButtons: [20000, 50000, 100000],
        serviceChargeEnabled: false,
        serviceChargePct: 0,
        serviceChargeName: 'Biaya Layanan',
        qrisImageStorageId: storageId,
      },
    });
    const s = await asOwner.query(api.settings.get, {});
    expect(typeof s.qrisImageUrl).toBe('string');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- settings`
Expected: FAIL — `s.qrisImageUrl` is always undefined (field not returned yet).

- [ ] **Step 3: Add `qrisImageUrl` to the validator**

In `convex/settings.ts`, change `settingsValidator` (`:114-123`) to add the field:

```typescript
const settingsValidator = v.object({
  payment: paymentValidator,
  receipt: receiptValidator,
  integrations: integrationsValidator,
  taxName: v.string(),
  taxInclusive: v.boolean(),
  npwp: v.optional(v.string()),
  taxRatePct: v.number(),
  taxEnabled: v.boolean(),
  qrisImageUrl: v.optional(v.string()),
});
```

- [ ] **Step 4: Resolve the URL in the `get` handler**

In `convex/settings.ts`, change the `get` handler's return (`:136-145`) to resolve the storage id:

```typescript
    const payment = row?.payment ?? DEFAULT_SETTINGS.payment;
    const qrisImageUrl = payment.qrisImageStorageId
      ? await ctx.storage.getUrl(payment.qrisImageStorageId)
      : null;

    return {
      payment,
      receipt: row?.receipt ?? DEFAULT_SETTINGS.receipt,
      integrations: row?.integrations ?? DEFAULT_SETTINGS.integrations,
      taxName: row?.taxName ?? DEFAULT_SETTINGS.taxName,
      taxInclusive: row?.taxInclusive ?? DEFAULT_SETTINGS.taxInclusive,
      ...(row?.npwp !== undefined ? { npwp: row.npwp } : {}),
      taxRatePct: cafe?.taxRatePct ?? 11,
      taxEnabled: cafe?.taxEnabled ?? true,
      ...(qrisImageUrl ? { qrisImageUrl } : {}),
    };
```

(Note: `DEFAULT_SETTINGS.payment` has no `qrisImageStorageId`, so `payment.qrisImageStorageId` is `undefined` there — the `?` guard handles it.)

- [ ] **Step 5: Regenerate types and run the test**

Run: `./node_modules/.bin/convex codegen && pnpm test -- settings`
Expected: PASS — both settings tests pass.

- [ ] **Step 6: Commit**

```bash
git add convex/settings.ts convex/_generated tests/convex/settings.test.ts
git commit -m "feat(settings): resolve qrisImageUrl in settings.get"
```

---

## Task 3: Settings UI — QRIS-static card + disable unsupported toggles

**Files:**
- Modify: `src/routes/_pos/settings/tax.tsx` (draft type `:43-54`, `initialDraft` `:79-100`, `handleSave` payload `:155-171`, method section `:330-442`)

- [ ] **Step 1: Add `qrisImageStorageId` to the draft type**

In `src/routes/_pos/settings/tax.tsx`, extend `PaymentDraft` (`:43-54`) — add the storage id (string id or undefined):

```typescript
interface PaymentDraft {
  methods: PaymentMethodsDraft;
  defaultMethod: 'cash' | 'qris_static' | 'qris_dynamic' | 'card' | 'ewallet' | 'transfer';
  cashRounding: 'none' | 'nearest_100' | 'nearest_500' | 'nearest_1000';
  quickCashButtons: number[];
  serviceChargeEnabled: boolean;
  serviceChargePct: number;
  serviceChargeName: string;
  // Use string (never undefined) locally — map to optional only on save
  qrisMerchantName: string;
  qrisNmid: string;
  qrisImageStorageId?: Id<'_storage'>;
}
```

Add the `Id` import at the top of the file if not already present:

```typescript
import type { Id } from 'convex/_generated/dataModel';
```

- [ ] **Step 2: Seed `qrisImageStorageId` into `initialDraft`**

In `initialDraft` (`:87-98`), add the field inside the `payment` object (after `qrisNmid`):

```typescript
        qrisNmid: ('qrisNmid' in s.payment ? s.payment.qrisNmid : undefined) ?? '',
        ...(s.payment.qrisImageStorageId
          ? { qrisImageStorageId: s.payment.qrisImageStorageId }
          : {}),
```

- [ ] **Step 3: Include `qrisImageStorageId` in the save payload**

In `handleSave` (`:161-171`), add it to `paymentPayload` (after the `qrisNmid` spread):

```typescript
      const paymentPayload = {
        methods: d.payment.methods,
        defaultMethod: d.payment.defaultMethod,
        cashRounding: d.payment.cashRounding,
        quickCashButtons: d.payment.quickCashButtons,
        serviceChargeEnabled: d.payment.serviceChargeEnabled,
        serviceChargePct: d.payment.serviceChargePct,
        serviceChargeName: d.payment.serviceChargeName,
        ...(qrisMerchantName !== undefined ? { qrisMerchantName } : {}),
        ...(qrisNmid !== undefined ? { qrisNmid } : {}),
        ...(d.payment.qrisImageStorageId ? { qrisImageStorageId: d.payment.qrisImageStorageId } : {}),
      };
```

- [ ] **Step 4: Wire upload state, query, and handler in the component**

Near the other hooks in `SettingsTax` (after `updatePayment` at `:74`), add the upload mutation, the settings query (for the preview URL), a file input ref, and an uploading flag:

```typescript
  const generateUploadUrl = useMutation(api.cafes.generateUploadUrl);
  const qrisImageUrl = s?.qrisImageUrl;
  const [uploadingQr, setUploadingQr] = useState(false);
  const qrFileRef = useRef<HTMLInputElement>(null);
```

Add `useRef` to the React import and confirm `useMutation` is imported (it is). Then add the handler alongside the other handlers (after `handleRemoveQuickCash` at `:148`):

```typescript
  async function handleQrFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingQr(true);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const json = (await res.json()) as { storageId: Id<'_storage'> };
      patchPayment({ qrisImageStorageId: json.storageId });
    } catch {
      setError(t`Gagal mengunggah QRIS.`);
    } finally {
      setUploadingQr(false);
      if (qrFileRef.current) qrFileRef.current.value = '';
    }
  }
```

- [ ] **Step 5: Disable the unsupported method toggles + add the QRIS-static card**

In the "Metode pembayaran" section (`:330-442`), disable the four unsupported toggles by adding `disabled` to their `Switch`es and a "Segera hadir" caption. For each of **QRIS dinamis** (`:356-364`), **Kartu debit/kredit** (`:368-376`), **E-wallet** (`:380-388`), and **Transfer bank** (`:392-400`), change the `SettingRow` to pass a `description` and disable the switch. Example for QRIS dinamis (apply the same shape to the other three):

```tsx
          <SettingRow
            label={<Trans>QRIS dinamis</Trans>}
            description={<Trans>Segera hadir.</Trans>}
            control={
              <Switch
                checked={false}
                disabled
                onCheckedChange={() => {}}
              />
            }
          />
```

Then, **after** the "Metode pembayaran" `</SettingsSection>` (at `:442`) and before the "Tunai" section (`:447`), add the QRIS-static card. It shows only when the `qrisStatic` toggle is on:

```tsx
      {/* ------------------------------------------------------------------ */}
      {/* 3b. QRIS Statis                                                      */}
      {/* ------------------------------------------------------------------ */}
      {draft.payment.methods.qrisStatic ? (
        <SettingsSection title={<Trans>QRIS Statis</Trans>}>
          <FieldGroup>
            <SettingRow
              label={<Trans>Gambar QRIS</Trans>}
              description={<Trans>Unggah QR statis dari penyedia Anda.</Trans>}
              control={
                <div className="flex flex-col items-end gap-2">
                  {qrisImageUrl ? (
                    <img
                      src={qrisImageUrl}
                      alt={t`QRIS statis`}
                      className="size-24 rounded border border-border object-contain"
                    />
                  ) : null}
                  <input
                    ref={qrFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleQrFileChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingQr}
                    onClick={() => qrFileRef.current?.click()}
                  >
                    {uploadingQr ? <Spinner data-icon="inline-start" /> : null}
                    {qrisImageUrl ? <Trans>Ganti gambar</Trans> : <Trans>Unggah gambar</Trans>}
                  </Button>
                </div>
              }
            />

            <RowSep />

            <SettingRow
              label={<Trans>Nama merchant</Trans>}
              control={
                <Input
                  value={draft.payment.qrisMerchantName}
                  onChange={(e) => patchPayment({ qrisMerchantName: e.target.value })}
                  className="w-52"
                />
              }
            />

            <RowSep />

            <SettingRow
              label={<Trans>NMID</Trans>}
              control={
                <Input
                  value={draft.payment.qrisNmid}
                  onChange={(e) => patchPayment({ qrisNmid: e.target.value })}
                  className="w-52"
                />
              }
            />
          </FieldGroup>
        </SettingsSection>
      ) : null}
```

Confirm `Spinner` is imported in `tax.tsx`; if not, add `import { Spinner } from '~/components/ui/spinner';`. (If the file already renders `qrisMerchantName`/`qrisNmid` inputs elsewhere, remove those duplicates so they live only in this card.)

- [ ] **Step 6: Verify typecheck + build**

Run: `pnpm typecheck`
Expected: PASS (no type errors).

Run: `pnpm build`
Expected: builds successfully.

- [ ] **Step 7: Commit**

```bash
git add src/routes/_pos/settings/tax.tsx
git commit -m "feat(settings): static-QRIS image upload + disable unsupported methods"
```

---

## Task 4: Checkout — QRIS dialog + method-aware pay buttons

**Files:**
- Create: `src/components/sale/qris-static-payment-dialog.tsx`
- Modify: `src/components/sale/cart-pane.tsx` (props `:27-43`, footer button `:118-126`)
- Modify: `src/components/sale/sale-screen.tsx` (state `:43`, CartPane props `:104-123`, dialog mount `:172-191`)

- [ ] **Step 1: Create the QRIS-static payment dialog**

Create `src/components/sale/qris-static-payment-dialog.tsx`. It mirrors `CashPaymentDialog` minus the tendered keypad, adds the QR image, and calls `createQrisStaticSale`:

```tsx
import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { DEFAULT_LOYALTY, redemptionIDR } from 'convex/lib/loyalty';
import { computeOrderTotals } from 'convex/lib/pricing';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';
import type { CartState } from './cart-reducer';
import { CustomerSection, type CustomerSelection } from './customer-section';

function genUUID(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function QrisStaticPaymentDialog({
  open,
  onOpenChange,
  subtotalIDR,
  promoDiscountIDR,
  serviceChargeEnabled,
  serviceChargePct,
  taxEnabled,
  taxRatePct,
  qrisImageUrl,
  qrisMerchantName,
  qrisNmid,
  cart,
  shiftId,
  cashierId,
  promoId,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subtotalIDR: number;
  /** Promo discount already applied to the cart (0 when no promo). */
  promoDiscountIDR: number;
  serviceChargeEnabled: boolean;
  serviceChargePct: number;
  taxEnabled: boolean;
  taxRatePct: number;
  qrisImageUrl?: string;
  qrisMerchantName?: string;
  qrisNmid?: string;
  cart: CartState;
  shiftId: Id<'shifts'>;
  cashierId: Id<'cafeStaff'>;
  promoId?: Id<'promotions'>;
  onPaid: (orderId: Id<'orders'>) => void;
}) {
  const { t } = useLingui();
  const createQrisStaticSale = useMutation(api.orders.createQrisStaticSale);
  const loyaltyCfg = useQuery(api.loyalty.getConfig) ?? DEFAULT_LOYALTY;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerSelection>({ redeemPoints: 0 });
  const clientIdRef = useRef<string>('');

  useEffect(() => {
    if (open) {
      clientIdRef.current = genUUID();
      setError(null);
      setCustomer({ redeemPoints: 0 });
    }
  }, [open]);

  const afterPromoIDR = subtotalIDR - promoDiscountIDR;
  const redeemIDR = redemptionIDR(customer.redeemPoints, loyaltyCfg);
  const discountIDR = promoDiscountIDR + redeemIDR;
  const { totalIDR } = computeOrderTotals({
    subtotalIDR,
    discountIDR,
    serviceChargeEnabled,
    serviceChargePct,
    taxEnabled,
    taxRatePct,
  });

  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createQrisStaticSale({
        clientId: clientIdRef.current,
        shiftId,
        cashierId,
        lines: cart.lines.map((l) => ({
          menuItemId: l.menuItemId,
          qty: l.qty,
          modifierOptionIds: l.modifierOptionIds,
        })),
        ...(promoId ? { promoId } : {}),
        ...(customer.customerId ? { customerId: customer.customerId } : {}),
        ...(customer.redeemPoints > 0 ? { redeemPoints: customer.redeemPoints } : {}),
        createdAtClient: Date.now(),
      });
      onPaid(result.orderId);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Gagal memproses pembayaran.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            <Trans>Pembayaran QRIS</Trans>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <CustomerSection
            cafeLoyalty={loyaltyCfg}
            afterPromoIDR={afterPromoIDR}
            value={customer}
            onChange={setCustomer}
          />

          <div className="rounded-md bg-muted px-3 py-2 space-y-1">
            {redeemIDR > 0 ? (
              <div className="flex justify-between text-xs text-emerald-700">
                <span>
                  <Trans>Poin ditukar</Trans>
                </span>
                <span className="tabular-nums">−{formatIDR(redeemIDR)}</span>
              </div>
            ) : null}
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <Trans>Total tagihan</Trans>
              </div>
              <div className="text-2xl font-semibold text-primary tabular-nums">
                {formatIDR(totalIDR)}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 rounded-md border border-border px-3 py-3">
            {qrisImageUrl ? (
              <img
                src={qrisImageUrl}
                alt={t`Kode QRIS`}
                className="size-56 object-contain"
              />
            ) : (
              <p className="text-sm text-muted-foreground py-8">
                <Trans>Gambar QRIS belum diunggah.</Trans>
              </p>
            )}
            {qrisMerchantName ? <div className="text-sm font-medium">{qrisMerchantName}</div> : null}
            {qrisNmid ? (
              <div className="text-xs text-muted-foreground">NMID: {qrisNmid}</div>
            ) : null}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button
            type="button"
            onClick={confirm}
            disabled={submitting}
            className="w-full"
            size="lg"
          >
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            {submitting ? <Trans>Memproses…</Trans> : <Trans>Sudah dibayar</Trans>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Give `CartPane` method-aware buttons**

In `src/components/sale/cart-pane.tsx`, replace the single `onBayar` prop with a list of methods + an `onPay` callback. Change the props type (`:23-43`) — replace `onBayar: () => void;` with:

```typescript
  payMethods: Array<'cash' | 'qris_static'>;
  onPay: (method: 'cash' | 'qris_static') => void;
```

Remove `onBayar` from the destructure (`:25`) and add `payMethods, onPay`. Then replace the footer `<Button onClick={onBayar} ...>` (`:118-126`) with one button per method:

```tsx
        <div className="grid grid-cols-2 gap-2 mt-2">
          {payMethods.map((m) => (
            <Button
              key={m}
              type="button"
              onClick={() => onPay(m)}
              disabled={empty}
              className={payMethods.length === 1 ? 'col-span-2' : ''}
              size="lg"
            >
              {m === 'cash' ? <Trans>Tunai</Trans> : <Trans>QRIS</Trans>}
            </Button>
          ))}
        </div>
```

- [ ] **Step 3: Wire method selection + the QRIS dialog into `SaleScreen`**

In `src/components/sale/sale-screen.tsx`:

(a) Add the import after the `CashPaymentDialog` import (`:8`):

```typescript
import { QrisStaticPaymentDialog } from './qris-static-payment-dialog';
```

(b) Replace the `paymentOpen` state (`:43`) with two booleans:

```typescript
  const [cashOpen, setCashOpen] = useState(false);
  const [qrisOpen, setQrisOpen] = useState(false);
```

(c) Compute the enabled+supported methods after the totals block (after `:80`):

```typescript
  const methods = settings.payment.methods;
  const defaultMethod = settings.payment.defaultMethod;
  const supported: Array<'cash' | 'qris_static'> = [];
  if (methods.cash) supported.push('cash');
  if (methods.qrisStatic && settings.qrisImageUrl) supported.push('qris_static');
  // Put the configured default first when it is in the supported set.
  const payMethods = supported.sort((a, b) =>
    a === defaultMethod ? -1 : b === defaultMethod ? 1 : 0
  );
```

(d) Replace the `CartPane`'s `onBayar` prop (`:119-121`) with:

```tsx
        payMethods={payMethods}
        onPay={(method) => {
          if (cart.lines.length === 0) return;
          if (method === 'cash') setCashOpen(true);
          else setQrisOpen(true);
        }}
```

(e) Replace the `CashPaymentDialog` mount (`:172-191`) — update `open`/`onOpenChange` and add the QRIS dialog beside it, plus the quick-cash prop (used in Task 5):

```tsx
      {shift && cashierId ? (
        <>
          <CashPaymentDialog
            open={cashOpen}
            onOpenChange={setCashOpen}
            subtotalIDR={subtotal}
            promoDiscountIDR={discount}
            serviceChargeEnabled={scEnabled}
            serviceChargePct={scPct}
            taxEnabled={taxEnabled}
            taxRatePct={taxRatePct}
            quickCashButtons={settings.payment.quickCashButtons}
            {...(cart.promo?._id ? { promoId: cart.promo._id } : {})}
            cart={cart}
            shiftId={shift._id}
            cashierId={cashierId}
            onPaid={(orderId) => {
              setReceiptOrderId(orderId);
              dispatch({ type: 'clearCart' });
            }}
          />
          <QrisStaticPaymentDialog
            open={qrisOpen}
            onOpenChange={setQrisOpen}
            subtotalIDR={subtotal}
            promoDiscountIDR={discount}
            serviceChargeEnabled={scEnabled}
            serviceChargePct={scPct}
            taxEnabled={taxEnabled}
            taxRatePct={taxRatePct}
            {...(settings.qrisImageUrl ? { qrisImageUrl: settings.qrisImageUrl } : {})}
            {...(settings.payment.qrisMerchantName ? { qrisMerchantName: settings.payment.qrisMerchantName } : {})}
            {...(settings.payment.qrisNmid ? { qrisNmid: settings.payment.qrisNmid } : {})}
            {...(cart.promo?._id ? { promoId: cart.promo._id } : {})}
            cart={cart}
            shiftId={shift._id}
            cashierId={cashierId}
            onPaid={(orderId) => {
              setReceiptOrderId(orderId);
              dispatch({ type: 'clearCart' });
            }}
          />
        </>
      ) : null}
```

(Note: the `quickCashButtons` prop is added to `CashPaymentDialog` in Task 5; adding it here first is fine — Task 5 makes the dialog accept it. If you run typecheck between Step 4 and Task 5 it will error on that unknown prop, so do Task 5 before the next typecheck, or temporarily omit the line and add it in Task 5.)

- [ ] **Step 4: Update existing Playwright tests that click "Bayar"**

The cart footer button is no longer labelled "Bayar" — the cash button is now "Tunai". Update these four references (they're Playwright e2e, not part of the `pnpm test` gates, but keep them correct). In each, change `name: /^Bayar$/` to `name: /^Tunai$/`:

- `tests/e2e/sale.spec.ts:76`
- `tests/e2e/sale.spec.ts:167`
- `tests/e2e/sale.spec.ts:220`
- `tests/e2e/inventory.spec.ts:151`

Verify none remain:

Run: `grep -rn "name: /\^Bayar\$/" tests/`
Expected: no matches.

- [ ] **Step 5: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS once Task 5 lands (the `quickCashButtons` prop). If you want a clean checkpoint now, omit the `quickCashButtons` line in (e), run `pnpm typecheck` → PASS, then add it back in Task 5.

- [ ] **Step 6: Commit**

```bash
git add src/components/sale/qris-static-payment-dialog.tsx src/components/sale/cart-pane.tsx src/components/sale/sale-screen.tsx tests/e2e/sale.spec.ts tests/e2e/inventory.spec.ts
git commit -m "feat(sale): method-aware pay buttons + QRIS static dialog"
```

---

## Task 5: Receipt `qris_static` variant + quick-cash wiring

**Files:**
- Modify: `src/components/sale/cash-payment-dialog.tsx` (props `:32-61`, denoms `:102`, quick buttons `:194-205`)
- Modify: `src/components/sale/receipt-preview.tsx` (payment block `:124-141`)

- [ ] **Step 1: Make the cash dialog accept and use `quickCashButtons`**

In `src/components/sale/cash-payment-dialog.tsx`, add the prop. In the destructure (`:32-46`) add `quickCashButtons,` and in the props type (`:46-61`) add:

```typescript
  quickCashButtons: number[];
```

Then replace the denominations line (`:102`):

```typescript
  const denoms = quickCashButtons.length > 0 ? quickCashButtons : computeDenominations(totalIDR);
```

And update the quick-buttons grid (`:194-205`) so the first button is always an exact-total "Pas" and the rest are the configured amounts:

```tsx
          <div className="grid grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => setTendered(String(totalIDR))}
              className="text-xs px-2 py-2 rounded-md border border-border bg-background hover:bg-muted"
            >
              <Trans>Pas</Trans>
            </button>
            {denoms.slice(0, 3).map((d, i) => (
              <button
                type="button"
                key={`${d}-${i}`}
                onClick={() => setTendered(String(d))}
                className="text-xs px-2 py-2 rounded-md border border-border bg-background hover:bg-muted"
              >
                {`${(d / 1000).toLocaleString('id-ID')}k`}
              </button>
            ))}
          </div>
```

`computeDenominations` stays as the fallback and is still referenced.

- [ ] **Step 2: Add the `qris_static` line to the receipt**

In `src/components/sale/receipt-preview.tsx`, after the cash block (`:124-141`, the `{order.payment?.method === 'cash' ? (...) : null}`), add a non-cash method line. Insert immediately after that block's closing `: null}`:

```tsx
            {order.payment && order.payment.method !== 'cash' ? (
              <div className="flex justify-between mt-1">
                {/* Printed receipt is always English, kept out of the i18n catalog. */}
                <span>Payment</span>
                <span>{order.payment.method === 'qris_static' ? 'QRIS' : order.payment.method}</span>
              </div>
            ) : null}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `pnpm typecheck`
Expected: PASS (the `quickCashButtons` prop now exists on `CashPaymentDialog`).

Run: `pnpm build`
Expected: builds successfully.

- [ ] **Step 4: Commit**

```bash
git add src/components/sale/cash-payment-dialog.tsx src/components/sale/receipt-preview.tsx
git commit -m "feat(sale): qris_static receipt line + live quick-cash buttons"
```

---

## Task 6: i18n catalogs, e2e smoke, and full local CI

**Files:**
- Modify: `src/locales/id/messages.po`, `src/locales/en/messages.po` (generated)
- Modify: `tests/e2e/sale.spec.ts`

- [ ] **Step 1: Extract new strings and fill English**

Run: `pnpm lingui:extract`
Expected: new `msgid`s appear (e.g. "Pembayaran QRIS", "Sudah dibayar", "QRIS Statis", "Gambar QRIS", "Nama merchant", "Segera hadir.", "Gagal mengunggah QRIS.").

Then open `src/locales/en/messages.po` and fill the `msgstr` for every new (empty) `msgid` with the English translation — e.g.:

```
msgid "Pembayaran QRIS"
msgstr "QRIS Payment"

msgid "Sudah dibayar"
msgstr "Paid"

msgid "QRIS Statis"
msgstr "Static QRIS"

msgid "Gambar QRIS"
msgstr "QRIS image"

msgid "Nama merchant"
msgstr "Merchant name"

msgid "Segera hadir."
msgstr "Coming soon."

msgid "Gagal mengunggah QRIS."
msgstr "Failed to upload QRIS."
```

Translate any remaining new ids the extract added. Verify none are missing:

Run: `pnpm lingui:extract`
Expected: the `en` row shows `Missing: 0`.

- [ ] **Step 2: Compile catalogs**

Run: `pnpm lingui:compile`
Expected: "Done".

- [ ] **Step 3: Add a QRIS-static e2e smoke**

Append a new `test(...)` inside the `test.describe('sale (auth-gated)', ...)` block in `tests/e2e/sale.spec.ts`. The e2e tests here are self-contained (each does signup → onboarding → item → PIN → open shift). **Copy the setup steps verbatim from the first test** (`tests/e2e/sale.spec.ts:13-63` — signup through "Buka Shift"), then replace its payment section with the QRIS flow below. QRIS statis is enabled by default (`DEFAULT_SETTINGS.payment.methods.qrisStatic === true`), so the only setup needed is uploading a QR image. The file input is hidden, but Playwright `setInputFiles` works on hidden inputs; we pass an inline 1×1 PNG buffer so no fixture file is needed. The SaveBar button is "Simpan perubahan" (appears once the form is dirty).

```typescript
  test('upload static QRIS → QRIS payment → receipt shows QRIS', async ({ page }) => {
    // --- copy setup from the first test (signup → onboarding → item → PIN → open shift) ---
    // ...paste lines 13-63 of the first test here, using a unique email + cafe name...

    // Upload a static QRIS image in settings
    await page.goto('/settings/tax');
    await waitForUrlHydrated(page, '/settings/tax');
    await page.locator('input[type=file]').setInputFiles({
      name: 'qr.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64'
      ),
    });
    await page.getByRole('button', { name: /Simpan perubahan/ }).click();
    await expect(page.getByText(/Tersimpan/)).toBeVisible();

    // Sale: add an item and pay via QRIS
    await page.goto('/sale');
    await waitForUrlHydrated(page, '/sale');
    await page.getByRole('button', { name: /Espresso/ }).first().click();
    await page.getByRole('button', { name: /^QRIS$/ }).click();
    await page.getByRole('button', { name: /Sudah dibayar/ }).click();

    // Receipt shows the QRIS payment line
    await expect(page.getByText(/QRIS/)).toBeVisible();
    await page.getByRole('button', { name: /Selesai/ }).click();
  });
```

Add `import { Buffer } from 'node:buffer';` at the top of the spec if `Buffer` is not already in scope (it is global in the Node test runner, but the explicit import is harmless). Run the e2e suite locally if the dev servers are available (`pnpm test:e2e`); if not, the convex tests in Tasks 1–2 are the primary safety net and this smoke runs in the e2e job.

- [ ] **Step 4: Run the full local CI gates**

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm test`
Expected: PASS (all suites, including the new orders + settings tests).

Run: `pnpm lingui:compile`
Expected: "Done".

- [ ] **Step 5: Commit**

```bash
git add src/locales tests/e2e
git commit -m "i18n(payments): translate QRIS strings + e2e smoke"
```

---

## Task 7: PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/qris-static-payments
```

- [ ] **Step 2: Open the PR against `main`**

Title: `feat: static QRIS payments`. Body summarizes the slice (settings upload, method-aware checkout, QRIS dialog, receipt variant, quick-cash wiring; no schema migration) and notes `cashRounding` + dynamic QRIS are deferred. Wait for CI (typecheck/test/lingui:compile + Workers Builds) to go green before merging. **Merge with a merge commit (no squash).**

---

## Notes for the implementer

- **Cash behavior must not change.** Task 1's refactor is mechanical — the cash code path is identical, only parameterized. If any existing `createCashSale` test fails, the extraction diverged from the original; diff against `git show HEAD~:convex/orders.ts`.
- **`qris_static`-enabled default:** with no `cafeSettings` row, `DEFAULT_SETTINGS.payment.methods.qrisStatic` is `true`, so the guard only throws when explicitly set to `false`.
- **QRIS button visibility** requires both `methods.qrisStatic` AND a configured `qrisImageUrl` — an enabled-but-unconfigured QRIS never reaches checkout.
- **Receipt stays English/off-catalog** — the "Payment / QRIS" line uses a literal string, not `<Trans>`.
