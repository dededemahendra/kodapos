import type { Id } from 'convex/_generated/dataModel';
import { describe, expect, it } from 'vitest';
import { costPerCupIDR, type IngredientCostInfo } from './inventory';

const susuId = 'ing-susu' as unknown as Id<'ingredients'>;
const espressoBeanId = 'ing-bean' as unknown as Id<'ingredients'>;

function ingMap(arr: IngredientCostInfo[]): Map<Id<'ingredients'>, IngredientCostInfo> {
  return new Map(arr.map((i) => [i._id, i]));
}

describe('costPerCupIDR', () => {
  it('computes 200ml × 1.0 × Rp 25/ml = Rp 5.000', () => {
    const m = ingMap([{ _id: susuId, lastCostPerUnitIDR: 25 }]);
    expect(
      costPerCupIDR([{ ingredientId: susuId, qty: 200, wastageFactor: 1.0 }], m)
    ).toBe(5000);
  });

  it('returns 0 for empty lines', () => {
    expect(costPerCupIDR([], new Map())).toBe(0);
  });

  it('applies wastageFactor: 200ml × 1.5 × Rp 25 = Rp 7.500', () => {
    const m = ingMap([{ _id: susuId, lastCostPerUnitIDR: 25 }]);
    expect(
      costPerCupIDR([{ ingredientId: susuId, qty: 200, wastageFactor: 1.5 }], m)
    ).toBe(7500);
  });

  it('handles a zero-cost ingredient without NaN', () => {
    const m = ingMap([
      { _id: susuId, lastCostPerUnitIDR: 25 },
      { _id: espressoBeanId, lastCostPerUnitIDR: 0 },
    ]);
    const result = costPerCupIDR(
      [
        { ingredientId: susuId, qty: 200, wastageFactor: 1.0 },
        { ingredientId: espressoBeanId, qty: 18, wastageFactor: 1.0 },
      ],
      m
    );
    expect(result).toBe(5000);
    expect(Number.isFinite(result)).toBe(true);
  });
});
