import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireOwned, requireActiveOutlet } from '../lib/auth';
import { assertBarcodeUnique } from './items';

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
  barcode: v.optional(v.string()),
});

function assertVariant(name: string, priceIDR: number): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama varian wajib diisi.');
  if (trimmed.length > 24) throw new Error('Nama varian maksimal 24 karakter.');
  if (!Number.isInteger(priceIDR)) throw new Error('Harga varian harus berupa angka bulat (rupiah).');
  if (priceIDR < 0) throw new Error('Harga varian tidak boleh negatif.');
  return trimmed;
}

// 12 random digits (Web Crypto). Digits-only so Code128 + handheld scanners
// handle it cleanly. Mirrors the item generator; kept local to avoid coupling.
function genVariantBarcode(): string {
  const a = new Uint8Array(12);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => String(b % 10)).join('');
}

export const create = mutation({
  args: {
    menuItemId: v.id('menuItems'),
    name: v.string(),
    priceIDR: v.number(),
    barcode: v.optional(v.string()),
  },
  returns: v.id('menuItemVariants'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, args.menuItemId, 'Item');
    const cleanName = assertVariant(args.name, args.priceIDR);
    const bc = args.barcode?.trim();
    if (bc) await assertBarcodeUnique(ctx, cafeId, bc);
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
      ...(bc ? { barcode: bc } : {}),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('menuItemVariants'),
    name: v.string(),
    priceIDR: v.number(),
    barcode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, args.id, 'Varian');
    const cleanName = assertVariant(args.name, args.priceIDR);
    const bc = args.barcode?.trim();
    if (bc) await assertBarcodeUnique(ctx, cafeId, bc, { variantId: args.id });
    await ctx.db.patch(args.id, {
      name: cleanName,
      priceIDR: args.priceIDR,
      barcode: bc || undefined,
    });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('menuItemVariants') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, id, 'Varian');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

export const assignBarcode = mutation({
  args: { id: v.id('menuItemVariants') },
  returns: v.string(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const variant = await requireOwned(ctx, cafeId, id, 'Varian');
    if (variant.barcode) throw new Error('Varian sudah punya barcode.');
    for (let attempt = 0; attempt < 8; attempt++) {
      const bc = genVariantBarcode();
      try {
        await assertBarcodeUnique(ctx, cafeId, bc);
      } catch {
        continue;
      }
      await ctx.db.patch(id, { barcode: bc });
      return bc;
    }
    throw new Error('Gagal membuat barcode unik.');
  },
});

export const listForItem = query({
  args: { menuItemId: v.id('menuItems') },
  returns: v.array(variantDoc),
  handler: async (ctx, { menuItemId }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, menuItemId, 'Item');
    const variants = await ctx.db
      .query('menuItemVariants')
      .withIndex('by_item_active', (q) => q.eq('menuItemId', menuItemId).eq('archived', false))
      .collect();
    return variants.sort((a, b) => a.position - b.position);
  },
});
