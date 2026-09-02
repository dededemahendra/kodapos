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
  itemId: Id<'menuItems'>;
};

// Mirrors the setup() helper in tests/convex/sale-core.test.ts and
// tests/convex/replay-sale.test.ts: a 20.000 item, an open shift with a
// 100.000 float, so every number below is checkable by hand.
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
  const shiftId = await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  const itemId = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Kopi',
    priceIDR: 20000,
  });
  return { asOwner, cafeId, cashierId, shiftId, itemId };
}

async function replaySale(s: Setup, clientId: string) {
  return await s.asOwner.mutation(api.orders.createReplayedCashSale, {
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
}

async function summaryOf(s: Setup) {
  const { page } = await s.asOwner.query(api.shifts.listClosed, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  return page.find((row) => row._id === s.shiftId)!;
}

describe('closed-shift cash with sales still queued', () => {
  it('a replayed sale no longer reads as an unexplained overage', async () => {
    // The regression this exists for. The till took 20.000 cash offline, so the
    // drawer holds 120.000 and the cashier counts 120.000 — but the server
    // knows nothing of the queued sale at close, so expected freezes at
    // 100.000. Before the fix the frozen pair was preferred on read forever:
    // the replayed order showed up in cashSalesIDR while expected stayed at
    // 100.000, and the owner saw +20.000 of "overage" for cash that was already
    // counted in the orders below it.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.shifts.close, { id: s.shiftId, countedCashIDR: 120000 });

    const atClose = await summaryOf(s);
    expect(atClose.expectedCashIDR).toBe(100000);
    expect(atClose.varianceIDR).toBe(20000);

    await replaySale(s, 'offline-1');

    const afterReplay = await summaryOf(s);
    expect(afterReplay.cashSalesIDR).toBe(20000);
    expect(afterReplay.expectedCashIDR).toBe(120000);
    expect(afterReplay.varianceIDR).toBe(0);
    expect(afterReplay.lateCashIDR).toBe(20000);
  });

  it('declaring the queued cash at close reconciles the drawer immediately', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.shifts.close, {
      id: s.shiftId,
      countedCashIDR: 120000,
      queuedSales: [{ clientId: 'offline-1', totalIDR: 20000 }],
    });

    // Expected already accounts for the sale nobody has posted yet.
    const atClose = await summaryOf(s);
    expect(atClose.expectedCashIDR).toBe(120000);
    expect(atClose.varianceIDR).toBe(0);
    expect(atClose.queuedCashIDR).toBe(20000);
    expect(atClose.cashSalesIDR).toBe(0);

    await replaySale(s, 'offline-1');

    // ...and stays put once it does: the declared-but-unposted amount drains by
    // exactly what the replay added, so expected never moves and the owner is
    // never shown a variance that swings and then swings back.
    const afterReplay = await summaryOf(s);
    expect(afterReplay.cashSalesIDR).toBe(20000);
    expect(afterReplay.expectedCashIDR).toBe(120000);
    expect(afterReplay.varianceIDR).toBe(0);
    expect(afterReplay.lateCashIDR).toBe(20000);
  });

  it('never lets an over-declared queue inflate expected cash below what posted', async () => {
    // The declaration is client-supplied. If it overstates what actually
    // replays, the leftover must not linger as phantom expected cash forever —
    // but neither may a bigger-than-declared replay push expected past the real
    // orders. Declared 20.000, two sales (40.000) actually post.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.shifts.close, {
      id: s.shiftId,
      countedCashIDR: 120000,
      queuedSales: [{ clientId: 'offline-1', totalIDR: 20000 }],
    });
    await replaySale(s, 'offline-1');
    await replaySale(s, 'offline-2');

    const after = await summaryOf(s);
    expect(after.cashSalesIDR).toBe(40000);
    // 100.000 float + 40.000 posted, with the declared queue fully drained
    // (floored at 0, never negative).
    expect(after.expectedCashIDR).toBe(140000);
    expect(after.lateCashIDR).toBe(40000);
  });

  it('rejects a non-integer or negative queued-cash declaration', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await expect(
      s.asOwner.mutation(api.shifts.close, {
        id: s.shiftId,
        countedCashIDR: 100000,
        queuedSales: [{ clientId: 'offline-1', totalIDR: 1500.5 }],
      })
    ).rejects.toThrow('angka bulat');
    await expect(
      s.asOwner.mutation(api.shifts.close, {
        id: s.shiftId,
        countedCashIDR: 100000,
        queuedSales: [{ clientId: 'offline-1', totalIDR: -1000 }],
      })
    ).rejects.toThrow('negatif');
  });

  it('does not double-count a declared sale that already posted before close (the race window)', async () => {
    // The declaration comes from an outbox snapshot up to a poll interval
    // stale. If a queued sale replays between that snapshot and the close
    // mutation — here modelled by posting it while the shift is still open,
    // then declaring the same clientId at close — its cash is already inside
    // `shiftCashBreakdown`'s live `cashSalesIDR`. Counting the declaration on
    // top would inflate expected cash by 20.000 forever: unlike a genuine
    // late replay, a sale that posted before close never gets a
    // `shift_closed` marker, so nothing would ever be able to unwind it.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await replaySale(s, 'offline-1');
    await s.asOwner.mutation(api.shifts.close, {
      id: s.shiftId,
      countedCashIDR: 120000,
      queuedSales: [{ clientId: 'offline-1', totalIDR: 20000 }],
    });

    const row = await summaryOf(s);
    expect(row.cashSalesIDR).toBe(20000);
    expect(row.expectedCashIDR).toBe(120000);
    expect(row.varianceIDR).toBe(0);
    expect(row.lateCashIDR).toBe(0);
    expect(row.queuedCashIDR).toBe(0);
  });

  it('stops expecting the cash once a replayed sale is voided', async () => {
    // The regression this exists for. `lateCashIDR` counted only PAID orders,
    // so voiding a replayed sale dropped it out of `cashSalesIDR` and out of
    // the drained-declaration figure at the same time — `unpostedQueuedIDR`
    // climbed straight back by the amount just removed, and expected cash
    // never moved. The owner hands the 20.000 back to the customer and the
    // Z-report goes on demanding it forever.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.shifts.close, {
      id: s.shiftId,
      countedCashIDR: 120000,
      queuedSales: [{ clientId: 'offline-1', totalIDR: 20000 }],
    });
    const replayed = await replaySale(s, 'offline-1');

    const afterReplay = await summaryOf(s);
    expect(afterReplay.expectedCashIDR).toBe(120000);
    expect(afterReplay.varianceIDR).toBe(0);

    await s.asOwner.mutation(api.orders.voidSale, { orderId: replayed.orderId });

    // The cash went back over the counter, so the drawer should only be
    // expected to hold the 100.000 float. Variance is +20.000 against the
    // frozen close-time count, which is the honest reading: 120.000 really was
    // counted, and 20.000 of it has since been refunded.
    const afterVoid = await summaryOf(s);
    expect(afterVoid.cashSalesIDR).toBe(0);
    expect(afterVoid.expectedCashIDR).toBe(100000);
    expect(afterVoid.varianceIDR).toBe(20000);
    // Nothing offline is still counted as landed after close.
    expect(afterVoid.lateCashIDR).toBe(0);
  });

  it('matches the online path when a sale in the same shift is voided', async () => {
    // The parity check the fix is calibrated against: an ONLINE sale voided
    // after close has always behaved this way, so the replayed path must land
    // on exactly the same expected/variance pair.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    const sale = await s.asOwner.mutation(api.orders.createCashSale, {
      clientId: 'online-1',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: Date.now(),
    });
    await s.asOwner.mutation(api.shifts.close, { id: s.shiftId, countedCashIDR: 120000 });
    await s.asOwner.mutation(api.orders.voidSale, { orderId: sale.orderId });

    const row = await summaryOf(s);
    expect(row.expectedCashIDR).toBe(100000);
    expect(row.varianceIDR).toBe(20000);
  });

  it('leaves an ordinary shift with no offline sales untouched', async () => {
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.orders.createCashSale, {
      clientId: 'online-1',
      shiftId: s.shiftId,
      cashierId: s.cashierId,
      lines: [{ menuItemId: s.itemId, qty: 1, modifierOptionIds: [] }],
      cashTenderedIDR: 20000,
      createdAtClient: Date.now(),
    });
    await s.asOwner.mutation(api.shifts.close, { id: s.shiftId, countedCashIDR: 120000 });

    const row = await summaryOf(s);
    expect(row.expectedCashIDR).toBe(120000);
    expect(row.varianceIDR).toBe(0);
    expect(row.lateCashIDR).toBe(0);
    expect(row.queuedCashIDR).toBe(0);
  });
});
