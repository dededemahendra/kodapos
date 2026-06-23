import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { requireOwned, requireActiveOutlet } from './lib/auth';
import { startOfLocalDay, tzFor } from './lib/time';

const statusValidator = v.union(
  v.literal('booked'),
  v.literal('seated'),
  v.literal('completed'),
  v.literal('cancelled'),
  v.literal('no_show')
);

const rowValidator = v.object({
  id: v.id('reservations'),
  at: v.number(),
  customerName: v.string(),
  phone: v.optional(v.string()),
  partySize: v.number(),
  tableId: v.optional(v.id('tables')),
  tableName: v.optional(v.string()),
  status: statusValidator,
  durationMin: v.number(),
  note: v.optional(v.string()),
});

function assertPartySize(partySize: number): number {
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 100) {
    throw new Error('Jumlah tamu tidak valid.');
  }
  return partySize;
}

function assertAt(at: number): number {
  if (!Number.isFinite(at)) throw new Error('Waktu reservasi tidak valid.');
  return at;
}

function assertDurationMin(durationMin: number | undefined): number {
  const d = durationMin ?? 90;
  if (!Number.isInteger(d) || d < 1 || d > 600) {
    throw new Error('Durasi tidak valid.');
  }
  return d;
}

/**
 * Resolve the effective guest name: an explicit trimmed non-empty name wins,
 * else fall back to the (owned) customer's name, else throw.
 */
async function resolveCustomerName(
  ctx: MutationCtx,
  cafeId: Id<'cafes'>,
  customerName: string | undefined,
  customerId: Id<'customers'> | undefined
): Promise<string> {
  const trimmed = (customerName ?? '').trim();
  if (trimmed.length >= 1) return trimmed;
  if (customerId) {
    const customer = await requireOwned(ctx, cafeId, customerId, 'Pelanggan');
    return customer.name;
  }
  throw new Error('Nama tamu wajib diisi.');
}

export const create = mutation({
  args: {
    tableId: v.optional(v.id('tables')),
    customerId: v.optional(v.id('customers')),
    customerName: v.optional(v.string()),
    phone: v.optional(v.string()),
    partySize: v.number(),
    at: v.number(),
    durationMin: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  returns: v.id('reservations'),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    if (args.tableId) await requireOwned(ctx, cafeId, args.tableId, 'Meja');
    if (args.customerId) await requireOwned(ctx, cafeId, args.customerId, 'Pelanggan');

    const customerName = await resolveCustomerName(
      ctx,
      cafeId,
      args.customerName,
      args.customerId
    );
    const partySize = assertPartySize(args.partySize);
    const at = assertAt(args.at);
    const durationMin = assertDurationMin(args.durationMin);
    const phone = args.phone?.trim();
    const note = args.note?.trim();

    return await ctx.db.insert('reservations', {
      cafeId,
      ...(args.tableId ? { tableId: args.tableId } : {}),
      ...(args.customerId ? { customerId: args.customerId } : {}),
      customerName,
      ...(phone ? { phone } : {}),
      partySize,
      at,
      durationMin,
      status: 'booked',
      ...(note ? { note } : {}),
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('reservations'),
    tableId: v.optional(v.id('tables')),
    customerId: v.optional(v.id('customers')),
    customerName: v.optional(v.string()),
    phone: v.optional(v.string()),
    partySize: v.optional(v.number()),
    at: v.optional(v.number()),
    durationMin: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const existing = await requireOwned(ctx, cafeId, args.id, 'Reservasi');

    if (args.tableId) await requireOwned(ctx, cafeId, args.tableId, 'Meja');
    if (args.customerId) await requireOwned(ctx, cafeId, args.customerId, 'Pelanggan');

    const patch: {
      tableId?: Id<'tables'>;
      customerId?: Id<'customers'>;
      customerName?: string;
      phone?: string | undefined;
      partySize?: number;
      at?: number;
      durationMin?: number;
      note?: string | undefined;
    } = {};

    if (args.tableId !== undefined) patch.tableId = args.tableId;
    if (args.customerId !== undefined) patch.customerId = args.customerId;
    if (args.customerName !== undefined) {
      patch.customerName = await resolveCustomerName(
        ctx,
        cafeId,
        args.customerName,
        args.customerId ?? existing.customerId
      );
    }
    if (args.phone !== undefined) patch.phone = args.phone.trim() || undefined;
    if (args.partySize !== undefined) patch.partySize = assertPartySize(args.partySize);
    if (args.at !== undefined) patch.at = assertAt(args.at);
    if (args.durationMin !== undefined) patch.durationMin = assertDurationMin(args.durationMin);
    if (args.note !== undefined) patch.note = args.note.trim() || undefined;

    await ctx.db.patch(args.id, patch);
    return null;
  },
});

export const setStatus = mutation({
  args: { id: v.id('reservations'), status: statusValidator },
  returns: v.null(),
  handler: async (ctx, { id, status }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, id, 'Reservasi');
    await ctx.db.patch(id, { status });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id('reservations') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, id, 'Reservasi');
    await ctx.db.delete(id);
    return null;
  },
});

export const list = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    status: v.optional(statusValidator),
  },
  returns: v.object({ rows: v.array(rowValidator) }),
  handler: async (ctx, { from, to, status }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const tz = await tzFor(ctx, cafeId);
    const startOfToday = startOfLocalDay(tz, 0, Date.now());
    const lo = from ?? startOfToday;
    const hi = to ?? Number.MAX_SAFE_INTEGER;

    const found = await ctx.db
      .query('reservations')
      .withIndex('by_cafe_at', (q) => q.eq('cafeId', cafeId).gte('at', lo).lte('at', hi))
      .collect();

    const filtered = status ? found.filter((r) => r.status === status) : found;
    filtered.sort((a, b) => a.at - b.at);

    const rows = await Promise.all(
      filtered.map(async (r) => {
        const tableName = r.tableId ? (await ctx.db.get(r.tableId))?.name : undefined;
        return {
          id: r._id,
          at: r.at,
          customerName: r.customerName,
          ...(r.phone ? { phone: r.phone } : {}),
          partySize: r.partySize,
          ...(r.tableId ? { tableId: r.tableId } : {}),
          ...(tableName ? { tableName } : {}),
          status: r.status,
          durationMin: r.durationMin,
          ...(r.note ? { note: r.note } : {}),
        };
      })
    );
    return { rows };
  },
});

export const todayByTable = query({
  args: {},
  returns: v.array(
    v.object({
      tableId: v.id('tables'),
      at: v.number(),
      customerName: v.string(),
      partySize: v.number(),
      status: v.union(v.literal('booked'), v.literal('seated')),
    })
  ),
  handler: async (ctx) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const tz = await tzFor(ctx, cafeId);
    const now = Date.now();
    const startOfToday = startOfLocalDay(tz, 0, now);
    const startOfTomorrow = startOfLocalDay(tz, -1, now);

    const rows = await ctx.db
      .query('reservations')
      .withIndex('by_cafe_at', (q) =>
        q.eq('cafeId', cafeId).gte('at', startOfToday).lt('at', startOfTomorrow)
      )
      .collect();

    return rows
      .filter(
        (r): r is typeof r & { tableId: Id<'tables'>; status: 'booked' | 'seated' } =>
          r.tableId !== undefined && (r.status === 'booked' || r.status === 'seated')
      )
      .sort((a, b) => a.at - b.at)
      .map((r) => ({
        tableId: r.tableId,
        at: r.at,
        customerName: r.customerName,
        partySize: r.partySize,
        status: r.status,
      }));
  },
});
