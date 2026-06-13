import { describe, expect, it } from 'vitest';
import { scopedSubtotalIDR } from '../../convex/lib/pricing';

const lines = [
  { menuItemId: 'A', categoryId: 'X', lineTotalIDR: 18000 },
  { menuItemId: 'B', categoryId: 'Y', lineTotalIDR: 12000 },
];

describe('scopedSubtotalIDR', () => {
  it('order scope → full sum of all lines', () => {
    expect(scopedSubtotalIDR(lines, 'order')).toBe(30000);
  });

  it('undefined scope → full sum (back-compat)', () => {
    expect(scopedSubtotalIDR(lines, undefined)).toBe(30000);
  });

  it('item scope → only lines whose menuItemId is targeted', () => {
    expect(scopedSubtotalIDR(lines, 'item', ['A'])).toBe(18000);
    expect(scopedSubtotalIDR(lines, 'item', ['B'])).toBe(12000);
    expect(scopedSubtotalIDR(lines, 'item', ['A', 'B'])).toBe(30000);
  });

  it('category scope → only lines whose categoryId is targeted', () => {
    expect(scopedSubtotalIDR(lines, 'category', undefined, ['X'])).toBe(18000);
    expect(scopedSubtotalIDR(lines, 'category', undefined, ['Y'])).toBe(12000);
    expect(scopedSubtotalIDR(lines, 'category', undefined, ['X', 'Y'])).toBe(30000);
  });

  it('item scope with no matching line → 0', () => {
    expect(scopedSubtotalIDR(lines, 'item', ['Z'])).toBe(0);
  });

  it('category scope with no matching line → 0', () => {
    expect(scopedSubtotalIDR(lines, 'category', undefined, ['Z'])).toBe(0);
  });

  it('missing targets → 0 (item + category)', () => {
    expect(scopedSubtotalIDR(lines, 'item')).toBe(0);
    expect(scopedSubtotalIDR(lines, 'item', [])).toBe(0);
    expect(scopedSubtotalIDR(lines, 'category')).toBe(0);
    expect(scopedSubtotalIDR(lines, 'category', undefined, [])).toBe(0);
  });
});
