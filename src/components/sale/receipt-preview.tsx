import { Trans } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { DEFAULT_SERVICE_CHARGE_NAME } from 'convex/lib/pricing';
import { useQuery } from 'convex/react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent } from '~/components/ui/dialog';
import { formatIDR } from '~/lib/money';
import { formatPromoValue } from '~/lib/promo';

export function ReceiptPreview({
  open,
  onOpenChange,
  orderId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: Id<'orders'> | null;
  onDone: () => void;
}) {
  const cafe = useQuery(api.cafes.myCafe, {});
  const order = useQuery(api.orders.getById, orderId ? { id: orderId } : 'skip');

  if (!orderId) return null;

  // Persisted discountIDR includes any point redemption (server folds promo +
  // redeem into one discount). Split them back out so the receipt shows the promo
  // discount and the points redeemed on separate lines.
  const pointsRedeemedIDR = order?.pointsRedeemedIDR ?? 0;
  const promoDiscountIDR = (order?.discountIDR ?? 0) - pointsRedeemedIDR;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {order === undefined || cafe === undefined ? (
          <p className="text-muted-foreground">
            <Trans>Memuat struk…</Trans>
          </p>
        ) : !order ? (
          <p className="text-red-600">
            <Trans>Pesanan tidak ditemukan.</Trans>
          </p>
        ) : (
          <div data-print-receipt className="font-mono text-sm">
            <div className="text-center mb-3">
              <div className="font-semibold">{cafe?.name}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(order.createdAtClient).toLocaleString('id-ID')}
              </div>
              <div className="text-xs text-muted-foreground">
                <Trans>Kasir: {order.cashierName}</Trans>
              </div>
            </div>
            <hr className="border-dashed border-border my-2" />
            {order.lines.map((line, i) => (
              <div key={`${order._id}-line-${i}`} className="mb-1.5">
                <div className="flex justify-between">
                  <span>
                    {line.qty}× {line.nameSnapshot}
                  </span>
                  <span className="tabular-nums">{formatIDR(line.lineTotalIDR)}</span>
                </div>
                {line.modifiersSnapshot.length > 0 ? (
                  <ul className="text-xs text-muted-foreground ml-3">
                    {line.modifiersSnapshot.map((m, j) => (
                      <li key={`${order._id}-line-${i}-mod-${j}`}>
                        + {m.groupName}: {m.optionName}
                        {m.priceAdjustmentIDR > 0 ? ` (+${formatIDR(m.priceAdjustmentIDR)})` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
            <hr className="border-dashed border-border my-2" />
            <div className="flex justify-between">
              <span>
                <Trans>Subtotal</Trans>
              </span>
              <span className="tabular-nums">{formatIDR(order.subtotalIDR)}</span>
            </div>
            {promoDiscountIDR > 0 ? (
              <div className="flex justify-between">
                <span>
                  <Trans>Diskon</Trans>
                  {order.appliedPromo
                    ? ` ${order.appliedPromo.name} (${formatPromoValue(order.appliedPromo.type, order.appliedPromo.value)})`
                    : ''}
                </span>
                <span className="tabular-nums">−{formatIDR(promoDiscountIDR)}</span>
              </div>
            ) : null}
            {pointsRedeemedIDR > 0 ? (
              <div className="flex justify-between">
                {/* Printed receipt is always English, kept out of the i18n catalog. */}
                <span>Points redeemed</span>
                <span className="tabular-nums">-{formatIDR(pointsRedeemedIDR)}</span>
              </div>
            ) : null}
            {(order.serviceChargeIDR ?? 0) > 0 ? (
              <div className="flex justify-between">
                <span>
                  {order.serviceChargeName ?? DEFAULT_SERVICE_CHARGE_NAME}{' '}
                  {order.serviceChargePct ?? 0}%
                </span>
                <span className="tabular-nums">{formatIDR(order.serviceChargeIDR ?? 0)}</span>
              </div>
            ) : null}
            {order.taxIDR > 0 ? (
              <div className="flex justify-between">
                <span>
                  <Trans>PPN {order.taxRatePct}%</Trans>
                </span>
                <span className="tabular-nums">{formatIDR(order.taxIDR)}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-semibold text-base">
              <span>
                <Trans>Total</Trans>
              </span>
              <span className="tabular-nums">{formatIDR(order.totalIDR)}</span>
            </div>
            {order.payment?.method === 'cash' ? (
              <>
                <div className="flex justify-between mt-1">
                  <span>
                    <Trans>Tunai</Trans>
                  </span>
                  <span className="tabular-nums">
                    {formatIDR(order.payment.cashTenderedIDR ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>
                    <Trans>Kembalian</Trans>
                  </span>
                  <span className="tabular-nums">{formatIDR(order.payment.changeIDR ?? 0)}</span>
                </div>
              </>
            ) : null}
            {order.customerId && order.pointsEarned !== undefined ? (
              <>
                <hr className="border-dashed border-border my-2" />
                {/* Printed receipt is always English, kept out of the i18n catalog. */}
                <div className="text-center text-xs">Points earned: +{order.pointsEarned}</div>
              </>
            ) : null}
          </div>
        )}
        <div className="flex gap-2 justify-end mt-4">
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Trans>Cetak</Trans>
          </Button>
          <Button type="button" onClick={onDone}>
            <Trans>Selesai</Trans>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
