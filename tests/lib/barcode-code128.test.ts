import { describe, expect, it } from 'vitest';
import { CODE128_PATTERNS, code128Checksum, encodeCode128B } from '../../src/lib/barcode-code128';

// Start-B and Stop patterns per the canonical Code128 spec.
// NOTE: Start B is [2,1,1,2,1,4] (value 104); [2,1,1,4,1,2] is Start A (value 103).
// The encoder must be scanner-correct, so we assert the true spec values.
const START_B = [2, 1, 1, 2, 1, 4];
const STOP = [2, 3, 3, 1, 1, 1, 2]; // 7 modules: stop + trailing termination bar.

describe('code128Checksum', () => {
  // Worked example — 'CODE128':
  //   chars   C(67) O(79) D(68) E(69) 1(49) 2(50) 8(56)
  //   −32      35    47    36    37    17    18    24
  //   ×(i+1)   35    94   108   148    85   108   168   → Σ = 746
  //   104 + 746 = 850 ; 850 % 103 = 26
  it("computes the mod-103 checksum for 'CODE128'", () => {
    expect(code128Checksum('CODE128')).toBe(26);
  });

  // Second hand-computed vector — 'HELLO':
  //   chars   H(72) E(69) L(76) L(76) O(79)
  //   −32      40    37    44    44    47
  //   ×(i+1)   40    74   132   176   235   → Σ = 657
  //   104 + 657 = 761 ; 761 % 103 = 40
  it("computes the mod-103 checksum for 'HELLO'", () => {
    expect(code128Checksum('HELLO')).toBe(40);
  });

  // Single char 'A': (104 + (65−32)×1) % 103 = 137 % 103 = 34
  it("computes the mod-103 checksum for 'A'", () => {
    expect(code128Checksum('A')).toBe(34);
  });
});

describe('encodeCode128B', () => {
  it('begins with the Start-B pattern and ends with the Stop+termination pattern', () => {
    const widths = encodeCode128B('CODE128');
    expect(widths.slice(0, 6)).toEqual(START_B);
    expect(widths.slice(-7)).toEqual(STOP);
  });

  it('matches the fully hand-computed module array for a single char', () => {
    // 'A' → symbols [104 (start B), 33 (A−32), 34 (checksum), 106 (stop)]
    //   104 [2,1,1,2,1,4]
    //    33 [1,1,1,3,2,3]
    //    34 [1,3,1,1,2,3]
    //   106 [2,3,3,1,1,1,2]
    expect(encodeCode128B('A')).toEqual([
      2, 1, 1, 2, 1, 4, 1, 1, 1, 3, 2, 3, 1, 3, 1, 1, 2, 3, 2, 3, 3, 1, 1, 1, 2,
    ]);
  });

  it('produces 6 modules per data/start symbol plus a 7-module stop tail', () => {
    const value = 'CODE128';
    // start + chars + checksum = (1 + value.length + 1) six-module symbols,
    // then a 7-module stop tail.
    const widths = encodeCode128B(value);
    expect(widths.length).toBe((1 + value.length + 1) * 6 + 7);
  });

  it('is deterministic — same input yields an identical array', () => {
    expect(encodeCode128B('CODE128')).toEqual(encodeCode128B('CODE128'));
    expect(encodeCode128B('Kopi 25k')).toEqual(encodeCode128B('Kopi 25k'));
  });

  it('throws on a character below ASCII 32 (e.g. newline)', () => {
    expect(() => encodeCode128B('AB\nCD')).toThrow(/Code128/i);
  });

  it('throws on a non-ASCII character (e.g. é)', () => {
    expect(() => encodeCode128B('café')).toThrow(/Code128/i);
  });
});

describe('CODE128_PATTERNS table', () => {
  it('has 107 rows (values 0..106)', () => {
    expect(CODE128_PATTERNS.length).toBe(107);
  });

  it('every data symbol (0..105) totals exactly 11 modules', () => {
    for (let i = 0; i <= 105; i++) {
      const total = (CODE128_PATTERNS[i] ?? []).reduce((a, b) => a + b, 0);
      expect(total).toBe(11);
    }
  });

  it('the stop row (106) totals 13 modules (11 + 2-module termination bar)', () => {
    expect((CODE128_PATTERNS[106] ?? []).reduce((a, b) => a + b, 0)).toBe(13);
  });
});
