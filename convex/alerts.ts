import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalQuery } from './_generated/server';
import type { Id } from './_generated/dataModel';
import {
  buildLowStockHtml,
  buildLowStockText,
  type LowStockItem,
} from './lib/lowStockEmail';
import { currentStockQty } from './lib/inventory';

const canonicalUnit = v.union(
  v.literal('g'),
  v.literal('ml'),
  v.literal('piece')
);

const lowStockItem = v.object({
  name: v.string(),
  currentStockQty: v.number(),
  reorderThreshold: v.number(),
  unit: canonicalUnit,
});

/**
 * One cafe's low-stock ingredients, for the nightly digest (system-side, no
 * owner gate). Mirrors `dashboard.lowStock`'s computation but returns ALL items
 * below threshold (not sliced), sorted by current stock ascending.
 */
export const lowStockForCafe = internalQuery({
  args: { cafeId: v.id('cafes') },
  returns: v.object({ cafeName: v.string(), items: v.array(lowStockItem) }),
  handler: async (ctx, { cafeId }) => {
    const cafe = await ctx.db.get(cafeId);
    const ingredients = await ctx.db
      .query('ingredients')
      .withIndex('by_cafe_active', (q) =>
        q.eq('cafeId', cafeId).eq('archived', false)
      )
      .collect();
    const items: LowStockItem[] = [];
    for (const ing of ingredients) {
      const qty = await currentStockQty(ctx, cafeId, ing._id);
      if (qty < ing.reorderThreshold) {
        items.push({
          name: ing.name,
          currentStockQty: qty,
          reorderThreshold: ing.reorderThreshold,
          unit: ing.canonicalUnit,
        });
      }
    }
    items.sort((a, b) => a.currentStockQty - b.currentStockQty);
    return { cafeName: cafe?.name ?? 'kodapos', items };
  },
});

/**
 * Nightly low-stock email digest, opt-in per cafe. An action (not a mutation)
 * because it POSTs to Resend over HTTP. No-ops when RESEND_API_KEY is unset.
 * Pages through every cafe; for each one that opted in (`emailLowStockDaily`)
 * and has a recipient (`summaryEmail`), emails the list of below-threshold
 * ingredients when there are any. Each cafe's work is wrapped in try/catch so a
 * single send failure never aborts the cron or the other cafes.
 */
export const lowStockDigest = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const key = process.env.RESEND_API_KEY;
    if (!key) return null;
    const from = process.env.RESEND_FROM ?? 'kodapos <onboarding@resend.dev>';

    let cursor: string | null = null;
    for (;;) {
      const page: {
        cafes: Array<{ cafeId: Id<'cafes'> }>;
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.forecast.listCafesForCron, { cursor });
      for (const cafe of page.cafes) {
        const cafeId = cafe.cafeId;
        try {
          const notif = await ctx.runQuery(
            internal.settings.notificationsForCafe,
            { cafeId }
          );
          if (!(notif?.emailLowStockDaily && notif.summaryEmail)) continue;
          const to = notif.summaryEmail;

          const { cafeName, items } = await ctx.runQuery(
            internal.alerts.lowStockForCafe,
            { cafeId }
          );
          if (items.length === 0) continue;

          const html = buildLowStockHtml(cafeName, items);
          const text = buildLowStockText(cafeName, items);
          const subject = `Low stock alert ${cafeName}`;
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ from, to, subject, html, text }),
          });
          if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`Resend ${res.status}. ${detail}`.trim());
          }
        } catch (err) {
          console.warn(`lowStockDigest failed for cafe ${cafeId}:`, err);
        }
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    return null;
  },
});
