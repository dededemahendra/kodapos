import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { RequirePermission } from '~/components/permission/require-permission';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Doc } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Archive, BadgePercent, Pencil, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { PromoFormDialog } from '~/components/promo/promo-form-dialog';
import { Badge } from '~/components/ui/badge';
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
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { formatPromoValue } from '~/lib/promo';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/promos')({
  component: PromosPage,
});

function PromosPage() {
  return (
    <RequirePermission perm="canEditMenu">
      <PromosInner />
    </RequirePermission>
  );
}

type Promo = Doc<'promotions'>;
type Filter = 'active' | 'archived';

function PromosInner() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [formPromo, setFormPromo] = useState<Promo | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Promo | null>(null);

  const promos = useQuery(api.promotions.list, { includeArchived: true });
  const archive = useMutation(api.promotions.archive);

  const counts = useMemo(() => {
    if (!promos) return undefined;
    return {
      active: promos.filter((p) => !p.archived).length,
      archived: promos.filter((p) => p.archived).length,
    };
  }, [promos]);

  const visible = useMemo<Promo[] | undefined>(() => {
    if (!promos) return undefined;
    return promos.filter((p) => (filter === 'archived' ? p.archived : !p.archived));
  }, [promos, filter]);

  function openCreate() {
    setFormPromo(null);
    setFormOpen(true);
  }
  // Stable so the `columns` memo (dep [t]) doesn't capture a changing ref.
  const openEdit = useCallback((p: Promo) => {
    setFormPromo(p);
    setFormOpen(true);
  }, []);

  const columns = useMemo<ColumnDef<Promo, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <Trans>Nama</Trans>,
        cell: ({ row }) =>
          row.original.archived ? (
            <span className="font-medium">{row.original.name}</span>
          ) : (
            <button
              type="button"
              className="text-left font-medium hover:underline"
              onClick={() => openEdit(row.original)}
            >
              {row.original.name}
            </button>
          ),
      },
      {
        id: 'type',
        enableSorting: false,
        header: () => <Trans>Tipe</Trans>,
        cell: ({ row }) =>
          row.original.type === 'percent' ? (
            <StatusBadge variant="success"><Trans>Persen</Trans></StatusBadge>
          ) : (
            <StatusBadge variant="muted"><Trans>Nominal</Trans></StatusBadge>
          ),
      },
      {
        accessorKey: 'value',
        header: () => <Trans>Nilai</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatPromoValue(row.original.type, row.original.value)}
          </span>
        ),
      },
      {
        id: 'code',
        enableSorting: false,
        header: () => <Trans>Kode & cakupan</Trans>,
        cell: ({ row }) => {
          const { code, scope } = row.original;
          return (
            <div className="flex items-center gap-2">
              {code ? (
                <Badge variant="secondary" className="font-mono">{code}</Badge>
              ) : (
                <span className="text-sm text-muted-foreground"><Trans>Tidak ada</Trans></span>
              )}
              <span className="text-sm text-muted-foreground">
                {scope === 'item' ? (
                  <Trans>Item</Trans>
                ) : scope === 'category' ? (
                  <Trans>Kategori</Trans>
                ) : (
                  <Trans>Order</Trans>
                )}
              </span>
            </div>
          );
        },
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
    [t]
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BadgePercent />
        </EmptyMedia>
        <EmptyTitle>
          {filter === 'archived' ? (
            <Trans>Tidak ada promo diarsipkan.</Trans>
          ) : (
            <Trans>Belum ada promo.</Trans>
          )}
        </EmptyTitle>
        {filter === 'active' ? (
          <EmptyDescription>
            <Trans>Buat promo untuk memberi diskon di kasir.</Trans>
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Promo & Diskon</Trans>}
        meta={counts ? <Trans>{counts.active} promo aktif</Trans> : null}
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus />
            <Trans>Tambah Promo</Trans>
          </Button>
        }
      />

      <Toolbar
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Aktif</Trans>, value: 'active', ...(counts !== undefined ? { count: counts.active } : {}) },
          { label: <Trans>Arsip</Trans>, value: 'archived', ...(counts !== undefined ? { count: counts.archived } : {}) },
        ]}
      />

      <DataTable
        columns={columns}
        data={visible}
        emptyState={emptyState}
        initialSort={[{ id: 'name', desc: false }]}
      />

      <PromoFormDialog
        open={formOpen}
        promo={formPromo}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setFormPromo(null);
        }}
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(o) => {
          if (!o) setArchiveTarget(null);
        }}
        title={<Trans>Arsipkan promo?</Trans>}
        description={
          archiveTarget ? (
            <Trans>"{archiveTarget.name}" tidak akan bisa dipakai di kasir.</Trans>
          ) : undefined
        }
        confirmLabel={<Trans>Arsipkan</Trans>}
        destructive
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            await archive({ id: archiveTarget._id });
            toast.success(t`Promo diarsipkan.`);
          } catch (err) {
            const message = err instanceof Error ? err.message : t`Gagal mengarsipkan promo.`;
            toast.error(message);
            throw err;
          }
        }}
      />
    </main>
  );
}
