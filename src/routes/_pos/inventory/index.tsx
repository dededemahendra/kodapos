import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Archive, History, PackagePlus, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { IngredientForm } from '~/components/inventory/ingredient-form';
import { StockAdjustDialog } from '~/components/inventory/stock-adjust-dialog';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DataTable } from '~/components/ui/data-table';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { RowActions } from '~/components/ui/row-actions';
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { formatIDR } from '~/lib/money';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/inventory/')({
  component: InventoryIndex,
});

type Ingredient = Doc<'ingredients'> & { currentStockQty: number };
type Filter = 'all' | 'low' | 'archived';

function isLow(row: Ingredient): boolean {
  return row.currentStockQty < row.reorderThreshold && !row.archived;
}

function InventoryIndex() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<Id<'ingredients'> | null>(null);
  const [adjustId, setAdjustId] = useState<Id<'ingredients'> | null>(null);
  const [archiveRow, setArchiveRow] = useState<Ingredient | null>(null);

  const archive = useMutation(api.ingredients.archive);
  const ingredients = useQuery(api.ingredients.list, { includeArchived: true });

  // Counts for the filter chips (computed off the unfiltered, non-archived set
  // where relevant). While loading, ingredients is undefined → counts hidden.
  const counts = useMemo(() => {
    if (!ingredients) return undefined;
    const active = ingredients.filter((r) => !r.archived);
    return {
      all: active.length,
      low: active.filter(isLow).length,
      archived: ingredients.filter((r) => r.archived).length,
    };
  }, [ingredients]);

  // The rows passed to DataTable: undefined while loading (so DataTable shows
  // skeletons), otherwise filtered + searched.
  const visible = useMemo<Ingredient[] | undefined>(() => {
    if (!ingredients) return undefined;
    let rows = ingredients;
    if (filter === 'low') {
      rows = rows.filter(isLow);
    } else if (filter === 'archived') {
      rows = rows.filter((r) => r.archived);
    } else {
      rows = rows.filter((r) => !r.archived);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    }
    return rows;
  }, [ingredients, filter, search]);

  const columns = useMemo<ColumnDef<Ingredient, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <Trans>Bahan</Trans>,
        cell: ({ row }) => {
          const low = isLow(row.original);
          return (
            <span className="font-medium">
              {low ? <span aria-hidden="true" className="mr-1">⚠</span> : null}
              {row.original.name}
            </span>
          );
        },
      },
      {
        accessorKey: 'currentStockQty',
        header: () => <Trans>Stok</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.currentStockQty} {row.original.canonicalUnit}
          </span>
        ),
      },
      {
        accessorKey: 'reorderThreshold',
        header: () => <Trans>Ambang</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.reorderThreshold} {row.original.canonicalUnit}
          </span>
        ),
      },
      {
        accessorKey: 'lastCostPerUnitIDR',
        header: () => <Trans>Biaya / satuan</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatIDR(row.original.lastCostPerUnitIDR)}
          </span>
        ),
      },
      {
        id: 'status',
        enableSorting: false,
        header: () => <Trans>Status</Trans>,
        cell: ({ row }) => {
          const r = row.original;
          if (r.archived)
            return (
              <StatusBadge variant="muted">
                <Trans>Arsip</Trans>
              </StatusBadge>
            );
          if (isLow(r))
            return (
              <StatusBadge variant="warn">
                <Trans>Rendah</Trans>
              </StatusBadge>
            );
          return (
            <StatusBadge variant="success">
              <Trans>Aktif</Trans>
            </StatusBadge>
          );
        },
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => (
          <div className="text-right">
            <RowActions
              label={t`Aksi baris`}
              items={[
                {
                  label: <Trans>Catat stok masuk</Trans>,
                  icon: <PackagePlus />,
                  onSelect: () => setAdjustId(row.original._id),
                },
                {
                  label: <Trans>Ubah bahan</Trans>,
                  icon: <Pencil />,
                  onSelect: () => setEditId(row.original._id),
                },
                {
                  label: <Trans>Lihat riwayat</Trans>,
                  icon: <History />,
                  // Destination view ships in sub-project 2 (Inventory polish).
                  onSelect: () => {},
                },
                {
                  label: <Trans>Arsipkan</Trans>,
                  icon: <Archive />,
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () => setArchiveRow(row.original),
                },
              ]}
            />
          </div>
        ),
      },
    ],
    [t]
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>
          {filter === 'low' ? (
            <Trans>Tidak ada bahan dengan stok rendah.</Trans>
          ) : filter === 'archived' ? (
            <Trans>Tidak ada bahan diarsipkan.</Trans>
          ) : (
            <Trans>Belum ada bahan.</Trans>
          )}
        </EmptyTitle>
        {filter === 'all' ? (
          <EmptyDescription>
            <Trans>Tambah bahan pertama untuk mulai melacak stok.</Trans>
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Stok Bahan</Trans>}
        meta={
          counts ? (
            <Trans>
              {counts.all} bahan · {counts.low} stok rendah
            </Trans>
          ) : null
        }
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus />
            <Trans>Tambah Bahan</Trans>
          </Button>
        }
      />

      <Toolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder={t`Cari bahan…`}
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Semua</Trans>, value: 'all', ...(counts !== undefined && { count: counts.all }) },
          { label: <Trans>Stok rendah</Trans>, value: 'low', ...(counts !== undefined && { count: counts.low }) },
          { label: <Trans>Arsip</Trans>, value: 'archived', ...(counts !== undefined && { count: counts.archived }) },
        ]}
      />

      <DataTable
        columns={columns}
        data={visible}
        emptyState={emptyState}
        getRowClassName={(row) => (isLow(row) ? 'bg-destructive/10' : '')}
        initialSort={[{ id: 'name', desc: false }]}
      />

      <IngredientForm
        open={createOpen || editId !== null}
        ingredientId={editId}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditId(null);
          }
        }}
      />
      <StockAdjustDialog
        open={adjustId !== null}
        ingredientId={adjustId}
        onOpenChange={(open) => {
          if (!open) setAdjustId(null);
        }}
      />
      <ConfirmDialog
        open={archiveRow !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveRow(null);
        }}
        title={<Trans>Arsipkan bahan?</Trans>}
        description={
          archiveRow ? (
            <Trans>
              "{archiveRow.name}" akan disembunyikan dari daftar aktif. Bisa
              dipulihkan dari tampilan arsip.
            </Trans>
          ) : undefined
        }
        confirmLabel={<Trans>Arsipkan</Trans>}
        destructive
        onConfirm={async () => {
          if (!archiveRow) return;
          await archive({ id: archiveRow._id });
          toast.success(t`Bahan diarsipkan.`);
        }}
      />
    </main>
  );
}
