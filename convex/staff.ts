import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireOwnerCafe } from './lib/auth';
import { hashPin, verifyPin as verifyPinHash } from './lib/pin';

const permissionsValidator = v.object({
  canVoid: v.boolean(),
  canDiscount: v.boolean(),
  canManageShift: v.boolean(),
  canViewReports: v.boolean(),
  canEditMenu: v.boolean(),
});

const ALL_TRUE = { canVoid: true, canDiscount: true, canManageShift: true, canViewReports: true, canEditMenu: true };
const ALL_FALSE = { canVoid: false, canDiscount: false, canManageShift: false, canViewReports: false, canEditMenu: false };

const cafeStaffDoc = v.object({
  _id: v.id('cafeStaff'),
  _creationTime: v.number(),
  cafeId: v.id('cafes'),
  name: v.string(),
  pinHash: v.optional(v.string()),
  role: v.union(v.literal('owner'), v.literal('cashier')),
  archived: v.boolean(),
  createdAt: v.number(),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  permissions: v.optional(permissionsValidator),
});

function assertName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Nama staf wajib diisi.');
  if (trimmed.length > 60) throw new Error('Nama staf maksimal 60 karakter.');
  return trimmed;
}

function assertPin(pin: string): string {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN harus 4 digit angka.');
  return pin;
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(cafeStaffDoc),
  handler: async (ctx, { includeArchived = false }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const rows = await ctx.db
      .query('cafeStaff')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    return rows
      .filter((s) => includeArchived || !s.archived)
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === 'owner' ? -1 : 1;
        return a.createdAt - b.createdAt;
      });
  },
});

export const create = mutation({
  args: { name: v.string(), pin: v.string() },
  returns: v.id('cafeStaff'),
  handler: async (ctx, { name, pin }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cleanName = assertName(name);
    const cleanPin = assertPin(pin);
    const pinHash = await hashPin(cleanPin);
    return await ctx.db.insert('cafeStaff', {
      cafeId,
      name: cleanName,
      pinHash,
      role: 'cashier',
      archived: false,
      createdAt: Date.now(),
    });
  },
});

export const updateName = mutation({
  args: { id: v.id('cafeStaff'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Staf');
    await ctx.db.patch(id, { name: assertName(name) });
    return null;
  },
});

export const archive = mutation({
  args: { id: v.id('cafeStaff') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await requireOwned(ctx, cafeId, id, 'Staf');
    if (row.role === 'owner') {
      const owners = await ctx.db
        .query('cafeStaff')
        .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId).eq('archived', false))
        .collect();
      const activeOwners = owners.filter((s) => s.role === 'owner');
      if (activeOwners.length <= 1) {
        throw new Error('Tidak bisa mengarsipkan pemilik terakhir.');
      }
    }
    const openShift = await ctx.db
      .query('shifts')
      .withIndex('by_cafe_status', (q) => q.eq('cafeId', cafeId).eq('status', 'open'))
      .unique();
    if (openShift && openShift.cashierId === id) {
      throw new Error('Tutup shift sebelum mengarsipkan.');
    }
    await ctx.db.patch(id, { archived: true });
    return null;
  },
});

export const verifyPin = query({
  args: { id: v.id('cafeStaff'), pin: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { id, pin }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.cafeId !== cafeId || row.archived) return false;
    if (!row.pinHash) return false;
    return await verifyPinHash(pin, row.pinHash);
  },
});

export const resetPin = mutation({
  args: { id: v.id('cafeStaff'), pin: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, pin }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Staf');
    const cleanPin = assertPin(pin);
    const pinHash = await hashPin(cleanPin);
    await ctx.db.patch(id, { pinHash });
    return null;
  },
});

export const updateDetails = mutation({
  args: {
    id: v.id('cafeStaff'),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, name, phone, email }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Staf');
    await ctx.db.patch(id, {
      name: assertName(name),
      phone: phone?.trim() || undefined,
      email: email?.trim() || undefined,
    });
    return null;
  },
});

export const setPermissions = mutation({
  args: {
    id: v.id('cafeStaff'),
    permissions: permissionsValidator,
  },
  returns: v.null(),
  handler: async (ctx, { id, permissions }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    await requireOwned(ctx, cafeId, id, 'Staf');
    await ctx.db.patch(id, { permissions });
    return null;
  },
});

export const permissionsFor = query({
  args: { cashierId: v.id('cafeStaff') },
  returns: v.object({
    role: v.union(v.literal('owner'), v.literal('cashier')),
    permissions: permissionsValidator,
  }),
  handler: async (ctx, { cashierId }) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const staff = await ctx.db.get(cashierId);
    if (!staff || staff.cafeId !== cafeId) throw new Error('Kasir tidak ditemukan.');
    return {
      role: staff.role,
      permissions: staff.role === 'owner' ? ALL_TRUE : { ...ALL_FALSE, ...(staff.permissions ?? {}) },
    };
  },
});
