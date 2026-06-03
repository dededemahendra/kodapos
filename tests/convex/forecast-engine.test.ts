import { describe, expect, it } from 'vitest';
import {
  type DaySample,
  baseEstimate,
  coeffOfVariation,
  confidence,
  dayOfWeekMultiplier,
  predictedQty,
  weatherMultiplier,
} from '../../convex/lib/forecast';
import { holidayMultiplier, driversFor, type Driver } from '../../convex/lib/forecast';

const sample = (daysAgo: number, dow: number, qty: number): DaySample => ({ daysAgo, dow, qty });

describe('baseEstimate', () => {
  it('empty → 0', () => {
    expect(baseEstimate([])).toBe(0);
  });
  it('constant series → that constant', () => {
    const s = Array.from({ length: 20 }, (_, i) => sample(i, 0, 10));
    expect(baseEstimate(s)).toBeCloseTo(10, 5);
  });
  it('weights recent days more (exp decay)', () => {
    const s = [sample(0, 0, 20), ...Array.from({ length: 9 }, (_, i) => sample(i + 1, 0, 0))];
    const est = baseEstimate(s);
    const simpleMean = 20 / 10;
    expect(est).toBeGreaterThan(simpleMean);
  });
  it('trims extremes when n >= 14', () => {
    const s = [
      ...Array.from({ length: 18 }, (_, i) => sample(i, 0, 10)),
      sample(18, 0, 1000),
    ];
    expect(baseEstimate(s)).toBeLessThan(50);
  });
  it('does NOT trim when n < 14 (recency signal preserved)', () => {
    // 9 zeros + 1 outlier at daysAgo=0; n=10 < 14 so trim is suppressed.
    // Untrimmed exp-decay mean ~= 12.4; if the outlier were trimmed it would be 0.
    const s = [sample(0, 0, 100), ...Array.from({ length: 9 }, (_, i) => sample(i + 1, 0, 0))];
    expect(baseEstimate(s)).toBeGreaterThan(5); // a trimmed result would be 0
  });
});

describe('dayOfWeekMultiplier', () => {
  it('< 2 weeks of data → 1', () => {
    const s = [sample(0, 0, 5), sample(1, 1, 5)];
    expect(dayOfWeekMultiplier(s, 0)).toBe(1);
  });
  it('busier weekday → >1, clamped to 2', () => {
    const s = [
      sample(0, 5, 20), sample(1, 4, 5), sample(7, 5, 20), sample(8, 4, 5),
      sample(14, 5, 20), sample(15, 4, 5),
    ];
    const m = dayOfWeekMultiplier(s, 5);
    expect(m).toBeGreaterThan(1);
    expect(m).toBeLessThanOrEqual(2);
  });
  it('overall avg 0 → 1', () => {
    const s = [sample(0, 0, 0), sample(7, 1, 0)];
    expect(dayOfWeekMultiplier(s, 0)).toBe(1);
  });
  it('dow never observed → 1', () => {
    const s = [sample(0, 0, 5), sample(7, 1, 5), sample(14, 0, 5)];
    expect(dayOfWeekMultiplier(s, 5)).toBe(1); // dow=5 never seen, but >=2 week-buckets
  });
});

describe('coeffOfVariation', () => {
  it('constant → 0', () => {
    expect(coeffOfVariation([5, 5, 5])).toBeCloseTo(0, 5);
  });
  it('mean 0 → Infinity', () => {
    expect(coeffOfVariation([0, 0])).toBe(Infinity);
  });
});

describe('confidence', () => {
  it('high needs span>=21 and CoV<0.5', () => {
    expect(confidence(21, 0.4)).toBe('high');
    expect(confidence(21, 0.6)).toBe('med');
  });
  it('med needs span>=14 and CoV<1.0', () => {
    expect(confidence(14, 0.9)).toBe('med');
    expect(confidence(13, 0.2)).toBe('low');
    expect(confidence(30, 1.5)).toBe('low');
  });
});

describe('predictedQty', () => {
  it('rounds and clamps to >= 0', () => {
    expect(predictedQty(10, 1.2, 1, 1)).toBe(12);
    expect(predictedQty(10, 0, 1, 0.2)).toBe(0);
    expect(predictedQty(2.4, 1, 1, 1)).toBe(2);
  });
  it('clamps a negative product to 0', () => {
    expect(predictedQty(-5, 1, 1, 1)).toBe(0);
  });
});

describe('weatherMultiplier', () => {
  it('no condition → 1', () => {
    expect(weatherMultiplier()).toBe(1);
  });
  it('rain dampens by 15%', () => {
    expect(weatherMultiplier('rainy')).toBe(0.85);
  });
  it('hot/cool/normal are neutral in C2b (global rain-only model)', () => {
    expect(weatherMultiplier('hot')).toBe(1);
    expect(weatherMultiplier('cool')).toBe(1);
    expect(weatherMultiplier('normal')).toBe(1);
  });
});

describe('holidayMultiplier', () => {
  it('Lebaran three-day rule', () => {
    expect(holidayMultiplier('2026-03-19').mult).toBe(0.5);
    expect(holidayMultiplier('2026-03-20').mult).toBe(0.2);
    expect(holidayMultiplier('2026-03-21').mult).toBe(1.2);
    expect(holidayMultiplier('2026-03-20').driver).toEqual({ code: 'holiday', pct: -80, key: 'lebaran_day' });
  });
  it('fixed-date nationals by MM-DD across years', () => {
    expect(holidayMultiplier('2026-08-17').mult).toBe(0.7);
    expect(holidayMultiplier('2027-12-25').mult).toBe(0.8);
    expect(holidayMultiplier('2026-01-01').driver).toEqual({ code: 'holiday', pct: -20, key: 'new_year' });
  });
  it('ordinary weekday → 1, no driver', () => {
    expect(holidayMultiplier('2026-06-03')).toEqual({ mult: 1 });
  });
  it('weekend within 2 days of a holiday → 1.1, no driver key', () => {
    // 2026-08-15 is the Saturday two days before 08-17 (Mon)
    expect(holidayMultiplier('2026-08-15')).toEqual({ mult: 1.1 });
  });
  it('weekend NOT near a holiday → 1', () => {
    expect(holidayMultiplier('2026-06-06')).toEqual({ mult: 1 }); // a plain Saturday
  });
  it('weekend near New Year across the year boundary → 1.1', () => {
    // 2023-12-31 is a Sunday, 1 day before 2024-01-01 (next year)
    expect(holidayMultiplier('2023-12-31')).toEqual({ mult: 1.1 });
  });
});

describe('driversFor', () => {
  it('emits a busy dow driver past the 0.1 threshold', () => {
    expect(driversFor({ dowMult: 1.2, dow: 5 })).toEqual([{ code: 'dow_busy', pct: 20, dow: 5 }]);
  });
  it('emits a quiet dow driver for < 1', () => {
    expect(driversFor({ dowMult: 0.8, dow: 1 })).toEqual([{ code: 'dow_quiet', pct: -20, dow: 1 }]);
  });
  it('suppresses dow driver within the +/-0.1 deadband', () => {
    expect(driversFor({ dowMult: 1.05, dow: 2 })).toEqual([]);
  });
  it('includes the holiday driver and caps at 2', () => {
    const holiday: Driver = { code: 'holiday', pct: -80, key: 'lebaran_day' };
    expect(driversFor({ dowMult: 1.3, dow: 6, holiday })).toEqual([
      { code: 'dow_busy', pct: 30, dow: 6 },
      holiday,
    ]);
  });
  it('appends the weather driver after dow/holiday', () => {
    const weather: Driver = { code: 'weather', pct: -15, condition: 'rainy' };
    expect(driversFor({ dowMult: 1.05, dow: 2, weather })).toEqual([weather]);
  });
  it('drops the weather driver when dow + holiday already fill the 2-cap', () => {
    const holiday: Driver = { code: 'holiday', pct: -80, key: 'lebaran_day' };
    const weather: Driver = { code: 'weather', pct: -15, condition: 'rainy' };
    expect(driversFor({ dowMult: 1.3, dow: 6, holiday, weather })).toEqual([
      { code: 'dow_busy', pct: 30, dow: 6 },
      holiday,
    ]);
  });
});
