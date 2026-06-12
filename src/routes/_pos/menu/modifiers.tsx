import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Doc } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Archive, Pencil, Plus, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DataTable } from '~/components/ui/data-table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { RowActions } from '~/components/ui/row-actions';
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/menu/modifiers')({
  component: ModifierGroupsPage,
});

type Group = Doc<'modifierGroups'> & { options: Doc<'modifierOptions'>[] };
type Filter = 'active' | 'archived';

function ModifierGroupsPage() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<Group | null>(null);

  const groups = useQuery(api.menu.modifierGroups.list, { includeArchived: true }) as
    | Group[]
    | undefined;
  const archive = useMutation(api.menu.modifierGroups.archive);

  const counts = useMemo(() => {
    if (!groups) return undefined;
    return {
      active: groups.filter((g) => !g.archived).length,
      archived: groups.filter((g) => g.archived).length,
    };
  }, [groups]);

  const visible = useMemo<Group[] | undefined>(() => {
    if (!groups) return undefined;
    let rows = groups.filter((g) => (filter === 'archived' ? g.archived : !g.archived));
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((g) => g.name.toLowerCase().includes(q));
    }
    return rows;
  }, [groups, filter, search]);

  const columns = useMemo<ColumnDef<Group, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <Trans>Nama</Trans>,
        cell: ({ row }) => (
          <Link
            to="/menu/modifiers/$groupId"
            params={{ groupId: row.original._id }}
            className="font-medium hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'type',
        enableSorting: false,
        header: () => <Trans>Tipe</Trans>,
        cell: ({ row }) =>
          row.original.required ? (
            <StatusBadge variant="success">
              <Trans>Wajib</Trans>
            </StatusBadge>
          ) : (
            <StatusBadge variant="muted">
              <Trans>Opsional</Trans>
            </StatusBadge>
          ),
      },
      {
        id: 'rule',
        enableSorting: false,
        header: () => <Trans>Aturan</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.minSelect}–{row.original.maxSelect}
          </span>
        ),
      },
      {
        id: 'options',
        accessorFn: (g) => g.options.length,
        header: () => <Trans>Opsi</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.options.length}</span>
        ),
      },
      {
        id: 'status',
        enableSorting: false,
        header: () => <Trans>Status</Trans>,
        cell: ({ row }) =>
          row.original.archived ? (
            <StatusBadge variant="muted">
              <Trans>Arsip</Trans>
            </StatusBadge>
          ) : (
            <StatusBadge variant="success">
              <Trans>Aktif</Trans>
            </StatusBadge>
          ),
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
                  label: <Trans>Ubah grup</Trans>,
                  icon: <Pencil />,
                  onSelect: () =>
                    navigate({
                      to: '/menu/modifiers/$groupId',
                      params: { groupId: row.original._id },
                    }),
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
    [t, navigate]
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SlidersHorizontal />
        </EmptyMedia>
        <EmptyTitle>
          {filter === 'archived' ? (
            <Trans>Tidak ada grup diarsipkan.</Trans>
          ) : (
            <Trans>Belum ada grup modifier.</Trans>
          )}
        </EmptyTitle>
        <EmptyDescription>
          {filter === 'archived' ? (
            <Trans>Grup modifier yang diarsipkan akan muncul di sini.</Trans>
          ) : (
            <Trans>Buat satu grup untuk dipakai ulang di banyak item.</Trans>
          )}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <div>
      <PageHeader
        title={<Trans>Grup Modifier</Trans>}
        description={<Trans>Dipakai ulang di banyak item, ubah di satu tempat.</Trans>}
        actions={
          <Button asChild>
            <Link to="/menu/modifiers/$groupId" params={{ groupId: 'new' }}>
              <Plus />
              <Trans>Grup baru</Trans>
            </Link>
          </Button>
        }
      />

      <Toolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder={t`Cari grup…`}
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Aktif</Trans>, value: 'active', ...(counts !== undefined && { count: counts.active }) },
          { label: <Trans>Arsip</Trans>, value: 'archived', ...(counts !== undefined && { count: counts.archived }) },
        ]}
      />

      <DataTable
        columns={columns}
        data={visible}
        emptyState={emptyState}
        initialSort={[{ id: 'name', desc: false }]}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={<Trans>Arsipkan grup?</Trans>}
        description={
          archiveTarget ? (
            <Trans>"{archiveTarget.name}" akan dilepas dari item dan disembunyikan.</Trans>
          ) : undefined
        }
        confirmLabel={<Trans>Arsipkan</Trans>}
        destructive
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            await archive({ id: archiveTarget._id });
            toast.success(t`Grup diarsipkan.`);
          } catch (err) {
            const message = err instanceof Error ? err.message : t`Gagal mengarsipkan grup.`;
            toast.error(message);
            throw err;
          }
        }}
      />
    </div>
  );
}
