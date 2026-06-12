import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setupOwner(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return { asOwner };
}

// Full sale-checkout seeding (mirrors split-tender.test.ts). Espresso is a
// no-recipe item priced at 50000; one unit → an order total of 50000.
type SaleSetup = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cashierId: Id<'cafeStaff'>;
  shiftId: Id<'shifts'>;
  itemId: Id<'menuItems'>;
};

const ITEM_PRICE = 50_000; // one Espresso = 50000

async function setupSale(t: ReturnType<typeof convexTest>): Promise<SaleSetup> {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: 'Asia/Jakarta',
    taxRatePct: 0,
    taxEnabled: false,
  });
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100_000 });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Espresso',
    priceIDR: ITEM_PRICE,
  });
  return { asOwner, cashierId, shiftId, itemId };
}

describe('gift card redemption (tender)', () => {
  it('redeem full via createGiftCardSale: order paid, balance 0, redeem ledger −total, giftcard payment row', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setupSale(t);
    const gid = await asOwner.mutation(api.giftCards.issue, {
      code: 'PAYFULL',
      balanceIDR: 100_000,
    });
    // Two units → total 100000, exactly the card balance.
    const res = await asOwner.mutation(api.orders.createGiftCardSale, {
      clientId: 'gc-full',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 2, modifierOptionIds: [] }],
      giftCardCode: 'payfull',
      createdAtClient: 1700000000000,
    });
    expect(res.totalIDR).toBe(100_000);
    expect(res.changeIDR).toBe(0);

    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    expect(order?.paymentStatus).toBe('paid');
    expect(order?.paymentMethod).toBe('giftcard');
    expect(order?.paymentBreakdown).toEqual([{ method: 'giftcard', amountIDR: 100_000 }]);

    const card = await asOwner.query(api.giftCards.getByCode, { code: 'PAYFULL' });
    expect(card?.balanceIDR).toBe(0);

    const txns = await asOwner.query(api.giftCards.transactions, { id: gid });
    // newest-first: redeem, then issue
    expect(txns[0]?.type).toBe('redeem');
    expect(txns[0]?.amountIDR).toBe(-100_000);
    expect(txns[0]?.orderId).toBe(res.orderId);

    const pays = await t.run((ctx) =>
      ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', res.orderId))
        .collect()
    );
    expect(pays).toHaveLength(1);
    expect(pays[0]?.method).toBe('giftcard');
    expect(pays[0]?.amountIDR).toBe(100_000);
    expect(pays[0]?.giftCardId).toBe(gid);
    expect(pays[0]?.confirmedAt).toEqual(expect.any(Number));
  });

  it('redeem partial via split: giftcard 100000 + cash 50000 on a 150000 order; cash reconciliation counts 50000 not 150000', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setupSale(t);
    const gid = await asOwner.mutation(api.giftCards.issue, {
      code: 'PARTIAL',
      balanceIDR: 100_000,
    });
    // Three units → total 150000.
    const res = await asOwner.mutation(api.orders.createSplitSale, {
      clientId: 'gc-partial',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 3, modifierOptionIds: [] }],
      tenders: [
        { method: 'giftcard', giftCardCode: 'partial', amountIDR: 100_000 },
        { method: 'cash', amountIDR: 50_000, tenderedIDR: 50_000 },
      ],
      createdAtClient: 1700000000000,
    });
    expect(res.totalIDR).toBe(150_000);

    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    expect(order?.paymentStatus).toBe('paid');
    expect(order?.paymentMethod).toBe('split');

    const card = await asOwner.query(api.giftCards.getByCode, { code: 'PARTIAL' });
    expect(card?.balanceIDR).toBe(0);

    // The drawer counts only the 50000 cash leg, NOT the 150000 order total.
    const summary = await asOwner.query(api.shifts.closeoutSummary, { shiftId });
    expect(summary.cashSalesIDR).toBe(50_000);
    expect(summary.expectedCashIDR).toBe(100_000 + 50_000); // opening 100k + cash leg

    // The shift-history summary must NOT lump the gift-card leg into QRIS sales.
    await asOwner.mutation(api.shifts.close, { id: shiftId, countedCashIDR: 150_000 });
    const history = await asOwner.query(api.shifts.listClosed, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    const closed = history.page.find((s) => s._id === shiftId);
    expect(closed?.cashSalesIDR).toBe(50_000);
    expect(closed?.qrisSalesIDR).toBe(0); // gift-card leg excluded from QRIS

    const pays = await t.run((ctx) =>
      ctx.db
        .query('payments')
        .withIndex('by_order', (q) => q.eq('orderId', res.orderId))
        .collect()
    );
    expect(pays.reduce((s, p) => s + p.amountIDR, 0)).toBe(150_000);
    const gcRow = pays.find((p) => p.method === 'giftcard');
    expect(gcRow?.giftCardId).toBe(gid);
    expect(gcRow?.amountIDR).toBe(100_000);
  });

  it('insufficient balance is rejected before any deduct (balance unchanged)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setupSale(t);
    await asOwner.mutation(api.giftCards.issue, { code: 'LOWBAL', balanceIDR: 40_000 });
    // One unit → 50000 > balance 40000.
    await expect(
      asOwner.mutation(api.orders.createGiftCardSale, {
        clientId: 'gc-insufficient',
        shiftId,
        cashierId,
        lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
        giftCardCode: 'LOWBAL',
        createdAtClient: 1700000000000,
      })
    ).rejects.toThrow(/saldo kartu hadiah tidak cukup/i);

    const card = await asOwner.query(api.giftCards.getByCode, { code: 'LOWBAL' });
    expect(card?.balanceIDR).toBe(40_000); // untouched
  });

  it('void refunds exactly the redeemed amount once; a second void throws', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setupSale(t);
    const gid = await asOwner.mutation(api.giftCards.issue, {
      code: 'VOIDME',
      balanceIDR: 100_000,
    });
    // One unit → 50000 redeemed (card → 50000).
    const res = await asOwner.mutation(api.orders.createGiftCardSale, {
      clientId: 'gc-void',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 1, modifierOptionIds: [] }],
      giftCardCode: 'VOIDME',
      createdAtClient: 1700000000000,
    });
    let card = await asOwner.query(api.giftCards.getByCode, { code: 'VOIDME' });
    expect(card?.balanceIDR).toBe(50_000);

    await asOwner.mutation(api.orders.voidSale, { orderId: res.orderId });
    card = await asOwner.query(api.giftCards.getByCode, { code: 'VOIDME' });
    expect(card?.balanceIDR).toBe(100_000); // refunded back to original

    const txns = await asOwner.query(api.giftCards.transactions, { id: gid });
    expect(txns[0]?.type).toBe('refund');
    expect(txns[0]?.amountIDR).toBe(50_000);
    expect(txns[0]?.orderId).toBe(res.orderId);

    // A second void can't double-refund (paymentStatus guard).
    await expect(
      asOwner.mutation(api.orders.voidSale, { orderId: res.orderId })
    ).rejects.toThrow();
    card = await asOwner.query(api.giftCards.getByCode, { code: 'VOIDME' });
    expect(card?.balanceIDR).toBe(100_000); // still 100000, not 150000
  });

  it('reports.payments shows a giftcard bucket with the redeemed amount', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, cashierId, shiftId, itemId } = await setupSale(t);
    await asOwner.mutation(api.giftCards.issue, { code: 'REPORTGC', balanceIDR: 100_000 });
    const now = Date.now();
    await asOwner.mutation(api.orders.createGiftCardSale, {
      clientId: 'gc-report',
      shiftId,
      cashierId,
      lines: [{ menuItemId: itemId, qty: 2, modifierOptionIds: [] }],
      giftCardCode: 'REPORTGC',
      createdAtClient: now,
    });
    const r = await asOwner.query(api.reports.payments, { range: { preset: 'today' } });
    const gc = r.methods.find((m) => m.method === 'giftcard');
    expect(gc?.amountIDR).toBe(100_000);
    expect(gc?.count).toBe(1);
  });
});

describe('gift cards management', () => {
  it('issue uppercases + trims the code, sets balance, writes an issue ledger row', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.giftCards.issue, {
      code: '  gift-1  ',
      balanceIDR: 100_000,
    });
    const card = await asOwner.query(api.giftCards.getByCode, { code: 'gift-1' });
    expect(card?._id).toBe(id);
    expect(card?.code).toBe('GIFT-1');
    expect(card?.balanceIDR).toBe(100_000);
    expect(card?.status).toBe('active');

    const txns = await asOwner.query(api.giftCards.transactions, { id });
    expect(txns).toHaveLength(1);
    expect(txns[0]?.type).toBe('issue');
    expect(txns[0]?.amountIDR).toBe(100_000);
  });

  it('topup increases the balance and writes a topup ledger row', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.giftCards.issue, { code: 'CARD2', balanceIDR: 50_000 });
    await asOwner.mutation(api.giftCards.topup, { id, amountIDR: 25_000 });
    const card = await asOwner.query(api.giftCards.getByCode, { code: 'card2' });
    expect(card?.balanceIDR).toBe(75_000);

    const txns = await asOwner.query(api.giftCards.transactions, { id });
    // newest-first: topup, then issue
    expect(txns).toHaveLength(2);
    expect(txns[0]?.type).toBe('topup');
    expect(txns[0]?.amountIDR).toBe(25_000);
    expect(txns[1]?.type).toBe('issue');
  });

  it('getByCode resolves by uppercased code and returns null for unknown', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.giftCards.issue, { code: 'abcd', balanceIDR: 10_000 });
    const card = await asOwner.query(api.giftCards.getByCode, { code: ' AbCd ' });
    expect(card?.code).toBe('ABCD');
    expect(await asOwner.query(api.giftCards.getByCode, { code: 'nope' })).toBeNull();
  });

  it('list returns newest-first and excludes archived by default', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const first = await asOwner.mutation(api.giftCards.issue, { code: 'FIRST', balanceIDR: 10_000 });
    const second = await asOwner.mutation(api.giftCards.issue, {
      code: 'SECOND',
      balanceIDR: 20_000,
    });
    const list = await asOwner.query(api.giftCards.list, {});
    expect(list).toHaveLength(2);
    expect(list[0]?._id).toBe(second); // newest-first
    expect(list[1]?._id).toBe(first);

    await asOwner.mutation(api.giftCards.archive, { id: second });
    const active = await asOwner.query(api.giftCards.list, {});
    expect(active).toHaveLength(1);
    expect(active[0]?._id).toBe(first);
    const all = await asOwner.query(api.giftCards.list, { includeArchived: true });
    expect(all).toHaveLength(2);
  });

  it('archive sets the status to archived', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.giftCards.issue, { code: 'ARCH1', balanceIDR: 5_000 });
    await asOwner.mutation(api.giftCards.archive, { id });
    const card = await asOwner.query(api.giftCards.getByCode, { code: 'ARCH1' });
    expect(card?.status).toBe('archived');
  });

  it('rejects a duplicate code in the same cafe', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await asOwner.mutation(api.giftCards.issue, { code: 'DUP1', balanceIDR: 10_000 });
    await expect(
      asOwner.mutation(api.giftCards.issue, { code: ' dup1 ', balanceIDR: 5_000 })
    ).rejects.toThrow();
  });

  it('rejects a non-positive balance', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.giftCards.issue, { code: 'ZERO1', balanceIDR: 0 })
    ).rejects.toThrow();
    await expect(
      asOwner.mutation(api.giftCards.issue, { code: 'NEG1', balanceIDR: -100 })
    ).rejects.toThrow();
  });

  it('rejects a code shorter than 4 chars', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    await expect(
      asOwner.mutation(api.giftCards.issue, { code: 'abc', balanceIDR: 10_000 })
    ).rejects.toThrow();
  });

  it('rejects a non-positive topup', async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await setupOwner(t);
    const id = await asOwner.mutation(api.giftCards.issue, { code: 'TOP1', balanceIDR: 10_000 });
    await expect(asOwner.mutation(api.giftCards.topup, { id, amountIDR: 0 })).rejects.toThrow();
    await expect(asOwner.mutation(api.giftCards.topup, { id, amountIDR: -5 })).rejects.toThrow();
  });

  it('owner-scope: cafe B cannot topup or archive cafe A card', async () => {
    const t = convexTest(schema, modules);
    const a = await setupOwner(t, 'a@x.com');
    const aId = await a.asOwner.mutation(api.giftCards.issue, {
      code: 'ACARD',
      balanceIDR: 10_000,
    });
    const b = await setupOwner(t, 'b@x.com');
    expect(await b.asOwner.query(api.giftCards.list, { includeArchived: true })).toHaveLength(0);
    await expect(
      b.asOwner.mutation(api.giftCards.topup, { id: aId, amountIDR: 1_000 })
    ).rejects.toThrow();
    await expect(b.asOwner.mutation(api.giftCards.archive, { id: aId })).rejects.toThrow();
  });
});
