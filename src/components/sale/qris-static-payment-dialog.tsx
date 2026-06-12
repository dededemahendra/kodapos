import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { DEFAULT_LOYALTY } from 'convex/lib/loyalty';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';
import { genUUID } from '~/lib/uuid';
import type { CartState } from './cart-reducer';
import { CustomerSection, type CustomerSelection } from './customer-section';
import { usePaymentTotals } from './use-payment-totals';

export function QrisStaticPaymentDialog({
  open,
  onOpenChange,
  subtotalIDR,
  promoDiscountIDR,
  serviceChargeEnabled,
  serviceChargePct,
  taxEnabled,
  taxRatePct,
  qrisImageUrl,
  qrisMerchantName,
  qrisNmid,
  cart,
  shiftId,
  cashierId,
  promoId,
  tableId,
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
  qrisImageUrl?: string;
  qrisMerchantName?: string;
  qrisNmid?: string;
  cart: CartState;
  shiftId: Id<'shifts'>;
  cashierId: Id<'cafeStaff'>;
  promoId?: Id<'promotions'>;
  tableId?: Id<'tables'>;
  onPaid: (orderId: Id<'orders'>) => void;
}) {
  const { t } = useLingui();
  const createQrisStaticSale = useMutation(api.orders.createQrisStaticSale);
  const loyaltyCfg = useQuery(api.loyalty.getConfig) ?? DEFAULT_LOYALTY;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerSelection>({ redeemPoints: 0 });
  const clientIdRef = useRef<string>('');

  useEffect(() => {
    if (open) {
      clientIdRef.current = genUUID();
      setError(null);
      setCustomer({ redeemPoints: 0 });
    }
  }, [open]);

  const { afterPromoIDR, redeemIDR, totalIDR } = usePaymentTotals({
    subtotalIDR,
    discountIDR: promoDiscountIDR,
    redeemPoints: customer.redeemPoints,
    loyaltyCfg,
    serviceChargeEnabled,
    serviceChargePct,
    taxEnabled,
    taxRatePct,
  });

  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createQrisStaticSale({
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
        ...(tableId ? { tableId } : {}),
        ...(cart.manualDiscount ? { manualDiscount: cart.manualDiscount } : {}),
        ...(customer.customerId ? { customerId: customer.customerId } : {}),
        ...(customer.redeemPoints > 0 ? { redeemPoints: customer.redeemPoints } : {}),
        createdAtClient: Date.now(),
      });
      onPaid(result.orderId);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Gagal memproses pembayaran.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            <Trans>Pembayaran QRIS</Trans>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
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

          <div className="flex flex-col items-center gap-1 rounded-md border border-border px-3 py-3">
            {qrisImageUrl ? (
              <img src={qrisImageUrl} alt={t`Kode QRIS`} className="size-56 object-contain" />
            ) : (
              <p className="text-sm text-muted-foreground py-8">
                <Trans>Gambar QRIS belum diunggah.</Trans>
              </p>
            )}
            {qrisMerchantName ? <div className="text-sm font-medium">{qrisMerchantName}</div> : null}
            {qrisNmid ? <div className="text-xs text-muted-foreground">NMID: {qrisNmid}</div> : null}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button type="button" onClick={confirm} disabled={submitting} className="w-full" size="lg">
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            {submitting ? <Trans>Memproses…</Trans> : <Trans>Sudah dibayar</Trans>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
