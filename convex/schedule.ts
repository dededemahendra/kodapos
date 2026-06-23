import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwned, requireActiveOutlet } from './lib/auth';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function assertDate(date: string): string {
  if (!DATE_RE.test(date)) throw new Error('Tanggal tidak valid.');
  return date;
}

function assertTime(time: string): string {
  if (!TIME_RE.test(time)) throw new Error('Waktu tidak valid.');
  return time;
}

function assertOrder(startTime: string, endTime: string): void {
  if (!(endTime > startTime)) throw new Error('Waktu selesai harus setelah mulai.');
}

const rowValidator = v.object({
  id: v.id('scheduledShifts'),
  staffId: v.id('cafeStaff'),
  staffName: v.string(),
  date: v.string(),
  startTime: v.string(),
  endTime: v.string(),
  note: v.optional(v.string()),
});

export const list = query({
  args: { from: v.string(), to: v.string() },
  returns: v.object({ rows: v.array(rowValidator) }),
  handler: async (ctx, { from, to }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const found = await ctx.db
      .query('scheduledShifts')
      .withIndex('by_cafe_date', (q) => q.eq('cafeId', cafeId).gte('date', from).lte('date', to))
      .collect();

    const staff = await ctx.db
      .query('cafeStaff')
      .withIndex('by_cafe_active', (q) => q.eq('cafeId', cafeId))
      .collect();
    const nameById = new Map(staff.map((s) => [s._id, s.name] as const));

    const rows = found
      .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)))
      .map((s) => ({
        id: s._id,
        staffId: s.staffId,
        staffName: nameById.get(s.staffId) ?? '?',
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        ...(s.note ? { note: s.note } : {}),
      }));
    return { rows };
  },
});

export const create = mutation({
  args: {
    staffId: v.id('cafeStaff'),
    date: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    note: v.optional(v.string()),
  },
  returns: v.id('scheduledShifts'),
  handler: async (ctx, { staffId, date, startTime, endTime, note }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, staffId, 'Staf');
    const cleanDate = assertDate(date);
    const cleanStart = assertTime(startTime);
    const cleanEnd = assertTime(endTime);
    assertOrder(cleanStart, cleanEnd);
    const cleanNote = note?.trim();
    return await ctx.db.insert('scheduledShifts', {
      cafeId,
      staffId,
      date: cleanDate,
      startTime: cleanStart,
      endTime: cleanEnd,
      ...(cleanNote ? { note: cleanNote } : {}),
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('scheduledShifts'),
    staffId: v.optional(v.id('cafeStaff')),
    date: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    const existing = await requireOwned(ctx, cafeId, args.id, 'Jadwal');
    if (args.staffId !== undefined) await requireOwned(ctx, cafeId, args.staffId, 'Staf');

    const patch: {
      staffId?: typeof existing.staffId;
      date?: string;
      startTime?: string;
      endTime?: string;
      note?: string | undefined;
    } = {};

    if (args.staffId !== undefined) patch.staffId = args.staffId;
    if (args.date !== undefined) patch.date = assertDate(args.date);
    if (args.startTime !== undefined) patch.startTime = assertTime(args.startTime);
    if (args.endTime !== undefined) patch.endTime = assertTime(args.endTime);
    if (args.note !== undefined) patch.note = args.note.trim() || undefined;

    const start = patch.startTime ?? existing.startTime;
    const end = patch.endTime ?? existing.endTime;
    assertOrder(start, end);

    await ctx.db.patch(args.id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id('scheduledShifts') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { cafeId } = await requireActiveOutlet(ctx);
    await requireOwned(ctx, cafeId, id, 'Jadwal');
    await ctx.db.delete(id);
    return null;
  },
});
