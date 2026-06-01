import type { Doc, Id } from '../_generated/dataModel';

export const DAY_MS = 86_400_000;
export const DEFAULT_TZ = 'Asia/Jakarta';

/** Offset (ms) of `tz` from UTC at the given instant. Indonesia zones are
 *  fixed-offset, so this is stable across windows. */
export function tzOffsetMs(tz: string, atMs: number): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(atMs));
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    const asIfUtc = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second)
    );
    return asIfUtc - atMs;
  } catch {
    return 0;
  }
}

/** Maps an instant (ms) to its cafe-local calendar day, "YYYY-MM-DD". */
export function dayKeyFn(tz: string): (atMs: number) => string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return (atMs) => fmt.format(new Date(atMs));
}

/** UTC ms of 00:00 on the calendar date `key` ("YYYY-MM-DD"), interpreted as a
 *  naive date (no tz). Combine with `tzOffsetMs` to get the local-midnight instant. */
export function utcOfDayKey(key: string): number {
  const [y, m, d] = key.split('-');
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

/** UTC ms of local-midnight for the day `daysAgo` days before `nowMs`, in `tz`. */
export function startOfLocalDay(tz: string, daysAgo: number, nowMs: number): number {
  const asUtc = utcOfDayKey(dayKeyFn(tz)(nowMs - daysAgo * DAY_MS));
  return asUtc - tzOffsetMs(tz, asUtc);
}

/** Cafe timezone, defaulting to Asia/Jakarta. */
export async function tzFor(
  ctx: { db: { get: (id: Id<'cafes'>) => Promise<Doc<'cafes'> | null> } },
  cafeId: Id<'cafes'>
): Promise<string> {
  const cafe = await ctx.db.get(cafeId);
  return cafe?.timezone ?? DEFAULT_TZ;
}

export type RangeArgs =
  | { preset: 'today' | 'yesterday' | 'last7' | 'last30' }
  | { from: string; to: string }; // inclusive local YYYY-MM-DD keys

export type ResolvedRange = {
  startMs: number;
  endMs: number;
  fromKey: string;
  toKey: string;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Resolves report range args to tz-correct UTC-ms boundaries (inclusive of the
 *  full final local day) plus the from/to calendar keys. */
export function resolveRange(tz: string, args: RangeArgs, nowMs: number): ResolvedRange {
  const keyOf = dayKeyFn(tz);
  let fromKey: string;
  let toKey: string;
  if ('preset' in args) {
    const today = keyOf(nowMs);
    switch (args.preset) {
      case 'today':
        fromKey = today;
        toKey = today;
        break;
      case 'yesterday':
        fromKey = keyOf(nowMs - DAY_MS);
        toKey = fromKey;
        break;
      case 'last7':
        fromKey = keyOf(nowMs - 6 * DAY_MS);
        toKey = today;
        break;
      case 'last30':
        fromKey = keyOf(nowMs - 29 * DAY_MS);
        toKey = today;
        break;
    }
  } else {
    fromKey = args.from;
    toKey = args.to;
  }
  if (!DATE_KEY.test(fromKey) || !DATE_KEY.test(toKey) || fromKey > toKey) {
    throw new Error('Rentang tanggal tidak valid.');
  }
  const startUtc = utcOfDayKey(fromKey);
  const endUtc = utcOfDayKey(toKey);
  if ((endUtc - startUtc) / DAY_MS > 366) {
    throw new Error('Rentang tanggal tidak valid.');
  }
  const startMs = startUtc - tzOffsetMs(tz, startUtc);
  const endNextUtc = endUtc + DAY_MS;
  const endMs = endNextUtc - tzOffsetMs(tz, endNextUtc) - 1;
  return { startMs, endMs, fromKey, toKey };
}

/** Inclusive list of calendar day keys from `fromKey` to `toKey`. */
export function eachDayKey(fromKey: string, toKey: string): string[] {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const out: string[] = [];
  let cur = utcOfDayKey(fromKey);
  const end = utcOfDayKey(toKey);
  while (cur <= end) {
    out.push(fmt.format(new Date(cur)));
    cur += DAY_MS;
  }
  return out;
}
