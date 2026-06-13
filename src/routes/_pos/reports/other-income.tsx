import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Coins, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { IncomeDialog } from '~/components/income/income-dialog';
import { useReportRange } from '~/components/reports/use-report-range';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
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

export const Route = createFileRoute('/_pos/reports/other-income')({
  component: OtherIncomeReport,
});

type Row = {
  id: Id<'otherIncome'>;
  at: number;
  source: string;
  amountIDR: number;
  note?: string;
};

function OtherIncomeReport() {
  const { t } = useLingui();
  const { range } = useReportRange();
  const data = useQuery(api.otherIncome.list, { range });
  const remove = useMutation(api.otherIncome.remove);
  const [addOpen, setAddOpen] = useState(false);
  const [delId, setDelId] = useState<Id<'otherIncome'> | null>(null);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
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
        accessorKey: 'source',
        header: () => <Trans>Sumber</Trans>,
        cell: ({ row }) => (
          <span className="text-sm">{row.original.source}</span>
        ),
      },
      {
        accessorKey: 'note',
        header: () => <Trans>Catatan</Trans>,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.note ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'amountIDR',
        header: () => <Trans>Jumlah (Rp)</Trans>,
        cell: ({ row }) => (
          <div className="text-right">
            <span className="tabular-nums">
              {formatIDR(row.original.amountIDR)}
            </span>
          </div>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setDelId(row.original.id)}
            >
              <Trans>Hapus</Trans>
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  function exportCSV() {
    if (!data) return;
    const csv = toCSV(
      data.rows.map((r) => ({
        at: new Date(r.at).toLocaleDateString('id-ID'),
        source: r.source,
        note: r.note ?? '',
        amountIDR: r.amountIDR,
      })),
      [
        { key: 'at', header: t`Tanggal` },
        { key: 'source', header: t`Sumber` },
        { key: 'note', header: t`Catatan` },
        { key: 'amountIDR', header: t`Jumlah (Rp)` },
      ]
    );
    downloadCSV(`pendapatan-lain-${range}.csv`, csv);
  }

  async function exportPDF() {
    if (!data) return;
    try {
      await exportTablePdf({
        filename: 'pendapatan-lain.pdf',
        title: 'Other income',
        subtitle:
          'from' in range ? `${range.from} to ${range.to}` : range.preset,
        columns: [
          { key: 'at', header: 'Date' },
          { key: 'source', header: 'Source' },
          { key: 'note', header: 'Note' },
          { key: 'amountIDR', header: 'Amount' },
        ],
        rows: data.rows.map((r) => ({
          at: new Date(r.at).toLocaleDateString('en-GB'),
          source: r.source,
          note: r.note ?? '',
          amountIDR: formatIDR(r.amountIDR),
        })),
        numericKeys: ['amountIDR'],
        footRows: [['', '', 'Total', formatIDR(data.totalIDR)]],
      });
    } catch {
      toast.error(t`Gagal mengunduh PDF.`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <Trans>Total</Trans>:{' '}
          <span className="font-semibold tabular-nums">
            {data ? formatIDR(data.totalIDR) : '—'}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={!data || data.rows.length === 0}
          >
            <Trans>Unduh CSV</Trans>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportPDF}
            disabled={!data || data.rows.length === 0}
          >
            <Trans>Unduh PDF</Trans>
          </Button>
          <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
            <Plus />
            <Trans>Catat pendapatan</Trans>
          </Button>
        </div>
      </div>

      {data === undefined ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : data.rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Coins />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Belum ada pendapatan lain.</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>Catat pendapatan atau ubah rentang tanggal di atas.</Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DataTable
          columns={columns}
          data={data.rows}
          emptyState={null}
          initialSort={[{ id: 'at', desc: true }]}
        />
      )}

      <IncomeDialog open={addOpen} onOpenChange={setAddOpen} />
      <ConfirmDialog
        open={delId !== null}
        onOpenChange={(o) => {
          if (!o) setDelId(null);
        }}
        title={<Trans>Hapus pendapatan?</Trans>}
        confirmLabel={<Trans>Hapus</Trans>}
        destructive
        onConfirm={async () => {
          if (!delId) return;
          try {
            await remove({ id: delId });
            toast.success(t`Pendapatan dihapus.`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t`Gagal menghapus.`);
            throw err;
          }
        }}
      />
    </div>
  );
}
