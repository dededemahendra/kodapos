import { describe, expect, it } from 'vitest';
import { purchaseTotalIDR } from './purchase';

describe('purchaseTotalIDR', () => {
  it('sums qty × unitCostIDR across lines', () => {
    expect(
      purchaseTotalIDR([
        { qty: 5, unitCostIDR: 50000 },
        { qty: 10, unitCostIDR: 25000 },
      ])
    ).toBe(500000);
  });

  it('returns 0 for no lines', () => {
    expect(purchaseTotalIDR([])).toBe(0);
  });
});
