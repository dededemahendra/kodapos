import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';

const statusV = v.union(
  v.literal('open'),
  v.literal('partial'),
  v.literal('received'),
  v.literal('cancelled')
);

type PoLine = {
  ingredientId: import('./_generated/dataModel').Id<'ingredients'>;
  orderedQty: number;
  receivedQty: number;
  unitCostIDR: number;
};

function deriveStatus(lines: PoLine[]): 'open' | 'partial' | 'received' {
  const allFull = lines.every((l) => l.receivedQty === l.orderedQty);
  if (allFull) return 'received';
  const anyReceived = lines.some((l) => l.receivedQty > 0);
  return anyReceived ? 'partial' : 'open';
}

export const create = mutation({
  args: {
    supplierId: v.optional(v.id('suppliers')),
    lines: v.array(
      v.object({
        ingredientId: v.id('ingredients'),
        orderedQty: v.number(),
        unitCostIDR: v.number(),
      })
    ),
    note: v.optional(v.string()),
  },
  returns: v.id('purchaseOrders'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    if (args.lines.length === 0) {
      throw new Error('Pesanan beli harus punya minimal satu bahan.');
    }
    for (const line of args.lines) {
      if (!Number.isInteger(line.orderedQty) || line.orderedQty <= 0) {
        throw new Error('Jumlah harus bilangan bulat lebih dari nol.');
      }
      if (!Number.isInteger(line.unitCostIDR) || line.unitCostIDR < 0) {
        throw new Error('Biaya per satuan harus bilangan bulat ≥ 0.');
      }
      const ing = await ctx.db.get(line.ingredientId);
      if (!ing || ing.cafeId !== cafeId || ing.archived) {
        throw new Error('Bahan tidak ditemukan.');
      }
    }
    const seen = new Set<string>();
    for (const line of args.lines) {
      if (seen.has(line.ingredientId)) {
        throw new Error('Bahan duplikat dalam pesanan.');
      }
      seen.add(line.ingredientId);
    }

    let supplierName: string | undefined;
    if (args.supplierId) {
      const supplier = await requireOwned(ctx, cafeId, args.supplierId, 'Pemasok');
      supplierName = supplier.name;
    }

    const now = Date.now();
    const note = args.note?.trim();
    return await ctx.db.insert('purchaseOrders', {
      cafeId,
      ...(args.supplierId ? { supplierId: args.supplierId } : {}),
      ...(supplierName ? { supplierName } : {}),
      status: 'open',
      lines: args.lines.map((l) => ({
        ingredientId: l.ingredientId,
        orderedQty: l.orderedQty,
        receivedQty: 0,
        unitCostIDR: l.unitCostIDR,
      })),
      ...(note ? { note } : {}),
      createdAt: now,
    });
  },
});

export const receive = mutation({
  args: {
    id: v.id('purchaseOrders'),
    lines: v.array(
      v.object({
        ingredientId: v.id('ingredients'),
        qty: v.number(),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const po = await requireOwned(ctx, cafeId, args.id, 'Pesanan beli');
    if (po.status === 'received' || po.status === 'cancelled') {
      throw new Error('PO sudah selesai atau dibatalkan.');
    }
    const receiptIds = new Set<string>();
    for (const r of args.lines) {
      if (receiptIds.has(r.ingredientId)) {
        throw new Error('Bahan duplikat dalam penerimaan.');
      }
      receiptIds.add(r.ingredientId);
    }

    // Work on a copy; validate every receipt before applying any side effect.
    const lines = po.lines.map((l) => ({ ...l }));
    for (const receipt of args.lines) {
      if (!Number.isInteger(receipt.qty) || receipt.qty <= 0) {
        throw new Error('Jumlah harus bilangan bulat lebih dari nol.');
      }
      const line = lines.find((l) => l.ingredientId === receipt.ingredientId);
      if (!line) {
        throw new Error('Bahan tidak ditemukan.');
      }
      if (line.receivedQty + receipt.qty > line.orderedQty) {
        throw new Error('Melebihi jumlah dipesan.');
      }
      line.receivedQty += receipt.qty;
    }

    // Apply: one purchase movement + cost update per received line.
    const now = Date.now();
    for (const receipt of args.lines) {
      const line = po.lines.find((l) => l.ingredientId === receipt.ingredientId)!;
      await ctx.db.insert('inventoryMovements', {
        cafeId,
        ingredientId: receipt.ingredientId,
        delta: receipt.qty,
        reason: 'purchase',
        refType: 'purchaseOrder',
        refId: args.id as unknown as string,
        at: now,
      });
      await ctx.db.patch(receipt.ingredientId, {
        lastCostPerUnitIDR: line.unitCostIDR,
      });
    }

    await ctx.db.patch(args.id, { lines, status: deriveStatus(lines) });
    return null;
  },
});

export const cancel = mutation({
  args: { id: v.id('purchaseOrders') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const po = await requireOwned(ctx, cafeId, id, 'Pesanan beli');
    if (po.status === 'received' || po.status === 'cancelled') {
      throw new Error('PO sudah selesai atau dibatalkan.');
    }
    // Cancel only stops future receipt; already-received goods stay (real
    // inventoryMovements are never reversed here).
    await ctx.db.patch(id, { status: 'cancelled' });
    return null;
  },
});

const poSummary = v.object({
  _id: v.id('purchaseOrders'),
  supplierName: v.optional(v.string()),
  status: statusV,
  lineCount: v.number(),
  orderedTotalIDR: v.number(),
  receivedTotalIDR: v.number(),
  createdAt: v.number(),
});

export const list = query({
  args: { status: v.optional(statusV) },
  returns: v.array(poSummary),
  handler: async (ctx, { status }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = status
      ? // bounded; PO volume per cafe is modest
        await ctx.db
          .query('purchaseOrders')
          .withIndex('by_cafe_status', (q) =>
            q.eq('cafeId', cafeId).eq('status', status)
          )
          .take(200)
      : // bounded; PO volume per cafe is modest
        await ctx.db
          .query('purchaseOrders')
          .withIndex('by_cafe_created', (q) => q.eq('cafeId', cafeId))
          .order('desc')
          .take(200);
    // The status index is not ordered by createdAt; sort newest-first for both.
    const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt);
    return sorted.map((po) => ({
      _id: po._id,
      ...(po.supplierName ? { supplierName: po.supplierName } : {}),
      status: po.status,
      lineCount: po.lines.length,
      orderedTotalIDR: po.lines.reduce(
        (sum, l) => sum + l.orderedQty * l.unitCostIDR,
        0
      ),
      receivedTotalIDR: po.lines.reduce(
        (sum, l) => sum + l.receivedQty * l.unitCostIDR,
        0
      ),
      createdAt: po.createdAt,
    }));
  },
});

const poDetail = v.object({
  _id: v.id('purchaseOrders'),
  supplierId: v.optional(v.id('suppliers')),
  supplierName: v.optional(v.string()),
  status: statusV,
  note: v.optional(v.string()),
  createdAt: v.number(),
  lines: v.array(
    v.object({
      ingredientId: v.id('ingredients'),
      ingredientName: v.string(),
      unit: v.union(v.literal('g'), v.literal('ml'), v.literal('piece')),
      orderedQty: v.number(),
      receivedQty: v.number(),
      remainingQty: v.number(),
      unitCostIDR: v.number(),
    })
  ),
});

export const get = query({
  args: { id: v.id('purchaseOrders') },
  returns: v.union(poDetail, v.null()),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const po = await ctx.db.get(id);
    if (!po || po.cafeId !== cafeId) return null;
    const lines = [];
    for (const line of po.lines) {
      const ing = await ctx.db.get(line.ingredientId);
      lines.push({
        ingredientId: line.ingredientId,
        ingredientName: ing?.name ?? '—',
        unit: ing?.canonicalUnit ?? ('piece' as const),
        orderedQty: line.orderedQty,
        receivedQty: line.receivedQty,
        remainingQty: line.orderedQty - line.receivedQty,
        unitCostIDR: line.unitCostIDR,
      });
    }
    return {
      _id: po._id,
      ...(po.supplierId ? { supplierId: po.supplierId } : {}),
      ...(po.supplierName ? { supplierName: po.supplierName } : {}),
      status: po.status,
      ...(po.note ? { note: po.note } : {}),
      createdAt: po.createdAt,
      lines,
    };
  },
});
