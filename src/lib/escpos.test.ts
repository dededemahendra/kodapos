import { describe, expect, it } from 'vitest';
import { divider, EscPos, twoCol } from './escpos';

describe('EscPos', () => {
  it('init emits ESC @', () => {
    expect(Array.from(new EscPos().init().encode())).toEqual([0x1b, 0x40]);
  });

  it('align center emits ESC a 1', () => {
    expect(Array.from(new EscPos().align('center').encode())).toEqual([0x1b, 0x61, 1]);
  });

  it('cut emits GS V 0', () => {
    expect(Array.from(new EscPos().cut().encode())).toEqual([0x1d, 0x56, 0x00]);
  });

  it('text encodes ASCII and replaces chars above 0xFF with ?', () => {
    expect(Array.from(new EscPos().text('A€').encode())).toEqual([0x41, 0x3f]);
  });

  it('line appends a trailing LF', () => {
    const bytes = Array.from(new EscPos().line('Hi').encode());
    expect(bytes[bytes.length - 1]).toBe(0x0a);
  });
});

describe('twoCol', () => {
  it('flushes the right text to the column width', () => {
    const row = twoCol('Subtotal', 'Rp 10', 20);
    expect(row).toHaveLength(20);
    expect(row.endsWith('Rp 10')).toBe(true);
    expect(row.startsWith('Subtotal')).toBe(true);
  });

  it('truncates an over-long left text leaving a gap', () => {
    const row = twoCol('A very long item name here', 'Rp 99', 16);
    expect(row).toHaveLength(16);
    expect(row.endsWith('Rp 99')).toBe(true);
  });
});

describe('divider', () => {
  it('repeats the fill character to the width', () => {
    expect(divider(5)).toBe('-----');
  });
});
