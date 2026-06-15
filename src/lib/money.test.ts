import { describe, expect, it } from 'vitest';
import { computeChange, formatIDR, parseIDR } from './money';

describe('formatIDR', () => {
  it('formats whole rupiah with id-ID thousands separators', () => {
    expect(formatIDR(0)).toBe('Rp 0');
    expect(formatIDR(1_000)).toBe('Rp 1.000');
    expect(formatIDR(1_250_000)).toBe('Rp 1.250.000');
  });

  it('rounds fractional inputs to whole rupiah', () => {
    expect(formatIDR(1.5)).toBe('Rp 2');
    expect(formatIDR(1.4)).toBe('Rp 1');
    expect(formatIDR(8_495_827.000000013)).toBe('Rp 8.495.827');
  });
});

describe('parseIDR', () => {
  it('parses formatted IDR strings back to integer', () => {
    expect(parseIDR('Rp 1.250.000')).toBe(1_250_000);
    expect(parseIDR('1.250.000')).toBe(1_250_000);
    expect(parseIDR('1250000')).toBe(1_250_000);
  });

  it('throws on garbage input', () => {
    expect(() => parseIDR('abc')).toThrow();
  });
});

describe('computeChange', () => {
  it('returns the positive difference when tendered exceeds total', () => {
    expect(computeChange({ totalIDR: 35_000, tenderedIDR: 50_000 })).toBe(15_000);
  });

  it('returns zero when tendered exactly equals total', () => {
    expect(computeChange({ totalIDR: 50_000, tenderedIDR: 50_000 })).toBe(0);
  });

  it('throws when tendered is less than total', () => {
    expect(() => computeChange({ totalIDR: 50_000, tenderedIDR: 40_000 })).toThrow(/insufficient/i);
  });
});
