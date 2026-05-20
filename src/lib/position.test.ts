import { describe, expect, it } from 'vitest';
import { nextPositionAfter } from './position';

describe('nextPositionAfter', () => {
  it('returns 100 for an empty list', () => {
    expect(nextPositionAfter([])).toBe(100);
  });

  it('returns max + 100 for a populated list', () => {
    expect(nextPositionAfter([{ position: 10 }, { position: 110 }])).toBe(210);
  });

  it('handles unsorted input', () => {
    expect(nextPositionAfter([{ position: 210 }, { position: 10 }, { position: 110 }])).toBe(310);
  });

  it('throws on non-integer positions', () => {
    expect(() => nextPositionAfter([{ position: 10.5 }])).toThrow(/integer/i);
  });
});
