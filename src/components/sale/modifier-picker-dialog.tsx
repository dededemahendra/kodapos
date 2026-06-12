import { useLingui } from '@lingui/react/macro';
import { Trans } from '@lingui/react/macro';
import type { Id } from 'convex/_generated/dataModel';
import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { formatIDR } from '~/lib/money';
import type { CartLineModifier } from './cart-reducer';
import type { ItemForSale } from './menu-pane';

export type ModifierPickResult = {
  qty: number;
  variantId?: Id<'menuItemVariants'>;
  variantName?: string;
  modifierOptionIds: Id<'modifierOptions'>[];
  modifierLabels: CartLineModifier[];
  unitPriceIDR: number;
};

export function ModifierPickerDialog({
  open,
  onOpenChange,
  row,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ItemForSale | null;
  onConfirm: (pick: ModifierPickResult) => void;
}) {
  const { t } = useLingui();
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [variantId, setVariantId] = useState<Id<'menuItemVariants'> | null>(null);
  const [qty, setQty] = useState(1);

  // Reset state when the dialog opens for a new item. Default the variant to the
  // first one when the item has variants (a required selection).
  useEffect(() => {
    if (open) {
      setSelected({});
      setVariantId(row?.variants[0]?._id ?? null);
      setQty(1);
    }
  }, [open, row?.item._id]);

  if (!row) return null;

  // Narrow `row` to a non-null const so closures below (toggle, submit) see
  // the narrowed type without TypeScript complaining about possible null.
  const item = row;

  function toggle(groupId: string, optionId: string, maxSelect: number) {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[groupId] ?? []);
      if (set.has(optionId)) {
        set.delete(optionId);
      } else {
        if (maxSelect === 1) {
          set.clear();
        }
        if (set.size >= maxSelect) {
          // Already at cap on multi-select; tapping a new chip is a no-op.
          return prev;
        }
        set.add(optionId);
      }
      next[groupId] = set;
      return next;
    });
  }

  const adjustments: CartLineModifier[] = [];
  let allRequiredSatisfied = true;
  for (const ag of item.attachedGroups) {
    const set = selected[ag.group._id] ?? new Set<string>();
    if (set.size < ag.group.minSelect || set.size > ag.group.maxSelect) {
      allRequiredSatisfied = false;
    }
    for (const opt of ag.options) {
      if (set.has(opt._id)) {
        adjustments.push({
          groupName: ag.group.name,
          optionName: opt.name,
          priceAdjustmentIDR: opt.priceAdjustmentIDR,
        });
      }
    }
  }
  const hasVariants = item.variants.length > 0;
  const selectedVariant = hasVariants
    ? item.variants.find((v) => v._id === variantId) ?? null
    : null;
  const basePrice = selectedVariant ? selectedVariant.priceIDR : item.item.priceIDR;
  const unitPriceIDR =
    basePrice + adjustments.reduce((s, m) => s + m.priceAdjustmentIDR, 0);
  const variantSatisfied = !hasVariants || selectedVariant !== null;

  function submit() {
    const ids: Id<'modifierOptions'>[] = [];
    for (const ag of item.attachedGroups) {
      const set = selected[ag.group._id] ?? new Set<string>();
      for (const opt of ag.options) {
        if (set.has(opt._id)) ids.push(opt._id);
      }
    }
    onConfirm({
      qty,
      ...(selectedVariant
        ? { variantId: selectedVariant._id, variantName: selectedVariant.name }
        : {}),
      modifierOptionIds: ids,
      modifierLabels: adjustments,
      unitPriceIDR,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.item.name}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            <Trans>Harga dasar {formatIDR(item.item.priceIDR)}</Trans>
          </p>
        </DialogHeader>
        <div className="space-y-4 max-h-[50vh] overflow-y-auto">
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
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {item.variants.map((v) => {
                  const checked = v._id === variantId;
                  return (
                    <button
                      type="button"
                      key={v._id}
                      onClick={() => setVariantId(v._id)}
                      className={`text-sm px-3 py-1.5 rounded-full border ${
                        checked
                          ? 'bg-primary text-primary-foreground border-ring'
                          : 'bg-background text-foreground border-border hover:border-ring'
                      }`}
                    >
                      {v.name} ({formatIDR(v.priceIDR)})
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {item.attachedGroups.map((ag) => {
            const isRequired = ag.group.required || ag.group.minSelect >= 1;
            return (
              <div key={ag.group._id}>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-medium">{ag.group.name}</h3>
                  <span className="text-xs text-muted-foreground">
                    {isRequired
                      ? t`Wajib (pilih ${ag.group.minSelect}${
                          ag.group.maxSelect > ag.group.minSelect
                            ? `-${ag.group.maxSelect}`
                            : ''
                        })`
                      : t`Opsional (maks ${ag.group.maxSelect})`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {ag.options.map((opt) => {
                    const checked = selected[ag.group._id]?.has(opt._id) ?? false;
                    return (
                      <button
                        type="button"
                        key={opt._id}
                        onClick={() => toggle(ag.group._id, opt._id, ag.group.maxSelect)}
                        className={`text-sm px-3 py-1.5 rounded-full border ${
                          checked
                            ? 'bg-primary text-primary-foreground border-ring'
                            : 'bg-background text-foreground border-border hover:border-ring'
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
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <span className="text-sm">
              <Trans>Jumlah</Trans>
            </span>
            <div className="flex items-center gap-1 ml-auto">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </Button>
              <span className="w-7 text-center tabular-nums">{qty}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setQty((q) => Math.min(99, q + 1))}
              >
                +
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between">
          <div className="text-sm">
            <Trans>
              Total <span className="font-semibold tabular-nums">{formatIDR(qty * unitPriceIDR)}</span>
            </Trans>
          </div>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                <Trans>Batal</Trans>
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={submit}
              disabled={!allRequiredSatisfied || !variantSatisfied}
            >
              <Trans>Tambah ke pesanan</Trans>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
