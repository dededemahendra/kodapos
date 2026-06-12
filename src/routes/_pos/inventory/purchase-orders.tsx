import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { ClipboardList } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PurchaseOrderFormDialog } from '~/components/inventory/purchase-order-form-dialog';
import { RequirePermission } from '~/components/permission/require-permission';
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
import type { StatusBadgeVariant } from '~/components/ui/status-badge-variant';
import { formatDate } from '~/lib/formater';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/inventory/purchase-orders')({
  component: PurchaseOrdersPage,
});

type PoStatus = 'open' | 'partial' | 'received' | 'cancelled';

type PoRow = {
  _id: Id<'purchaseOrders'>;
  supplierName?: string;
  status: PoStatus;
  lineCount: number;
  orderedTotalIDR: number;
  receivedTotalIDR: number;
  createdAt: number;
};

const STATUS_VARIANT: Record<PoStatus, StatusBadgeVariant> = {
  open: 'muted',
  partial: 'warn',
  received: 'success',
  cancelled: 'danger',
};

function StatusCell({ status }: { status: PoStatus }) {
  const variant = STATUS_VARIANT[status];
  return (
    <StatusBadge variant={variant}>
      {status === 'open' ? (
        <Trans>Terbuka</Trans>
      ) : status === 'partial' ? (
        <Trans>Sebagian</Trans>
      ) : status === 'received' ? (
        <Trans>Diterima</Trans>
      ) : (
        <Trans>Dibatalkan</Trans>
      )}
    </StatusBadge>
  );
}

function PurchaseOrdersPage() {
  const [formOpen, setFormOpen] = useState(false);
  // Holds the row a user clicked; Task 3 wires this into the detail component.
  const [selectedId, setSelectedId] = useState<Id<'purchaseOrders'> | null>(null);
  const rows = useQuery(api.purchaseOrders.list, {}) as PoRow[] | undefined;

  // selectedId is intentionally unused for now (Task 3 renders the detail).
  void selectedId;

  const columns = useMemo<ColumnDef<PoRow, unknown>[]>(
    () => [
      {
        accessorKey: 'supplierName',
        enableSorting: false,
        header: () => <Trans>Pemasok</Trans>,
        cell: ({ row }) => (
          <button
            type="button"
            className="font-medium hover:underline"
            onClick={() => setSelectedId(row.original._id)}
          >
            {row.original.supplierName ?? <Trans>Tanpa pemasok</Trans>}
          </button>
        ),
      },
      {
        accessorKey: 'status',
        enableSorting: false,
        header: () => <Trans>Status</Trans>,
        cell: ({ row }) => <StatusCell status={row.original.status} />,
      },
      {
        accessorKey: 'orderedTotalIDR',
        header: () => <Trans>Dipesan</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatIDR(row.original.orderedTotalIDR)}</span>
        ),
      },
      {
        accessorKey: 'receivedTotalIDR',
        header: () => <Trans>Diterima</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatIDR(row.original.receivedTotalIDR)}</span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: () => <Trans>Tanggal</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatDate(new Date(row.original.createdAt).toISOString(), 'day-month')}
          </span>
        ),
      },
    ],
    []
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ClipboardList />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>Belum ada pesanan beli.</Trans>
        </EmptyTitle>
        <EmptyDescription>
          <Trans>Buat pesanan beli ke pemasok, lalu terima barang untuk menambah stok.</Trans>
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <RequirePermission perm="canEditMenu">
      <main className="p-6">
        <PageHeader
          title={<Trans>Pesanan Beli</Trans>}
          meta={rows ? <Trans>{rows.length} pesanan beli</Trans> : null}
          actions={
            <Button type="button" onClick={() => setFormOpen(true)}>
              <ClipboardList />
              <Trans>Buat PO</Trans>
            </Button>
          }
        />

        <DataTable
          columns={columns}
          data={rows}
          emptyState={emptyState}
          initialSort={[{ id: 'createdAt', desc: true }]}
        />

        <PurchaseOrderFormDialog open={formOpen} onOpenChange={setFormOpen} />
      </main>
    </RequirePermission>
  );
}
