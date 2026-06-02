import { describe, expect, it } from 'vitest';
import { suggestRestock } from '../../convex/lib/restock';

describe('suggestRestock', () => {
  it('orders the shortfall plus safety stock, rounded up', () => {
    // required 700, stock 100, reorder 0 → safety = max(0, 100) = 100; 700-100+100=700
    expect(suggestRestock(700, 100, 0)).toBe(700);
  });
  it('reorderThreshold dominates safety stock when larger', () => {
    // required 70, stock 0, reorder 50 → safety = max(50, 10) = 50; 70-0+50=120
    expect(suggestRestock(70, 0, 50)).toBe(120);
  });
  it('per-day demand dominates when larger than reorder', () => {
    // required 700, stock 0, reorder 10 → safety = max(10, 100) = 100; 700+100=800
    expect(suggestRestock(700, 0, 10)).toBe(800);
  });
  it('fully stocked → 0', () => {
    // required 70, stock 1000, reorder 0 → safety 10; 70-1000+10 <0 → 0
    expect(suggestRestock(70, 1000, 0)).toBe(0);
  });
  it('rounds up to a whole unit', () => {
    expect(suggestRestock(10.2, 0, 0)).toBe(Math.ceil(10.2 + 10.2 / 7));
  });
});
