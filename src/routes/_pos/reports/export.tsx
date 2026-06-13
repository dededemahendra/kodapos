import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { FileSpreadsheet } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { useReportRange } from '~/components/reports/use-report-range';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
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
import { exportTablePdf } from '~/lib/pdf';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/reports/export')({
  component: AccountingExport,
});

type EntryType = 'sale' | 'expense' | 'other_income' | 'refund' | 'purchase';

type Entry = {
  at: number;
  dateKey: string;
  type: EntryType;
  ref: string;
  description: string;
  account: string;
  method?: string;
  inflowIDR: number;
  outflowIDR: number;
};

// Translated badge labels for the on-screen table.
function typeLabel(type: EntryType): ReactNode {
  switch (type) {
    case 'sale':
      return <Trans>Penjualan</Trans>;
    case 'refund':
      return <Trans>Pengembalian</Trans>;
    case 'expense':
      return <Trans>Pengeluaran</Trans>;
    case 'other_income':
      return <Trans>Pendapatan Lain</Trans>;
    case 'purchase':
      return <Trans>Pembelian</Trans>;
  }
}

function AccountingExport() {
  const { t } = useLingui();
  const { range } = useReportRange();
  const data = useQuery(api.accounting.ledger, { range });

  // Plain-text type labels keyed by the DB value for CSV export (off-screen, so
  // the translated ReactNode labels above can't be reused).
  const typeText: Record<EntryType, string> = {
    sale: t`Penjualan`,
    refund: t`Pengembalian`,
    expense: t`Pengeluaran`,
    other_income: t`Pendapatan Lain`,
    purchase: t`Pembelian`,
  };

  const columns = useMemo<ColumnDef<Entry, unknown>[]>(
    () => [
      {
        accessorKey: 'at',
        header: () => <Trans>Tanggal</Trans>,
        cell: ({ row }) => (
          <span className="text-sm">
            {new Date(row.original.at).toLocaleDateString('id-ID')}
          </span>
        ),
      },
      {
        accessorKey: 'type',
        header: () => <Trans>Tipe</Trans>,
        cell: ({ row }) => (
          <Badge variant="secondary">{typeLabel(row.original.type)}</Badge>
        ),
      },
      {
        accessorKey: 'description',
        header: () => <Trans>Keterangan</Trans>,
        cell: ({ row }) => (
          <span className="text-sm">{row.original.description}</span>
        ),
      },
      {
        accessorKey: 'account',
        header: () => <Trans>Akun</Trans>,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.account}
          </span>
        ),
      },
      {
        accessorKey: 'method',
        header: () => <Trans>Metode</Trans>,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.method ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'inflowIDR',
        header: () => (
          <div className="text-right">
            <Trans>Uang Masuk</Trans>
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {row.original.inflowIDR ? formatIDR(row.original.inflowIDR) : '—'}
          </div>
        ),
      },
      {
        accessorKey: 'outflowIDR',
        header: () => (
          <div className="text-right">
            <Trans>Uang Keluar</Trans>
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {row.original.outflowIDR ? formatIDR(row.original.outflowIDR) : '—'}
          </div>
        ),
      },
    ],
    []
  );

  function exportCSV() {
    if (!data) return;
    const rows = data.entries.map((e) => ({
      Tanggal: e.dateKey,
      Tipe: typeText[e.type],
      Ref: e.ref,
      Keterangan: e.description,
      Akun: e.account,
      Metode: e.method ?? '',
      Masuk: e.inflowIDR || '',
      Keluar: e.outflowIDR || '',
    }));
    const csv = toCSV(rows, [
      { key: 'Tanggal', header: t`Tanggal` },
      { key: 'Tipe', header: t`Tipe` },
      { key: 'Ref', header: 'Ref' },
      { key: 'Keterangan', header: t`Keterangan` },
      { key: 'Akun', header: t`Akun` },
      { key: 'Metode', header: t`Metode` },
      { key: 'Masuk', header: t`Uang Masuk` },
      { key: 'Keluar', header: t`Uang Keluar` },
    ]);
    downloadCSV(`buku-besar-${data.fromKey}-${data.toKey}.csv`, csv);
  }

  // English type labels for the off-catalog PDF document.
  const typeEnglish: Record<EntryType, string> = {
    sale: 'Sale',
    refund: 'Refund',
    expense: 'Expense',
    other_income: 'Other income',
    purchase: 'Purchase',
  };

  async function exportPDF() {
    if (!data) return;
    try {
      const rows = data.entries.map((e) => ({
        date: e.dateKey,
        type: typeEnglish[e.type],
        ref: e.ref,
        description: e.description,
        account: e.account,
        method: e.method ?? '',
        inflow: e.inflowIDR ? formatIDR(e.inflowIDR) : '',
        outflow: e.outflowIDR ? formatIDR(e.outflowIDR) : '',
      }));
      await exportTablePdf({
        filename: `buku-besar-${data.fromKey}-${data.toKey}.pdf`,
        title: 'Ledger',
        subtitle: `${data.fromKey} to ${data.toKey}`,
        columns: [
          { key: 'date', header: 'Date' },
          { key: 'type', header: 'Type' },
          { key: 'ref', header: 'Ref' },
          { key: 'description', header: 'Description' },
          { key: 'account', header: 'Account' },
          { key: 'method', header: 'Method' },
          { key: 'inflow', header: 'Inflow' },
          { key: 'outflow', header: 'Outflow' },
        ],
        rows,
        numericKeys: ['inflow', 'outflow'],
        footRows: [
          [
            '',
            '',
            '',
            '',
            '',
            'Total',
            formatIDR(data.summary.inflowIDR),
            formatIDR(data.summary.outflowIDR),
          ],
          ['', '', '', '', '', 'Net', formatIDR(data.summary.netIDR), ''],
        ],
      });
    } catch {
      toast.error(t`Gagal mengunduh PDF.`);
    }
  }

  const reversed = useMemo(
    () => (data ? [...data.entries].reverse() : []),
    [data]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={exportCSV}
          disabled={!data || data.entries.length === 0}
        >
          <Trans>Unduh Buku Besar (CSV)</Trans>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={exportPDF}
          disabled={!data || data.entries.length === 0}
        >
          <Trans>Unduh PDF</Trans>
        </Button>
      </div>

      {data ? (
        <Card className="p-4">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            <div className="flex items-baseline justify-between gap-4">
              <dt>
                <Trans>Arus Masuk</Trans>
              </dt>
              <dd className="tabular-nums">
                {formatIDR(data.summary.inflowIDR)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt>
                <Trans>Arus Keluar</Trans>
              </dt>
              <dd className="tabular-nums">
                {formatIDR(data.summary.outflowIDR)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 font-semibold sm:col-span-2 border-t border-border pt-2">
              <dt>
                <Trans>Bersih</Trans>
              </dt>
              <dd
                className={`tabular-nums${
                  data.summary.netIDR < 0 ? ' text-destructive' : ''
                }`}
              >
                {formatIDR(data.summary.netIDR)}
              </dd>
            </div>

            <div className="flex items-baseline justify-between gap-4 text-muted-foreground text-sm sm:col-span-2 border-t border-border pt-2">
              <dt>
                <Trans>Penjualan</Trans>
              </dt>
              <dd className="tabular-nums">
                {formatIDR(data.summary.salesIDR)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 text-muted-foreground text-sm">
              <dt>
                <Trans>Pendapatan Lain</Trans>
              </dt>
              <dd className="tabular-nums">
                {formatIDR(data.summary.otherIncomeIDR)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 text-muted-foreground text-sm">
              <dt>
                <Trans>Pengembalian</Trans>
              </dt>
              <dd className="tabular-nums">
                {formatIDR(data.summary.refundsIDR)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 text-muted-foreground text-sm">
              <dt>
                <Trans>Pengeluaran</Trans>
              </dt>
              <dd className="tabular-nums">
                {formatIDR(data.summary.expensesIDR)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 text-muted-foreground text-sm">
              <dt>
                <Trans>Pembelian</Trans>
              </dt>
              <dd className="tabular-nums">
                {formatIDR(data.summary.purchasesIDR)}
              </dd>
            </div>
          </dl>
        </Card>
      ) : null}

      {data === undefined ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : data.entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileSpreadsheet />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Belum ada transaksi.</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>Coba ubah rentang tanggal di atas.</Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DataTable columns={columns} data={reversed} emptyState={null} />
      )}
    </div>
  );
}
