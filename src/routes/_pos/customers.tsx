import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Doc } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Archive, Pencil, Plus, Users } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { CustomerDetailSheet } from '~/components/customer/customer-detail-sheet';
import { CustomerFormDialog } from '~/components/customer/customer-form-dialog';
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
import { PageHeader } from '~/components/ui/page-header';
import { RowActions } from '~/components/ui/row-actions';
import { Toolbar } from '~/components/ui/toolbar';
import { formatIDR } from '~/lib/formater';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/customers')({ component: CustomersPage });

type Customer = Doc<'customers'>;
type Filter = 'active' | 'archived';

function CustomersPage() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formCustomer, setFormCustomer] = useState<Customer | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Customer | null>(null);
  const [selectedId, setSelectedId] = useState<Customer['_id'] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const customers = useQuery(api.customers.list, {
    includeArchived: filter === 'archived',
    search,
  });
  const archive = useMutation(api.customers.archive);

  function openCreate() {
    setFormCustomer(null);
    setFormOpen(true);
  }
  const openEdit = useCallback((c: Customer) => {
    setFormCustomer(c);
    setFormOpen(true);
  }, []);
  const openDetail = useCallback((c: Customer) => {
    setSelectedId(c._id);
    setSheetOpen(true);
  }, []);

  const columns = useMemo<ColumnDef<Customer, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <Trans>Nama</Trans>,
        cell: ({ row }) => (
          <button
            type="button"
            className="text-left font-medium hover:underline"
            onClick={() => openDetail(row.original)}
          >
            {row.original.name}
          </button>
        ),
      },
      {
        accessorKey: 'phone',
        enableSorting: false,
        header: () => <Trans>Telp</Trans>,
        cell: ({ row }) => <span className="tabular-nums">{row.original.phone}</span>,
      },
      {
        accessorKey: 'pointsBalance',
        header: () => <Trans>Poin</Trans>,
        cell: ({ row }) => <span className="tabular-nums">{row.original.pointsBalance}</span>,
      },
      {
        accessorKey: 'visitCount',
        header: () => <Trans>Kunjungan</Trans>,
        cell: ({ row }) => <span className="tabular-nums">{row.original.visitCount}</span>,
      },
      {
        accessorKey: 'totalSpentIDR',
        header: () => <Trans>Total</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatIDR(row.original.totalSpentIDR)}</span>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => null,
        cell: ({ row }) =>
          row.original.archived ? null : (
            <div className="text-right">
              <RowActions
                label={t`Aksi baris`}
                items={[
                  {
                    label: <Trans>Ubah</Trans>,
                    icon: <Pencil />,
                    onSelect: () => openEdit(row.original),
                  },
                  {
                    label: <Trans>Arsipkan</Trans>,
                    icon: <Archive />,
                    destructive: true,
                    separatorBefore: true,
                    onSelect: () => setArchiveTarget(row.original),
                  },
                ]}
              />
            </div>
          ),
      },
    ],
    [t, openEdit, openDetail]
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Users />
        </EmptyMedia>
        <EmptyTitle>
          {search ? (
            <Trans>Tidak ada pelanggan cocok.</Trans>
          ) : filter === 'archived' ? (
            <Trans>Tidak ada pelanggan diarsipkan.</Trans>
          ) : (
            <Trans>Belum ada pelanggan.</Trans>
          )}
        </EmptyTitle>
        {!search && filter === 'active' ? (
          <EmptyDescription>
            <Trans>Tambah pelanggan untuk melacak poin dan kunjungan.</Trans>
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Pelanggan</Trans>}
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus />
            <Trans>Tambah pelanggan</Trans>
          </Button>
        }
      />
      <Toolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder={t`Cari nama atau telepon…`}
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Aktif</Trans>, value: 'active' },
          { label: <Trans>Arsip</Trans>, value: 'archived' },
        ]}
      />
      <DataTable
        columns={columns}
        data={customers}
        emptyState={emptyState}
        initialSort={[{ id: 'name', desc: false }]}
      />
      <CustomerFormDialog
        open={formOpen}
        customer={formCustomer}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setFormCustomer(null);
        }}
      />
      <CustomerDetailSheet
        customerId={selectedId}
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) setSelectedId(null);
        }}
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(o) => {
          if (!o) setArchiveTarget(null);
        }}
        title={<Trans>Arsipkan pelanggan?</Trans>}
        description={
          archiveTarget ? (
            <Trans>"{archiveTarget.name}" tidak akan muncul di daftar pelanggan.</Trans>
          ) : undefined
        }
        confirmLabel={<Trans>Arsipkan</Trans>}
        destructive
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            await archive({ id: archiveTarget._id });
            toast.success(t`Pelanggan diarsipkan.`);
          } catch (err) {
            const message = err instanceof Error ? err.message : t`Gagal mengarsipkan pelanggan.`;
            toast.error(message);
            throw err;
          }
        }}
      />
    </main>
  );
}
