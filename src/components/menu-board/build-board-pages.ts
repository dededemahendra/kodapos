/** One sellable item as shown on the board. Mirrors api.menu.board.get. */
export type BoardItem = {
  name: string;
  priceIDR: number;
  imageUrl: string | null;
  soldOut: boolean;
};

export type BoardCategory = { name: string; items: BoardItem[] };

/** One screenful. A page always belongs to exactly one category. */
export type BoardPage = { categoryName: string; items: BoardItem[] };

/**
 * Chunk categories into board pages. Categories are never mixed on a page, so a
 * customer always reads one heading at a time; a category with more items than
 * fit simply spans consecutive pages. Pure and deterministic, which is why the
 * rotation itself can stay a dumb index over the result.
 *
 * Plain sequential chunking leaves a sparse final page whenever a category's
 * item count isn't a multiple of cardsPerPage (e.g. 9 items at 8/page is
 * [8, 1]). CSS grid stretches that lone card to fill the page, and the
 * rotation holds it for a full turn, which reads as a rendering bug on a TV.
 * To avoid that, once a category is chunked, its last two pages are
 * rebalanced evenly between themselves (earlier full pages are left alone).
 */
export function buildBoardPages(categories: BoardCategory[], cardsPerPage: number): BoardPage[] {
  const size = Math.max(1, Math.floor(cardsPerPage));
  const pages: BoardPage[] = [];
  for (const category of categories) {
    for (const items of chunkAndBalance(category.items, size)) {
      pages.push({ categoryName: category.name, items });
    }
  }
  return pages;
}

/** Sequentially chunk items into pages of `size`, then even out the last two. */
function chunkAndBalance(items: BoardItem[], size: number): BoardItem[][] {
  const chunks: BoardItem[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }

  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1] as BoardItem[];
    const secondLast = chunks[chunks.length - 2] as BoardItem[];
    const combined = [...secondLast, ...last];
    const splitIndex = Math.ceil(combined.length / 2);
    chunks[chunks.length - 2] = combined.slice(0, splitIndex);
    chunks[chunks.length - 1] = combined.slice(splitIndex);
  }

  return chunks;
}
