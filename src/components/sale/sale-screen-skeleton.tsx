import { Skeleton } from '~/components/ui/skeleton';

/**
 * Loading placeholder for the register, mirroring the menu pane (scan bar +
 * category chips + item grid) and the cart pane. Shown while the sale screen's
 * queries (menu, cafe, shift, settings) resolve.
 */
export function SaleScreenSkeleton() {
  return (
    <div className="grid h-full grid-cols-[1fr_minmax(320px,30%)]">
      {/* Menu pane */}
      <div className="flex min-h-0 flex-col">
        <div className="border-b border-border px-3 py-2">
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="flex gap-2 overflow-hidden border-b border-border px-3 py-2">
          {Array.from({ length: 6 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional skeletons
            <Skeleton key={`chip-${i}`} className="h-7 w-20 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="flex-1 overflow-hidden p-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positional skeletons
              <div key={`card-${i}`} className="rounded-md border p-3">
                <Skeleton className="mb-2 h-16 w-full rounded" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cart pane */}
      <div className="flex min-h-0 flex-col border-l border-border p-4">
        <Skeleton className="h-6 w-28" />
        <div className="mt-4 flex-1 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional skeletons
            <div key={`line-${i}`} className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
