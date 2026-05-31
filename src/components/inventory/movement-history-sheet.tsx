import { Trans } from '@lingui/react/macro';
import { History } from 'lucide-react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { WASTE_REASON_LABELS } from '~/components/inventory/waste-reason';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Skeleton } from '~/components/ui/skeleton';
import { StatusBadge } from '~/components/ui/status-badge';
import { formatDate } from '~/lib/formater';
import { movementTypeVariant } from '~/lib/inventory-movement';
import { cn } from '~/lib/utils';

type Unit = 'g' | 'ml' | 'piece';

export function MovementHistorySheet({
  ingredient,
  onOpenChange,
}: {
  /** null = closed. Carries the name + unit for display. */
  ingredient: { _id: Id<'ingredients'>; name: string; canonicalUnit: Unit } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const data = useQuery(
    api.ingredients.listMovements,
    ingredient ? { ingredientId: ingredient._id } : 'skip'
  );
  const unit = ingredient?.canonicalUnit ?? '';

  return (
    <Sheet open={ingredient !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            <Trans>Riwayat</Trans> — {ingredient?.name}
          </SheetTitle>
          <SheetDescription className="sr-only">
            <Trans>Riwayat pergerakan stok untuk bahan ini.</Trans>
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 text-sm">
          {data === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are positional and never reorder
                <Skeleton key={`skeleton-${i}`} className="h-8 w-full" />
              ))}
            </div>
          ) : data.rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <History />
                </EmptyMedia>
                <EmptyTitle>
                  <Trans>Belum ada pergerakan stok.</Trans>
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2"><Trans>Tanggal</Trans></th>
                    <th className="py-2"><Trans>Tipe</Trans></th>
                    <th className="py-2 text-right"><Trans>Perubahan</Trans></th>
                    <th className="py-2 text-right"><Trans>Saldo</Trans></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="py-2 tabular-nums">
                        {formatDate(new Date(r.at).toISOString(), 'day-month')}
                      </td>
                      <td className="py-2">
                        <StatusBadge variant={movementTypeVariant(r.reason)}>
                          {r.reason === 'sale' ? (
                            <Trans>Penjualan</Trans>
                          ) : r.reason === 'adjustment' ? (
                            <Trans>Penyesuaian</Trans>
                          ) : (
                            <Trans>Limbah</Trans>
                          )}
                        </StatusBadge>
                        {r.reason === 'waste' && r.wasteReason ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {WASTE_REASON_LABELS[r.wasteReason]}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={cn(
                          'py-2 text-right tabular-nums',
                          r.delta < 0 ? 'text-destructive' : 'text-primary'
                        )}
                      >
                        {r.delta > 0 ? '+' : ''}
                        {r.delta} {unit}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {r.balanceAfter} {unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.truncated ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  <Trans>Menampilkan 100 pergerakan terbaru.</Trans>
                </p>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
