import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import { action, internalAction } from './_generated/server';
import type { Id } from './_generated/dataModel';
import {
  buildReceiptHtml,
  buildReceiptText,
  type ReceiptCafe,
  type ReceiptOrder,
} from './lib/receipt';
import {
  buildShiftSummaryHtml,
  buildShiftSummaryText,
  type ShiftSummaryData,
} from './lib/shiftSummary';
import { sendEmail } from './lib/resend';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Email an order receipt to a customer via Resend. Owner-scoped: `getById`/
 * `myCafe` are gated on the calling owner, so an owner can only email their own
 * orders. Degrades gracefully without a configured key (throws a clear,
 * user-facing error the UI can toast). The receipt content is English.
 */
export const sendReceipt = action({
  args: { orderId: v.id('orders'), to: v.string() },
  returns: v.null(),
  handler: async (ctx, { orderId, to }) => {
    if (!EMAIL_RE.test(to.trim())) throw new Error('Alamat email tidak valid.');

    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('Email belum dikonfigurasi.');

    const order = await ctx.runQuery(api.orders.getById, { id: orderId });
    if (!order) throw new Error('Pesanan tidak ditemukan.');
    if (order.paymentStatus === 'pending') throw new Error('Pesanan belum dibayar.');
    const cafe = await ctx.runQuery(api.cafes.myCafe, {});

    const html = buildReceiptHtml(order as ReceiptOrder, cafe as ReceiptCafe | null);
    const text = buildReceiptText(order as ReceiptOrder, cafe as ReceiptCafe | null);

    const subject = `Receipt ${cafe?.name ?? 'kodapos'}`;
    await sendEmail({ to, subject, html, text });
    return null;
  },
});

/** POST a built shift summary to Resend. Throws on a non-ok response. */
async function postShiftSummary(to: string, data: ShiftSummaryData): Promise<void> {
  const html = buildShiftSummaryHtml(data);
  const text = buildShiftSummaryText(data);
  const subject = `Shift summary ${data.cafeName}`;
  await sendEmail({ to, subject, html, text });
}

/**
 * Email a shift-close summary on demand. Owner-scoped: `summaryDataOwned` is
 * gated on the calling owner, so an owner can only email their own shifts.
 * Degrades gracefully without a configured key (throws a clear, user-facing
 * error the UI can toast). The summary content is English.
 */
export const sendShiftSummary = action({
  args: { shiftId: v.id('shifts'), to: v.string() },
  returns: v.null(),
  handler: async (ctx, { shiftId, to }) => {
    if (!EMAIL_RE.test(to.trim())) throw new Error('Alamat email tidak valid.');
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('Email belum dikonfigurasi.');

    const data = await ctx.runQuery(api.shifts.summaryDataOwned, { shiftId });
    await postShiftSummary(to.trim(), data as ShiftSummaryData);
    return null;
  },
});

/**
 * Scheduled auto-send fired by `shifts.close`. System-side (no owner gate): it
 * reads `internal.shifts.summaryData`. A scheduled job MUST NOT throw
 * uncaught: when the key is unset it no-ops, and a Resend failure is logged and
 * swallowed so a transient send error never crashes the scheduler.
 */
export const sendShiftSummaryScheduled = internalAction({
  args: { shiftId: v.id('shifts'), to: v.string() },
  returns: v.null(),
  handler: async (ctx, { shiftId, to }) => {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      console.warn(
        `sendShiftSummaryScheduled: RESEND_API_KEY unset, skipping shift ${shiftId as Id<'shifts'>}`
      );
      return null;
    }
    try {
      const data = await ctx.runQuery(internal.shifts.summaryData, { shiftId });
      await postShiftSummary(to, data as ShiftSummaryData);
    } catch (err) {
      console.error(`sendShiftSummaryScheduled failed for shift ${shiftId}:`, err);
    }
    return null;
  },
});
