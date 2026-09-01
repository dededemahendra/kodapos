import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireActiveOutlet, requireOwned } from '../lib/auth';

const categoryDoc = v.object({
  _id: v.id('priceCategories'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  position: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

function assertName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Nama kategori harga wajib diisi.');
  return trimmed;
}

export const create = mutation({
  args: { name: v.string() },
  returns: v.id('priceCategories'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const cleanName = assertName(args.name);
    const existing = await ctx.db
      .query('priceCategories')
      .withIndex('by_cafe_and_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    const position = existing.length === 0 ? 0 : Math.max(...existing.map((x) => x.position)) + 1;
    return await ctx.db.insert('priceCategories', {
      cafeId,
      name: cleanName,
      position,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { id: v.id('priceCategories'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, args.id, 'Kategori harga');
    await ctx.db.patch(args.id, { name: assertName(args.name) });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('priceCategories') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, id, 'Kategori harga');
    // Archived rather than deleted: settled orders snapshot the name, and the
    // override rows stay addressable if the owner un-archives later.
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

export const list = query({
  args: {},
  returns: v.array(categoryDoc),
  handler: async (ctx) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    return await ctx.db
      .query('priceCategories')
      .withIndex('by_cafe_and_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
  },
});
