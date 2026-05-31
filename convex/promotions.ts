import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';

const promotionDoc = v.object({
  _id: v.id('promotions'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  type: v.union(v.literal('percent'), v.literal('fixed')),
  value: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

const promoType = v.union(v.literal('percent'), v.literal('fixed'));

function assertPromo(name: string, type: 'percent' | 'fixed', value: number): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama promo wajib diisi.');
  if (trimmed.length > 60) throw new Error('Nama promo maksimal 60 karakter.');
  if (type === 'percent') {
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new Error('Persentase promo harus 1–100.');
    }
  } else if (!Number.isInteger(value) || value < 1) {
    throw new Error('Nominal promo harus bilangan bulat ≥ 1.');
  }
  return trimmed;
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(promotionDoc),
  handler: async (ctx, { includeArchived = false }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('promotions')
      .withIndex('by_cafe_active', (q) =>
        includeArchived ? q.eq('cafeId', cafeId) : q.eq('cafeId', cafeId).eq('archived', false)
      )
      .collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
  },
});

export const create = mutation({
  args: { name: v.string(), type: promoType, value: v.number() },
  returns: v.id('promotions'),
  handler: async (ctx, { name, type, value }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cleanName = assertPromo(name, type, value);
    return await ctx.db.insert('promotions', {
      cafeId,
      name: cleanName,
      type,
      value,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { id: v.id('promotions'), name: v.string(), type: promoType, value: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, name, type, value }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Promo');
    const cleanName = assertPromo(name, type, value);
    await ctx.db.patch(id, { name: cleanName, type, value });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('promotions') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Promo');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});
