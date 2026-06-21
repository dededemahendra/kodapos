import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utils';

/**
 * Reusable page-level loading skeletons. Each mirrors a common content shape so
 * the page reserves its layout while Convex queries resolve (data === undefined),
 * avoiding a bare spinner and the layout shift when data pops in. Purely visual
 * (aria-hidden, no text), so they need no i18n.
 */

/** Grid of card-shaped skeletons, for card-grid pages (tables, kitchen, orders). */
export function CardGridSkeleton({
  count = 8,
  className,
  cardClassName,
}: {
  count?: number;
  className?: string;
  cardClassName?: string;
}) {
  return (
    <div
      className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn('h-28 w-full rounded-lg', cardClassName)} />
      ))}
    </div>
  );
}

/** Row of stat-card skeletons (small label + large value), for report summaries. */
export function StatCardsSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-4 lg:grid-cols-4', className)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-28" />
        </div>
      ))}
    </div>
  );
}

/** Stacked label + input rows, for settings and edit forms. */
export function FormSkeleton({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-5', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full max-w-md" />
        </div>
      ))}
    </div>
  );
}

/** Term/value summary rows (a definition list), for P&L, export, and shift summaries. */
export function SummaryRowsSkeleton({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Stacked list-row skeletons, for history, shift, and staff lists. */
export function ListSkeleton({
  rows = 6,
  className,
  rowClassName,
}: {
  rows?: number;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn('h-14 w-full rounded-md', rowClassName)} />
      ))}
    </div>
  );
}
