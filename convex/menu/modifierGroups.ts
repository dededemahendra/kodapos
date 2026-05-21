import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { mutation, type QueryCtx, query } from '../_generated/server';
import { requireOwned, requireOwnerCafe } from '../lib/auth';

const optionInput = v.object({
  id: v.optional(v.id('modifierOptions')),
  name: v.string(),
  priceAdjustmentIDR: v.number(),
  position: v.number(),
});

const optionDoc = v.object({
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

const groupWithOptions = v.object({
  _id: v.id('modifierGroups'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  required: v.boolean(),
  minSelect: v.number(),
  maxSelect: v.number(),
  archived: v.boolean(),
  createdAt: v.number(),
  options: v.array(optionDoc),
});

function assertGroup(
  name: string,
  required: boolean,
  minSelect: number,
  maxSelect: number,
  optionCount: number
): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama grup modifier wajib diisi.');
  if (trimmed.length > 60) throw new Error('Nama grup modifier maksimal 60 karakter.');
  if (!Number.isInteger(minSelect) || minSelect < 0) throw new Error('minSelect tidak valid.');
  if (!Number.isInteger(maxSelect) || maxSelect < 1) throw new Error('maxSelect tidak valid.');
  if (minSelect > maxSelect)
    throw new Error('minSelect tidak boleh lebih besar (minimal) dari maxSelect.');
  if (required && optionCount === 0)
    throw new Error('Grup wajib harus memiliki minimal satu opsi.');
  return trimmed;
}

function assertOption(name: string, priceAdjustmentIDR: number, position: number): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama opsi wajib diisi.');
  if (trimmed.length > 60) throw new Error('Nama opsi maksimal 60 karakter.');
  if (!Number.isInteger(priceAdjustmentIDR))
    throw new Error('Harga modifier harus berupa angka bulat (rupiah).');
  if (priceAdjustmentIDR < 0) throw new Error('Harga modifier tidak boleh negatif.');
  if (!Number.isInteger(position) || position < 0) throw new Error('Posisi opsi tidak valid.');
  return trimmed;
}

async function loadOptionsForGroup(ctx: QueryCtx, groupId: Id<'modifierGroups'>) {
  const opts = await ctx.db
    .query('modifierOptions')
    .withIndex('by_group_active', (q) => q.eq('groupId', groupId).eq('archived', false))
    .collect();
  return opts.sort((a, b) => a.position - b.position);
}

export const upsert = mutation({
  args: {
    id: v.optional(v.id('modifierGroups')),
    name: v.string(),
    required: v.boolean(),
    minSelect: v.number(),
    maxSelect: v.number(),
    options: v.array(optionInput),
  },
  returns: v.id('modifierGroups'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cleanName = assertGroup(
      args.name,
      args.required,
      args.minSelect,
      args.maxSelect,
      args.options.length
    );

    let groupId: Id<'modifierGroups'>;
    if (args.id) {
      await requireOwned(ctx, cafeId, args.id, 'Grup modifier');
      await ctx.db.patch(args.id, {
        name: cleanName,
        required: args.required,
        minSelect: args.minSelect,
        maxSelect: args.maxSelect,
      });
      groupId = args.id;
    } else {
      groupId = await ctx.db.insert('modifierGroups', {
        cafeId,
        name: cleanName,
        required: args.required,
        minSelect: args.minSelect,
        maxSelect: args.maxSelect,
        archived: false,
        createdAt: Date.now(),
      });
    }

    // Reconcile options.
    const existingOptions = await ctx.db
      .query('modifierOptions')
      .withIndex('by_group_active', (q) => q.eq('groupId', groupId).eq('archived', false))
      .collect();
    const keptIds = new Set(
      args.options.filter((o) => o.id).map((o) => o.id as Id<'modifierOptions'>)
    );

    // Archive options whose ids are not in the kept set.
    for (const existing of existingOptions) {
      if (!keptIds.has(existing._id)) {
        await ctx.db.patch(existing._id, { archived: true });
      }
    }

    // Insert new or update kept options.
    for (const opt of args.options) {
      const cleanOptName = assertOption(opt.name, opt.priceAdjustmentIDR, opt.position);
      if (opt.id) {
        const existing = await ctx.db.get(opt.id);
        if (!existing || existing.groupId !== groupId || existing.cafeId !== cafeId) {
          throw new Error('Akses ditolak.');
        }
        await ctx.db.patch(opt.id, {
          name: cleanOptName,
          priceAdjustmentIDR: opt.priceAdjustmentIDR,
          position: opt.position,
        });
      } else {
        await ctx.db.insert('modifierOptions', {
          cafeId,
          groupId,
          name: cleanOptName,
          priceAdjustmentIDR: opt.priceAdjustmentIDR,
          position: opt.position,
          archived: false,
          createdAt: Date.now(),
        });
      }
    }

    return groupId;
  },
});

export const archive = mutation({
  args: { id: v.id('modifierGroups') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Grup modifier');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(groupWithOptions),
  handler: async (ctx, { includeArchived = false }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const groups = await ctx.db
      .query('modifierGroups')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    const filtered = groups.filter((g) => includeArchived || !g.archived);
    const result = [];
    for (const g of filtered) {
      const options = await loadOptionsForGroup(ctx, g._id);
      result.push({ ...g, options });
    }
    return result;
  },
});

export const getById = query({
  args: { id: v.id('modifierGroups') },
  returns: v.union(groupWithOptions, v.null()),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const group = await ctx.db.get(id);
    if (!group || group.cafeId !== cafeId) return null;
    const options = await loadOptionsForGroup(ctx, group._id);
    return { ...group, options };
  },
});
