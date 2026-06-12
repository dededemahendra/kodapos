import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { CreditCard } from 'lucide-react';
import { useMemo } from 'react';
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
import { useReportRange } from '~/components/reports/use-report-range';

export const Route = createFileRoute('/_pos/reports/payments')({
  component: PaymentsReport,
});

const METHOD_LABEL: Record<string, string> = {
  cash: 'Tunai',
  qris_static: 'QRIS Statis',
  qris_dynamic: 'QRIS Dinamis',
};

type MethodRow = {
  method: string;
  label: string;
  count: number;
  amountIDR: number;
  pct: number;
};

function PaymentsReport() {
  const { t } = useLingui();
  const { range } = useReportRange();
  const data = useQuery(api.reports.payments, { range });

  const rows = useMemo<MethodRow[]>(() => {
    if (!data) return [];
    return data.methods.map((m) => ({
      method: m.method,
      label: METHOD_LABEL[m.method] ?? m.method,
      count: m.count,
      amountIDR: m.amountIDR,
      pct:
        data.totalIDR === 0
          ? 0
          : Math.round((m.amountIDR / data.totalIDR) * 100),
    }));
  }, [data]);

  const columns = useMemo<ColumnDef<MethodRow, unknown>[]>(
    () => [
      { accessorKey: 'label', header: () => <Trans>Metode</Trans> },
      {
        accessorKey: 'count',
        header: () => <Trans>Transaksi</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.count}</span>
        ),
      },
      {
        accessorKey: 'amountIDR',
        header: () => <Trans>Jumlah</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatIDR(row.original.amountIDR)}
          </span>
        ),
      },
      {
        accessorKey: 'pct',
        header: () => <Trans>Porsi</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.pct}%</span>
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

  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CreditCard />
          </EmptyMedia>
          <EmptyTitle>
            <Trans>Belum ada pembayaran pada rentang ini.</Trans>
          </EmptyTitle>
          <EmptyDescription>
            <Trans>Coba ubah rentang tanggal di atas.</Trans>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  function onDownload() {
    const csv = toCSV(
      rows.map((r) => ({
        label: r.label,
        count: r.count,
        amountIDR: r.amountIDR,
        pct: r.pct,
      })),
      [
        { key: 'label', header: t`Metode` },
        { key: 'count', header: t`Transaksi` },
        { key: 'amountIDR', header: t`Jumlah (Rp)` },
        { key: 'pct', header: t`Porsi (%)` },
      ]
    );
    downloadCSV(`pembayaran-${data!.fromKey}_${data!.toKey}.csv`, csv);
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
        data={rows}
        emptyState={null}
        initialSort={[{ id: 'amountIDR', desc: true }]}
      />
    </div>
  );
}
