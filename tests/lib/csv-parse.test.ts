import { describe, expect, it } from 'vitest';
import { parseCSV } from '../../src/lib/csv';

describe('parseCSV', () => {
  it('parses simple rows and fields', () => {
    expect(parseCSV('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps a quoted field with a comma as one cell', () => {
    expect(parseCSV('x,"a,b",z')).toEqual([['x', 'a,b', 'z']]);
  });

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(parseCSV('"he said ""hi"""')).toEqual([['he said "hi"']]);
  });

  it('handles a quoted field with an internal newline', () => {
    expect(parseCSV('"line1\nline2",b')).toEqual([['line1\nline2', 'b']]);
  });

  it('tolerates CRLF line endings', () => {
    expect(parseCSV('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('does not add an empty row for a trailing newline', () => {
    expect(parseCSV('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});
