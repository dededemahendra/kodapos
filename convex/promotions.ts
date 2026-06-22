import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { type MutationCtx, mutation, query } from './_generated/server';
import { requireOwned, requireActiveOutlet } from './lib/auth';

const promotionDoc = v.object({
  _id: v.id('promotions'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  type: v.union(v.literal('percent'), v.literal('fixed')),
  value: v.number(),
  code: v.optional(v.string()),
  scope: v.optional(v.union(v.literal('order'), v.literal('item'), v.literal('category'))),
  targetItemIds: v.optional(v.array(v.id('menuItems'))),
  targetCategoryIds: v.optional(v.array(v.id('categories'))),
  archived: v.boolean(),
  createdAt: v.number(),
});

const promoType = v.union(v.literal('percent'), v.literal('fixed'));
const promoScope = v.union(v.literal('order'), v.literal('item'), v.literal('category'));

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

/** Normalize + validate a coupon code. Trims, uppercases, requires 3–20 chars of
 *  [A-Z0-9_-]. Returns the uppercased code or throws. */
function assertPromoCode(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,20}$/.test(upper)) throw new Error('Kode promo tidak valid.');
  return upper;
}

/** Ensure `code` is unique within the cafe (excluding `selfId` on update). Only
 *  NON-archived promos block a code, so an archived promo's code can be reused. */
async function assertCodeUnique(
  ctx: MutationCtx,
  cafeId: Id<'cafes'>,
  code: string,
  selfId?: Id<'promotions'>
): Promise<void> {
  const clash = await ctx.db
    .query('promotions')
    .withIndex('by_cafe_code', (q) => q.eq('cafeId', cafeId).eq('code', code))
    .collect();
  if (clash.some((p) => !p.archived && p._id !== selfId)) {
    throw new Error('Kode promo sudah dipakai.');
  }
}

/**
 * Validate a promo's scope + targets. For `item`/`category`, requires a non-empty
 * matching target array and asserts every id belongs to the cafe. Returns the
 * fields to store: for `order` (or undefined) the targets are cleared.
 */
async function assertPromoScope(
  ctx: MutationCtx,
  cafeId: Id<'cafes'>,
  scope: 'order' | 'item' | 'category' | undefined,
  targetItemIds: Id<'menuItems'>[] | undefined,
  targetCategoryIds: Id<'categories'>[] | undefined
): Promise<{
  scope: 'order' | 'item' | 'category';
  targetItemIds?: Id<'menuItems'>[];
  targetCategoryIds?: Id<'categories'>[];
}> {
  const resolved = scope ?? 'order';
  if (resolved === 'item') {
    if (!targetItemIds || targetItemIds.length < 1) throw new Error('Pilih target promo.');
    for (const id of targetItemIds) await requireOwned(ctx, cafeId, id, 'Item');
    return { scope: 'item', targetItemIds };
  }
  if (resolved === 'category') {
    if (!targetCategoryIds || targetCategoryIds.length < 1) throw new Error('Pilih target promo.');
    for (const id of targetCategoryIds) await requireOwned(ctx, cafeId, id, 'Kategori');
    return { scope: 'category', targetCategoryIds };
  }
  return { scope: 'order' };
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(promotionDoc),
  handler: async (ctx, { includeArchived = false }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const rows = await ctx.db
      .query('promotions')
      .withIndex('by_cafe_active', (q) =>
        includeArchived ? q.eq('cafeId', cafeId) : q.eq('cafeId', cafeId).eq('archived', false)
      )
      .collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
  },
});

export const resolveByCode = query({
  args: { code: v.string() },
  returns: v.union(promotionDoc, v.null()),
  handler: async (ctx, { code }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const upper = code.trim().toUpperCase();
    if (upper.length < 1) return null;
    const rows = await ctx.db
      .query('promotions')
      .withIndex('by_cafe_code', (q) => q.eq('cafeId', cafeId).eq('code', upper))
      .collect();
    return rows.find((p) => !p.archived) ?? null;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    type: promoType,
    value: v.number(),
    code: v.optional(v.string()),
    scope: v.optional(promoScope),
    targetItemIds: v.optional(v.array(v.id('menuItems'))),
    targetCategoryIds: v.optional(v.array(v.id('categories'))),
  },
  returns: v.id('promotions'),
  handler: async (ctx, { name, type, value, code, scope, targetItemIds, targetCategoryIds }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const cleanName = assertPromo(name, type, value);
    const cleanCode = code && code.trim() ? assertPromoCode(code) : undefined;
    if (cleanCode) await assertCodeUnique(ctx, cafeId, cleanCode);
    const scoped = await assertPromoScope(ctx, cafeId, scope, targetItemIds, targetCategoryIds);
    return await ctx.db.insert('promotions', {
      cafeId,
      name: cleanName,
      type,
      value,
      ...(cleanCode ? { code: cleanCode } : {}),
      scope: scoped.scope,
      ...(scoped.targetItemIds ? { targetItemIds: scoped.targetItemIds } : {}),
      ...(scoped.targetCategoryIds ? { targetCategoryIds: scoped.targetCategoryIds } : {}),
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('promotions'),
    name: v.string(),
    type: promoType,
    value: v.number(),
    code: v.optional(v.string()),
    scope: v.optional(promoScope),
    targetItemIds: v.optional(v.array(v.id('menuItems'))),
    targetCategoryIds: v.optional(v.array(v.id('categories'))),
  },
  returns: v.null(),
  handler: async (ctx, { id, name, type, value, code, scope, targetItemIds, targetCategoryIds }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, id, 'Promo');
    const cleanName = assertPromo(name, type, value);
    const cleanCode = code && code.trim() ? assertPromoCode(code) : undefined;
    if (cleanCode) await assertCodeUnique(ctx, cafeId, cleanCode, id);
    const scoped = await assertPromoScope(ctx, cafeId, scope, targetItemIds, targetCategoryIds);
    await ctx.db.patch(id, {
      name: cleanName,
      type,
      value,
      // Clear the code when blank; set targets per scope (cleared for 'order').
      code: cleanCode,
      scope: scoped.scope,
      targetItemIds: scoped.targetItemIds,
      targetCategoryIds: scoped.targetCategoryIds,
    });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('promotions') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, id, 'Promo');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});
