import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalQuery, mutation, query } from './_generated/server';
import { requireActiveOutlet, requireOwned } from './lib/auth';
import { cashCollectedIDR, methodTotals } from './lib/payment';
import { requireActiveCashier } from './lib/staff';

const shiftWithCashier = v.object({
  _id: v.id('shifts'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  cashierId: v.id('cafeStaff'),
  cashierName: v.string(),
  openedAt: v.number(),
  closedAt: v.optional(v.number()),
  openingFloatIDR: v.number(),
  expectedCashIDR: v.optional(v.number()),
  countedCashIDR: v.optional(v.number()),
  varianceIDR: v.optional(v.number()),
  queuedCashIDR: v.optional(v.number()),
  status: v.union(v.literal('open'), v.literal('closed')),
});

function assertIDR(n: number, label: string): number {
  if (!Number.isInteger(n)) throw new Error(`${label} harus berupa angka bulat (rupiah).`);
  if (n < 0) throw new Error(`${label} tidak boleh negatif.`);
  return n;
}

/**
 * The drawer arithmetic for one shift, ALWAYS recomputed from the orders and
 * cash movements that currently exist — never read back off the frozen
 * `expectedCashIDR`/`varianceIDR` a close wrote.
 *
 * That matters because a shift can be closed with offline sales still queued on
 * the device: `orders.createReplayedCashSale` posts a paid cash order into an
 * already-closed shift minutes or hours later. A frozen expected-cash figure
 * cannot know about that money, while `cashSalesIDR` here (derived from orders)
 * picks it up the instant it lands — so preferring the frozen number made the
 * two disagree by exactly the offline amount, and the Z-report showed the
 * replayed cash as an unexplained overage on top of the orders that already
 * contained it.
 *
 * Two derived figures keep the numbers honest across the whole window:
 *
 * - `lateCashIDR` — cash from paid orders that posted after the drawer was
 *   counted. Identified by the `shift_closed` reconciliation row that
 *   `orders.recordReconciliations` writes for exactly this case, NOT by
 *   comparing timestamps: `createdAtClient` on a replayed sale is back inside
 *   the shift, and `_creationTime` versus `closedAt` is a same-millisecond
 *   coin flip at the boundary. The marker row is the fact itself.
 * - `unpostedQueuedIDR` — what the closing client declared as still queued
 *   (`shift.queuedCashIDR`), less whatever has since replayed, floored at 0. It
 *   holds expected cash steady during the window between close and replay: at
 *   close it is the full queued amount, and it drains to 0 as the sales post,
 *   with `cashSalesIDR` rising by the same amount.
 *
 * Net effect: `expectedCashIDR` equals the cash that should physically be in
 * the drawer, at close and at every point after it, whether or not the queue
 * has drained. A shift closed before this field existed simply has
 * `queuedCashIDR` undefined and gets the live recomputation alone, which is
 * still the fix for the double-count.
 */
/**
 * Ids of the orders that posted into an already-closed shift, for one cafe.
 * Read once and passed down when several shifts are summarized in a row
 * (`listClosed`), so a page of 20 shifts does not read this table 20 times.
 */
async function lateOrderIdsFor(
  ctx: QueryCtx | MutationCtx,
  cafeId: Id<'cafes'>
): Promise<Set<string>> {
  // Indexed on kind, not filtered after a by_cafe collect: these rows are only
  // ever flagged resolved, never deleted, so scanning the whole table here grew
  // without bound for the life of the outlet and would eventually blow the
  // per-query read limit on the very page that depends on it.
  const rows = await ctx.db
    .query('saleReconciliations')
    .withIndex('by_cafe_kind', (q) => q.eq('cafeId', cafeId).eq('kind', 'shift_closed'))
    .collect();
  return new Set(rows.map((r) => r.orderId as string));
}

type BreakdownPrefetch = {
  /** The shift's orders, when the caller already collected them. */
  orders?: Doc<'orders'>[];
  /** The cafe's late-posting order ids, from {@link lateOrderIdsFor}. */
  lateOrderIds?: Set<string>;
};

async function shiftCashBreakdown(
  ctx: QueryCtx | MutationCtx,
  shift: Doc<'shifts'>,
  prefetch: BreakdownPrefetch = {}
) {
  const orders =
    prefetch.orders ??
    (await ctx.db
      .query('orders')
      .withIndex('by_shift', (q) => q.eq('shiftId', shift._id))
      .collect());
  const paid = orders.filter((o) => o.paymentStatus === 'paid');
  const cashSalesIDR = paid.reduce((s, o) => s + cashCollectedIDR(o), 0);
  // Only a closed shift can have anything land late, so an open one skips the
  // read entirely.
  const lateOrderIds =
    shift.status === 'closed'
      ? (prefetch.lateOrderIds ?? (await lateOrderIdsFor(ctx, shift.cafeId)))
      : new Set<string>();
  const lateCashIDR = paid
    .filter((o) => lateOrderIds.has(o._id))
    .reduce((s, o) => s + cashCollectedIDR(o), 0);
  const unpostedQueuedIDR = Math.max(0, (shift.queuedCashIDR ?? 0) - lateCashIDR);
  const movements = await ctx.db
    .query('cashMovements')
    .withIndex('by_shift', (q) => q.eq('shiftId', shift._id))
    .collect();
  let cashInIDR = 0;
  let cashOutIDR = 0;
  for (const m of movements) {
    if (m.direction === 'in') cashInIDR += m.amountIDR;
    else cashOutIDR += m.amountIDR;
  }
  const expectedCashIDR =
    shift.openingFloatIDR + cashSalesIDR + cashInIDR - cashOutIDR + unpostedQueuedIDR;
  return {
    cashSalesIDR,
    cashInIDR,
    cashOutIDR,
    expectedCashIDR,
    lateCashIDR,
    unpostedQueuedIDR,
  };
}

export const current = query({
  args: {},
  returns: v.union(shiftWithCashier, v.null()),
  handler: async (ctx) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const open = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .unique();
    if (!open) return null;
    const cashier = await ctx.db.get(open.cashierId);
    return { ...open, cashierName: cashier?.name ?? '—' };
  },
});

export const open = mutation({
  args: { cashierId: v.id('cafeStaff'), openingFloatIDR: v.number() },
  returns: v.id('shifts'),
  handler: async (ctx, { cashierId, openingFloatIDR }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const cashier = await requireActiveCashier(ctx, cafeId, cashierId);
    const floatIDR = assertIDR(openingFloatIDR, 'Modal awal');
    const existingOpen = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .unique();
    if (existingOpen) {
      const existingCashier = await ctx.db.get(existingOpen.cashierId);
      const name = existingCashier?.name ?? '—';
      throw new Error(`Shift sudah dibuka oleh ${name}. Tutup dulu sebelum buka baru.`);
    }
    return await ctx.db.insert('shifts', {
      cafeId,
      cashierId: cashier._id,
      openedAt: Date.now(),
      openingFloatIDR: floatIDR,
      status: 'open',
    });
  },
});

export const close = mutation({
  args: {
    id: v.id('shifts'),
    countedCashIDR: v.number(),
    /**
     * The sales still sitting in this device's outbox, one entry each. The
     * server cannot see the outbox, so the closing client declares them;
     * without the declaration the drawer count reads as an overage for the
     * whole window between close and replay.
     *
     * Per-sale, NOT a pre-summed total, and that is the whole point. The
     * client's snapshot of its outbox is up to a poll interval stale, so a
     * queued sale can replay in the gap between the snapshot and this
     * mutation. A bare total would then be counted twice — once inside
     * `shiftCashBreakdown` (the order now exists) and once in the
     * declaration — and it could never drain, because `lateCashIDR` only
     * counts orders that posted into an ALREADY-CLOSED shift and this one
     * posted while it was still open. The result was a permanent phantom
     * shortfall on the Z-report: exactly the "is my staff short?" question
     * this whole feature exists to answer honestly. Declaring `clientId`s
     * lets the server drop any that already landed, so the arithmetic is
     * correct regardless of timing.
     */
    queuedSales: v.optional(v.array(v.object({ clientId: v.string(), totalIDR: v.number() }))),
  },
  returns: v.null(),
  handler: async (ctx, { id, countedCashIDR, queuedSales }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const shift = await requireOwned(ctx, cafeId, id, 'Shift');
    if (shift.status !== 'open') {
      throw new Error('Shift sudah ditutup.');
    }
    const counted = assertIDR(countedCashIDR, 'Uang terhitung');
    let queued = 0;
    for (const declared of queuedSales ?? []) {
      assertIDR(declared.totalIDR, 'Penjualan menunggu sinkron');
      // Already posted (it replayed between the client's snapshot and now, or
      // the outbox entry outlived a successful post). Its cash is already in
      // the orders `shiftCashBreakdown` reads below; counting it again here
      // would inflate expected cash forever.
      const posted = await ctx.db
        .query('orders')
        .withIndex('by_cafe_clientId', (q) =>
          q.eq('cafeId', cafeId).eq('clientId', declared.clientId)
        )
        .unique();
      if (posted) continue;
      queued += declared.totalIDR;
    }
    // The shift row has no queuedCashIDR yet, so the breakdown's own
    // unpostedQueuedIDR is 0 here; add the declaration explicitly.
    const { expectedCashIDR: postedExpectedIDR } = await shiftCashBreakdown(ctx, shift);
    const expectedCashIDR = postedExpectedIDR + queued;
    await ctx.db.patch(id, {
      status: 'closed',
      closedAt: Date.now(),
      countedCashIDR: counted,
      expectedCashIDR,
      varianceIDR: counted - expectedCashIDR,
      ...(queued > 0 ? { queuedCashIDR: queued } : {}),
    });

    // Auto-send the shift-summary email when the owner has enabled it. Run via
    // the scheduler so a Resend failure (or missing key) never rolls back the
    // close. The scheduled action is system-side, so it reads `summaryData`
    // (no owner gate).
    const settingsRow = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    const notifications = settingsRow?.notifications;
    if (notifications?.emailSummaryOnClose && notifications.summaryEmail) {
      await ctx.scheduler.runAfter(0, internal.email.sendShiftSummaryScheduled, {
        shiftId: id,
        to: notifications.summaryEmail,
      });
    }
    return null;
  },
});

export const closeoutSummary = query({
  args: { shiftId: v.id('shifts') },
  returns: v.object({
    cashierName: v.string(),
    openingFloatIDR: v.number(),
    cashSalesIDR: v.number(),
    cashInIDR: v.number(),
    cashOutIDR: v.number(),
    expectedCashIDR: v.number(),
    countedCashIDR: v.union(v.number(), v.null()),
    varianceIDR: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, { shiftId }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const shift = await requireOwned(ctx, cafeId, shiftId, 'Shift');
    const { cashSalesIDR, cashInIDR, cashOutIDR, expectedCashIDR } = await shiftCashBreakdown(
      ctx,
      shift
    );
    const cashier = await ctx.db.get(shift.cashierId);
    const countedCashIDR = shift.countedCashIDR ?? null;
    return {
      cashierName: cashier?.name ?? '—',
      openingFloatIDR: shift.openingFloatIDR,
      cashSalesIDR,
      cashInIDR,
      cashOutIDR,
      expectedCashIDR,
      countedCashIDR,
      varianceIDR: countedCashIDR !== null ? countedCashIDR - expectedCashIDR : null,
    };
  },
});

const shiftSummary = v.object({
  _id: v.id('shifts'),
  openedAt: v.number(),
  closedAt: v.number(),
  cashierName: v.string(),
  openingFloatIDR: v.number(),
  countedCashIDR: v.union(v.number(), v.null()),
  ordersCount: v.number(),
  salesTotalIDR: v.number(),
  cashSalesIDR: v.number(),
  qrisSalesIDR: v.number(),
  expectedCashIDR: v.number(),
  varianceIDR: v.union(v.number(), v.null()),
  /** Cash from sales that posted after this shift closed (offline replay). */
  lateCashIDR: v.number(),
  /** What the closing client declared as still queued on the device. */
  queuedCashIDR: v.number(),
});

async function summarizeShift(ctx: QueryCtx, shift: Doc<'shifts'>, lateOrderIds?: Set<string>) {
  const orders = await ctx.db
    .query('orders')
    .withIndex('by_shift', (q) => q.eq('shiftId', shift._id))
    .collect();
  const paid = orders.filter((o) => o.paymentStatus === 'paid');
  let salesTotalIDR = 0;
  let cashSalesIDR = 0;
  let qrisSalesIDR = 0;
  for (const o of paid) {
    salesTotalIDR += o.totalIDR;
    cashSalesIDR += cashCollectedIDR(o);
    // QRIS only — NOT "everything non-cash". Gift-card tenders are a separate
    // method and must not be mislabeled as QRIS in the shift summary (they stay
    // in salesTotalIDR but neither the cash nor the QRIS bucket).
    qrisSalesIDR += methodTotals(o)
      .filter((t) => t.method === 'qris_static' || t.method === 'qris_dynamic')
      .reduce((s, t) => s + t.amountIDR, 0);
  }
  const cashier = await ctx.db.get(shift.cashierId);
  const countedCashIDR = shift.countedCashIDR ?? null;
  // Recomputed, NOT read back off shift.expectedCashIDR / shift.varianceIDR.
  // A replayed offline sale lands in a shift that is already closed, and the
  // frozen pair cannot move with it — see shiftCashBreakdown's doc comment for
  // why preferring them double-counted the offline cash on the Z-report.
  const { expectedCashIDR, lateCashIDR } = await shiftCashBreakdown(ctx, shift, {
    orders,
    ...(lateOrderIds ? { lateOrderIds } : {}),
  });
  return {
    _id: shift._id,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt ?? shift.openedAt,
    cashierName: cashier?.name ?? '—',
    openingFloatIDR: shift.openingFloatIDR,
    countedCashIDR,
    ordersCount: paid.length,
    salesTotalIDR,
    cashSalesIDR,
    qrisSalesIDR,
    expectedCashIDR,
    varianceIDR: countedCashIDR !== null ? countedCashIDR - expectedCashIDR : null,
    lateCashIDR,
    queuedCashIDR: shift.queuedCashIDR ?? 0,
  };
}

const shiftSummaryData = v.object({
  cafeName: v.string(),
  openedAt: v.number(),
  closedAt: v.number(),
  salesTotalIDR: v.number(),
  cashSalesIDR: v.number(),
  qrisSalesIDR: v.number(),
  openingFloatIDR: v.number(),
  expectedCashIDR: v.number(),
  countedCashIDR: v.union(v.number(), v.null()),
  varianceIDR: v.union(v.number(), v.null()),
});

/** Resolve the ShiftSummaryData shape (cafe name + the shift numbers) for a shift. */
async function buildSummaryData(ctx: QueryCtx, shift: Doc<'shifts'>) {
  const cafe = await ctx.db.get(shift.cafeId);
  const s = await summarizeShift(ctx, shift);
  return {
    cafeName: cafe?.name ?? 'kodapos',
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    salesTotalIDR: s.salesTotalIDR,
    cashSalesIDR: s.cashSalesIDR,
    qrisSalesIDR: s.qrisSalesIDR,
    openingFloatIDR: s.openingFloatIDR,
    expectedCashIDR: s.expectedCashIDR,
    countedCashIDR: s.countedCashIDR,
    varianceIDR: s.varianceIDR,
  };
}

/**
 * System-side summary numbers for a shift. No owner gate: invoked by the
 * scheduled auto-send action (`email.sendShiftSummaryScheduled`) which runs
 * with no user identity.
 */
export const summaryData = internalQuery({
  args: { shiftId: v.id('shifts') },
  returns: shiftSummaryData,
  handler: async (ctx, { shiftId }) => {
    const shift = await ctx.db.get(shiftId);
    if (!shift) throw new Error('Shift tidak ditemukan.');
    return await buildSummaryData(ctx, shift);
  },
});

/** Owner-gated summary numbers, for the manual "Email ringkasan" send. */
export const summaryDataOwned = query({
  args: { shiftId: v.id('shifts') },
  returns: shiftSummaryData,
  handler: async (ctx, { shiftId }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const shift = await requireOwned(ctx, cafeId, shiftId, 'Shift');
    return await buildSummaryData(ctx, shift);
  },
});

export const listClosed = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(shiftSummary),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const result = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'closed'))
      .order('desc')
      .paginate(paginationOpts);
    const lateOrderIds = await lateOrderIdsFor(ctx, cafeId);
    const page = await Promise.all(result.page.map((s) => summarizeShift(ctx, s, lateOrderIds)));
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});
