import { describe, expect, it } from 'vitest';
import { type BoardCategory, type BoardItem, buildBoardPages } from './build-board-pages';

function item(name: string): BoardItem {
  return { name, priceIDR: 10000, imageUrl: null, soldOut: false };
}

function category(name: string, count: number): BoardCategory {
  return {
    name,
    items: Array.from({ length: count }, (_, i) => item(`${name}-${i + 1}`)),
  };
}

describe('buildBoardPages', () => {
  it('returns no pages for no categories', () => {
    expect(buildBoardPages([], 6)).toEqual([]);
  });

  it('puts a small category on a single page', () => {
    const pages = buildBoardPages([category('Kopi', 3)], 6);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.categoryName).toBe('Kopi');
    expect(pages[0]?.items.map((i) => i.name)).toEqual(['Kopi-1', 'Kopi-2', 'Kopi-3']);
  });

  it('never mixes two categories on one page', () => {
    const pages = buildBoardPages([category('Kopi', 2), category('Teh', 1)], 6);
    expect(pages.map((p) => p.categoryName)).toEqual(['Kopi', 'Teh']);
    expect(pages[0]?.items).toHaveLength(2);
    expect(pages[1]?.items).toHaveLength(1);
  });

  it('spans a large category across consecutive pages, balancing the last two', () => {
    const pages = buildBoardPages([category('Kopi', 7), category('Teh', 1)], 3);
    expect(pages.map((p) => p.categoryName)).toEqual(['Kopi', 'Kopi', 'Kopi', 'Teh']);
    // Sequential chunking of 7 items at 3/page would be [3, 3, 1]; the last two
    // pages (3 + 1 = 4 items) are rebalanced to [2, 2] instead of leaving a
    // near-empty final page.
    expect(pages.map((p) => p.items.length)).toEqual([3, 2, 2, 1]);
    expect(pages[1]?.items.map((i) => i.name)).toEqual(['Kopi-4', 'Kopi-5']);
    expect(pages[2]?.items.map((i) => i.name)).toEqual(['Kopi-6', 'Kopi-7']);
  });

  it('skips categories with no items', () => {
    const pages = buildBoardPages([category('Kosong', 0), category('Kopi', 1)], 6);
    expect(pages.map((p) => p.categoryName)).toEqual(['Kopi']);
  });

  it('treats a cardsPerPage below 1 as 1 rather than looping forever', () => {
    const pages = buildBoardPages([category('Kopi', 2)], 0);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.items).toHaveLength(1);
  });

  describe('balancing the last two pages of a category', () => {
    // Worked examples at cardsPerPage = 8. Sequential chunking alone would leave
    // a sparse final page (e.g. 9 items -> [8, 1]), which stretches to fill a
    // quarter of the TV for a full rotation and reads as a rendering bug. Only
    // the last two pages are ever touched; earlier full pages are untouched.
    it.each([
      { count: 0, expected: [] },
      { count: 3, expected: [3] },
      { count: 8, expected: [8] },
      { count: 9, expected: [5, 4] },
      { count: 10, expected: [5, 5] },
      { count: 16, expected: [8, 8] },
      { count: 17, expected: [8, 5, 4] },
    ])('$count items becomes pages of $expected', ({ count, expected }) => {
      const pages = buildBoardPages([category('Kopi', count)], 8);
      expect(pages.map((p) => p.items.length)).toEqual(expected);
    });

    it('does not touch a category that already balances evenly', () => {
      const pages = buildBoardPages([category('Kopi', 16)], 8);
      expect(pages[0]?.items.map((i) => i.name)).toEqual(
        Array.from({ length: 8 }, (_, i) => `Kopi-${i + 1}`)
      );
      expect(pages[1]?.items.map((i) => i.name)).toEqual(
        Array.from({ length: 8 }, (_, i) => `Kopi-${i + 9}`)
      );
    });

    it('never produces a page longer than cardsPerPage', () => {
      for (let count = 0; count <= 40; count++) {
        const pages = buildBoardPages([category('Kopi', count)], 8);
        for (const page of pages) {
          expect(page.items.length).toBeLessThanOrEqual(8);
        }
      }
    });

    it('never produces an empty page', () => {
      for (let count = 1; count <= 40; count++) {
        const pages = buildBoardPages([category('Kopi', count)], 8);
        for (const page of pages) {
          expect(page.items.length).toBeGreaterThan(0);
        }
      }
    });

    it('preserves every item exactly once, in order, when pages are concatenated', () => {
      for (let count = 0; count <= 40; count++) {
        const cat = category('Kopi', count);
        const pages = buildBoardPages([cat], 8);
        const rebuilt = pages.flatMap((p) => p.items);
        expect(rebuilt).toEqual(cat.items);
      }
    });

    it('balances categories independently without mixing them', () => {
      const pages = buildBoardPages([category('Kopi', 9), category('Teh', 10)], 8);
      expect(pages.map((p) => p.categoryName)).toEqual(['Kopi', 'Kopi', 'Teh', 'Teh']);
      expect(pages.map((p) => p.items.length)).toEqual([5, 4, 5, 5]);
    });
  });
});
