import { describe, expect, it } from 'vitest';
import {
  CODE_SEARCH_PAGE_SIZE,
  codeSearchExhausted,
  isPartialReceiptCode,
  MAX_CODE_SEARCH_PAGES,
  normalizeReceiptCode,
  shouldAutoLoadMore,
} from '~/lib/order-search';

describe('normalizeReceiptCode', () => {
  it('uppercases and trims a complete code', () => {
    expect(normalizeReceiptCode(' ef12 ')).toBe('EF12');
    expect(normalizeReceiptCode('EF12')).toBe('EF12');
  });

  it('returns null for anything that is not exactly four characters', () => {
    // The server answers a non-4-character query with "no matches", so
    // auto-loading on one would page the whole range to prove a certainty.
    expect(normalizeReceiptCode('')).toBeNull();
    expect(normalizeReceiptCode('   ')).toBeNull();
    expect(normalizeReceiptCode('EF1')).toBeNull();
    expect(normalizeReceiptCode('EF123')).toBeNull();
  });
});

describe('isPartialReceiptCode', () => {
  it('is true only while the operator is mid-typing', () => {
    expect(isPartialReceiptCode('')).toBe(false);
    expect(isPartialReceiptCode('  ')).toBe(false);
    expect(isPartialReceiptCode('E')).toBe(true);
    expect(isPartialReceiptCode('EF12')).toBe(false);
    expect(isPartialReceiptCode('EF123')).toBe(true);
  });
});

describe('shouldAutoLoadMore', () => {
  const base = { code: 'EF12', resultCount: 0, status: 'CanLoadMore', pagesLoaded: 1 } as const;

  it('keeps paging while a code search has found nothing and pages remain', () => {
    // The bug this exists for: results are date-descending, so a morning
    // receipt looked up in the afternoon is empty on page 1 with isDone false.
    expect(shouldAutoLoadMore(base)).toBe(true);
  });

  it('stops as soon as the code matches something', () => {
    expect(shouldAutoLoadMore({ ...base, resultCount: 1 })).toBe(false);
  });

  it('stops when the range is exhausted', () => {
    expect(shouldAutoLoadMore({ ...base, status: 'Exhausted' })).toBe(false);
  });

  it('does not page while a request is already in flight', () => {
    expect(shouldAutoLoadMore({ ...base, status: 'LoadingMore' })).toBe(false);
    expect(shouldAutoLoadMore({ ...base, status: 'LoadingFirstPage' })).toBe(false);
  });

  it('never auto-pages when no code is being searched', () => {
    // Plain browsing must stay manual — otherwise opening the report walks the
    // whole range.
    expect(shouldAutoLoadMore({ ...base, code: null })).toBe(false);
  });

  it('stops at the safety cap', () => {
    expect(shouldAutoLoadMore({ ...base, pagesLoaded: MAX_CODE_SEARCH_PAGES })).toBe(false);
    expect(shouldAutoLoadMore({ ...base, pagesLoaded: MAX_CODE_SEARCH_PAGES - 1 })).toBe(true);
    expect(shouldAutoLoadMore({ ...base, pagesLoaded: 3, maxPages: 3 })).toBe(false);
  });
});

describe('codeSearchExhausted', () => {
  it('is true only when the cap stopped a fruitless search that could continue', () => {
    const capped = {
      code: 'EF12',
      resultCount: 0,
      status: 'CanLoadMore',
      pagesLoaded: MAX_CODE_SEARCH_PAGES,
    } as const;
    expect(codeSearchExhausted(capped)).toBe(true);
    // Genuinely not there: the range ran out, which is an honest empty state.
    expect(codeSearchExhausted({ ...capped, status: 'Exhausted' })).toBe(false);
    // Found it.
    expect(codeSearchExhausted({ ...capped, resultCount: 1 })).toBe(false);
    expect(codeSearchExhausted({ ...capped, code: null })).toBe(false);
  });

  it('is mutually exclusive with shouldAutoLoadMore', () => {
    for (const pagesLoaded of [0, 1, MAX_CODE_SEARCH_PAGES - 1, MAX_CODE_SEARCH_PAGES, 999]) {
      const state = {
        code: 'EF12',
        resultCount: 0,
        status: 'CanLoadMore',
        pagesLoaded,
      } as const;
      expect(shouldAutoLoadMore(state) && codeSearchExhausted(state)).toBe(false);
    }
  });
});

describe('page size', () => {
  it('scans in bigger bites than the browsing page', () => {
    expect(CODE_SEARCH_PAGE_SIZE).toBeGreaterThan(25);
  });
});
