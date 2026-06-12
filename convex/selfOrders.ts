import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, type QueryCtx, query } from './_generated/server';
import { heldLineValidator } from './lib/heldOrder';
import { requireOwned, requireOwnerCafe } from './lib/auth';

/**
 * Staff (OWNER-GATED) side of QR self-ordering. The public, unauthenticated
 * intake lives in `convex/public.ts`; everything here calls `requireOwnerCafe`
 * and scopes every read/write to the owner's cafe. A self-order only becomes a
 * real order via `accept` → the authenticated /sale register path.
 */

// ---------------------------------------------------------------------------
// queue — pending self-orders for the owner's cafe, newest-first
// ---------------------------------------------------------------------------

const queueRow = v.object({
  id: v.id('selfOrders'),
  tableName: v.optional(v.string()),
  lineCount: v.number(),
  subtotalIDR: v.number(),
  customerNote: v.optional(v.string()),
  createdAt: v.number(),
  // A compact line preview for the queue card (display fields only).
  lines: v.array(
    v.object({
      nameSnapshot: v.string(),
      qty: v.number(),
      variantName: v.optional(v.string()),
      modifierLabels: v.array(v.string()),
    })
  ),
});

export const queue = query({
  args: {},
  returns: v.array(queueRow),
  handler: async (ctx, _args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('selfOrders')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'new'))
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        id: r._id,
        ...(r.tableName ? { tableName: r.tableName } : {}),
        lineCount: r.lines.length,
        subtotalIDR: r.subtotalIDR,
        ...(r.customerNote ? { customerNote: r.customerNote } : {}),
        createdAt: r.createdAt,
        lines: r.lines.map((l) => ({
          nameSnapshot: l.nameSnapshot,
          qty: l.qty,
          ...(l.variantName ? { variantName: l.variantName } : {}),
          modifierLabels: l.modifierLabels,
        })),
      }));
  },
});

// ---------------------------------------------------------------------------
// getForCart — the held-order recall payload shape, so /sale loads a self-order
// identically to a parked held order
// ---------------------------------------------------------------------------

/**
 * Map a stored self-order line into the held-order recall line shape the
 * sale-screen's cart `load` action consumes. The only divergence is
 * `modifierLabels`: self-orders store option names as strings, but the cart line
 * expects `{groupName, optionName, priceAdjustmentIDR}` objects — so we rehydrate
 * them from the snapshot's `modifierOptionIds`. (Final pricing is recomputed
 * server-side from `modifierOptionIds` at ring-up; the labels are display-only.)
 */
async function toRecallLine(
  ctx: QueryCtx,
  line: Doc<'selfOrders'>['lines'][number]
): Promise<Doc<'heldOrders'>['lines'][number]> {
  const modifierLabels: Array<{
    groupName: string;
    optionName: string;
    priceAdjustmentIDR: number;
  }> = [];
  for (const optionId of line.modifierOptionIds) {
    const option = await ctx.db.get(optionId);
    if (!option) continue;
    const group = await ctx.db.get(option.groupId);
    modifierLabels.push({
      groupName: group?.name ?? '',
      optionName: option.name,
      priceAdjustmentIDR: option.priceAdjustmentIDR,
    });
  }
  return {
    menuItemId: line.menuItemId,
    nameSnapshot: line.nameSnapshot,
    qty: line.qty,
    unitPriceIDR: line.unitPriceIDR,
    ...(line.variantId ? { variantId: line.variantId } : {}),
    ...(line.variantName ? { variantName: line.variantName } : {}),
    modifierOptionIds: line.modifierOptionIds,
    modifierLabels,
  };
}

export const getForCart = query({
  args: { id: v.id('selfOrders') },
  returns: v.object({
    tableId: v.optional(v.id('tables')),
    lines: v.array(heldLineValidator),
  }),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await requireOwned(ctx, cafeId, id, 'Pesanan');
    const lines = await Promise.all(row.lines.map((l) => toRecallLine(ctx, l)));
    return {
      ...(row.tableId ? { tableId: row.tableId } : {}),
      lines,
    };
  },
});

// ---------------------------------------------------------------------------
// accept / reject — owner transitions
// ---------------------------------------------------------------------------

export const accept = mutation({
  args: { id: v.id('selfOrders') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Pesanan');
    await ctx.db.patch(id, { status: 'accepted', acceptedAt: Date.now() });
    return null;
  },
});

export const reject = mutation({
  args: { id: v.id('selfOrders') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Pesanan');
    await ctx.db.patch(id, { status: 'rejected' });
    return null;
  },
});
