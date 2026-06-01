import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../../convex/lib/phone';

describe('normalizePhone', () => {
  it('leading 0 → 62', () => {
    expect(normalizePhone('0812-3456-7890')).toBe('6281234567890');
  });
  it('+62 with spaces/dashes → digits', () => {
    expect(normalizePhone('+62 812 3456 7890')).toBe('6281234567890');
  });
  it('already 62 is kept', () => {
    expect(normalizePhone('6281234567890')).toBe('6281234567890');
  });
  it('bare local (no 0/62) keeps digits', () => {
    expect(normalizePhone('81234567890')).toBe('81234567890');
  });
  it('strips all non-digits', () => {
    expect(normalizePhone('(0812) 345.678')).toBe('62812345678');
  });
});
