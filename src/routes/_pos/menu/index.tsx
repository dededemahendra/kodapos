import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/menu/')({
  component: ItemsListPage,
});

type CategoryFilter = 'all' | 'archived' | Id<'categories'>;

function ItemsListPage() {
  const { t } = useLingui();
  const categories = useQuery(api.menu.categories.list, {});
  const allItems = useQuery(api.menu.items.list, {});
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    if (!allItems) return [];
    let rows = allItems;
    if (filter === 'archived') {
      rows = []; // populated by archived list below
    } else if (filter !== 'all') {
      rows = rows.filter((r) => r.categoryId === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    }
    return rows;
  }, [allItems, filter, search]);

  const archivedItems = useQuery(
    api.menu.items.list,
    filter === 'archived' ? { includeArchived: true, includeInactive: true } : 'skip'
  );

  const archivedVisible = useMemo(() => {
    if (!archivedItems) return [];
    return archivedItems.filter((r) => r.archived);
  }, [archivedItems]);

  const rows = filter === 'archived' ? archivedVisible : visible;
  const isLoading = categories === undefined || allItems === undefined;

  return (
    <div className="flex gap-6">
      <aside className="w-52 shrink-0 text-sm">
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2"><Trans>Kategori</Trans></h2>
        <nav className="space-y-1">
          <FilterButton
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            label={t`Semua (${allItems?.length ?? 0})`}
          />
          {(categories ?? []).map((c) => {
            const count = allItems?.filter((i) => i.categoryId === c._id).length ?? 0;
            return (
              <FilterButton
                key={c._id}
                active={filter === c._id}
                onClick={() => setFilter(c._id)}
                label={`${c.name} (${count})`}
              />
            );
          })}
          <FilterButton
            active={filter === 'archived'}
            onClick={() => setFilter('archived')}
            label={t`Arsip`}
            muted
          />
        </nav>
      </aside>
      <section className="flex-1">
        <div className="flex gap-2 mb-3">
          <Input
            placeholder={t`Cari item…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Button asChild>
            <Link to="/menu/items/$itemId" params={{ itemId: 'new' }}>
              <Trans>+ Item</Trans>
            </Link>
          </Button>
        </div>
        {isLoading ? (
          <p className="text-muted-foreground"><Trans>Memuat…</Trans></p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground"><Trans>Tidak ada item.</Trans></p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                <th className="py-2 px-2"><Trans>Nama</Trans></th>
                <th className="py-2 px-2 w-24"><Trans>Kategori</Trans></th>
                <th className="py-2 px-2 w-28 text-right"><Trans>Harga</Trans></th>
                <th className="py-2 px-2 w-24"><Trans>Status</Trans></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="border-b border-border/50 hover:bg-muted">
                  <td className="py-2 px-2">
                    <Link
                      to="/menu/items/$itemId"
                      params={{ itemId: r._id }}
                      className="hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 px-2 text-muted-foreground">
                    {categories?.find((c) => c._id === r.categoryId)?.name ?? '—'}
                  </td>
                  <td className="py-2 px-2 text-right">{formatIDR(r.priceIDR)}</td>
                  <td className="py-2 px-2">
                    {r.archived ? (
                      <span className="text-xs text-muted-foreground"><Trans>● Arsip</Trans></span>
                    ) : r.isActive ? (
                      <span className="text-xs text-primary"><Trans>● Aktif</Trans></span>
                    ) : (
                      <span className="text-xs text-muted-foreground"><Trans>○ Off</Trans></span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  muted,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-2 py-1 rounded ${
        active ? 'bg-accent text-primary font-medium' : 'hover:bg-muted'
      } ${muted ? 'text-muted-foreground' : ''}`}
    >
      {label}
    </button>
  );
}
