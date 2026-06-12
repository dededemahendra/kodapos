import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { useReportRange } from '~/components/reports/use-report-range';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { DataTable } from '~/components/ui/data-table';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import { downloadCSV, toCSV } from '~/lib/csv';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/reports/margin')({
  component: MarginReport,
});

type MarginRow = {
  name: string;
  qty: number;
  revenueIDR: number;
  cogsIDR: number;
  marginIDR: number;
  marginPct: number;
};

function MarginReport() {
  const { t } = useLingui();
  const { range } = useReportRange();
  const data = useQuery(api.reports.margin, { range });

  const columns = useMemo<ColumnDef<MarginRow, unknown>[]>(
    () => [
      { accessorKey: 'name', header: () => <Trans>Item</Trans> },
      {
        accessorKey: 'qty',
        header: () => <Trans>Terjual</Trans>,
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
      {
        accessorKey: 'cogsIDR',
        header: () => <Trans>Biaya</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatIDR(row.original.cogsIDR)}
          </span>
        ),
      },
      {
        accessorKey: 'marginIDR',
        header: () => <Trans>Margin</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatIDR(row.original.marginIDR)}
          </span>
        ),
      },
      {
        accessorKey: 'marginPct',
        header: () => <Trans>Margin %</Trans>,
        cell: ({ row }) => (
          <Badge
            variant={row.original.marginPct < 0 ? 'destructive' : 'secondary'}
          >
            {`${row.original.marginPct}%`}
          </Badge>
        ),
      },
    ],
    []
  );

  function exportCSV() {
    if (!data) return;
    const csv = toCSV(
      data.items.map((r) => ({
        name: r.name,
        qty: r.qty,
        revenueIDR: r.revenueIDR,
        cogsIDR: r.cogsIDR,
        marginIDR: r.marginIDR,
        marginPct: r.marginPct,
      })),
      [
        { key: 'name', header: t`Item` },
        { key: 'qty', header: t`Terjual` },
        { key: 'revenueIDR', header: t`Pendapatan (Rp)` },
        { key: 'cogsIDR', header: t`Biaya (Rp)` },
        { key: 'marginIDR', header: t`Margin (Rp)` },
        { key: 'marginPct', header: t`Margin %` },
      ]
    );
    downloadCSV('margin.csv', csv);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <Trans>Pendapatan</Trans>:{' '}
            <span className="font-semibold tabular-nums">
              {data ? formatIDR(data.totalRevenueIDR) : '—'}
            </span>
          </div>
          <div>
            <Trans>Biaya</Trans>:{' '}
            <span className="font-semibold tabular-nums">
              {data ? formatIDR(data.totalCogsIDR) : '—'}
            </span>
          </div>
          <div>
            <Trans>Margin</Trans>:{' '}
            <span className="font-semibold tabular-nums">
              {data ? formatIDR(data.totalMarginIDR) : '—'}
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={exportCSV}
          disabled={!data || data.items.length === 0}
        >
          <Trans>Unduh CSV</Trans>
        </Button>
      </div>

      {data === undefined ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : data.items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TrendingUp />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Belum ada penjualan pada rentang ini.</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>Margin muncul setelah ada item terjual pada rentang ini.</Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DataTable
          columns={columns}
          data={data.items}
          emptyState={null}
          initialSort={[{ id: 'marginIDR', desc: true }]}
        />
      )}

      <p className="text-muted-foreground text-xs">
        <Trans>Margin memakai biaya bahan terkini.</Trans>
      </p>
    </div>
  );
}
