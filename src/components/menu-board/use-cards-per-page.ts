import { useEffect, useState } from 'react';

/** Cards on a 16:9 TV (xl and up) versus a smaller monitor. */
const CARDS_LARGE = 8;
const CARDS_SMALL = 6;
/** Tailwind's xl breakpoint. */
const XL_PX = 1280;

function cardsForWidth(width: number): number {
  return width >= XL_PX ? CARDS_LARGE : CARDS_SMALL;
}

/**
 * Cards per board page, by viewport breakpoint. Deliberately a constant map
 * rather than measured layout: the board is a fixed wall display, and measuring
 * would add a reflow loop for no visible gain. Starts at the large value so the
 * server-rendered markup and the first client render agree (no hydration
 * mismatch), then corrects on mount.
 */
export function useCardsPerPage(): number {
  const [cards, setCards] = useState(CARDS_LARGE);

  useEffect(() => {
    const update = () => setCards(cardsForWidth(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return cards;
}
