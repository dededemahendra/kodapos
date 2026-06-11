import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { RequirePermission } from '~/components/permission/require-permission';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { NotebookText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RecipeEditor } from '~/components/inventory/recipe-editor';
import { DataTable } from '~/components/ui/data-table';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { formatIDR } from '~/lib/money';
import { recipeMarginPct } from '~/lib/recipe';

export const Route = createFileRoute('/_pos/recipes')({
  component: RecipesPage,
});

function RecipesPage() {
  return (
    <RequirePermission perm="canEditMenu">
      <RecipesInner />
    </RequirePermission>
  );
}

type RecipeRow = {
  itemId: Id<'menuItems'>;
  name: string;
  priceIDR: number;
  hasRecipe: boolean;
  lineCount: number;
  costPerCupIDR: number;
};
type Filter = 'all' | 'complete' | 'missing';

function RecipesInner() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [editRow, setEditRow] = useState<RecipeRow | null>(null);

  const rows = useQuery(api.recipes.listForCatalog, {}) as RecipeRow[] | undefined;

  const counts = useMemo(() => {
    if (!rows) return undefined;
    return {
      all: rows.length,
      complete: rows.filter((r) => r.hasRecipe).length,
      missing: rows.filter((r) => !r.hasRecipe).length,
    };
  }, [rows]);

  const visible = useMemo<RecipeRow[] | undefined>(() => {
    if (!rows) return undefined;
    let out = rows;
    if (filter === 'complete') out = out.filter((r) => r.hasRecipe);
    else if (filter === 'missing') out = out.filter((r) => !r.hasRecipe);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) => r.name.toLowerCase().includes(q));
    }
    return out;
  }, [rows, filter, search]);

  const columns = useMemo<ColumnDef<RecipeRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <Trans>Item</Trans>,
        cell: ({ row }) => (
          <button
            type="button"
            className="text-left font-medium hover:underline"
            onClick={() => setEditRow(row.original)}
          >
            {row.original.name}
          </button>
        ),
      },
      {
        accessorKey: 'lineCount',
        header: () => <Trans>Bahan</Trans>,
        cell: ({ row }) => <span className="tabular-nums">{row.original.lineCount}</span>,
      },
      {
        accessorKey: 'priceIDR',
        header: () => <Trans>Harga</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatIDR(row.original.priceIDR)}</span>
        ),
      },
      {
        accessorKey: 'costPerCupIDR',
        header: () => <Trans>HPP/cup</Trans>,
        cell: ({ row }) =>
          row.original.hasRecipe ? (
            <span className="tabular-nums">{formatIDR(row.original.costPerCupIDR)}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'margin',
        accessorFn: (r) => {
          const m = r.hasRecipe ? recipeMarginPct(r.priceIDR, r.costPerCupIDR) : null;
          return m ?? Number.NEGATIVE_INFINITY;
        },
        header: () => <Trans>Margin</Trans>,
        cell: ({ row }) => {
          const m = row.original.hasRecipe
            ? recipeMarginPct(row.original.priceIDR, row.original.costPerCupIDR)
            : null;
          return m !== null ? (
            <span className="tabular-nums">{m}%</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: 'status',
        enableSorting: false,
        header: () => <Trans>Status</Trans>,
        cell: ({ row }) =>
          row.original.hasRecipe ? (
            <StatusBadge variant="success">
              <Trans>Lengkap</Trans>
            </StatusBadge>
          ) : (
            <StatusBadge variant="muted">
              <Trans>Belum</Trans>
            </StatusBadge>
          ),
      },
    ],
    []
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <NotebookText />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>Belum ada item.</Trans>
        </EmptyTitle>
        <EmptyDescription>
          <Trans>Tambah item menu dulu untuk mulai menyusun resep.</Trans>
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Resep</Trans>}
        meta={
          counts ? (
            <Trans>
              {counts.all} item · {counts.missing} tanpa resep
            </Trans>
          ) : null
        }
      />

      <Toolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder={t`Cari item…`}
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Semua</Trans>, value: 'all', ...(counts !== undefined ? { count: counts.all } : {}) },
          { label: <Trans>Lengkap</Trans>, value: 'complete', ...(counts !== undefined ? { count: counts.complete } : {}) },
          { label: <Trans>Belum</Trans>, value: 'missing', ...(counts !== undefined ? { count: counts.missing } : {}) },
        ]}
      />

      <DataTable
        columns={columns}
        data={visible}
        emptyState={emptyState}
        initialSort={[{ id: 'name', desc: false }]}
      />

      <Sheet
        open={editRow !== null}
        onOpenChange={(o) => {
          if (!o) setEditRow(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              <Trans>Resep</Trans> — {editRow?.name}
            </SheetTitle>
            <SheetDescription className="sr-only">
              <Trans>Sunting bahan dan jumlah untuk resep item ini.</Trans>
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {editRow ? <RecipeEditor menuItemId={editRow.itemId} /> : null}
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
