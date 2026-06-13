import { v } from 'convex/values';
import { api } from './_generated/api';
import { action } from './_generated/server';
import {
  buildReceiptHtml,
  buildReceiptText,
  type ReceiptCafe,
  type ReceiptOrder,
} from './lib/receipt';

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
    const cafe = await ctx.runQuery(api.cafes.myCafe, {});

    const html = buildReceiptHtml(order as ReceiptOrder, cafe as ReceiptCafe | null);
    const text = buildReceiptText(order as ReceiptOrder, cafe as ReceiptCafe | null);

    const from = process.env.RESEND_FROM ?? 'kodapos <onboarding@resend.dev>';
    const subject = `Receipt ${cafe?.name ?? 'kodapos'}`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gagal mengirim email (${res.status}). ${detail}`.trim());
    }
    return null;
  },
});
