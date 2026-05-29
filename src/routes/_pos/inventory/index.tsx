import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { IngredientForm } from '~/components/inventory/ingredient-form';
import { StockAdjustDialog } from '~/components/inventory/stock-adjust-dialog';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/inventory/')({
  component: InventoryIndex,
});

type Filter = 'all' | 'low' | 'archived';

function InventoryIndex() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<Id<'ingredients'> | null>(null);
  const [adjustId, setAdjustId] = useState<Id<'ingredients'> | null>(null);

  const ingredients = useQuery(api.ingredients.list, {
    includeArchived: filter === 'archived',
  });

  const visible = useMemo(() => {
    if (!ingredients) return [];
    let rows = ingredients;
    if (filter === 'low') {
      rows = rows.filter((r) => r.currentStockQty < r.reorderThreshold && !r.archived);
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

  const isLoading = ingredients === undefined;

  return (
    <main className="p-6">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold"><Trans>Inventaris</Trans></h1>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Trans>+ Tambah Bahan</Trans>
        </Button>
      </header>

      <div className="flex items-center gap-2 mb-3">
        <Input
          placeholder={t`Cari bahan…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          <Trans>Semua</Trans>
        </FilterChip>
        <FilterChip active={filter === 'low'} onClick={() => setFilter('low')}>
          <Trans>Stok rendah</Trans>
        </FilterChip>
        <FilterChip active={filter === 'archived'} onClick={() => setFilter('archived')}>
          <Trans>Arsip</Trans>
        </FilterChip>
      </div>

      {isLoading ? (
        <div className="flex gap-2 text-muted-foreground items-center">
          <Spinner />
          <span><Trans>Memuat…</Trans></span>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground">
          {filter === 'low' ? (
            <Trans>Tidak ada bahan dengan stok rendah.</Trans>
          ) : filter === 'archived' ? (
            <Trans>Tidak ada bahan diarsipkan.</Trans>
          ) : (
            <Trans>Belum ada bahan. Tambah bahan pertama untuk mulai melacak stok.</Trans>
          )}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
              <th className="py-2 px-2"><Trans>Nama</Trans></th>
              <th className="py-2 px-2 w-32 text-right"><Trans>Stok</Trans></th>
              <th className="py-2 px-2 w-24 text-right"><Trans>Ambang</Trans></th>
              <th className="py-2 px-2 w-32 text-right"><Trans>Biaya / satuan</Trans></th>
              <th className="py-2 px-2 w-32"><Trans>Status</Trans></th>
              <th className="py-2 px-2 w-32" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const low = row.currentStockQty < row.reorderThreshold && !row.archived;
              return (
                <tr
                  key={row._id}
                  className={`border-b border-border/50 hover:bg-muted ${low ? 'bg-destructive/10' : ''}`}
                >
                  <td className="py-2 px-2">
                    {low ? <span className="mr-1">⚠</span> : null}
                    {row.name}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {row.currentStockQty} {row.canonicalUnit}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {row.reorderThreshold} {row.canonicalUnit}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {formatIDR(row.lastCostPerUnitIDR)}
                  </td>
                  <td className="py-2 px-2 text-xs">
                    {row.archived ? (
                      <span className="text-muted-foreground">● <Trans>Arsip</Trans></span>
                    ) : low ? (
                      <span className="text-destructive">● <Trans>Rendah</Trans></span>
                    ) : (
                      <span className="text-primary">● <Trans>Aktif</Trans></span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAdjustId(row._id)}
                    >
                      <Trans>Catat Stok</Trans>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditId(row._id)}
                    >
                      <Trans>Ubah</Trans>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

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
    </main>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-sm px-3 py-1.5 rounded-md ${
        active
          ? 'bg-accent text-primary font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
