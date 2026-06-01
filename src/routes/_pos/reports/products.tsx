import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { Package } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '~/components/ui/button';
import { DataTable } from '~/components/ui/data-table';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import { downloadCSV, toCSV } from '~/lib/csv';
import { formatIDR } from '~/lib/money';
import { useReportRange } from '~/components/reports/use-report-range';

export const Route = createFileRoute('/_pos/reports/products')({
  component: ProductsReport,
});

type ItemRow = { name: string; qty: number; revenueIDR: number };

function ProductsReport() {
  const { t } = useLingui();
  const { range } = useReportRange();
  const data = useQuery(api.reports.products, { range });

  const columns = useMemo<ColumnDef<ItemRow, unknown>[]>(
    () => [
      { accessorKey: 'name', header: () => <Trans>Produk</Trans> },
      {
        accessorKey: 'qty',
        header: () => <Trans>Jumlah</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.qty}</span>
        ),
      },
      {
        accessorKey: 'revenueIDR',
        header: () => <Trans>Pendapatan</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatIDR(row.original.revenueIDR)}
          </span>
        ),
      },
    ],
    []
  );

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Spinner />
      </div>
    );
  }

  if (data.items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Package />
          </EmptyMedia>
          <EmptyTitle>
            <Trans>Belum ada produk terjual pada rentang ini.</Trans>
          </EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  function onDownload() {
    const csv = toCSV(data!.items, [
      { key: 'name', header: t`Produk` },
      { key: 'qty', header: t`Jumlah` },
      { key: 'revenueIDR', header: t`Pendapatan (Rp)` },
    ]);
    downloadCSV(`produk-${data!.fromKey}_${data!.toKey}.csv`, csv);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onDownload}>
          <Trans>Unduh CSV</Trans>
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={data.items}
        emptyState={null}
        initialSort={[{ id: 'revenueIDR', desc: true }]}
      />
    </div>
  );
}
