import { useLingui } from '@lingui/react/macro';
import { Trans } from '@lingui/react/macro';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { formatIDR } from '~/lib/money';

export function ItemCard({
  item,
  variants,
  imageUrl,
  hasModifiers,
  lowStockIngredientNames,
  onTap,
}: {
  item: Doc<'menuItems'>;
  variants: { _id: Id<'menuItemVariants'>; name: string; priceIDR: number }[];
  imageUrl: string | null;
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
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-full h-16 rounded object-cover mb-1" />
      ) : (
        <div className="w-full h-16 rounded bg-muted grid place-items-center text-muted-foreground text-xs mb-1">{item.name.charAt(0)}</div>
      )}
      <div className="flex items-start justify-between gap-1">
        <div className="font-medium leading-tight">{item.name}</div>
        {isLow ? <span aria-label={t`Stok rendah`}>⚠</span> : null}
      </div>
      <div className="text-sm text-muted-foreground mt-1">
        {variants.length > 0 ? (
          <Trans>dari {formatIDR(Math.min(...variants.map((v) => v.priceIDR)))}</Trans>
        ) : (
          formatIDR(item.priceIDR)
        )}
      </div>
      {hasModifiers ? (
        <div className="mt-2 inline-block text-[10px] uppercase tracking-wide text-primary bg-accent rounded px-1.5 py-0.5">
          <Trans>Pilihan</Trans>
        </div>
      ) : null}
    </button>
  );
}
