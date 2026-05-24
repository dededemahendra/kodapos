import type { Doc } from 'convex/_generated/dataModel';
import { formatIDR } from '~/lib/money';

export function ItemCard({
  item,
  hasModifiers,
  lowStockIngredientNames,
  onTap,
}: {
  item: Doc<'menuItems'>;
  hasModifiers: boolean;
  lowStockIngredientNames: string[];
  onTap: () => void;
}) {
  const isLow = lowStockIngredientNames.length > 0;
  return (
    <button
      type="button"
      onClick={onTap}
      title={isLow ? `Stok rendah: ${lowStockIngredientNames.join(', ')}` : undefined}
      className={`text-left rounded-md border p-3 hover:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
        isLow ? 'border-amber-400 bg-amber-50/30' : 'border-border bg-bg'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="font-medium leading-tight">{item.name}</div>
        {isLow ? <span aria-label="Stok rendah">⚠</span> : null}
      </div>
      <div className="text-sm text-fg-muted mt-1">{formatIDR(item.priceIDR)}</div>
      {hasModifiers ? (
        <div className="mt-2 inline-block text-[10px] uppercase tracking-wide text-brand-700 bg-brand-50 rounded px-1.5 py-0.5">
          Pilihan
        </div>
      ) : null}
    </button>
  );
}
