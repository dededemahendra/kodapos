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
    <main className="max-w-5xl mx-auto p-6">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Inventaris</h1>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          + Tambah Bahan
        </Button>
      </header>

      <div className="flex items-center gap-2 mb-3">
        <Input
          placeholder="Cari bahan…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          Semua
        </FilterChip>
        <FilterChip active={filter === 'low'} onClick={() => setFilter('low')}>
          Stok rendah
        </FilterChip>
        <FilterChip active={filter === 'archived'} onClick={() => setFilter('archived')}>
          Arsip
        </FilterChip>
      </div>

      {isLoading ? (
        <div className="flex gap-2 text-fg-muted items-center">
          <Spinner />
          <span>Memuat…</span>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-fg-muted">
          {filter === 'low'
            ? 'Tidak ada bahan dengan stok rendah.'
            : filter === 'archived'
              ? 'Tidak ada bahan diarsipkan.'
              : 'Belum ada bahan. Tambah bahan pertama untuk mulai melacak stok.'}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-fg-muted border-b border-border">
              <th className="py-2 px-2">Nama</th>
              <th className="py-2 px-2 w-32 text-right">Stok</th>
              <th className="py-2 px-2 w-24 text-right">Ambang</th>
              <th className="py-2 px-2 w-32 text-right">Biaya / satuan</th>
              <th className="py-2 px-2 w-32">Status</th>
              <th className="py-2 px-2 w-32" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const low = row.currentStockQty < row.reorderThreshold && !row.archived;
              return (
                <tr
                  key={row._id}
                  className={`border-b border-border/50 hover:bg-surface ${low ? 'bg-amber-50' : ''}`}
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
                      <span className="text-fg-muted">● Arsip</span>
                    ) : low ? (
                      <span className="text-amber-700">● Rendah</span>
                    ) : (
                      <span className="text-brand-600">● Aktif</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAdjustId(row._id)}
                    >
                      Catat Stok
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditId(row._id)}
                    >
                      Ubah
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
          ? 'bg-brand-50 text-brand-700 font-medium'
          : 'text-fg-muted hover:bg-surface hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}
