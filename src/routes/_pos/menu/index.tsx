import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Archive, Ban, CircleCheck, Plus, Power, UtensilsCrossed } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DataTable } from '~/components/ui/data-table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { RowActions } from '~/components/ui/row-actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { formatIDR } from '~/lib/money';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/menu/')({
  component: ItemsListPage,
});

type ItemRow = Doc<'menuItems'> & {
  hasRecipe: boolean;
  lowStockIngredientNames: string[];
  imageUrl: string | null;
};
type Filter = 'active' | 'archived';

function isLow(row: ItemRow): boolean {
  return !row.archived && row.lowStockIngredientNames.length > 0;
}

function ItemsListPage() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [archiveTarget, setArchiveTarget] = useState<ItemRow | null>(null);

  const categories = useQuery(api.menu.categories.list, {});
  const allItems = useQuery(api.menu.items.list, {
    includeArchived: true,
    includeInactive: true,
  }) as ItemRow[] | undefined;
  const setActive = useMutation(api.menu.items.setActive);
  const setSoldOut = useMutation(api.menu.items.setSoldOut);
  const archive = useMutation(api.menu.items.archive);

  const categoryName = useMemo(() => {
    const map = new Map<Id<'categories'>, string>();
    for (const c of categories ?? []) map.set(c._id, c.name);
    return map;
  }, [categories]);

  const categoryCounts = useMemo(() => {
    const map = new Map<Id<'categories'>, number>();
    for (const it of allItems ?? []) {
      if (it.archived) continue;
      map.set(it.categoryId, (map.get(it.categoryId) ?? 0) + 1);
    }
    return map;
  }, [allItems]);

  const counts = useMemo(() => {
    if (!allItems) return undefined;
    // "active" here means non-archived (the live catalog: both Aktif and
    // Nonaktif items), matching what the Aktif tab shows — not isActive only.
    const active = allItems.filter((r) => !r.archived);
    return {
      active: active.length,
      archived: allItems.filter((r) => r.archived).length,
      low: active.filter(isLow).length,
    };
  }, [allItems]);

  const visible = useMemo<ItemRow[] | undefined>(() => {
    if (!allItems) return undefined;
    let rows = allItems.filter((r) => (filter === 'archived' ? r.archived : !r.archived));
    if (categoryId !== 'all') {
      rows = rows.filter((r) => r.categoryId === (categoryId as Id<'categories'>));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    }
    return rows;
  }, [allItems, filter, categoryId, search]);

  const columns = useMemo<ColumnDef<ItemRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <Trans>Nama</Trans>,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.imageUrl ? (
              <img src={row.original.imageUrl} alt="" className="size-8 rounded object-cover border border-border shrink-0" />
            ) : (
              <div className="size-8 rounded bg-muted grid place-items-center text-[10px] text-muted-foreground shrink-0">{row.original.name.charAt(0)}</div>
            )}
            <Link
              to="/menu/items/$itemId"
              params={{ itemId: row.original._id }}
              className="font-medium hover:underline"
            >
              {isLow(row.original) ? <span aria-hidden="true" className="mr-1">⚠</span> : null}
              {row.original.name}
            </Link>
          </div>
        ),
      },
      {
        id: 'category',
        enableSorting: false,
        header: () => <Trans>Kategori</Trans>,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {categoryName.get(row.original.categoryId) ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'priceIDR',
        header: () => <Trans>Harga</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatIDR(row.original.priceIDR)}</span>
        ),
      },
      {
        id: 'recipe',
        enableSorting: false,
        header: () => <Trans>Resep</Trans>,
        cell: ({ row }) =>
          row.original.hasRecipe ? (
            <StatusBadge variant="success">
              <Trans>Ada</Trans>
            </StatusBadge>
          ) : (
            <StatusBadge variant="muted">
              <Trans>Belum</Trans>
            </StatusBadge>
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
          if (r.isActive)
            return (
              <StatusBadge variant="success">
                <Trans>Aktif</Trans>
              </StatusBadge>
            );
          return (
            <StatusBadge variant="muted">
              <Trans>Nonaktif</Trans>
            </StatusBadge>
          );
        },
      },
      {
        id: 'availability',
        enableSorting: false,
        header: () => <Trans>Ketersediaan</Trans>,
        cell: ({ row }) => {
          const r = row.original;
          if (r.archived)
            return (
              <StatusBadge variant="muted">
                <Trans>Arsip</Trans>
              </StatusBadge>
            );
          if (r.soldOut)
            return (
              <StatusBadge variant="danger">
                <Trans>Habis</Trans>
              </StatusBadge>
            );
          if (r.isActive)
            return (
              <StatusBadge variant="success">
                <Trans>Tersedia</Trans>
              </StatusBadge>
            );
          return (
            <StatusBadge variant="muted">
              <Trans>Nonaktif</Trans>
            </StatusBadge>
          );
        },
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="text-right">
              <RowActions
                label={t`Aksi baris`}
                items={[
                  {
                    label: r.isActive ? <Trans>Nonaktifkan</Trans> : <Trans>Aktifkan</Trans>,
                    icon: <Power />,
                    onSelect: async () => {
                      try {
                        await setActive({ id: r._id, isActive: !r.isActive });
                        toast.success(
                          r.isActive ? t`Item dinonaktifkan.` : t`Item diaktifkan.`
                        );
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : t`Gagal memperbarui item.`
                        );
                      }
                    },
                  },
                  {
                    label: r.soldOut ? (
                      <Trans>Tandai tersedia</Trans>
                    ) : (
                      <Trans>Tandai habis</Trans>
                    ),
                    icon: r.soldOut ? <CircleCheck /> : <Ban />,
                    onSelect: async () => {
                      try {
                        await setSoldOut({ id: r._id, soldOut: !r.soldOut });
                        toast.success(
                          r.soldOut ? t`Item ditandai tersedia.` : t`Item ditandai habis.`
                        );
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : t`Gagal memperbarui item.`
                        );
                      }
                    },
                  },
                  {
                    label: <Trans>Arsipkan</Trans>,
                    icon: <Archive />,
                    destructive: true,
                    separatorBefore: true,
                    onSelect: () => setArchiveTarget(r),
                  },
                ]}
              />
            </div>
          );
        },
      },
    ],
    [t, categoryName, setActive, setSoldOut]
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UtensilsCrossed />
        </EmptyMedia>
        <EmptyTitle>
          {filter === 'archived' ? (
            <Trans>Tidak ada item diarsipkan.</Trans>
          ) : (
            <Trans>Belum ada item.</Trans>
          )}
        </EmptyTitle>
        <EmptyDescription>
          {filter === 'archived' ? (
            <Trans>Item yang diarsipkan akan muncul di sini.</Trans>
          ) : (
            <Trans>Tambah item pertama untuk mulai berjualan.</Trans>
          )}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <div>
      <PageHeader
        title={<Trans>Item Menu</Trans>}
        meta={
          counts ? (
            <Trans>
              {counts.active} item · {counts.low} stok rendah
            </Trans>
          ) : null
        }
        actions={
          <Button asChild>
            <Link to="/menu/items/$itemId" params={{ itemId: 'new' }}>
              <Plus />
              <Trans>Tambah Item</Trans>
            </Link>
          </Button>
        }
      />

      <Toolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder={t`Cari item…`}
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          {
            label: <Trans>Aktif</Trans>,
            value: 'active',
            ...(counts !== undefined && { count: counts.active }),
          },
          {
            label: <Trans>Arsip</Trans>,
            value: 'archived',
            ...(counts !== undefined && { count: counts.archived }),
          },
        ]}
      >
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t`Semua kategori`}</SelectItem>
            {(categories ?? []).map((c) => (
              <SelectItem key={c._id} value={c._id}>
                {c.name} ({categoryCounts.get(c._id) ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Toolbar>

      <DataTable
        columns={columns}
        data={visible}
        emptyState={emptyState}
        getRowClassName={(row) => (isLow(row) ? 'bg-destructive/10' : '')}
        initialSort={[{ id: 'name', desc: false }]}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={<Trans>Arsipkan item?</Trans>}
        description={
          archiveTarget ? (
            <Trans>"{archiveTarget.name}" akan disembunyikan dari menu dan layar kasir.</Trans>
          ) : undefined
        }
        confirmLabel={<Trans>Arsipkan</Trans>}
        destructive
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            await archive({ id: archiveTarget._id });
            toast.success(t`Item diarsipkan.`);
          } catch (err) {
            const message = err instanceof Error ? err.message : t`Gagal mengarsipkan item.`;
            toast.error(message);
            throw err;
          }
        }}
      />
    </div>
  );
}
