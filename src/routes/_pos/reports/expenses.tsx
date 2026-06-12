import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Plus, Wallet } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import {
  EXPENSE_CATEGORY_OPTIONS,
  type ExpenseCategory,
} from '~/components/expenses/expense-categories';
import { ExpenseDialog } from '~/components/expenses/expense-dialog';
import { useReportRange } from '~/components/reports/use-report-range';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
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
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/reports/expenses')({
  component: ExpensesReport,
});

type Row = {
  id: Id<'expenses'>;
  at: number;
  category: ExpenseCategory;
  amountIDR: number;
  note?: string;
};

function catLabel(c: ExpenseCategory): ReactNode {
  return EXPENSE_CATEGORY_OPTIONS.find((o) => o.value === c)?.label ?? c;
}

function ExpensesReport() {
  const { t } = useLingui();
  const { range } = useReportRange();
  const data = useQuery(api.expenses.list, { range });
  const remove = useMutation(api.expenses.remove);
  const [addOpen, setAddOpen] = useState(false);
  const [delId, setDelId] = useState<Id<'expenses'> | null>(null);

  // Raw category labels keyed by the DB value for CSV export (off-screen, so
  // the translated ReactNode labels above can't be reused).
  const catText: Record<ExpenseCategory, string> = {
    rent: t`Sewa`,
    utilities: t`Utilitas`,
    supplies: t`Perlengkapan`,
    salary: t`Gaji`,
    other: t`Lainnya`,
  };

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
        accessorKey: 'category',
        header: () => <Trans>Kategori</Trans>,
        cell: ({ row }) => (
          <Badge variant="secondary">{catLabel(row.original.category)}</Badge>
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
        accessorKey: 'note',
        header: () => <Trans>Catatan</Trans>,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.note ?? '—'}
          </span>
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
        category: catText[r.category],
        amountIDR: r.amountIDR,
        note: r.note ?? '',
      })),
      [
        { key: 'at', header: t`Tanggal` },
        { key: 'category', header: t`Kategori` },
        { key: 'amountIDR', header: t`Jumlah` },
        { key: 'note', header: t`Catatan` },
      ]
    );
    downloadCSV('pengeluaran.csv', csv);
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
          <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
            <Plus />
            <Trans>Catat pengeluaran</Trans>
          </Button>
        </div>
      </div>

      {data && data.byCategory.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {data.byCategory.map((c) => (
            <div
              key={c.category}
              className="rounded-md border border-border px-2 py-1 text-xs"
            >
              {catLabel(c.category)}:{' '}
              <span className="tabular-nums">{formatIDR(c.amountIDR)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {data === undefined ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : data.rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Wallet />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Belum ada pengeluaran pada rentang ini.</Trans>
            </EmptyTitle>
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

      <ExpenseDialog open={addOpen} onOpenChange={setAddOpen} />
      <ConfirmDialog
        open={delId !== null}
        onOpenChange={(o) => {
          if (!o) setDelId(null);
        }}
        title={<Trans>Hapus pengeluaran?</Trans>}
        confirmLabel={<Trans>Hapus</Trans>}
        destructive
        onConfirm={async () => {
          if (!delId) return;
          try {
            await remove({ id: delId });
            toast.success(t`Pengeluaran dihapus.`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t`Gagal menghapus.`);
            throw err;
          }
        }}
      />
    </div>
  );
}
