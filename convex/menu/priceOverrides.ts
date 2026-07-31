import { v } from 'convex/values';
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
