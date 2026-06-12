import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { orderTypeValidator } from './lib/orderType';

const ticket = v.object({
  _id: v.id('orders'),
  orderType: v.optional(orderTypeValidator),
  kitchenStatus: v.union(v.literal('new'), v.literal('ready')),
  createdAtClient: v.number(),
  tableName: v.optional(v.string()),
  lines: v.array(
    v.object({
      nameSnapshot: v.string(),
      qty: v.number(),
      modifiers: v.array(v.string()),
    })
  ),
});

/**
 * The kitchen board: the open shift's paid orders with kitchenStatus in
 * {new, ready}, oldest-first (FIFO). Reactive → the board auto-updates as orders
 * are rung and tickets advance. No open shift → []. Each order is mapped to a
 * compact ticket (lines collapse modifiers to "Group: Option" strings; tableName
 * is resolved from a one-pass tables name map).
 */
export const tickets = query({
  args: {},
  returns: v.array(ticket),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);

    const openShift = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .first();
    if (!openShift) return [];

    // Two narrow index reads (new + ready) instead of a full-table scan.
    const newOrders = await ctx.db
      .query('orders')
      .withIndex('by_cafe_kitchen', (q) => q.eq('cafeId', cafeId).eq('kitchenStatus', 'new'))
      .collect();
    const readyOrders = await ctx.db
      .query('orders')
      .withIndex('by_cafe_kitchen', (q) => q.eq('cafeId', cafeId).eq('kitchenStatus', 'ready'))
      .collect();

    const orders = [...newOrders, ...readyOrders]
      .filter((o) => o.paymentStatus === 'paid' && o.shiftId === openShift._id)
      .sort((a, b) => a.createdAtClient - b.createdAtClient);

    // One-pass table name map for tableName resolution.
    const tables = await ctx.db
      .query('tables')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .collect();
    const tableNameById = new Map(tables.map((tbl) => [tbl._id, tbl.name] as const));

    return orders.map((o) => {
      const tableName = o.tableId ? tableNameById.get(o.tableId) : undefined;
      return {
        _id: o._id,
        ...(o.orderType !== undefined ? { orderType: o.orderType } : {}),
        // Filtered to new/ready above; assert the narrowed literal type.
        kitchenStatus: o.kitchenStatus as 'new' | 'ready',
        createdAtClient: o.createdAtClient,
        ...(tableName !== undefined ? { tableName } : {}),
        lines: o.lines.map((l) => ({
          nameSnapshot: l.nameSnapshot,
          qty: l.qty,
          modifiers: l.modifiersSnapshot.map((m) => `${m.groupName}: ${m.optionName}`),
        })),
      } satisfies {
        _id: Doc<'orders'>['_id'];
        orderType?: Doc<'orders'>['orderType'];
        kitchenStatus: 'new' | 'ready';
        createdAtClient: number;
        tableName?: string;
        lines: Array<{ nameSnapshot: string; qty: number; modifiers: string[] }>;
      };
    });
  },
});

/**
 * Advance a kitchen ticket forward: 'ready' (made) or 'done' (cleared off the
 * board). Owner-gated + ownership-checked. The UI only exposes forward moves;
 * the mutation just sets the value.
 */
export const advance = mutation({
  args: {
    orderId: v.id('orders'),
    status: v.union(v.literal('ready'), v.literal('done')),
  },
  returns: v.null(),
  handler: async (ctx, { orderId, status }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, orderId, 'Pesanan');
    await ctx.db.patch(orderId, { kitchenStatus: status });
    return null;
  },
});
