import { Trans, useLingui } from '@lingui/react/macro';
import { computeOrderTotals } from 'convex/lib/pricing';
import { Trash2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';
import type { CartLine, MenuPricing } from './types';

/**
 * Review + submit sheet. Shows each cart line with a qty stepper + remove, an
 * estimated total (service charge + tax via the shared `computeOrderTotals`, the
 * same pure fn the server uses), an optional note, and the submit button. The
 * displayed totals are an ESTIMATE — the server re-prices authoritatively.
 */
export function CartReviewSheet({
  open,
  onOpenChange,
  cart,
  pricing,
  note,
  onNoteChange,
  onSetQty,
  onRemove,
  onSubmit,
  submitting,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartLine[];
  pricing: MenuPricing;
  note: string;
  onNoteChange: (note: string) => void;
  onSetQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const { t } = useLingui();
  const subtotalIDR = cart.reduce((sum, l) => sum + l.qty * l.unitPriceIDR, 0);
  const { serviceChargeIDR, taxIDR, totalIDR } = computeOrderTotals({
    subtotalIDR,
    serviceChargeEnabled: pricing.serviceChargeEnabled,
    serviceChargePct: pricing.serviceChargePct,
    taxEnabled: pricing.taxEnabled,
    taxRatePct: pricing.taxRatePct,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>
            <Trans>Keranjang</Trans>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-2 space-y-3">
          {cart.map((line) => {
            const summary = [line.variantName, ...line.modifierLabels]
              .filter(Boolean)
              .join(' · ');
            return (
              <div key={line.key} className="flex gap-3 border-b border-border pb-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{line.name}</div>
                  {summary ? (
                    <div className="text-xs text-muted-foreground">{summary}</div>
                  ) : null}
                  <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {formatIDR(line.unitPriceIDR)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={t`Kurangi`}
                      onClick={() => onSetQty(line.key, line.qty - 1)}
                    >
                      −
                    </Button>
                    <span className="w-6 text-center tabular-nums">{line.qty}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={t`Tambah`}
                      onClick={() => onSetQty(line.key, line.qty + 1)}
                    >
                      +
                    </Button>
                  </div>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-destructive"
                    onClick={() => onRemove(line.key)}
                  >
                    <Trash2 className="size-3.5" />
                    <Trans>Hapus</Trans>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              <Trans>Subtotal</Trans>
            </span>
            <span className="tabular-nums">{formatIDR(subtotalIDR)}</span>
          </div>
          {pricing.serviceChargeEnabled ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{pricing.serviceChargeName}</span>
              <span className="tabular-nums">{formatIDR(serviceChargeIDR)}</span>
            </div>
          ) : null}
          {pricing.taxEnabled ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                <Trans>Pajak</Trans>
              </span>
              <span className="tabular-nums">{formatIDR(taxIDR)}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-border pt-1 font-semibold">
            <span>
              <Trans>Perkiraan total</Trans>
            </span>
            <span className="tabular-nums">{formatIDR(totalIDR)}</span>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium" htmlFor="self-order-note">
            <Trans>Catatan (opsional)</Trans>
          </label>
          <Input
            id="self-order-note"
            className="mt-1"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder={t`mis. tidak pedas`}
          />
        </div>

        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          type="button"
          className="mt-4 w-full"
          size="lg"
          onClick={onSubmit}
          disabled={submitting || cart.length === 0}
        >
          {submitting ? <Spinner className="mr-2" /> : null}
          <Trans>Kirim pesanan</Trans>
        </Button>
      </SheetContent>
    </Sheet>
  );
}
