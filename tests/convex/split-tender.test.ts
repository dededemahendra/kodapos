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

const DEFAULT_PAYMENT = {
  methods: {
    cash: true,
    qrisStatic: true,
    qrisDynamic: false,
    card: false,
    ewallet: false,
    transfer: false,
  },
  defaultMethod: 'cash' as const,
  cashRounding: 'none' as const,
  quickCashButtons: [20000, 50000, 100000],
  serviceChargeEnabled: false,
  serviceChargePct: 0,
  serviceChargeName: 'Biaya Layanan',
};

async function setup(t: ReturnType<typeof convexTest>): Promise<Setup> {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
  });
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: 'Asia/Jakarta',
    taxRatePct: 0,
    taxEnabled: false,
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
  // A static-QRIS leg requires a configured QR image.
  const storageId = await t.run(
    async (ctx) => await ctx.storage.store(new Blob(['qr'], { type: 'image/png' }))
  );
  await asOwner.mutation(api.settings.updatePayment, {
    payment: { ...DEFAULT_PAYMENT, qrisImageStorageId: storageId },
  });
  return { asOwner, cafeId, cashierId, shiftId, categoryId, itemId };
}

// Seeded Espresso is 18000; qty 1 → order total 18000. Split = cash 10000 + qris_static 8000.
const TOTAL = 18000;

describe('orders.createSplitSale', () => {
  it('splits cash + qris_static summing to total → 2 confirmed payment rows, breakdown, paid', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const res = await asOwner.mutation(api.orders.createSplitSale, {
      clientId: 'split-1',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      tenders: [
        { method: 'cash', amountIDR: 10000, tenderedIDR: 10000 },
        { method: 'qris_static', amountIDR: 8000 },
      ],
      createdAtClient: 1700000000000,
    });
    expect(res.totalIDR).toBe(TOTAL);

    const order = await t.run(async (ctx) => await ctx.db.get(res.orderId));
    expect(order?.paymentMethod).toBe('split');
    expect(order?.paymentStatus).toBe('paid');
    expect(order?.totalIDR).toBe(TOTAL);
    expect(order?.paymentBreakdown).toHaveLength(2);
    expect(
      order?.paymentBreakdown?.reduce((s, b) => s + b.amountIDR, 0)
    ).toBe(TOTAL);

    const payments = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', res.orderId))
        .collect()
    );
    expect(payments).toHaveLength(2);
    expect(payments.reduce((s, p) => s + p.amountIDR, 0)).toBe(TOTAL);
    for (const p of payments) {
      expect(p.confirmedAt).toEqual(expect.any(Number));
    }
    expect(payments.map((p) => p.method).sort()).toEqual(['cash', 'qris_static']);
  });

  it('cash overpay leg → that row changeIDR + returned changeIDR === 5000', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const res = await asOwner.mutation(api.orders.createSplitSale, {
      clientId: 'split-overpay',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      tenders: [
        { method: 'cash', amountIDR: 10000, tenderedIDR: 15000 },
        { method: 'qris_static', amountIDR: 8000 },
      ],
      createdAtClient: 1700000000000,
    });
    expect(res.changeIDR).toBe(5000);
    const payments = await t.run(async (ctx) =>
      await ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', res.orderId))
        .collect()
    );
    const cashRow = payments.find((p) => p.method === 'cash');
    expect(cashRow?.changeIDR).toBe(5000);
    expect(cashRow?.cashTenderedIDR).toBe(15000);
  });

  it('rejects Σ amountIDR ≠ total', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await expect(
      asOwner.mutation(api.orders.createSplitSale, {
        clientId: 'split-bad-sum',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        tenders: [
          { method: 'cash', amountIDR: 10000, tenderedIDR: 10000 },
          { method: 'qris_static', amountIDR: 5000 },
        ],
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/total tender tidak sama/i);
  });

  it('rejects a cash leg tenderedIDR < amountIDR', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await expect(
      asOwner.mutation(api.orders.createSplitSale, {
        clientId: 'split-short',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        tenders: [
          { method: 'cash', amountIDR: 10000, tenderedIDR: 9000 },
          { method: 'qris_static', amountIDR: 8000 },
        ],
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/kurang dari/i);
  });

  it('rejects a non-positive amount', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    await expect(
      asOwner.mutation(api.orders.createSplitSale, {
        clientId: 'split-zero',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        tenders: [
          { method: 'cash', amountIDR: 0, tenderedIDR: 0 },
          { method: 'qris_static', amountIDR: 18000 },
        ],
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow();
  });
});

// Split legs over the 18000 Espresso: cash A=10000 + qris_static B=8000.
// Pure-cash order C=18000. Cash reconciliation must count A + C (28000),
// NOT A+B+C (36000) and NOT just C (18000). QRIS must count B (8000).
const A = 10000; // cash leg of the split
const B = 8000; // qris_static leg of the split
const C = TOTAL; // pure-cash order (18000)
const OPENING = 100000; // setup opens the shift with openingFloatIDR 100000

describe('reconciliation + reports + dashboard for splits', () => {
  it('shift cash expectation counts only the cash leg of a split (A + C, not A+B+C)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);

    // Split: cash A + qris_static B over the 18000 order.
    await asOwner.mutation(api.orders.createSplitSale, {
      clientId: 'recon-split',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      tenders: [
        { method: 'cash', amountIDR: A, tenderedIDR: A },
        { method: 'qris_static', amountIDR: B },
      ],
      createdAtClient: 1700000000000,
    });
    // Pure-cash order C.
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'recon-cash',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: C,
      createdAtClient: 1700000000000,
    });

    // closeoutSummary reads shiftCashBreakdown over the open shift.
    const summary = await asOwner.query(api.shifts.closeoutSummary, { shiftId });
    expect(summary.cashSalesIDR).toBe(A + C); // 28000, NOT 36000, NOT 18000
    expect(summary.expectedCashIDR).toBe(OPENING + A + C); // 128000
  });

  it('summarizeShift (listClosed) splits cash vs qris by tender, not by headline method', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);

    await asOwner.mutation(api.orders.createSplitSale, {
      clientId: 'sum-split',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      tenders: [
        { method: 'cash', amountIDR: A, tenderedIDR: A },
        { method: 'qris_static', amountIDR: B },
      ],
      createdAtClient: 1700000000000,
    });
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'sum-cash',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: C,
      createdAtClient: 1700000000000,
    });

    await asOwner.mutation(api.shifts.close, {
      id: shiftId,
      countedCashIDR: OPENING + A + C,
    });
    const res = await asOwner.query(api.shifts.listClosed, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    const s = res.page[0]!;
    expect(s.ordersCount).toBe(2);
    expect(s.salesTotalIDR).toBe(C + TOTAL); // each order's total once: 18000 + 18000
    expect(s.cashSalesIDR).toBe(A + C); // 28000
    expect(s.qrisSalesIDR).toBe(B); // 8000
    expect(s.varianceIDR).toBe(0);
  });

  it('reports.payments attributes each tender method its amount; total counts each order once', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, shiftId, cashierId, itemId } = await setup(t);
    const now = Date.now();

    await asOwner.mutation(api.orders.createSplitSale, {
      clientId: 'rep-split',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      tenders: [
        { method: 'cash', amountIDR: A, tenderedIDR: A },
        { method: 'qris_static', amountIDR: B },
      ],
      createdAtClient: now,
    });
    await asOwner.mutation(api.orders.createCashSale, {
      clientId: 'rep-cash',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: C,
      createdAtClient: now,
    });

    const r = await asOwner.query(api.reports.payments, { range: { preset: 'today' } });
    const cash = r.methods.find((m) => m.method === 'cash');
    const qris = r.methods.find((m) => m.method === 'qris_static');
    expect(cash?.amountIDR).toBe(A + C); // 28000
    expect(qris?.amountIDR).toBe(B); // 8000
    // cash bucket counts both orders (split + pure-cash); qris only the split.
    expect(cash?.count).toBe(2);
    expect(qris?.count).toBe(1);
    expect(r.totalIDR).toBe(TOTAL + C); // each order total once: 36000
  });
});
