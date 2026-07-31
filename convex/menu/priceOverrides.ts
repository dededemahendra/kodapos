import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { mutation, query } from '../_generated/server';
import { requireActiveOutlet, requireOwned } from '../lib/auth';

const targetKindValidator = v.union(
  v.literal('item'),
  v.literal('variant'),
  v.literal('modifier')
);

const targetIdValidator = v.union(
  v.id('menuItems'),
  v.id('menuItemVariants'),
  v.id('modifierOptions')
);

const overrideDoc = v.object({
  _id: v.id('priceOverrides'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  priceCategoryId: v.id('priceCategories'),
  targetKind: targetKindValidator,
  targetId: targetIdValidator,
  priceIDR: v.number(),
  createdAt: v.number(),
});

/** Same shape of check the rest of the money path uses: whole rupiah, not negative. */
function assertPrice(n: number): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('Harga harus bilangan bulat dan tidak boleh negatif.');
  }
  return n;
}

/**
 * The override, its category and its target must all belong to the caller's
 * cafe. Without the target check a crafted id could reprice another outlet's
 * menu inside the same business. requireOwned's generic is keyed to a single
 * table, so a union target id is checked inline instead.
 */
async function assertTargetOwned(
  ctx: Parameters<typeof requireOwned>[0],
  cafeId: string,
  targetKind: 'item' | 'variant' | 'modifier',
  targetId: string
): Promise<void> {
  const label =
    targetKind === 'item' ? 'Menu' : targetKind === 'variant' ? 'Varian' : 'Modifier';

  // targetKindValidator and targetIdValidator are independent union members,
  // so nothing in the args validator stops a mismatched pair (targetKind:
  // 'item' with a variant's id). The dedup key in set/clear is the compound
  // (priceCategoryId, targetKind, targetId), so a mismatched pair would not
  // collide with the real target's row: it would insert a second, distinct
  // row for the same real target, and resolution would pick between the two
  // nondeterministically. normalizeId proves the id actually belongs to the
  // table targetKind claims, rather than just being valid for *some* table in
  // the union.
  const table =
    targetKind === 'item'
      ? 'menuItems'
      : targetKind === 'variant'
        ? 'menuItemVariants'
        : 'modifierOptions';
  if (!ctx.db.normalizeId(table, targetId)) {
    throw new Error(`${label} tidak ditemukan.`);
  }

  const doc = await ctx.db.get(targetId as never);
  const docCafeId = (doc as unknown as { cafeId?: string } | null)?.cafeId;
  if (!doc || docCafeId !== cafeId) {
    throw new Error(`${label} tidak ditemukan.`);
  }
}

export const set = mutation({
  args: {
    priceCategoryId: v.id('priceCategories'),
    targetKind: targetKindValidator,
    targetId: targetIdValidator,
    priceIDR: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, args.priceCategoryId, 'Kategori harga');
    await assertTargetOwned(ctx, cafeId, args.targetKind, args.targetId);
    const priceIDR = assertPrice(args.priceIDR);

    // Upsert. Convex has no unique constraint, so a repeat set must find and
    // patch rather than insert, or resolution later picks between duplicates.
    // targetKind is part of the compound key alongside targetId (not just
    // priceCategoryId + targetId): do not simplify it away, or a call whose
    // targetKind and targetId disagree (guarded above by assertTargetOwned)
    // would no longer collide with the real target's row and would insert a
    // second, distinct row for the same target.
    const existing = await ctx.db
      .query('priceOverrides')
      .withIndex('by_category_and_kind_and_target', (q) =>
        q
          .eq('priceCategoryId', args.priceCategoryId)
          .eq('targetKind', args.targetKind)
          .eq('targetId', args.targetId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { priceIDR });
    } else {
      await ctx.db.insert('priceOverrides', {
        cafeId,
        priceCategoryId: args.priceCategoryId,
        targetKind: args.targetKind,
        targetId: args.targetId,
        priceIDR,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});

export const clear = mutation({
  args: {
    priceCategoryId: v.id('priceCategories'),
    targetKind: targetKindValidator,
    targetId: targetIdValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, args.priceCategoryId, 'Kategori harga');
    const existing = await ctx.db
      .query('priceOverrides')
      .withIndex('by_category_and_kind_and_target', (q) =>
        q
          .eq('priceCategoryId', args.priceCategoryId)
          .eq('targetKind', args.targetKind)
          .eq('targetId', args.targetId)
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

export const listForCategory = query({
  args: { priceCategoryId: v.id('priceCategories') },
  returns: v.array(overrideDoc),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, args.priceCategoryId, 'Kategori harga');
    return await ctx.db
      .query('priceOverrides')
      .withIndex('by_cafe_and_category', (q) =>
        q.eq('cafeId', cafeId).eq('priceCategoryId', args.priceCategoryId)
      )
      .collect();
  },
});

const gridRow = v.object({
  targetKind: targetKindValidator,
  targetId: targetIdValidator,
  label: v.string(),
  /** The item a variant belongs to, or the modifier group an option belongs to. */
  groupLabel: v.optional(v.string()),
  standardPriceIDR: v.number(),
  /** null means this category does not reprice the target, so it inherits. */
  overrideIDR: v.union(v.number(), v.null()),
});

/**
 * Every priceable target for one category, with its standard price and current
 * override. Assembled here rather than in the client so the grid does not issue
 * a query per item for variants, and so "what is priceable" has one definition.
 */
export const grid = query({
  args: { priceCategoryId: v.id('priceCategories') },
  returns: v.array(gridRow),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, args.priceCategoryId, 'Kategori harga');

    const overrides = new Map<string, number>();
    const rows = await ctx.db
      .query('priceOverrides')
      .withIndex('by_cafe_and_category', (q) =>
        q.eq('cafeId', cafeId).eq('priceCategoryId', args.priceCategoryId)
      )
      .collect();
    for (const row of rows) overrides.set(row.targetId as string, row.priceIDR);

    // targetId keeps its union id type rather than widening to string, so the
    // returns validator and the client both see real ids and no cast is needed
    // at either end.
    const out: Array<{
      targetKind: 'item' | 'variant' | 'modifier';
      targetId: Id<'menuItems'> | Id<'menuItemVariants'> | Id<'modifierOptions'>;
      label: string;
      groupLabel?: string;
      standardPriceIDR: number;
      overrideIDR: number | null;
    }> = [];

    const items = await ctx.db
      .query('menuItems')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();

    // One cafe-wide fetch rather than one query per item: menuItemVariants has
    // by_cafe_item, so every variant for the cafe comes back in a single
    // round trip, grouped by item and filtered for archived in memory. This
    // is NOT mirrored below for modifier options: modifierOptions only has
    // by_group_active (no cafe-wide index), so fetching all of them in one
    // shot would need a new index, which is out of scope here. Leave the
    // modifier loop as a per-group fetch rather than "fixing" the asymmetry.
    const allVariants = await ctx.db
      .query('menuItemVariants')
      .withIndex('by_cafe_item', (q) => q.eq('cafeId', cafeId))
      .collect();
    const variantsByItem = new Map<Id<'menuItems'>, typeof allVariants>();
    for (const variant of allVariants) {
      if (variant.archived) continue;
      const list = variantsByItem.get(variant.menuItemId);
      if (list) list.push(variant);
      else variantsByItem.set(variant.menuItemId, [variant]);
    }

    for (const item of items) {
      out.push({
        targetKind: 'item',
        targetId: item._id,
        label: item.name,
        standardPriceIDR: item.priceIDR,
        overrideIDR: overrides.get(item._id) ?? null,
      });
      const variants = (variantsByItem.get(item._id) ?? []).sort(
        (a, b) => a.position - b.position
      );
      for (const variant of variants) {
        out.push({
          targetKind: 'variant',
          targetId: variant._id,
          label: variant.name,
          groupLabel: item.name,
          standardPriceIDR: variant.priceIDR,
          overrideIDR: overrides.get(variant._id) ?? null,
        });
      }
    }

    const groups = await ctx.db
      .query('modifierGroups')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
      .collect();
    for (const group of groups) {
      const options = await ctx.db
        .query('modifierOptions')
        .withIndex('by_group_active', (q) => q.eq('groupId', group._id).eq('archived', false))
        .collect();
      for (const option of options) {
        out.push({
          targetKind: 'modifier',
          targetId: option._id,
          label: option.name,
          groupLabel: group.name,
          standardPriceIDR: option.priceAdjustmentIDR,
          overrideIDR: overrides.get(option._id) ?? null,
        });
      }
    }

    return out;
  },
});
