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
});

describe('weatherMultiplier', () => {
  it('is the 1.0 stub in slice A', () => {
    expect(weatherMultiplier()).toBe(1);
  });
});
