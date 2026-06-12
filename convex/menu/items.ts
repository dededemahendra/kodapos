import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { mutation, type MutationCtx, query, type QueryCtx } from '../_generated/server';
import { requireOwned, requireOwnerCafe } from '../lib/auth';
import { itemRecipeStatus } from './itemStock';

const menuItemDoc = v.object({
  _id: v.id('menuItems'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  categoryId: v.id('categories'),
  name: v.string(),
  priceIDR: v.number(),
  isActive: v.boolean(),
  archived: v.boolean(),
  position: v.number(),
  createdAt: v.number(),
  imageStorageId: v.optional(v.id('_storage')),
  barcode: v.optional(v.string()),
});

const menuItemWithStatus = v.object({
  _id: v.id('menuItems'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  categoryId: v.id('categories'),
  name: v.string(),
  priceIDR: v.number(),
  isActive: v.boolean(),
  archived: v.boolean(),
  position: v.number(),
  createdAt: v.number(),
  imageStorageId: v.optional(v.id('_storage')),
  hasRecipe: v.boolean(),
  lowStockIngredientNames: v.array(v.string()),
  imageUrl: v.union(v.string(), v.null()),
});

const modifierGroupDoc = v.object({
  _id: v.id('modifierGroups'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  required: v.boolean(),
  minSelect: v.number(),
  maxSelect: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

const modifierOptionDoc = v.object({
  _id: v.id('modifierOptions'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  groupId: v.id('modifierGroups'),
  name: v.string(),
  priceAdjustmentIDR: v.number(),
  position: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
});

const variantForSale = v.object({
  _id: v.id('menuItemVariants'),
  name: v.string(),
  priceIDR: v.number(),
});

const variantDetail = v.object({
  _id: v.id('menuItemVariants'),
  name: v.string(),
  priceIDR: v.number(),
  position: v.number(),
});

const itemDetail = v.object({
  item: menuItemDoc,
  attachedGroups: v.array(
    v.object({
      group: modifierGroupDoc,
      options: v.array(modifierOptionDoc),
      position: v.number(),
    })
  ),
  variants: v.array(variantDetail),
  imageUrl: v.union(v.string(), v.null()),
});

async function imageUrlFor(
  ctx: QueryCtx,
  storageId?: Id<'_storage'>
): Promise<string | null> {
  return storageId ? await ctx.storage.getUrl(storageId) : null;
}

function assertItem(name: string, priceIDR: number): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama item wajib diisi.');
  if (trimmed.length > 80) throw new Error('Nama item maksimal 80 karakter.');
  if (!Number.isInteger(priceIDR)) throw new Error('Harga harus berupa angka bulat (rupiah).');
  if (priceIDR < 0) throw new Error('Harga tidak boleh negatif.');
  return trimmed;
}

// Mirror of a duplicate-name guard: query the by-cafe barcode index, collect
// the matches, and reject if any non-archived item (other than the one being
// edited) already owns the barcode.
async function isBarcodeFree(
  ctx: QueryCtx,
  cafeId: Id<'cafes'>,
  barcode: string,
  currentId?: Id<'menuItems'>
): Promise<boolean> {
  const matches = await ctx.db
    .query('menuItems')
    .withIndex('by_cafe_barcode', (q) => q.eq('cafeId', cafeId).eq('barcode', barcode))
    .collect();
  return !matches.some((m) => !m.archived && m._id !== currentId);
}

async function assertBarcodeUnique(
  ctx: QueryCtx,
  cafeId: Id<'cafes'>,
  barcode: string,
  currentId?: Id<'menuItems'>
): Promise<void> {
  if (!(await isBarcodeFree(ctx, cafeId, barcode, currentId)))
    throw new Error('Barcode sudah dipakai item lain.');
}

// 12 random digits using the Convex-available Web Crypto. Digits-only so the
// resulting Code128 symbology and handheld scanners handle it cleanly.
function genBarcode(): string {
  const a = new Uint8Array(12);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => String(b % 10)).join('');
}

// Generate a fresh unique digits-only barcode for an item that has none and
// patch it in. Retries on the (vanishingly rare) collision. Returns the code.
async function assignOneBarcode(
  ctx: MutationCtx,
  cafeId: Id<'cafes'>,
  itemId: Id<'menuItems'>
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const bc = genBarcode();
    if (await isBarcodeFree(ctx, cafeId, bc)) {
      await ctx.db.patch(itemId, { barcode: bc });
      return bc;
    }
  }
  throw new Error('Gagal membuat barcode unik.');
}

async function resolveAttachedGroups(
  ctx: QueryCtx,
  menuItemId: Id<'menuItems'>
): Promise<
  Array<{
    group: Doc<'modifierGroups'>;
    options: Doc<'modifierOptions'>[];
    position: number;
  }>
> {
  const joins = await ctx.db
    .query('menuItemModifierGroups')
    .withIndex('by_item', (q) => q.eq('menuItemId', menuItemId))
    .collect();
  joins.sort((a, b) => a.position - b.position);
  const attachedGroups: Array<{
    group: Doc<'modifierGroups'>;
    options: Doc<'modifierOptions'>[];
    position: number;
  }> = [];
  for (const j of joins) {
    const group = await ctx.db.get(j.modifierGroupId);
    if (!group || group.archived) continue;
    const options = await ctx.db
      .query('modifierOptions')
      .withIndex('by_group_active', (q) => q.eq('groupId', group._id).eq('archived', false))
      .collect();
    attachedGroups.push({
      group,
      options: options.sort((a, b) => a.position - b.position),
      position: j.position,
    });
  }
  return attachedGroups;
}

async function resolveActiveVariants(
  ctx: QueryCtx,
  menuItemId: Id<'menuItems'>
): Promise<Doc<'menuItemVariants'>[]> {
  const variants = await ctx.db
    .query('menuItemVariants')
    .withIndex('by_item_active', (q) => q.eq('menuItemId', menuItemId).eq('archived', false))
    .collect();
  return variants.sort((a, b) => a.position - b.position);
}

export const create = mutation({
  args: {
    categoryId: v.id('categories'),
    name: v.string(),
    priceIDR: v.number(),
    imageStorageId: v.optional(v.id('_storage')),
    barcode: v.optional(v.string()),
  },
  returns: v.id('menuItems'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cleanName = assertItem(args.name, args.priceIDR);
    await requireOwned(ctx, cafeId, args.categoryId, 'Kategori');
    const bc = args.barcode?.trim();
    if (bc) await assertBarcodeUnique(ctx, cafeId, bc);
    const siblings = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_category', (q) =>
        q.eq('cafeId', cafeId).eq('categoryId', args.categoryId).eq('archived', false)
      )
      .collect();
    const nextPos =
      siblings.length === 0 ? 100 : Math.max(...siblings.map((c) => c.position)) + 100;
    return await ctx.db.insert('menuItems', {
      cafeId,
      categoryId: args.categoryId,
      name: cleanName,
      priceIDR: args.priceIDR,
      isActive: true,
      archived: false,
      position: nextPos,
      createdAt: Date.now(),
      ...(args.imageStorageId ? { imageStorageId: args.imageStorageId } : {}),
      ...(bc ? { barcode: bc } : {}),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('menuItems'),
    categoryId: v.id('categories'),
    name: v.string(),
    priceIDR: v.number(),
    imageStorageId: v.optional(v.id('_storage')),
    barcode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const item = await requireOwned(ctx, cafeId, args.id, 'Item');
    await requireOwned(ctx, cafeId, args.categoryId, 'Kategori');
    const cleanName = assertItem(args.name, args.priceIDR);
    const bc = args.barcode?.trim();
    if (bc) await assertBarcodeUnique(ctx, cafeId, bc, args.id);
    // If the item is moving to a different category, give it a fresh
    // position at the bottom of the destination so it doesn't collide
    // with an existing sibling that already has the same position number.
    let nextPosition = item.position;
    if (args.categoryId !== item.categoryId) {
      const destSiblings = await ctx.db
        .query('menuItems')
        .withIndex('by_cafe_category', (q) =>
          q.eq('cafeId', cafeId).eq('categoryId', args.categoryId).eq('archived', false)
        )
        .collect();
      nextPosition =
        destSiblings.length === 0 ? 100 : Math.max(...destSiblings.map((s) => s.position)) + 100;
    }
    await ctx.db.patch(args.id, {
      categoryId: args.categoryId,
      name: cleanName,
      priceIDR: args.priceIDR,
      position: nextPosition,
      imageStorageId: args.imageStorageId,
      barcode: bc || undefined,
    });
    return null;
  },
});

export const setActive = mutation({
  args: { id: v.id('menuItems'), isActive: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { id, isActive }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Item');
    await ctx.db.patch(id, { isActive });
    return null;
  },
});

export const reorder = mutation({
  args: { id: v.id('menuItems'), direction: v.union(v.literal('up'), v.literal('down')) },
  returns: v.null(),
  handler: async (ctx, { id, direction }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const item = await requireOwned(ctx, cafeId, id, 'Item');
    const siblings = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_category', (q) =>
        q.eq('cafeId', cafeId).eq('categoryId', item.categoryId).eq('archived', item.archived)
      )
      .collect();
    siblings.sort((a, b) => a.position - b.position);
    const idx = siblings.findIndex((c) => c._id === id);
    const swap = direction === 'up' ? siblings[idx - 1] : siblings[idx + 1];
    if (!swap) return null;
    await ctx.db.patch(item._id, { position: swap.position });
    await ctx.db.patch(swap._id, { position: item.position });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('menuItems') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Item');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

export const assignBarcode = mutation({
  args: { id: v.id('menuItems') },
  returns: v.string(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const item = await requireOwned(ctx, cafeId, id, 'Item');
    if (item.barcode) throw new Error('Item sudah punya barcode.');
    return await assignOneBarcode(ctx, cafeId, item._id);
  },
});

export const assignMissingBarcodes = mutation({
  args: {},
  returns: v.object({ assigned: v.number() }),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    // Sellable items mirror listForSale: active + not archived.
    const items = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    const missing = items.filter((i) => i.isActive && !i.barcode);
    for (const item of missing) {
      await assignOneBarcode(ctx, cafeId, item._id);
    }
    return { assigned: missing.length };
  },
});

export const list = query({
  args: {
    categoryId: v.optional(v.id('categories')),
    includeArchived: v.optional(v.boolean()),
    includeInactive: v.optional(v.boolean()),
  },
  returns: v.array(menuItemWithStatus),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    // Catalog admin view: fetch all of the cafe's items (only the cafeId index
    // prefix is constrained) and filter archived/inactive in JS, because this
    // endpoint optionally includes both via flags. Café-scale (dozens of rows),
    // so the JS filter + per-item enrichment below is acceptable.
    const rows = args.categoryId
      ? await ctx.db
          .query('menuItems')
          .withIndex('by_cafe_category', (q) =>
            q.eq('cafeId', cafeId).eq('categoryId', args.categoryId as Id<'categories'>)
          )
          .collect()
      : await ctx.db
          .query('menuItems')
          .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
          .collect();
    const visible = rows
      .filter((r) => (args.includeArchived ? true : !r.archived))
      .filter((r) => (args.includeInactive ? true : r.isActive))
      .sort((a, b) => a.position - b.position);
    return await Promise.all(
      visible.map(async (r) => ({
        ...r,
        ...(await itemRecipeStatus(ctx, cafeId, r._id)),
        imageUrl: await imageUrlFor(ctx, r.imageStorageId),
      }))
    );
  },
});

const groupWithOptionsForSale = v.object({
  group: modifierGroupDoc,
  options: v.array(modifierOptionDoc),
  position: v.number(),
});

const itemForSale = v.object({
  item: menuItemDoc,
  attachedGroups: v.array(groupWithOptionsForSale),
  variants: v.array(variantForSale),
  lowStockIngredientNames: v.array(v.string()),
  imageUrl: v.union(v.string(), v.null()),
});

export const listForSale = query({
  args: {},
  returns: v.array(itemForSale),
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const items = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    const active = items.filter((i) => i.isActive).sort((a, b) => a.position - b.position);
    const result = [];
    for (const item of active) {
      const attachedGroups = await resolveAttachedGroups(ctx, item._id);
      const variants = (await resolveActiveVariants(ctx, item._id)).map((vr) => ({
        _id: vr._id,
        name: vr.name,
        priceIDR: vr.priceIDR,
      }));
      const { lowStockIngredientNames } = await itemRecipeStatus(ctx, cafeId, item._id);
      result.push({ item, attachedGroups, variants, lowStockIngredientNames, imageUrl: await imageUrlFor(ctx, item.imageStorageId) });
    }
    return result;
  },
});

export const getById = query({
  args: { id: v.id('menuItems') },
  returns: v.union(itemDetail, v.null()),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const item = await ctx.db.get(id);
    if (!item || item.cafeId !== cafeId) return null;
    const attachedGroups = await resolveAttachedGroups(ctx, id);
    const variants = (await resolveActiveVariants(ctx, id)).map((vr) => ({
      _id: vr._id,
      name: vr.name,
      priceIDR: vr.priceIDR,
      position: vr.position,
    }));
    return { item, attachedGroups, variants, imageUrl: await imageUrlFor(ctx, item.imageStorageId) };
  },
});
