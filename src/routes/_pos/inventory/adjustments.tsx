import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { PackagePlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ADJUST_REASONS } from '~/components/inventory/adjust-reasons';
import { IngredientPicker } from '~/components/inventory/ingredient-picker';
import { StockAdjustDialog } from '~/components/inventory/stock-adjust-dialog';
import { Button } from '~/components/ui/button';
import { DataTable } from '~/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { formatDate } from '~/lib/formater';

export const Route = createFileRoute('/_pos/inventory/adjustments')({
  component: AdjustmentsPage,
});

type AdjustmentRow = {
  id: string;
  at: number;
  ingredientName: string;
  unit: 'g' | 'ml' | 'piece';
  delta: number;
  reasonLabel?: string;
  note?: string;
};
type Filter = 'all' | (typeof ADJUST_REASONS)[number];

function AdjustmentsPage() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adjustId, setAdjustId] = useState<Id<'ingredients'> | null>(null);

  const rows = useQuery(api.ingredients.recentAdjustments, {}) as
    | AdjustmentRow[]
    | undefined;

  // Translated chip labels keyed by raw reason value.
  const reasonLabels: Record<string, string> = {
    'Pengiriman masuk': t`Pengiriman masuk`,
    'Stok opname': t`Stok opname`,
    Koreksi: t`Koreksi`,
  };

  const counts = useMemo(() => {
    if (!rows) return undefined;
    const c: Record<string, number> = { all: rows.length };
    for (const r of ADJUST_REASONS) c[r] = rows.filter((x) => x.reasonLabel === r).length;
    return c;
  }, [rows]);

  const visible = useMemo<AdjustmentRow[] | undefined>(() => {
    if (!rows) return undefined;
    return filter === 'all' ? rows : rows.filter((r) => r.reasonLabel === filter);
  }, [rows, filter]);

  const columns = useMemo<ColumnDef<AdjustmentRow, unknown>[]>(() => {
    const labels: Record<string, string> = {
      'Pengiriman masuk': t`Pengiriman masuk`,
      'Stok opname': t`Stok opname`,
      Koreksi: t`Koreksi`,
    };
    return [
      {
        accessorKey: 'at',
        header: () => <Trans>Tanggal</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatDate(new Date(row.original.at).toISOString(), 'day-month')}
          </span>
        ),
      },
      {
        accessorKey: 'ingredientName',
        enableSorting: false,
        header: () => <Trans>Bahan</Trans>,
        cell: ({ row }) => row.original.ingredientName,
      },
      {
        accessorKey: 'delta',
        header: () => <Trans>Perubahan</Trans>,
        cell: ({ row }) => (
          <span
            className={`tabular-nums ${row.original.delta < 0 ? 'text-destructive' : 'text-primary'}`}
          >
            {row.original.delta > 0 ? '+' : ''}
            {row.original.delta} {row.original.unit}
          </span>
        ),
      },
      {
        id: 'reason',
        enableSorting: false,
        header: () => <Trans>Alasan</Trans>,
        cell: ({ row }) =>
          row.original.reasonLabel ? (
            <StatusBadge
              variant={row.original.reasonLabel === 'Pengiriman masuk' ? 'success' : 'muted'}
            >
              {labels[row.original.reasonLabel] ?? row.original.reasonLabel}
            </StatusBadge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'note',
        enableSorting: false,
        header: () => <Trans>Catatan</Trans>,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.note ?? '—'}</span>
        ),
      },
    ];
  }, [t]);

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackagePlus />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>Belum ada penyesuaian.</Trans>
        </EmptyTitle>
        <EmptyDescription>
          <Trans>Catat penyesuaian stok untuk mulai melacak koreksi dan pengiriman.</Trans>
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Penyesuaian Stok</Trans>}
        meta={counts ? <Trans>{counts.all} penyesuaian · 30 hari</Trans> : null}
        actions={
          <Button type="button" onClick={() => setPickerOpen(true)}>
            <PackagePlus />
            <Trans>Catat Penyesuaian</Trans>
          </Button>
        }
      />

      <Toolbar
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Semua</Trans>, value: 'all', ...(counts !== undefined ? { count: counts.all } : {}) },
          ...ADJUST_REASONS.map((r) => ({
            label: reasonLabels[r],
            value: r,
            ...(counts !== undefined ? { count: counts[r] } : {}),
          })),
        ]}
      />

      <DataTable
        columns={columns}
        data={visible}
        emptyState={emptyState}
        initialSort={[{ id: 'at', desc: true }]}
      />

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Pilih bahan untuk disesuaikan</Trans>
            </DialogTitle>
          </DialogHeader>
          <IngredientPicker
            value={null}
            onChange={(id) => {
              setPickerOpen(false);
              setAdjustId(id);
            }}
          />
        </DialogContent>
      </Dialog>

      <StockAdjustDialog
        open={adjustId !== null}
        ingredientId={adjustId}
        onOpenChange={(open) => {
          if (!open) setAdjustId(null);
        }}
      />
    </main>
  );
}
