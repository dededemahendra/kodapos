import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { normalizePhone } from './lib/phone';

const supplierDoc = v.object({
  _id: v.id('suppliers'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  phone: v.string(),
  archived: v.boolean(),
  createdAt: v.number(),
});

function assertSupplier(name: string, phone: string): { name: string; phone: string } {
  const trimmedName = name.trim();
  if (trimmedName.length < 1) throw new Error('Nama pemasok wajib diisi.');
  if (trimmedName.length > 60) throw new Error('Nama pemasok maksimal 60 karakter.');
  const trimmedPhone = phone.trim();
  if (normalizePhone(trimmedPhone).length < 5) throw new Error('Nomor telepon tidak valid.');
  return { name: trimmedName, phone: trimmedPhone };
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(supplierDoc),
  handler: async (ctx, { includeArchived = false }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('suppliers')
      .withIndex('by_cafe_active', (q) =>
        includeArchived ? q.eq('cafeId', cafeId) : q.eq('cafeId', cafeId).eq('archived', false)
      )
      .collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
  },
});

export const create = mutation({
  args: { name: v.string(), phone: v.string() },
  returns: v.id('suppliers'),
  handler: async (ctx, { name, phone }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const clean = assertSupplier(name, phone);
    return await ctx.db.insert('suppliers', {
      cafeId,
      name: clean.name,
      phone: clean.phone,
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { id: v.id('suppliers'), name: v.string(), phone: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name, phone }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Pemasok');
    const clean = assertSupplier(name, phone);
    await ctx.db.patch(id, { name: clean.name, phone: clean.phone });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('suppliers') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Pemasok');
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});
