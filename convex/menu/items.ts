import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { mutation, query, type QueryCtx } from '../_generated/server';
import { requireOwned, requireOwnerCafe } from '../lib/auth';

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

const itemDetail = v.object({
  item: menuItemDoc,
  attachedGroups: v.array(
    v.object({
      group: modifierGroupDoc,
      options: v.array(modifierOptionDoc),
      position: v.number(),
    })
  ),
});

function assertItem(name: string, priceIDR: number): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama item wajib diisi.');
  if (trimmed.length > 80) throw new Error('Nama item maksimal 80 karakter.');
  if (!Number.isInteger(priceIDR)) throw new Error('Harga harus berupa angka bulat (rupiah).');
  if (priceIDR < 0) throw new Error('Harga tidak boleh negatif.');
  return trimmed;
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

export const create = mutation({
  args: { categoryId: v.id('categories'), name: v.string(), priceIDR: v.number() },
  returns: v.id('menuItems'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cleanName = assertItem(args.name, args.priceIDR);
    await requireOwned(ctx, cafeId, args.categoryId, 'Kategori');
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
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('menuItems'),
    categoryId: v.id('categories'),
    name: v.string(),
    priceIDR: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const item = await requireOwned(ctx, cafeId, args.id, 'Item');
    await requireOwned(ctx, cafeId, args.categoryId, 'Kategori');
    const cleanName = assertItem(args.name, args.priceIDR);
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

export const list = query({
  args: {
    categoryId: v.optional(v.id('categories')),
    includeArchived: v.optional(v.boolean()),
    includeInactive: v.optional(v.boolean()),
  },
  returns: v.array(menuItemDoc),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
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
    return rows
      .filter((r) => (args.includeArchived ? true : !r.archived))
      .filter((r) => (args.includeInactive ? true : r.isActive))
      .sort((a, b) => a.position - b.position);
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
      result.push({ item, attachedGroups });
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
    return { item, attachedGroups };
  },
});
