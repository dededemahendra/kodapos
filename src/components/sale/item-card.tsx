import type { Doc } from 'convex/_generated/dataModel';
import { formatIDR } from '~/lib/money';

export function ItemCard({
  item,
  hasModifiers,
  onTap,
}: {
  item: Doc<'menuItems'>;
  hasModifiers: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="text-left rounded-md border border-border bg-bg p-3 hover:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <div className="font-medium leading-tight">{item.name}</div>
      <div className="text-sm text-fg-muted mt-1">{formatIDR(item.priceIDR)}</div>
      {hasModifiers ? (
        <div className="mt-2 inline-block text-[10px] uppercase tracking-wide text-brand-700 bg-brand-50 rounded px-1.5 py-0.5">
          Pilihan
        </div>
      ) : null}
    </button>
  );
}
