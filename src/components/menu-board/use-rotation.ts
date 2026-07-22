import { useEffect, useState } from 'react';

/**
 * Current page index for the board, advancing every intervalMs and looping.
 * A TV cannot be scrolled by hand, so rotation is the only way through the menu.
 * Resets to 0 whenever the page count changes (menu edit, viewport resize) so a
 * stale index can never point past the end of the list.
 */
export function useRotation(pageCount: number, intervalMs: number): number {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (pageCount <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % pageCount);
    }, intervalMs);
    return () => clearInterval(id);
  }, [pageCount, intervalMs]);

  return Math.min(index, Math.max(0, pageCount - 1));
}
