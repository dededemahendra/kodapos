import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Archive, Folder, FolderTree, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryFormDialog } from '~/components/menu/category-form-dialog';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import {
  ReorderableTable,
  type ReorderableColumn,
} from '~/components/ui/reorderable-table';
import { RowActions } from '~/components/ui/row-actions';
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { toast } from '~/lib/toast';

type Category = Doc<'categories'>;
type Filter = 'active' | 'archived';

export function CategoryTable() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('active');
  const [formCategory, setFormCategory] = useState<Category | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Category | null>(null);

  const categories = useQuery(api.menu.categories.list, { includeArchived: true });
  // Counts reflect active items per category (default list excludes archived /
  // inactive). The "Item" column is an at-a-glance active-menu indicator.
  const items = useQuery(api.menu.items.list, {});
  const archiveCategory = useMutation(api.menu.categories.archive);
  const setOrder = useMutation(api.menu.categories.setOrder);

  const itemCounts = useMemo(() => {
    const map = new Map<Id<'categories'>, number>();
    for (const it of items ?? []) {
      map.set(it.categoryId, (map.get(it.categoryId) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const counts = useMemo(() => {
    if (!categories) return undefined;
    return {
      active: categories.filter((c) => !c.archived).length,
      archived: categories.filter((c) => c.archived).length,
    };
  }, [categories]);

  // Active view is drag-orderable; archived view is read-only.
  const activeRows = useMemo<Category[] | undefined>(
    () => (categories ? categories.filter((c) => !c.archived) : undefined),
    [categories]
  );
  const archivedRows = useMemo<Category[] | undefined>(
    () => (categories ? categories.filter((c) => c.archived) : undefined),
    [categories]
  );

  function openCreate() {
    setFormCategory(null);
    setFormOpen(true);
  }
  function openRename(c: Category) {
    setFormCategory(c);
    setFormOpen(true);
  }

  const columns: ReorderableColumn<Category>[] = [
    {
      id: 'name',
      header: <Trans>Nama</Trans>,
      cell: (c) => <span className="font-medium">{c.name}</span>,
    },
    {
      id: 'items',
      header: <Trans>Item</Trans>,
      cell: (c) => <span className="tabular-nums">{itemCounts.get(c._id) ?? 0}</span>,
    },
    {
      id: 'status',
      header: <Trans>Status</Trans>,
      cell: () => (
        <StatusBadge variant="success">
          <Trans>Aktif</Trans>
        </StatusBadge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: (c) => (
        <div className="text-right">
          <RowActions
            label={t`Aksi baris`}
            items={[
              {
                label: <Trans>Ubah nama</Trans>,
                icon: <Pencil />,
                onSelect: () => openRename(c),
              },
              {
                label: <Trans>Arsipkan</Trans>,
                icon: <Archive />,
                destructive: true,
                separatorBefore: true,
                onSelect: () => setArchiveTarget(c),
              },
            ]}
          />
        </div>
      ),
    },
  ];

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {filter === 'archived' ? <Folder /> : <FolderTree />}
        </EmptyMedia>
        <EmptyTitle>
          {filter === 'archived' ? (
            <Trans>Tidak ada kategori diarsipkan.</Trans>
          ) : (
            <Trans>Belum ada kategori.</Trans>
          )}
        </EmptyTitle>
        <EmptyDescription>
          {filter === 'archived' ? (
            <Trans>Kategori yang diarsipkan akan muncul di sini.</Trans>
          ) : (
            <Trans>Tambahkan kategori untuk mengelompokkan item menu Anda.</Trans>
          )}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <div>
      <PageHeader
        title={<Trans>Kategori</Trans>}
        description={
          <Trans>Kategori muncul sebagai filter di daftar Items dan di layar kasir.</Trans>
        }
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus />
            <Trans>Tambah Kategori</Trans>
          </Button>
        }
      />

      <Toolbar
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Aktif</Trans>, value: 'active', ...(counts !== undefined && { count: counts.active }) },
          { label: <Trans>Arsip</Trans>, value: 'archived', ...(counts !== undefined && { count: counts.archived }) },
        ]}
      />

      {filter === 'active' ? (
        <ReorderableTable
          columns={columns}
          data={activeRows}
          getRowId={(c) => c._id}
          reorderLabel={t`Seret untuk menata ulang`}
          emptyState={emptyState}
          onReorder={async (orderedIds) => {
            try {
              await setOrder({ orderedIds: orderedIds as Id<'categories'>[] });
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : t`Gagal menyimpan urutan.`
              );
            }
          }}
        />
      ) : (
        <ArchivedCategoryList rows={archivedRows} itemCounts={itemCounts} empty={emptyState} />
      )}

      <CategoryFormDialog
        open={formOpen}
        category={formCategory}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setFormCategory(null);
        }}
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={<Trans>Arsipkan kategori?</Trans>}
        description={
          archiveTarget ? (
            <Trans>
              "{archiveTarget.name}" akan disembunyikan dari daftar aktif dan layar kasir.
            </Trans>
          ) : undefined
        }
        confirmLabel={<Trans>Arsipkan</Trans>}
        destructive
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            await archiveCategory({ id: archiveTarget._id });
            toast.success(t`Kategori diarsipkan.`);
          } catch (err) {
            const message =
              err instanceof Error ? err.message : t`Gagal mengarsipkan kategori.`;
            toast.error(message);
            throw err;
          }
        }}
      />
    </div>
  );
}

// Read-only list for archived categories (no reorder, no actions — there is
// no unarchive flow, consistent with the Stock page's archived view).
function ArchivedCategoryList({
  rows,
  itemCounts,
  empty,
}: {
  rows: Category[] | undefined;
  itemCounts: Map<Id<'categories'>, number>;
  empty: React.ReactNode;
}) {
  if (rows === undefined) return null;
  if (rows.length === 0) return <div className="rounded-md border bg-card">{empty}</div>;
  return (
    <div className="rounded-md border bg-card divide-y divide-border">
      {rows.map((c) => (
        <div key={c._id} className="flex items-center justify-between px-4 py-2 text-sm">
          <span className="font-medium">{c.name}</span>
          <span className="flex items-center gap-4">
            <span className="tabular-nums text-muted-foreground">
              {itemCounts.get(c._id) ?? 0}
            </span>
            <StatusBadge variant="muted">
              <Trans>Arsip</Trans>
            </StatusBadge>
          </span>
        </div>
      ))}
    </div>
  );
}
