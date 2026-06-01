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
