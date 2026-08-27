import { describe, expect, it } from 'vitest';
import { createNdjsonParser } from './ndjson';

describe('createNdjsonParser', () => {
  it('parses whole lines', () => {
    const p = createNdjsonParser();
    expect(p.push('{"t":"delta","v":"a"}\n{"t":"done"}\n')).toEqual([
      { t: 'delta', v: 'a' },
      { t: 'done' },
    ]);
  });

  it('buffers a line split across chunks', () => {
    const p = createNdjsonParser();
    expect(p.push('{"t":"delta","v":"he')).toEqual([]);
    expect(p.push('llo"}\n')).toEqual([{ t: 'delta', v: 'hello' }]);
  });

  it('skips a malformed line rather than throwing', () => {
    const p = createNdjsonParser();
    expect(p.push('{oops\n{"t":"done"}\n')).toEqual([{ t: 'done' }]);
  });

  it('flushes a trailing line with no newline', () => {
    const p = createNdjsonParser();
    expect(p.push('{"t":"done"}')).toEqual([]);
    expect(p.flush()).toEqual([{ t: 'done' }]);
  });
});
