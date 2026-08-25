import { describe, expect, it } from 'vitest';
import { highlightNumbers, parseAiText } from '../../src/lib/ai-format';

describe('parseAiText', () => {
  it('coalesces consecutive bullets into one list', () => {
    expect(parseAiText('- one\n- two\n- three')).toEqual([
      { kind: 'list', items: ['one', 'two', 'three'] },
    ]);
  });

  it('accepts •, *, and numbered markers as list items', () => {
    expect(parseAiText('• a\n* b\n1. c\n2) d')).toEqual([
      { kind: 'list', items: ['a', 'b', 'c', 'd'] },
    ]);
  });

  it('treats a short line ending in a colon as a heading', () => {
    // Locale-agnostic on purpose: catches both "Saran:" and "Suggestions:".
    expect(parseAiText('Saran:\n- do this')).toEqual([
      { kind: 'heading', text: 'Saran' },
      { kind: 'list', items: ['do this'] },
    ]);
    expect(parseAiText('Suggestions:\n- do this')[0]).toEqual({
      kind: 'heading',
      text: 'Suggestions',
    });
  });

  it('treats a longer heading as a heading when a list follows it', () => {
    // Caught live: Indonesian headings run longer than English ones. This real
    // reply's heading is 41 chars and was being rendered as a paragraph.
    const raw = 'Rekomendasi untuk meningkatkan penjualan:\n- Tawarkan paket menu';
    expect(parseAiText(raw)).toEqual([
      { kind: 'heading', text: 'Rekomendasi untuk meningkatkan penjualan' },
      { kind: 'list', items: ['Tawarkan paket menu'] },
    ]);
  });

  it('does not mistake a long sentence ending in a colon for a heading', () => {
    const long =
      'Here is a fairly long sentence that happens to finish with a colon and should stay prose:';
    expect(parseAiText(long)).toEqual([{ kind: 'para', text: long }]);
  });

  it('falls back to a single paragraph when there is no structure', () => {
    // A model that ignores the format must still render exactly as before.
    expect(parseAiText('Just a plain answer with no structure at all.')).toEqual([
      { kind: 'para', text: 'Just a plain answer with no structure at all.' },
    ]);
  });

  it('joins consecutive prose lines into one paragraph, split on blank lines', () => {
    expect(parseAiText('line one\nline two\n\nsecond para')).toEqual([
      { kind: 'para', text: 'line one line two' },
      { kind: 'para', text: 'second para' },
    ]);
  });

  it('parses the real insights shape end to end', () => {
    const raw =
      '- Revenue is Rp 250.000\n- 10 orders today\nSaran:\n- Bundle products\n- Run a promo';
    expect(parseAiText(raw)).toEqual([
      { kind: 'list', items: ['Revenue is Rp 250.000', '10 orders today'] },
      { kind: 'heading', text: 'Saran' },
      { kind: 'list', items: ['Bundle products', 'Run a promo'] },
    ]);
  });

  it('tolerates CRLF and surrounding whitespace', () => {
    expect(parseAiText('  \r\n- one\r\n- two\r\n  ')).toEqual([
      { kind: 'list', items: ['one', 'two'] },
    ]);
  });

  it('returns nothing for empty or whitespace-only input', () => {
    expect(parseAiText('')).toEqual([]);
    expect(parseAiText('   \n\n  ')).toEqual([]);
  });
});

describe('highlightNumbers', () => {
  it('marks rupiah amounts for emphasis', () => {
    expect(highlightNumbers('Revenue is Rp 250.000 today')).toEqual([
      { text: 'Revenue is ', emphasis: false },
      { text: 'Rp 250.000', emphasis: true },
      { text: ' today', emphasis: false },
    ]);
  });

  it('marks IDR-prefixed amounts too, which models emit when replying in English', () => {
    // Caught live: an English reply came back as "IDR 250,000", which the
    // Rp-only pattern skipped, so no figure in an English answer was emphasized.
    expect(highlightNumbers('Revenue is IDR 250,000 today')).toEqual([
      { text: 'Revenue is ', emphasis: false },
      { text: 'IDR 250,000', emphasis: true },
      { text: ' today', emphasis: false },
    ]);
  });

  it('marks percentages for emphasis', () => {
    expect(highlightNumbers('up 12.5% vs yesterday')).toEqual([
      { text: 'up ', emphasis: false },
      { text: '12.5%', emphasis: true },
      { text: ' vs yesterday', emphasis: false },
    ]);
  });

  it('returns a single unemphasized run when there is nothing to mark', () => {
    expect(highlightNumbers('no numbers here')).toEqual([
      { text: 'no numbers here', emphasis: false },
    ]);
  });
});
