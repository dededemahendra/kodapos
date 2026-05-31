import { describe, expect, it } from 'vitest';
import { recipeMarginPct } from './recipe';

describe('recipeMarginPct', () => {
  it('computes margin percent (rounded)', () => {
    expect(recipeMarginPct(28000, 8500)).toBe(70); // 0.6964 → 70
    expect(recipeMarginPct(18000, 5000)).toBe(72); // 0.7222 → 72
  });

  it('returns null when price is zero or negative', () => {
    expect(recipeMarginPct(0, 100)).toBeNull();
    expect(recipeMarginPct(-1, 0)).toBeNull();
  });

  it('handles cost above price (negative margin)', () => {
    expect(recipeMarginPct(1000, 1500)).toBe(-50);
  });
});
