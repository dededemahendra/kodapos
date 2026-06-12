import { Trans, useLingui } from '@lingui/react/macro';
import type { Id } from 'convex/_generated/dataModel';
import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '~/components/ui/sheet';
import { formatIDR } from '~/lib/money';
import type { MenuItem, PickResult } from './types';

/**
 * Variant + modifier picker for one menu item. Mirrors the staff modifier picker
 * UX (chip toggles honoring min/max + required, a qty stepper) but emits a lean
 * `PickResult` for the public page's own cart — no staff reducer involved.
 */
export function ItemPickerSheet({
  item,
  open,
  onOpenChange,
  onConfirm,
}: {
  item: MenuItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (pick: PickResult) => void;
}) {
  const { t } = useLingui();
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [variantId, setVariantId] = useState<Id<'menuItemVariants'> | null>(null);
  const [qty, setQty] = useState(1);

  // Reset on each open. Default to the first variant when the item has variants.
  useEffect(() => {
    if (open) {
      setSelected({});
      setVariantId(item?.variants[0]?.id ?? null);
      setQty(1);
    }
  }, [open, item?.id]);

  if (!item) return null;
  const menuItem = item;

  function toggle(groupId: string, optionId: string, maxSelect: number) {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[groupId] ?? []);
      if (set.has(optionId)) {
        set.delete(optionId);
      } else {
        if (maxSelect === 1) set.clear();
        if (set.size >= maxSelect) return prev;
        set.add(optionId);
      }
      next[groupId] = set;
      return next;
    });
  }

  const hasVariants = menuItem.variants.length > 0;
  const selectedVariant = hasVariants
    ? menuItem.variants.find((v) => v.id === variantId) ?? null
    : null;

  let adjustments = 0;
  const modifierLabels: string[] = [];
  const modifierOptionIds: Id<'modifierOptions'>[] = [];
  let allSatisfied = true;
  for (const group of menuItem.modifierGroups) {
    const set = selected[group.id] ?? new Set<string>();
    if (set.size < group.minSelect || set.size > group.maxSelect) {
      allSatisfied = false;
    }
    for (const opt of group.options) {
      if (set.has(opt.id)) {
        adjustments += opt.priceAdjustmentIDR;
        modifierLabels.push(opt.name);
        modifierOptionIds.push(opt.id);
      }
    }
  }

  const basePrice = selectedVariant ? selectedVariant.priceIDR : menuItem.priceIDR;
  const unitPriceIDR = basePrice + adjustments;
  const variantSatisfied = !hasVariants || selectedVariant !== null;

  function submit() {
    onConfirm({
      menuItemId: menuItem.id,
      name: menuItem.name,
      qty,
      unitPriceIDR,
      ...(selectedVariant
        ? { variantId: selectedVariant.id, variantName: selectedVariant.name }
        : {}),
      modifierOptionIds,
      modifierLabels,
    });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{menuItem.name}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            <Trans>Harga dasar {formatIDR(menuItem.priceIDR)}</Trans>
          </p>
        </SheetHeader>

        <div className="space-y-4 mt-2">
          {hasVariants ? (
            <div>
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-medium">
                  <Trans>Ukuran</Trans>
                </h3>
                <span className="text-xs text-muted-foreground">
                  <Trans>Pilih varian</Trans>
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {menuItem.variants.map((v) => {
                  const checked = v.id === variantId;
                  return (
                    <button
                      type="button"
                      key={v.id}
                      onClick={() => setVariantId(v.id)}
                      className={`rounded-full border px-3 py-1.5 text-sm ${
                        checked
                          ? 'border-ring bg-primary text-primary-foreground'
                          : 'border-border bg-background text-foreground hover:border-ring'
                      }`}
                    >
                      {v.name} ({formatIDR(v.priceIDR)})
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {menuItem.modifierGroups.map((group) => {
            const isRequired = group.required || group.minSelect >= 1;
            return (
              <div key={group.id}>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-medium">{group.name}</h3>
                  <span className="text-xs text-muted-foreground">
                    {isRequired
                      ? t`Wajib (pilih ${group.minSelect}${
                          group.maxSelect > group.minSelect ? `-${group.maxSelect}` : ''
                        })`
                      : t`Opsional (maks ${group.maxSelect})`}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {group.options.map((opt) => {
                    const checked = selected[group.id]?.has(opt.id) ?? false;
                    return (
                      <button
                        type="button"
                        key={opt.id}
                        onClick={() => toggle(group.id, opt.id, group.maxSelect)}
                        className={`rounded-full border px-3 py-1.5 text-sm ${
                          checked
                            ? 'border-ring bg-primary text-primary-foreground'
                            : 'border-border bg-background text-foreground hover:border-ring'
                        }`}
                      >
                        {opt.name}
                        {opt.priceAdjustmentIDR > 0
                          ? ` (+${formatIDR(opt.priceAdjustmentIDR)})`
                          : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-2 border-t border-border pt-3">
            <span className="text-sm">
              <Trans>Jumlah</Trans>
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={t`Kurangi`}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </Button>
              <span className="w-7 text-center tabular-nums">{qty}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={t`Tambah`}
                onClick={() => setQty((q) => Math.min(99, q + 1))}
              >
                +
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="text-sm">
            <Trans>
              Total{' '}
              <span className="font-semibold tabular-nums">
                {formatIDR(qty * unitPriceIDR)}
              </span>
            </Trans>
          </div>
          <Button
            type="button"
            className="ml-auto"
            onClick={submit}
            disabled={!allSatisfied || !variantSatisfied}
          >
            <Trans>Tambah ke keranjang</Trans>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
