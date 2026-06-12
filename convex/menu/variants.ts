import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireOwned, requireOwnerCafe } from '../lib/auth';

const variantDoc = v.object({
  _id: v.id('menuItemVariants'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  menuItemId: v.id('menuItems'),
  name: v.string(),
  priceIDR: v.number(),
  position: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

function assertVariant(name: string, priceIDR: number): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama varian wajib diisi.');
  if (trimmed.length > 24) throw new Error('Nama varian maksimal 24 karakter.');
  if (!Number.isInteger(priceIDR)) throw new Error('Harga varian harus berupa angka bulat (rupiah).');
  if (priceIDR < 0) throw new Error('Harga varian tidak boleh negatif.');
  return trimmed;
}

export const create = mutation({
  args: {
    menuItemId: v.id('menuItems'),
    name: v.string(),
    priceIDR: v.number(),
  },
  returns: v.id('menuItemVariants'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, args.menuItemId, 'Item');
    const cleanName = assertVariant(args.name, args.priceIDR);
    const existing = await ctx.db
      .query('menuItemVariants')
      .withIndex('by_item_active', (q) =>
        q.eq('menuItemId', args.menuItemId).eq('archived', false)
      )
      .collect();
    const position =
      existing.length === 0 ? 0 : Math.max(...existing.map((x) => x.position)) + 1;
    return await ctx.db.insert('menuItemVariants', {
      cafeId,
      menuItemId: args.menuItemId,
      name: cleanName,
      priceIDR: args.priceIDR,
      position,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('menuItemVariants'),
    name: v.string(),
    priceIDR: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, args.id, 'Varian');
    const cleanName = assertVariant(args.name, args.priceIDR);
    await ctx.db.patch(args.id, { name: cleanName, priceIDR: args.priceIDR });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('menuItemVariants') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Varian');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

export const listForItem = query({
  args: { menuItemId: v.id('menuItems') },
  returns: v.array(variantDoc),
  handler: async (ctx, { menuItemId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, menuItemId, 'Item');
    const variants = await ctx.db
      .query('menuItemVariants')
      .withIndex('by_item_active', (q) => q.eq('menuItemId', menuItemId).eq('archived', false))
      .collect();
    return variants.sort((a, b) => a.position - b.position);
  },
});
