import { Trans } from '@lingui/react/macro';
import { useMemo } from 'react';
import { StatusBadge } from '~/components/ui/status-badge';
import { formatIDR } from '~/lib/money';
import { type BoardCategory, type BoardItem, buildBoardPages } from './build-board-pages';
import { useCardsPerPage } from './use-cards-per-page';
import { useRotation } from './use-rotation';

/** How long each page stays on screen. Long enough to read a full grid. */
const ROTATION_MS = 12000;

/**
 * Customer-facing menu board: photo cards grouped by category, auto rotating.
 * Display only, no interaction. Cafe content (category and item names) is the
 * cafe's own data and is never translated; only the chrome goes through lingui.
 */
export function MenuBoard({
  cafe,
  categories,
}: {
  cafe: { name: string; logoUrl: string | null };
  categories: BoardCategory[];
}) {
  const cardsPerPage = useCardsPerPage();
  const pages = useMemo(
    () => buildBoardPages(categories, cardsPerPage),
    [categories, cardsPerPage]
  );
  const index = useRotation(pages.length, ROTATION_MS);
  const page = pages[index];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center gap-4 border-b px-8 py-5">
        {cafe.logoUrl ? (
          <img src={cafe.logoUrl} alt="" className="h-12 w-12 rounded-md object-cover" />
        ) : null}
        <span className="text-2xl font-bold tracking-tight">{cafe.name}</span>
        {page ? (
          <span className="ml-6 truncate text-3xl font-extrabold tracking-tight">
            {page.categoryName}
          </span>
        ) : null}
        {pages.length > 1 ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {pages.map((p, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: pages are positional, order never changes within a render
                key={`${p.categoryName}-${i}`}
                className={`size-2.5 rounded-full ${
                  i === index ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>
        ) : null}
      </header>

      {page ? (
        <div
          key={index}
          className="grid min-h-0 flex-1 animate-in fade-in duration-700 grid-cols-2 gap-6 p-8 xl:grid-cols-4"
        >
          {page.items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: menu items have no stable id here; order is fixed per page
            <BoardCard key={`${item.name}-${i}`} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
          {cafe.logoUrl ? (
            <img src={cafe.logoUrl} alt="" className="h-24 w-24 rounded-xl object-cover" />
          ) : null}
          <p className="text-3xl font-semibold text-muted-foreground">
            <Trans>Menu segera hadir</Trans>
          </p>
        </div>
      )}
    </div>
  );
}

function BoardCard({ item }: { item: BoardItem }) {
  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card ${
        item.soldOut ? 'opacity-50' : ''
      }`}
    >
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" className="min-h-0 flex-1 w-full object-cover" />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-muted p-4 text-center">
          <span className="text-2xl font-semibold text-muted-foreground">{item.name}</span>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3 border-t px-4 py-3">
        <span className="truncate text-xl font-semibold">{item.name}</span>
        <div className="flex shrink-0 items-center gap-2">
          {item.soldOut ? (
            <StatusBadge variant="danger">
              <Trans>Habis</Trans>
            </StatusBadge>
          ) : null}
          <span className="text-xl font-bold tabular-nums">{formatIDR(item.priceIDR)}</span>
        </div>
      </div>
    </div>
  );
}
