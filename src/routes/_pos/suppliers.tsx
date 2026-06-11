import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { RequirePermission } from '~/components/permission/require-permission';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Doc } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Archive, Pencil, Plus, Truck } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { SupplierFormDialog } from '~/components/supplier/supplier-form-dialog';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DataTable } from '~/components/ui/data-table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { RowActions } from '~/components/ui/row-actions';
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/suppliers')({ component: SuppliersPage });

function SuppliersPage() {
  return (
    <RequirePermission perm="canEditMenu">
      <SuppliersInner />
    </RequirePermission>
  );
}

type Supplier = Doc<'suppliers'>;
type Filter = 'active' | 'archived';

function SuppliersInner() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [formSupplier, setFormSupplier] = useState<Supplier | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Supplier | null>(null);

  const suppliers = useQuery(api.suppliers.list, { includeArchived: true });
  const archive = useMutation(api.suppliers.archive);

  const counts = useMemo(() => {
    if (!suppliers) return undefined;
    return {
      active: suppliers.filter((s) => !s.archived).length,
      archived: suppliers.filter((s) => s.archived).length,
    };
  }, [suppliers]);

  const visible = useMemo<Supplier[] | undefined>(() => {
    if (!suppliers) return undefined;
    return suppliers.filter((s) => (filter === 'archived' ? s.archived : !s.archived));
  }, [suppliers, filter]);

  function openCreate() {
    setFormSupplier(null);
    setFormOpen(true);
  }
  const openEdit = useCallback((s: Supplier) => {
    setFormSupplier(s);
    setFormOpen(true);
  }, []);

  const columns = useMemo<ColumnDef<Supplier, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <Trans>Nama</Trans>,
        cell: ({ row }) =>
          row.original.archived ? (
            <span className="font-medium">{row.original.name}</span>
          ) : (
            <button type="button" className="text-left font-medium hover:underline" onClick={() => openEdit(row.original)}>
              {row.original.name}
            </button>
          ),
      },
      {
        accessorKey: 'phone',
        enableSorting: false,
        header: () => <Trans>Telepon</Trans>,
        cell: ({ row }) => <span className="tabular-nums">{row.original.phone}</span>,
      },
      {
        id: 'status',
        enableSorting: false,
        header: () => <Trans>Status</Trans>,
        cell: ({ row }) =>
          row.original.archived ? (
            <StatusBadge variant="muted"><Trans>Arsip</Trans></StatusBadge>
          ) : (
            <StatusBadge variant="success"><Trans>Aktif</Trans></StatusBadge>
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
                  { label: <Trans>Ubah</Trans>, icon: <Pencil />, onSelect: () => openEdit(row.original) },
                  { label: <Trans>Arsipkan</Trans>, icon: <Archive />, destructive: true, separatorBefore: true, onSelect: () => setArchiveTarget(row.original) },
                ]}
              />
            </div>
          ),
      },
    ],
    [t, openEdit]
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon"><Truck /></EmptyMedia>
        <EmptyTitle>{filter === 'archived' ? <Trans>Tidak ada pemasok diarsipkan.</Trans> : <Trans>Belum ada pemasok.</Trans>}</EmptyTitle>
        {filter === 'active' ? <EmptyDescription><Trans>Tambah pemasok untuk mengirim daftar belanja.</Trans></EmptyDescription> : null}
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Pemasok</Trans>}
        meta={counts ? <Trans>{counts.active} pemasok aktif</Trans> : null}
        actions={<Button type="button" onClick={openCreate}><Plus /><Trans>Tambah Pemasok</Trans></Button>}
      />
      <Toolbar
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Aktif</Trans>, value: 'active', ...(counts !== undefined ? { count: counts.active } : {}) },
          { label: <Trans>Arsip</Trans>, value: 'archived', ...(counts !== undefined ? { count: counts.archived } : {}) },
        ]}
      />
      <DataTable columns={columns} data={visible} emptyState={emptyState} initialSort={[{ id: 'name', desc: false }]} />
      <SupplierFormDialog
        open={formOpen}
        supplier={formSupplier}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setFormSupplier(null);
        }}
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(o) => {
          if (!o) setArchiveTarget(null);
        }}
        title={<Trans>Arsipkan pemasok?</Trans>}
        description={archiveTarget ? <Trans>"{archiveTarget.name}" tidak akan muncul di pilihan pemasok.</Trans> : undefined}
        confirmLabel={<Trans>Arsipkan</Trans>}
        destructive
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            await archive({ id: archiveTarget._id });
            toast.success(t`Pemasok diarsipkan.`);
          } catch (err) {
            const message = err instanceof Error ? err.message : t`Gagal mengarsipkan pemasok.`;
            toast.error(message);
            throw err;
          }
        }}
      />
    </main>
  );
}
