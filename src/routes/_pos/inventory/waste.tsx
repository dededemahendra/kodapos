import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { WasteDialog } from '~/components/inventory/waste-dialog';
import { WASTE_REASON_LABELS } from '~/components/inventory/waste-reason';
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
import { StatusBadge } from '~/components/ui/status-badge';
import { formatDate } from '~/lib/formater';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/inventory/waste')({
  component: WastePage,
});

type WasteRow = {
  id: string;
  at: number;
  ingredientName: string;
  unit: 'g' | 'ml' | 'piece';
  qtyWasted: number;
  wasteReason: string;
  note?: string;
  totalCostIDR: number;
};

function WastePage() {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const rows = useQuery(api.waste.recent, {}) as WasteRow[] | undefined;
  const totalLoss = (rows ?? []).reduce((sum, r) => sum + r.totalCostIDR, 0);

  const columns = useMemo<ColumnDef<WasteRow, unknown>[]>(
    () => [
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
        id: 'qty',
        enableSorting: false,
        header: () => <Trans>Jumlah</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.qtyWasted} {row.original.unit}
          </span>
        ),
      },
      {
        id: 'reason',
        enableSorting: false,
        header: () => <Trans>Alasan</Trans>,
        cell: ({ row }) => (
          <StatusBadge variant="danger">
            {WASTE_REASON_LABELS[row.original.wasteReason] ?? row.original.wasteReason}
          </StatusBadge>
        ),
      },
      {
        accessorKey: 'totalCostIDR',
        header: () => <Trans>Kerugian</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatIDR(row.original.totalCostIDR)}</span>
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
    ],
    []
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Trash2 />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>Belum ada limbah</Trans>
        </EmptyTitle>
        <EmptyDescription>
          <Trans>Belum ada limbah tercatat dalam 30 hari terakhir.</Trans>
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Limbah</Trans>}
        meta={
          rows ? (
            <Trans>Kerugian 30 hari · {formatIDR(totalLoss)}</Trans>
          ) : null
        }
        actions={
          <Button type="button" onClick={() => setOpen(true)}>
            <Trash2 />
            <Trans>Catat Limbah</Trans>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        emptyState={emptyState}
        initialSort={[{ id: 'at', desc: true }]}
      />

      <WasteDialog open={open} onOpenChange={setOpen} />
    </main>
  );
}
