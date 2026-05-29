import { useLingui } from '@lingui/react/macro';
import { Trans } from '@lingui/react/macro';
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
  const { t } = useLingui();
  const isLow = lowStockIngredientNames.length > 0;
  return (
    <button
      type="button"
      onClick={onTap}
      title={isLow ? t`Stok rendah: ${lowStockIngredientNames.join(', ')}` : undefined}
      className={`text-left rounded-md border p-3 hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring ${
        isLow ? 'border-destructive bg-destructive/10' : 'border-border bg-background'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="font-medium leading-tight">{item.name}</div>
        {isLow ? <span aria-label={t`Stok rendah`}>⚠</span> : null}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{formatIDR(item.priceIDR)}</div>
      {hasModifiers ? (
        <div className="mt-2 inline-block text-[10px] uppercase tracking-wide text-primary bg-accent rounded px-1.5 py-0.5">
          <Trans>Pilihan</Trans>
        </div>
      ) : null}
    </button>
  );
}
