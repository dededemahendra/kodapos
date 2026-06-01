import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { BarChart3 } from 'lucide-react';
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

export const Route = createFileRoute('/_pos/reports/sales')({
  component: SalesReport,
});

type DayRow = { day: string; revenueIDR: number; orders: number };

function SalesReport() {
  const { t } = useLingui();
  const { range } = useReportRange();
  const data = useQuery(api.reports.salesDaily, { range });

  const columns = useMemo<ColumnDef<DayRow, unknown>[]>(
    () => [
      { accessorKey: 'day', header: () => <Trans>Tanggal</Trans> },
      {
        accessorKey: 'orders',
        header: () => <Trans>Transaksi</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.orders}</span>
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

  const hasSales = data.days.some((d) => d.orders > 0);
  if (!hasSales) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BarChart3 />
          </EmptyMedia>
          <EmptyTitle>
            <Trans>Belum ada penjualan pada rentang ini.</Trans>
          </EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  function onDownload() {
    const csv = toCSV(data!.days, [
      { key: 'day', header: t`Tanggal` },
      { key: 'orders', header: t`Transaksi` },
      { key: 'revenueIDR', header: t`Pendapatan (Rp)` },
    ]);
    downloadCSV(`penjualan-${data!.fromKey}_${data!.toKey}.csv`, csv);
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
        data={data.days}
        emptyState={null}
        initialSort={[{ id: 'day', desc: false }]}
      />
    </div>
  );
}
