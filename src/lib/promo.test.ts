import { describe, expect, it } from 'vitest';
import { formatPromoValue } from './promo';

describe('formatPromoValue', () => {
  it('renders percent with a % suffix', () => {
    expect(formatPromoValue('percent', 20)).toBe('20%');
  });
  it('renders fixed as IDR', () => {
    expect(formatPromoValue('fixed', 10000)).toBe('Rp 10.000');
  });
});
