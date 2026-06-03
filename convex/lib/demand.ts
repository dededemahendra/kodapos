import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { DAY_MS, addDaysToKey, dayKeyFn, dowOfKey, startOfLocalDay, tzFor, utcOfDayKey } from './time';
import {
  type Confidence,
  type DaySample,
  type Driver,
  baseEstimate,
  coeffOfVariation,
  confidence,
  dayOfWeekMultiplier,
  driversFor,
  holidayMultiplier,
  predictedQty,
  weatherMultiplier,
} from './forecast';
import type { WeatherDay } from './weather';

export type DemandLine = {
  menuItemId: Id<'menuItems'>;
  name: string;
  tomorrowQty: number;
  sevenDayQty: number;
  confidence: Confidence;
  drivers: Driver[];
};

export type DemandResult =
  | { status: 'learning'; daysCollected: number; daysNeeded: number; etaDateKey: string }
  | { status: 'ready'; forDateKey: string; lines: DemandLine[] };

/** Live per-item 7-day forecast over the trailing 56 days of paid orders. */
export async function computeDemand(
  ctx: QueryCtx | MutationCtx,
  cafeId: Id<'cafes'>,
  weatherSignal?: WeatherDay[]
): Promise<DemandResult> {
  const tz = await tzFor(ctx, cafeId);
  const now = Date.now();
  const windowStart = startOfLocalDay(tz, 55, now);
  const rows = await ctx.db
    .query('orders')
    .withIndex('by_cafe_created', (q) => q.eq('cafeId', cafeId).gte('createdAtClient', windowStart))
    .collect();
  const paid = rows.filter((o) => o.paymentStatus === 'paid');

  const keyOf = dayKeyFn(tz);
  const todayKey = keyOf(now);
  const todayUtc = utcOfDayKey(todayKey);
  const daysAgoOf = (dk: string) => Math.round((todayUtc - utcOfDayKey(dk)) / DAY_MS);

  const activeKeys = new Set<string>();
  type Item = { name: string; byDay: Map<string, number> };
  const items = new Map<string, Item>();
  for (const o of paid) {
    const dk = keyOf(o.createdAtClient);
    activeKeys.add(dk);
    for (const l of o.lines) {
      const id = l.menuItemId as string;
      let it = items.get(id);
      if (!it) {
        it = { name: l.nameSnapshot, byDay: new Map() };
        items.set(id, it);
      }
      it.name = l.nameSnapshot;
      it.byDay.set(dk, (it.byDay.get(dk) ?? 0) + l.qty);
    }
  }

  const daysCollected = activeKeys.size;
  if (daysCollected < 14) {
    const firstKey = [...activeKeys].sort()[0] ?? todayKey;
    return { status: 'learning', daysCollected, daysNeeded: 14, etaDateKey: addDaysToKey(firstKey, 14) };
  }

  const axis = [...activeKeys]
    .map((dk) => ({ dk, daysAgo: daysAgoOf(dk), dow: dowOfKey(dk) }))
    .sort((a, b) => a.daysAgo - b.daysAgo);
  const futureKeys = Array.from({ length: 7 }, (_, i) => keyOf(now + (i + 1) * DAY_MS));
  const tomorrowKey = futureKeys[0]!;
  const condByDate = new Map((weatherSignal ?? []).map((d) => [d.dateKey, d.condition]));

  const lines: DemandLine[] = [];
  for (const [id, it] of items) {
    const samples: DaySample[] = axis.map((a) => ({ daysAgo: a.daysAgo, dow: a.dow, qty: it.byDay.get(a.dk) ?? 0 }));
    const base = baseEstimate(samples);
    const soldDaysAgo = axis.filter((a) => (it.byDay.get(a.dk) ?? 0) > 0).map((a) => a.daysAgo);
    const firstSaleDaysAgo = soldDaysAgo.length ? Math.max(...soldDaysAgo) : 0;
    const spanQtys = samples.filter((s) => s.daysAgo <= firstSaleDaysAgo).map((s) => s.qty);
    const conf = confidence(spanQtys.length, coeffOfVariation(spanQtys));
    const dayQty = (dk: string) =>
      predictedQty(base, dayOfWeekMultiplier(samples, dowOfKey(dk)), weatherMultiplier(condByDate.get(dk)), holidayMultiplier(dk).mult);
    const tomorrowQty = dayQty(tomorrowKey);
    const sevenDayQty = futureKeys.reduce((s, dk) => s + dayQty(dk), 0);
    const tomorrowHoliday = holidayMultiplier(tomorrowKey).driver;
    const tomorrowCond = condByDate.get(tomorrowKey);
    const weatherMult = weatherMultiplier(tomorrowCond);
    const weatherDriver: Driver | undefined =
      tomorrowCond && Math.abs(weatherMult - 1) >= 0.1
        ? { code: 'weather', pct: Math.round((weatherMult - 1) * 100), condition: tomorrowCond }
        : undefined;
    const drivers: Driver[] = driversFor({
      dowMult: dayOfWeekMultiplier(samples, dowOfKey(tomorrowKey)),
      dow: dowOfKey(tomorrowKey),
      ...(tomorrowHoliday ? { holiday: tomorrowHoliday } : {}),
      ...(weatherDriver ? { weather: weatherDriver } : {}),
    });
    lines.push({ menuItemId: id as unknown as Id<'menuItems'>, name: it.name, tomorrowQty, sevenDayQty, confidence: conf, drivers });
  }
  lines.sort((a, b) => b.tomorrowQty - a.tomorrowQty || a.name.localeCompare(b.name, 'id-ID'));
  return { status: 'ready', forDateKey: tomorrowKey, lines };
}
