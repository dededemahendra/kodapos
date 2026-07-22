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
 */
export function buildBoardPages(categories: BoardCategory[], cardsPerPage: number): BoardPage[] {
  const size = Math.max(1, Math.floor(cardsPerPage));
  const pages: BoardPage[] = [];
  for (const category of categories) {
    for (let start = 0; start < category.items.length; start += size) {
      pages.push({
        categoryName: category.name,
        items: category.items.slice(start, start + size),
      });
    }
  }
  return pages;
}
