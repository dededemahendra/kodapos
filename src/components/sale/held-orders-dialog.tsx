import { Trans } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { useState } from 'react';
import type { CartState } from './cart-reducer';
import { ORDER_TYPE_OPTIONS } from './order-types';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Empty, EmptyHeader, EmptyTitle } from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

export function HeldOrdersDialog({
  open,
  held,
  onOpenChange,
  onRecall,
  genLineKey,
}: {
  open: boolean;
  held:
    | {
        _id: Id<'heldOrders'>;
        label: string;
        orderType: 'dine_in' | 'takeaway' | 'pickup';
        lines: Array<{
          menuItemId: Id<'menuItems'>;
          nameSnapshot: string;
          qty: number;
          unitPriceIDR: number;
          modifierOptionIds: Array<Id<'modifierOptions'>>;
          modifierLabels: Array<{
            groupName: string;
            optionName: string;
            priceAdjustmentIDR: number;
          }>;
        }>;
        promo?: { promoId: Id<'promotions'>; name: string; type: 'percent' | 'fixed'; value: number };
        createdAt: number;
      }[]
    | undefined;
  onOpenChange: (open: boolean) => void;
  onRecall: (state: CartState) => void;
  genLineKey: () => string;
}) {
  const remove = useMutation(api.heldOrders.remove);
  const [busy, setBusy] = useState<Id<'heldOrders'> | null>(null);

  async function recall(h: NonNullable<typeof held>[number]) {
    setBusy(h._id);
    try {
      const state: CartState = {
        orderType: h.orderType,
        promo: h.promo
          ? { _id: h.promo.promoId, name: h.promo.name, type: h.promo.type, value: h.promo.value }
          : null,
        lines: h.lines.map((l) => ({ ...l, lineKey: genLineKey() })),
        manualDiscount: null,
      };
      onRecall(state);
      await remove({ id: h._id });
      onOpenChange(false);
    } finally {
      setBusy(null);
    }
  }

  async function discard(id: Id<'heldOrders'>) {
    setBusy(id);
    try {
      await remove({ id });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            <Trans>Pesanan ditahan</Trans>
          </DialogTitle>
        </DialogHeader>
        {held === undefined ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : held.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>
                <Trans>Tidak ada pesanan ditahan.</Trans>
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {held.map((h) => {
              const subtotal = h.lines.reduce((s, l) => s + l.qty * l.unitPriceIDR, 0);
              const itemCount = h.lines.reduce((s, l) => s + l.qty, 0);
              const typeLabel = ORDER_TYPE_OPTIONS.find((x) => x.value === h.orderType)?.label;
              return (
                <div
                  key={h._id}
                  className="flex items-center gap-2 rounded-md border border-border p-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-sm">
                      {h.label || <Trans>Tanpa nama</Trans>}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {typeLabel} · <Trans>{itemCount} item</Trans> · {formatIDR(subtotal)}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy === h._id}
                    onClick={() => recall(h)}
                  >
                    <Trans>Muat</Trans>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy === h._id}
                    onClick={() => discard(h._id)}
                    className="text-muted-foreground"
                  >
                    <Trans>Buang</Trans>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
