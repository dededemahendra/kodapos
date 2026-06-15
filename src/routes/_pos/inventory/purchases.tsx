import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PurchaseForm } from '~/components/inventory/purchase-form';
import { Button } from '~/components/ui/button';
import { DataTable } from '~/components/ui/data-table';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { formatDate } from '~/lib/formater';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/inventory/purchases')({
  component: PurchasesPage,
});

type PurchaseRow = {
  id: Id<'purchases'>;
  at: number;
  supplierName?: string;
  lineCount: number;
  totalIDR: number;
};

function PurchasesPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [viewId, setViewId] = useState<Id<'purchases'> | null>(null);
  const rows = useQuery(api.purchases.recent, {}) as PurchaseRow[] | undefined;

  const columns = useMemo<ColumnDef<PurchaseRow, unknown>[]>(
    () => [
      {
        accessorKey: 'at',
        header: () => <Trans>Tanggal</Trans>,
        cell: ({ row }) => (
          <button
            type="button"
            className="font-medium hover:underline"
            onClick={() => setViewId(row.original.id)}
          >
            {formatDate(new Date(row.original.at).toISOString(), 'day-month')}
          </button>
        ),
      },
      {
        accessorKey: 'supplierName',
        enableSorting: false,
        header: () => <Trans>Pemasok</Trans>,
        cell: ({ row }) => (
          <span>{row.original.supplierName ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'lineCount',
        enableSorting: false,
        header: () => <Trans>Item</Trans>,
        cell: ({ row }) => <span className="tabular-nums">{row.original.lineCount}</span>,
      },
      {
        accessorKey: 'totalIDR',
        header: () => <Trans>Total</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatIDR(row.original.totalIDR)}</span>
        ),
      },
    ],
    []
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Truck />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>Belum ada pembelian.</Trans>
        </EmptyTitle>
        <EmptyDescription>
          <Trans>Catat pembelian untuk menambah stok dan memperbarui biaya bahan.</Trans>
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Pembelian</Trans>}
        meta={rows ? <Trans>{rows.length} pembelian · 30 hari</Trans> : null}
        actions={
          <Button type="button" onClick={() => setFormOpen(true)}>
            <Truck />
            <Trans>Catat Pembelian</Trans>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        emptyState={emptyState}
        initialSort={[{ id: 'at', desc: true }]}
      />

      <PurchaseForm open={formOpen} onOpenChange={setFormOpen} />
      <PurchaseDetailSheet
        viewId={viewId}
        onOpenChange={(o) => {
          if (!o) setViewId(null);
        }}
      />
    </main>
  );
}

function PurchaseDetailSheet({
  viewId,
  onOpenChange,
}: {
  viewId: Id<'purchases'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useQuery(api.purchases.get, viewId ? { id: viewId } : 'skip');
  return (
    <Sheet open={viewId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            <Trans>Pembelian</Trans>
            {detail?.supplierName ? ` — ${detail.supplierName}` : ''}
          </SheetTitle>
          <SheetDescription className="sr-only">
            <Trans>Rincian baris pembelian.</Trans>
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 text-sm">
          {detail === undefined ? (
            <p className="text-muted-foreground">
              <Trans>Memuat…</Trans>
            </p>
          ) : detail === null ? (
            <p className="text-muted-foreground">
              <Trans>Pembelian tidak ditemukan.</Trans>
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs tabular-nums text-muted-foreground">
                {formatDate(new Date(detail.at).toISOString(), 'day-month')}
              </p>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2"><Trans>Bahan</Trans></th>
                    <th className="py-2 text-right"><Trans>Qty</Trans></th>
                    <th className="py-2 text-right"><Trans>Biaya/satuan</Trans></th>
                    <th className="py-2 text-right"><Trans>Subtotal</Trans></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((l, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: purchase lines are an immutable snapshot in stored order
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2">{l.ingredientName}</td>
                      <td className="py-2 text-right tabular-nums">
                        {l.qty} {l.unit}
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatIDR(Math.round(l.unitCostIDR))}</td>
                      <td className="py-2 text-right tabular-nums">{formatIDR(Math.round(l.subtotalIDR))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 flex justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">
                  <Trans>Total</Trans>
                </span>
                <span className="font-semibold tabular-nums">{formatIDR(detail.totalIDR)}</span>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
