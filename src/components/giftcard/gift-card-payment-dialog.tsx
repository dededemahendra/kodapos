import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { DEFAULT_LOYALTY } from 'convex/lib/loyalty';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { CustomerSection, type CustomerSelection } from '~/components/sale/customer-section';
import type { CartState } from '~/components/sale/cart-reducer';
import { usePaymentTotals } from '~/components/sale/use-payment-totals';
import { formatIDR } from '~/lib/money';
import { genUUID } from '~/lib/uuid';

export function GiftCardPaymentDialog({
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
  cart: CartState;
  shiftId: Id<'shifts'>;
  cashierId: Id<'cafeStaff'>;
  promoId?: Id<'promotions'>;
  tableId?: Id<'tables'>;
  onPaid: (orderId: Id<'orders'>) => void;
}) {
  const { t } = useLingui();
  const createGiftCardSale = useMutation(api.orders.createGiftCardSale);
  const loyaltyCfg = useQuery(api.loyalty.getConfig) ?? DEFAULT_LOYALTY;
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerSelection>({ redeemPoints: 0 });
  const clientIdRef = useRef<string>('');

  // Generate clientId once when the dialog opens; reset on close.
  useEffect(() => {
    if (open) {
      clientIdRef.current = genUUID();
      setCode('');
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

  const trimmed = code.trim();
  // Live balance preview: only query once a code is typed. `null` = not found.
  const card = useQuery(api.giftCards.getByCode, trimmed ? { code: trimmed } : 'skip');
  const lookupPending = trimmed !== '' && card === undefined;
  const balanceIDR = card?.balanceIDR ?? 0;
  const isActive = card?.status === 'active';
  // "Bayar" requires an active card whose balance covers the full total.
  const canPay = isActive && balanceIDR >= totalIDR && !submitting;
  const insufficient = card !== undefined && card !== null && isActive && balanceIDR < totalIDR;

  async function confirm() {
    if (!canPay) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createGiftCardSale({
        clientId: clientIdRef.current,
        shiftId,
        cashierId,
        orderType: cart.orderType,
        lines: cart.lines.map((l) => ({
          menuItemId: l.menuItemId,
          qty: l.qty,
          modifierOptionIds: l.modifierOptionIds,
          ...(l.variantId ? { variantId: l.variantId } : {}),
        })),
        giftCardCode: trimmed,
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
            <Trans>Kartu hadiah</Trans>
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

          <div className="space-y-1.5">
            <Input
              autoFocus
              placeholder={t`Kode kartu`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="uppercase tabular-nums"
            />
            {lookupPending ? (
              <p className="text-xs text-muted-foreground">
                <Trans>Memeriksa kartu…</Trans>
              </p>
            ) : trimmed && card === null ? (
              <p className="text-xs text-red-600">
                <Trans>Kartu hadiah tidak ditemukan.</Trans>
              </p>
            ) : card && !isActive ? (
              <p className="text-xs text-red-600">
                <Trans>Kartu hadiah tidak aktif.</Trans>
              </p>
            ) : card ? (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  <Trans>Saldo</Trans>
                </span>
                <span className="font-semibold tabular-nums">{formatIDR(balanceIDR)}</span>
              </div>
            ) : null}
            {insufficient ? (
              <p className="text-xs text-amber-700">
                <Trans>Saldo kurang — gunakan Bagi pembayaran.</Trans>
              </p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button
            type="button"
            onClick={confirm}
            disabled={!canPay}
            className="w-full"
            size="lg"
          >
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            {submitting ? <Trans>Memproses…</Trans> : <Trans>Bayar</Trans>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
