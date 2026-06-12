import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';

const tableDoc = v.object({
  _id: v.id('tables'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  sortOrder: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

function assertName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama meja wajib diisi.');
  if (trimmed.length > 40) throw new Error('Nama meja maksimal 40 karakter.');
  return trimmed;
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(tableDoc),
  handler: async (ctx, { includeArchived = false }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('tables')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .collect();
    return rows
      .filter((r) => includeArchived || !r.archived)
      .sort((a, b) => {
        // Active first, then by sortOrder, then name.
        if (a.archived !== b.archived) return a.archived ? 1 : -1;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name, 'id-ID');
      });
  },
});

export const create = mutation({
  args: { name: v.string() },
  returns: v.id('tables'),
  handler: async (ctx, { name }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const clean = assertName(name);
    const rows = await ctx.db
      .query('tables')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .collect();
    const sortOrder = rows.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1;
    return await ctx.db.insert('tables', {
      cafeId,
      name: clean,
      sortOrder,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { id: v.id('tables'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Meja');
    const clean = assertName(name);
    await ctx.db.patch(id, { name: clean });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('tables') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Meja');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

export const floor = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('tables'),
      name: v.string(),
      heldOrderId: v.optional(v.id('heldOrders')),
      occupied: v.boolean(),
      totalIDR: v.number(),
      itemCount: v.number(),
    })
  ),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const tables = (
      await ctx.db
        .query('tables')
        .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
        .collect()
    )
      .filter((r) => !r.archived)
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name, 'id-ID');
      });

    const openShift = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .first();

    return await Promise.all(
      tables.map(async (table) => {
        const held = openShift
          ? await ctx.db
              .query('heldOrders')
              .withIndex('by_table', (q) => q.eq('tableId', table._id))
              .filter((q) => q.eq(q.field('shiftId'), openShift._id))
              .first()
          : null;
        const totalIDR = held
          ? held.lines.reduce((sum, l) => sum + l.qty * l.unitPriceIDR, 0)
          : 0;
        const itemCount = held ? held.lines.reduce((sum, l) => sum + l.qty, 0) : 0;
        return {
          _id: table._id,
          name: table.name,
          ...(held ? { heldOrderId: held._id } : {}),
          occupied: !!held,
          totalIDR,
          itemCount,
        };
      })
    );
  },
});
