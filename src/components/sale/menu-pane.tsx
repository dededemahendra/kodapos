import { useLingui } from '@lingui/react/macro';
import { Trans } from '@lingui/react/macro';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { useMemo, useState } from 'react';
import { ItemCard } from './item-card';

export type ItemForSale = {
  item: Doc<'menuItems'>;
  attachedGroups: Array<{
    group: Doc<'modifierGroups'>;
    options: Doc<'modifierOptions'>[];
    position: number;
  }>;
  lowStockIngredientNames: string[];
  imageUrl: string | null;
};

export function MenuPane({
  categories,
  items,
  onItemTap,
}: {
  categories: Doc<'categories'>[];
  items: ItemForSale[];
  onItemTap: (item: ItemForSale) => void;
}) {
  const { t } = useLingui();
  const [activeCategoryId, setActiveCategoryId] = useState<Id<'categories'> | 'all'>('all');
  const visible = useMemo(() => {
    if (activeCategoryId === 'all') return items;
    return items.filter((row) => row.item.categoryId === activeCategoryId);
  }, [items, activeCategoryId]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 overflow-x-auto px-3 py-2 border-b border-border">
        <CategoryTab
          label={t`Semua (${items.length})`}
          active={activeCategoryId === 'all'}
          onClick={() => setActiveCategoryId('all')}
        />
        {categories.map((c) => {
          const count = items.filter((r) => r.item.categoryId === c._id).length;
          return (
            <CategoryTab
              key={c._id}
              label={`${c.name} (${count})`}
              active={activeCategoryId === c._id}
              onClick={() => setActiveCategoryId(c._id)}
            />
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {visible.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            <Trans>Tidak ada item di kategori ini.</Trans>
          </p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {visible.map((row) => (
              <ItemCard
                key={row.item._id}
                item={row.item}
                imageUrl={row.imageUrl}
                hasModifiers={row.attachedGroups.length > 0}
                lowStockIngredientNames={row.lowStockIngredientNames}
                onTap={() => onItemTap(row)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 text-sm px-3 py-1.5 rounded-md ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-background hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}
