import { DAY_MS, utcOfDayKey } from './time';

export type Confidence = 'low' | 'med' | 'high';

// An item's qty on each ACTIVE day (a day the cafe had >=1 paid order).
// daysAgo = integer offset from today (0=today); dow = 0=Mon..6=Sun; qty = units (0 allowed).
export type DaySample = { daysAgo: number; dow: number; qty: number };

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** stddev / mean over `values`; Infinity when mean is 0. */
export function coeffOfVariation(values: number[]): number {
  if (values.length === 0) return Infinity;
  const m = mean(values);
  if (m === 0) return Infinity;
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance) / m;
}

/** Exp-decay weighted, trimmed mean of qty over the trailing 28 active days. */
export function baseEstimate(samples: DaySample[], lambda = 0.05): number {
  if (samples.length === 0) return 0;
  const recent = [...samples].sort((a, b) => a.daysAgo - b.daysAgo).slice(0, 28);
  const drop = Math.floor(0.1 * recent.length);
  const byQty = [...recent].sort((a, b) => a.qty - b.qty);
  // Trim outliers only once there are >=14 days; with sparser data a single
  // recent sale must not be trimmed away (it carries the recency signal).
  const pool = recent.length >= 14 && drop > 0 ? byQty.slice(drop, byQty.length - drop) : recent;
  let wsum = 0;
  let num = 0;
  for (const s of pool) {
    const w = Math.exp(-lambda * s.daysAgo);
    wsum += w;
    num += w * s.qty;
  }
  return wsum === 0 ? 0 : num / wsum;
}

/** Ratio of avg qty on `forDow` to overall avg over the trailing 8 weeks. */
export function dayOfWeekMultiplier(samples: DaySample[], forDow: number): number {
  if (samples.length === 0) return 1;
  const weeks = new Set(samples.map((s) => Math.floor(s.daysAgo / 7)));
  if (weeks.size < 2) return 1;
  const overall = mean(samples.map((s) => s.qty));
  if (overall === 0) return 1;
  const onDow = samples.filter((s) => s.dow === forDow).map((s) => s.qty);
  if (onDow.length === 0) return 1;
  const mult = mean(onDow) / overall;
  return Math.min(2, Math.max(0.5, mult));
}

export function weatherMultiplier(): number {
  return 1; // stub in Slice A; Slice C wires a real weather signal
}

export function confidence(itemSpanDays: number, cov: number): Confidence {
  if (itemSpanDays >= 21 && cov < 0.5) return 'high';
  if (itemSpanDays >= 14 && cov < 1.0) return 'med';
  return 'low';
}

export function predictedQty(base: number, dow: number, weather: number, holiday: number): number {
  return Math.max(0, Math.round(base * dow * weather * holiday));
}

export type HolidayKey =
  | 'lebaran_eve' | 'lebaran_day' | 'lebaran_after'
  | 'independence' | 'christmas' | 'new_year';

export type Driver =
  | { code: 'dow_busy' | 'dow_quiet'; pct: number; dow: number }
  | { code: 'holiday'; pct: number; key: HolidayKey };

// Fixed-date holidays keyed by MM-DD.
const FIXED: Record<string, { mult: number; key: HolidayKey }> = {
  '08-17': { mult: 0.7, key: 'independence' },
  '12-25': { mult: 0.8, key: 'christmas' },
  '01-01': { mult: 0.8, key: 'new_year' },
};
// Lebaran is lunar — list per-year (extend as future dates become known).
const LEBARAN: Record<string, { mult: number; key: HolidayKey }> = {
  '2026-03-19': { mult: 0.5, key: 'lebaran_eve' },
  '2026-03-20': { mult: 0.2, key: 'lebaran_day' },
  '2026-03-21': { mult: 1.2, key: 'lebaran_after' },
};

function holidayDriver(mult: number, key: HolidayKey): Driver {
  return { code: 'holiday', pct: Math.round((mult - 1) * 100), key };
}

function isWeekendNearHoliday(dateKey: string): boolean {
  const t = utcOfDayKey(dateKey);
  const utcDow = new Date(t).getUTCDay(); // 0=Sun..6=Sat
  if (utcDow !== 0 && utcDow !== 6) return false;
  const year = dateKey.slice(0, 4);
  const holidays = [...Object.keys(LEBARAN), ...Object.keys(FIXED).map((mmdd) => `${year}-${mmdd}`)];
  return holidays.some((hk) => Math.abs(utcOfDayKey(hk) - t) <= 2 * DAY_MS);
}

/** Holiday multiplier + optional driver for a calendar day key. */
export function holidayMultiplier(dateKey: string): { mult: number; driver?: Driver } {
  const leb = LEBARAN[dateKey];
  if (leb) return { mult: leb.mult, driver: holidayDriver(leb.mult, leb.key) };
  const fixed = FIXED[dateKey.slice(5)];
  if (fixed) return { mult: fixed.mult, driver: holidayDriver(fixed.mult, fixed.key) };
  if (isWeekendNearHoliday(dateKey)) return { mult: 1.1 };
  return { mult: 1 };
}

/** Up to 2 structured drivers for a prediction (dow first, then holiday). */
export function driversFor(args: { dowMult: number; dow: number; holiday?: Driver }): Driver[] {
  const out: Driver[] = [];
  if (Math.abs(args.dowMult - 1) >= 0.1) {
    const pct = Math.round((args.dowMult - 1) * 100);
    out.push({ code: pct >= 0 ? 'dow_busy' : 'dow_quiet', pct, dow: args.dow });
  }
  if (args.holiday) out.push(args.holiday);
  return out.slice(0, 2);
}
