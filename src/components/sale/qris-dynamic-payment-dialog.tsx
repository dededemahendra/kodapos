import { Trans, useLingui } from '@lingui/react/macro';
import { QRCodeSVG } from 'qrcode.react';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { DEFAULT_LOYALTY } from 'convex/lib/loyalty';
import { useAction, useMutation, useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';
import { genUUID } from '~/lib/uuid';
import type { CartState } from './cart-reducer';
import { CustomerSection, type CustomerSelection } from './customer-section';
import { usePaymentTotals } from './use-payment-totals';

export function QrisDynamicPaymentDialog({
  open,
  onOpenChange,
  subtotalIDR,
  promoDiscountIDR,
  serviceChargeEnabled,
  serviceChargePct,
  taxEnabled,
  taxRatePct,
  cart,
  shiftId,
  cashierId,
  promoId,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subtotalIDR: number;
  /** Promo discount already applied to the cart (0 when no promo). */
  promoDiscountIDR: number;
  serviceChargeEnabled: boolean;
  serviceChargePct: number;
  taxEnabled: boolean;
  taxRatePct: number;
  cart: CartState;
  shiftId: Id<'shifts'>;
  cashierId: Id<'cafeStaff'>;
  promoId?: Id<'promotions'>;
  onPaid: (orderId: Id<'orders'>) => void;
}) {
  const { t } = useLingui();
  const createSale = useAction(api.payments.qrisDynamic.createQrisDynamicSale);
  const cancelSale = useMutation(api.payments.qrisDynamic.cancelQrisDynamicSale);
  const loyaltyCfg = useQuery(api.loyalty.getConfig) ?? DEFAULT_LOYALTY;
  const [customer, setCustomer] = useState<CustomerSelection>({ redeemPoints: 0 });
  const [orderId, setOrderId] = useState<Id<'orders'> | null>(null);
  const [qrString, setQrString] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const clientIdRef = useRef<string>('');

  const { afterPromoIDR, redeemIDR, totalIDR } = usePaymentTotals({
    subtotalIDR,
    promoDiscountIDR,
    redeemPoints: customer.redeemPoints,
    loyaltyCfg,
    serviceChargeEnabled,
    serviceChargePct,
    taxEnabled,
    taxRatePct,
  });

  useEffect(() => {
    if (open) {
      clientIdRef.current = genUUID();
      setCustomer({ redeemPoints: 0 });
      setOrderId(null);
      setQrString(null);
      setError(null);
    }
  }, [open]);

  const liveOrder = useQuery(api.orders.getById, orderId ? { id: orderId } : 'skip');

  useEffect(() => {
    if (liveOrder?.paymentStatus === 'paid' && orderId) {
      onPaid(orderId);
      onOpenChange(false);
    }
  }, [liveOrder?.paymentStatus, orderId, onPaid, onOpenChange]);

  async function startCharge() {
    if (creating || orderId) return;
    setCreating(true);
    setError(null);
    try {
      const res = await createSale({
        clientId: clientIdRef.current,
        shiftId,
        cashierId,
        orderType: cart.orderType,
        lines: cart.lines.map((l) => ({
          menuItemId: l.menuItemId,
          qty: l.qty,
          modifierOptionIds: l.modifierOptionIds,
        })),
        ...(promoId ? { promoId } : {}),
        ...(customer.customerId ? { customerId: customer.customerId } : {}),
        ...(customer.redeemPoints > 0 ? { redeemPoints: customer.redeemPoints } : {}),
        createdAtClient: Date.now(),
      });
      setOrderId(res.orderId);
      setQrString(res.qrString);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Gagal membuat tagihan QRIS.`);
    } finally {
      setCreating(false);
    }
  }

  async function handleClose(next: boolean) {
    if (!next && orderId && liveOrder?.paymentStatus === 'pending') {
      try {
        await cancelSale({ orderId });
      } catch {
        /* ignore */
      }
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            <Trans>Pembayaran QRIS</Trans>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!orderId ? (
            <>
              <CustomerSection
                cafeLoyalty={loyaltyCfg}
                afterPromoIDR={afterPromoIDR}
                value={customer}
                onChange={setCustomer}
              />

              <div className="rounded-md bg-muted px-3 py-2 space-y-1">
                {redeemIDR > 0 ? (
                  <div className="flex justify-between text-xs text-emerald-700">
                    <span>
                      <Trans>Poin ditukar</Trans>
                    </span>
                    <span className="tabular-nums">−{formatIDR(redeemIDR)}</span>
                  </div>
                ) : null}
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <Trans>Total tagihan</Trans>
                  </div>
                  <div className="text-2xl font-semibold text-primary tabular-nums">
                    {formatIDR(totalIDR)}
                  </div>
                </div>
              </div>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <Button
                type="button"
                onClick={startCharge}
                disabled={creating}
                className="w-full"
                size="lg"
              >
                {creating ? <Spinner data-icon="inline-start" /> : null}
                {creating ? <Trans>Membuat tagihan…</Trans> : <Trans>Buat QRIS</Trans>}
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-md bg-muted px-3 py-2 text-center">
                <div className="text-2xl font-semibold text-primary tabular-nums">
                  {formatIDR(totalIDR)}
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 rounded-md border border-border px-3 py-4">
                {qrString ? <QRCodeSVG value={qrString} size={224} marginSize={2} /> : null}
                <p className="text-sm text-muted-foreground">
                  <Trans>Menunggu pembayaran…</Trans>
                </p>
                <Spinner />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                className="w-full"
              >
                <Trans>Batal</Trans>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
