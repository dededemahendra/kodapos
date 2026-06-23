import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireOwned, requireActiveOutlet } from '../lib/auth';

const categoryDoc = v.object({
  _id: v.id('categories'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  position: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

function assertName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama kategori wajib diisi.');
  if (trimmed.length > 60) throw new Error('Nama kategori maksimal 60 karakter.');
  return trimmed;
}

export const create = mutation({
  args: { name: v.string() },
  returns: v.id('categories'),
  handler: async (ctx, { name }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const cleanName = assertName(name);
    const existing = await ctx.db
      .query('categories')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    const nextPos =
      existing.length === 0 ? 100 : Math.max(...existing.map((c) => c.position)) + 100;
    return await ctx.db.insert('categories', {
      cafeId,
      name: cleanName,
      position: nextPos,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { id: v.id('categories'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, id, 'Kategori');
    await ctx.db.patch(id, { name: assertName(name) });
    return null;
  },
});

export const reorder = mutation({
  args: { id: v.id('categories'), direction: v.union(v.literal('up'), v.literal('down')) },
  returns: v.null(),
  handler: async (ctx, { id, direction }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const row = await requireOwned(ctx, cafeId, id, 'Kategori');
    const siblings = await ctx.db
      .query('categories')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', row.archived))
      .collect();
    siblings.sort((a, b) => a.position - b.position);
    const idx = siblings.findIndex((c) => c._id === id);
    const swap = direction === 'up' ? siblings[idx - 1] : siblings[idx + 1];
    if (!swap) return null; // edge — no-op
    await ctx.db.patch(row._id, { position: swap.position });
    await ctx.db.patch(swap._id, { position: row.position });
    return null;
  },
});

export const setOrder = mutation({
  args: { orderedIds: v.array(v.id('categories')) },
  returns: v.null(),
  handler: async (ctx, { orderedIds }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const current = await ctx.db
      .query('categories')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    const currentIds = new Set(current.map((c) => c._id));
    // The provided order must be a permutation of the cafe's active categories.
    const unique = new Set(orderedIds);
    if (unique.size !== orderedIds.length || orderedIds.length !== currentIds.size) {
      throw new Error('Urutan kategori tidak lengkap.');
    }
    for (const id of orderedIds) {
      if (!currentIds.has(id)) throw new Error('Urutan kategori tidak dikenal.');
    }
    for (const [i, id] of orderedIds.entries()) {
      await ctx.db.patch(id, { position: (i + 1) * 100 });
    }
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('categories') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, id, 'Kategori');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(categoryDoc),
  handler: async (ctx, { includeArchived = false }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const rows = await ctx.db
      .query('categories')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    return rows
      .filter((c) => includeArchived || !c.archived)
      .sort((a, b) => a.position - b.position);
  },
});
