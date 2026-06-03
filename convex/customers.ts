import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { normalizePhone } from './lib/phone';

const customerDoc = v.object({
  _id: v.id('customers'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  phone: v.string(),
  note: v.optional(v.string()),
  pointsBalance: v.number(),
  visitCount: v.number(),
  totalSpentIDR: v.number(),
  lastVisitAt: v.optional(v.number()),
  archived: v.boolean(),
  createdAt: v.number(),
});

const txnDoc = v.object({
  _id: v.id('loyaltyTransactions'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  customerId: v.id('customers'),
  orderId: v.optional(v.id('orders')),
  type: v.union(v.literal('earn'), v.literal('redeem'), v.literal('adjust')),
  points: v.number(),
  note: v.optional(v.string()),
  at: v.number(),
});

function assertCustomer(name: string, phone: string): { name: string; phone: string } {
  const trimmedName = name.trim();
  if (trimmedName.length < 1) throw new Error('Nama pelanggan wajib diisi.');
  if (trimmedName.length > 60) throw new Error('Nama pelanggan maksimal 60 karakter.');
  const trimmedPhone = phone.trim();
  if (normalizePhone(trimmedPhone).length < 8) throw new Error('Nomor telepon tidak valid.');
  return { name: trimmedName, phone: trimmedPhone };
}

// Find an active customer in this cafe by normalized phone, or null.
async function findActiveByPhone(
  ctx: QueryCtx | MutationCtx,
  cafeId: Id<'cafes'>,
  phone: string
): Promise<Doc<'customers'> | null> {
  const norm = normalizePhone(phone);
  const rows = await ctx.db
    .query('customers')
    .withIndex('by_cafe_phone', (q) => q.eq('cafeId', cafeId).eq('phone', norm))
    .collect();
  return rows.find((r) => !r.archived) ?? null;
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()), search: v.optional(v.string()) },
  returns: v.array(customerDoc),
  handler: async (ctx, { includeArchived = false, search }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('customers')
      .withIndex('by_cafe_active', (q) =>
        includeArchived ? q.eq('cafeId', cafeId) : q.eq('cafeId', cafeId).eq('archived', false)
      )
      .collect();
    const qStr = (search ?? '').trim().toLowerCase();
    const filtered = qStr
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(qStr) ||
            normalizePhone(r.phone).includes(normalizePhone(qStr))
        )
      : rows;
    return filtered.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
  },
});

export const findByPhone = query({
  args: { phone: v.string() },
  returns: v.union(customerDoc, v.null()),
  handler: async (ctx, { phone }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    return await findActiveByPhone(ctx, cafeId, phone);
  },
});

export const getDetail = query({
  args: { id: v.id('customers') },
  returns: v.union(
    v.object({ ...customerDoc.fields, transactions: v.array(txnDoc), truncated: v.boolean() }),
    v.null()
  ),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.cafeId !== cafeId) return null;
    const all = await ctx.db
      .query('loyaltyTransactions')
      .withIndex('by_customer_at', (q) => q.eq('customerId', id))
      .order('desc')
      .take(101);
    const truncated = all.length > 100;
    return { ...c, transactions: all.slice(0, 100), truncated };
  },
});

export const create = mutation({
  args: { name: v.string(), phone: v.string(), note: v.optional(v.string()) },
  returns: v.id('customers'),
  handler: async (ctx, { name, phone, note }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const clean = assertCustomer(name, phone);
    const norm = normalizePhone(clean.phone);
    const dupe = await findActiveByPhone(ctx, cafeId, norm);
    if (dupe) throw new Error('Nomor telepon sudah terdaftar.');
    return await ctx.db.insert('customers', {
      cafeId,
      name: clean.name,
      phone: norm,
      ...(note?.trim() ? { note: note.trim() } : {}),
      pointsBalance: 0,
      visitCount: 0,
      totalSpentIDR: 0,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('customers'),
    name: v.string(),
    phone: v.string(),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, name, phone, note }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Pelanggan');
    const clean = assertCustomer(name, phone);
    const norm = normalizePhone(clean.phone);
    const dupe = await findActiveByPhone(ctx, cafeId, norm);
    if (dupe && dupe._id !== id) throw new Error('Nomor telepon sudah terdaftar.');
    await ctx.db.patch(id, {
      name: clean.name,
      phone: norm,
      note: note?.trim() ? note.trim() : undefined,
    });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('customers') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Pelanggan');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

export const adjustPoints = mutation({
  args: { id: v.id('customers'), points: v.number(), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, points, note }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const c = await requireOwned(ctx, cafeId, id, 'Pelanggan');
    if (!Number.isInteger(points) || points === 0) throw new Error('Poin tidak valid.');
    const next = c.pointsBalance + points;
    if (next < 0) throw new Error('Poin tidak boleh menjadi negatif.');
    const now = Date.now();
    await ctx.db.insert('loyaltyTransactions', {
      cafeId,
      customerId: id,
      type: 'adjust',
      points,
      ...(note?.trim() ? { note: note.trim() } : {}),
      at: now,
    });
    await ctx.db.patch(id, { pointsBalance: next });
    return null;
  },
});
