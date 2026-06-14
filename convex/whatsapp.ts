import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import { action, internalQuery } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';
import { buildReceiptText, type ReceiptCafe, type ReceiptOrder } from './lib/receipt';
import { buildWhatsappBody, normalizePhone } from './lib/whatsapp';

/**
 * Server-only read of the connected WhatsApp integration config, including the
 * secret token. Internal so it is never exposed to the client; auth propagates
 * from the calling action, so `requireOwnerCafe` scopes it to the owner.
 */
export const config = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      endpoint: v.string(),
      headerName: v.string(),
      token: v.string(),
      bodyTemplate: v.string(),
    })
  ),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    const wa = row?.integrations?.find((i) => i.key === 'whatsapp' && i.connected);
    const c = wa?.config as
      | { endpoint?: string; headerName?: string; token?: string; bodyTemplate?: string }
      | undefined;
    if (!c?.endpoint || !c.token || !c.bodyTemplate) return null;
    return {
      endpoint: c.endpoint,
      headerName: c.headerName ?? 'Authorization',
      token: c.token,
      bodyTemplate: c.bodyTemplate,
    };
  },
});

/**
 * Send an order receipt to a customer over WhatsApp via the owner's configured
 * provider (generic: POST the filled body template to their endpoint). Owner
 * scoped through `getById` / `myCafe`. The message body is the plain-text
 * receipt (English, same as the emailed receipt).
 */
export const sendReceipt = action({
  args: { orderId: v.id('orders'), to: v.string() },
  returns: v.null(),
  handler: async (ctx, { orderId, to }) => {
    const phone = normalizePhone(to);

    const cfg = await ctx.runQuery(internal.whatsapp.config, {});
    if (!cfg) throw new Error('WhatsApp belum dikonfigurasi.');

    const order = await ctx.runQuery(api.orders.getById, { id: orderId });
    if (!order) throw new Error('Pesanan tidak ditemukan.');
    if (order.paymentStatus === 'pending') throw new Error('Pesanan belum dibayar.');
    const cafe = await ctx.runQuery(api.cafes.myCafe, {});

    const message = buildReceiptText(order as ReceiptOrder, cafe as ReceiptCafe | null);
    const body = buildWhatsappBody(cfg.bodyTemplate, phone, message);

    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [cfg.headerName]: cfg.token },
      body,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gagal mengirim WhatsApp (${res.status}). ${detail.slice(0, 120)}`.trim());
    }
    return null;
  },
});
