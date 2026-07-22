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

  it('spans a large category across consecutive pages', () => {
    const pages = buildBoardPages([category('Kopi', 7), category('Teh', 1)], 3);
    expect(pages.map((p) => p.categoryName)).toEqual(['Kopi', 'Kopi', 'Kopi', 'Teh']);
    expect(pages.map((p) => p.items.length)).toEqual([3, 3, 1, 1]);
    expect(pages[2]?.items.map((i) => i.name)).toEqual(['Kopi-7']);
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
});
