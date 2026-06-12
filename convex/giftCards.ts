import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';

const giftCardDoc = v.object({
  _id: v.id('giftCards'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  code: v.string(),
  balanceIDR: v.number(),
  status: v.union(v.literal('active'), v.literal('archived')),
  createdAt: v.number(),
});

const giftCardSummary = v.object({
  _id: v.id('giftCards'),
  code: v.string(),
  balanceIDR: v.number(),
  status: v.union(v.literal('active'), v.literal('archived')),
});

const txnDoc = v.object({
  _id: v.id('giftCardTransactions'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  giftCardId: v.id('giftCards'),
  type: v.union(
    v.literal('issue'),
    v.literal('topup'),
    v.literal('redeem'),
    v.literal('refund')
  ),
  amountIDR: v.number(),
  orderId: v.optional(v.id('orders')),
  at: v.number(),
});

// Normalize a gift-card code: trim + uppercase. Codes are stored uppercased and
// must be at least 4 chars after trimming.
function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(giftCardDoc),
  handler: async (ctx, { includeArchived = false }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('giftCards')
      .withIndex('by_cafe_code', (q) => q.eq('cafeId', cafeId))
      .collect();
    const visible = includeArchived ? rows : rows.filter((r) => r.status === 'active');
    // Newest-first. Tie-break on `_creationTime` (monotonic + unique) so cards
    // issued in the same millisecond still get a stable order.
    return visible.sort((a, b) => b.createdAt - a.createdAt || b._creationTime - a._creationTime);
  },
});

export const getByCode = query({
  args: { code: v.string() },
  returns: v.union(giftCardSummary, v.null()),
  handler: async (ctx, { code }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const normalized = normalizeCode(code);
    const card = await ctx.db
      .query('giftCards')
      .withIndex('by_cafe_code', (q) => q.eq('cafeId', cafeId).eq('code', normalized))
      .first();
    if (!card) return null;
    return {
      _id: card._id,
      code: card.code,
      balanceIDR: card.balanceIDR,
      status: card.status,
    };
  },
});

export const transactions = query({
  args: { id: v.id('giftCards') },
  returns: v.array(txnDoc),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Kartu hadiah');
    return await ctx.db
      .query('giftCardTransactions')
      .withIndex('by_card_at', (q) => q.eq('giftCardId', id))
      .order('desc')
      .collect();
  },
});

export const issue = mutation({
  args: { code: v.string(), balanceIDR: v.number() },
  returns: v.id('giftCards'),
  handler: async (ctx, { code, balanceIDR }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const normalized = normalizeCode(code);
    if (normalized.length < 4) throw new Error('Kode kartu minimal 4 karakter.');
    if (!Number.isInteger(balanceIDR) || balanceIDR <= 0) {
      throw new Error('Saldo kartu harus lebih dari 0.');
    }
    const existing = await ctx.db
      .query('giftCards')
      .withIndex('by_cafe_code', (q) => q.eq('cafeId', cafeId).eq('code', normalized))
      .first();
    if (existing) throw new Error('Kode kartu sudah digunakan.');

    const now = Date.now();
    const id = await ctx.db.insert('giftCards', {
      cafeId,
      code: normalized,
      balanceIDR,
      status: 'active',
      createdAt: now,
    });
    await ctx.db.insert('giftCardTransactions', {
      cafeId,
      giftCardId: id,
      type: 'issue',
      amountIDR: balanceIDR,
      at: now,
    });
    return id;
  },
});

export const topup = mutation({
  args: { id: v.id('giftCards'), amountIDR: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, amountIDR }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const card = await requireOwned(ctx, cafeId, id, 'Kartu hadiah');
    if (!Number.isInteger(amountIDR) || amountIDR <= 0) {
      throw new Error('Jumlah pengisian harus lebih dari 0.');
    }
    const now = Date.now();
    await ctx.db.patch(id, { balanceIDR: card.balanceIDR + amountIDR });
    await ctx.db.insert('giftCardTransactions', {
      cafeId,
      giftCardId: id,
      type: 'topup',
      amountIDR,
      at: now,
    });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('giftCards') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Kartu hadiah');
    await ctx.db.patch(id, { status: 'archived' });
    return null;
  },
});
