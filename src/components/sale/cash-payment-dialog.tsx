import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { DEFAULT_LOYALTY } from 'convex/lib/loyalty';
import { computeOrderTotals } from 'convex/lib/pricing';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';
import { enqueue } from '~/lib/offline/outbox';
import { isUsable, load } from '~/lib/offline/register-cache';
import {
  buildReplayPayload,
  type OfflineSaleInput,
  type OfflineSaleRejection,
} from '~/lib/offline/sale-payload';
import { genUUID } from '~/lib/uuid';
import type { CartState } from './cart-reducer';
import { CustomerSection, type CustomerSelection } from './customer-section';
import { usePaymentTotals } from './use-payment-totals';

function computeDenominations(total: number): number[] {
  const nextFive = Math.ceil(total / 5000) * 5000;
  const nextHundred = Math.max(100000, Math.ceil(total / 100000) * 100000);
  const out: number[] = [total];
  if (nextFive !== total) out.push(nextFive);
  if (!out.includes(nextHundred)) out.push(nextHundred);
  const fourth = nextHundred + 100000;
  if (!out.includes(fourth)) out.push(fourth);
  return out.slice(0, 4);
}

export function CashPaymentDialog({
  open,
  onOpenChange,
  subtotalIDR,
  promoDiscountIDR,
  serviceChargeEnabled,
  serviceChargePct,
  taxEnabled,
  taxRatePct,
  quickCashButtons,
  cart,
  shiftId,
  cashierId,
  promoId,
  tableId,
  priceCategoryId,
  offline,
  onPaid,
  onQueued,
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
  quickCashButtons: number[];
  cart: CartState;
  shiftId: Id<'shifts'>;
  cashierId: Id<'cafeStaff'>;
  promoId?: Id<'promotions'>;
  tableId?: Id<'tables'>;
  priceCategoryId?: Id<'priceCategories'>;
  /** No usable connection: the sale goes to the device outbox, not the server. */
  offline: boolean;
  onPaid: (orderId: Id<'orders'>) => void;
  /** An offline sale that is safely stored on the device and owes a receipt. */
  onQueued: (sale: OfflineSaleInput) => void;
}) {
  const { t } = useLingui();
  const createCashSale = useMutation(api.orders.createCashSale);
  const loyaltyCfg = useQuery(api.loyalty.getConfig) ?? DEFAULT_LOYALTY;
  const [tendered, setTendered] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerSelection>({ redeemPoints: 0 });
  const clientIdRef = useRef<string>('');

  // Generate clientId once when the dialog opens; reset on close.
  useEffect(() => {
    if (open) {
      clientIdRef.current = genUUID();
      setTendered('');
      setError(null);
      setCustomer({ redeemPoints: 0 });
    }
  }, [open]);

  // Loyalty is a server-side ledger: `replayArgs` carries no customer, points
  // or reward field, so a redemption rung offline would discount the bill and
  // never be deducted from anyone's balance. The picker is hidden below and the
  // redemption is forced to zero here, so a customer selected just before the
  // socket dropped can't still move the total.
  useEffect(() => {
    if (offline) setCustomer({ redeemPoints: 0 });
  }, [offline]);

  const { afterPromoIDR, redeemIDR, totalIDR } = usePaymentTotals({
    subtotalIDR,
    discountIDR: promoDiscountIDR,
    redeemPoints: offline ? 0 : customer.redeemPoints,
    ...(offline ? {} : { redeemRewardIDR: customer.redeemRewardIDR }),
    loyaltyCfg,
    serviceChargeEnabled,
    serviceChargePct,
    taxEnabled,
    taxRatePct,
  });

  const tenderedNum = useMemo(() => {
    if (!tendered) return 0;
    const n = Number.parseInt(tendered, 10);
    return Number.isFinite(n) ? n : 0;
  }, [tendered]);
  const changeNum = tenderedNum - totalIDR;
  // Only show configured quick-cash amounts that actually cover the total — a
  // button below the total just disables Konfirmasi (dead tap). When none
  // qualify, fall back to computed denominations. computeDenominations puts the
  // exact total first; drop it since the standalone "Pas" button covers exact.
  const usableQuickCash = quickCashButtons.filter((d) => d > totalIDR);
  const denoms =
    usableQuickCash.length > 0 ? usableQuickCash : computeDenominations(totalIDR).slice(1);

  function rejectionMessage(reason: OfflineSaleRejection): string {
    if (reason === 'insufficient_cash') return t`Uang yang diterima kurang dari total.`;
    if (reason === 'empty_cart') return t`Keranjang kosong.`;
    // invalid_qty / non_integer_money / totals_mismatch are all "this cart
    // would be rejected when it syncs". Ringing it anyway would take the cash
    // and dead-letter the sale, so the till refuses it here instead.
    return t`Pesanan ini tidak bisa disimpan offline. Periksa kembali item dan totalnya.`;
  }

  /**
   * The offline path. Order matters and is not negotiable: check the cached
   * menu is fresh, build the payload, store it, and only then let the caller
   * print. A receipt printed for a sale that never reached the outbox is money
   * gone with no record it existed.
   */
  async function confirmOffline() {
    // The snapshot is what the offline register is priced from. `load()` itself
    // can reject (IndexedDB blocked/unavailable), which is exactly as unusable
    // as a stale snapshot, so it collapses into the same refusal.
    const snapshot = await load().catch(() => null);
    if (!isUsable(snapshot, Date.now())) {
      setError(
        t`Data menu tersimpan sudah terlalu lama untuk dipakai. Sambungkan internet dulu, atau tulis struk manual.`
      );
      return;
    }

    // Recomputed here rather than reusing the dialog's displayed total so the
    // three numbers the server re-checks (service charge, tax, total) come from
    // one call to the shared pricing helper and cannot disagree with each other.
    const {
      serviceChargeIDR,
      taxIDR,
      totalIDR: offlineTotalIDR,
    } = computeOrderTotals({
      subtotalIDR,
      discountIDR: promoDiscountIDR,
      serviceChargeEnabled,
      serviceChargePct,
      taxEnabled,
      taxRatePct,
    });

    const sale: OfflineSaleInput = {
      clientId: clientIdRef.current,
      shiftId,
      cashierId,
      // The cart's unitPriceIDR is already modifier-inclusive (set by
      // modifier-picker-dialog and kept that way by the cart reducer's reprice),
      // which is the convention the replay mutation asserts against. It is
      // passed straight through; nothing here recomputes a price.
      lines: cart.lines.map((l) => ({
        menuItemId: l.menuItemId,
        nameSnapshot: l.nameSnapshot,
        ...(l.variantId ? { variantId: l.variantId } : {}),
        ...(l.variantName ? { variantName: l.variantName } : {}),
        qty: l.qty,
        unitPriceIDR: l.unitPriceIDR,
        modifierOptionIds: l.modifierOptionIds,
        modifierLabels: l.modifierLabels,
      })),
      orderType: cart.orderType,
      ...(promoId ? { promoId } : {}),
      ...(priceCategoryId ? { priceCategoryId } : {}),
      // Promo + manual discount, already combined by the sale screen.
      discountIDR: promoDiscountIDR,
      serviceChargeIDR,
      taxIDR,
      totalIDR: offlineTotalIDR,
      cashTenderedIDR: tenderedNum,
      createdAtClient: Date.now(),
    };

    const built = buildReplayPayload(sale);
    if (!built.ok) {
      setError(rejectionMessage(built.reason));
      return;
    }

    // `enqueue` rejects on a full or unavailable IndexedDB (quota, private
    // browsing, a blocked upgrade). The throw propagates to confirm()'s catch,
    // which surfaces it and leaves the cart intact — no receipt is printed.
    await enqueue({
      clientId: built.payload.clientId,
      payload: built.payload,
      queuedAt: Date.now(),
    });

    onQueued(sale);
    onOpenChange(false);
  }

  async function confirm() {
    if (tenderedNum < totalIDR || submitting) return;
    setSubmitting(true);
    setError(null);
    if (offline) {
      try {
        await confirmOffline();
      } catch (err) {
        console.error('[offline] queueing the cash sale failed', err);
        setError(t`Penjualan gagal disimpan di perangkat ini. Struk tidak dicetak, coba lagi.`);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    try {
      const result = await createCashSale({
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
        cashTenderedIDR: tenderedNum,
        ...(promoId ? { promoId } : {}),
        ...(tableId ? { tableId } : {}),
        ...(priceCategoryId ? { priceCategoryId } : {}),
        ...(cart.manualDiscount ? { manualDiscount: cart.manualDiscount } : {}),
        ...(customer.customerId ? { customerId: customer.customerId } : {}),
        ...(customer.redeemPoints > 0 ? { redeemPoints: customer.redeemPoints } : {}),
        ...(customer.redeemRewardId ? { redeemRewardId: customer.redeemRewardId } : {}),
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

  function pressKey(key: string) {
    if (key === '⌫') {
      setTendered((s) => s.slice(0, -1));
    } else {
      setTendered((s) => (s + key).slice(0, 12));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {offline ? <Trans>Pembayaran Tunai (Offline)</Trans> : <Trans>Pembayaran Tunai</Trans>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {offline ? (
            <p className="rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-900">
              <Trans>
                Penjualan disimpan di perangkat ini dan dikirim otomatis saat koneksi kembali. Poin
                dan pelanggan tidak bisa dipakai selama offline.
              </Trans>
            </p>
          ) : (
            <CustomerSection
              cafeLoyalty={loyaltyCfg}
              afterPromoIDR={afterPromoIDR}
              value={customer}
              onChange={setCustomer}
            />
          )}

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

          <div
            className={`rounded-md border-2 px-3 py-2 text-right font-mono text-2xl tabular-nums ${
              tenderedNum >= totalIDR && tenderedNum > 0
                ? 'border-ring bg-accent text-primary'
                : 'border-border text-foreground'
            }`}
          >
            {tenderedNum > 0 ? tenderedNum.toLocaleString('id-ID') : '0'}
          </div>
          <div className="flex justify-between text-xs px-1">
            <span className="text-muted-foreground">
              <Trans>Kembalian</Trans>
            </span>
            <span className="font-semibold tabular-nums">
              {changeNum >= 0 ? formatIDR(changeNum) : '—'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => setTendered(String(totalIDR))}
              className="text-xs px-2 py-2 rounded-md border border-border bg-background hover:bg-muted"
            >
              <Trans>Pas</Trans>
            </button>
            {denoms.slice(0, 3).map((d, i) => (
              <button
                type="button"
                key={`${d}-${i}`}
                onClick={() => setTendered(String(d))}
                className="text-xs px-2 py-2 rounded-md border border-border bg-background hover:bg-muted"
              >
                {`${(d / 1000).toLocaleString('id-ID')}k`}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '000', '⌫'].map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => pressKey(k)}
                className="text-base px-2 py-3 rounded-md border border-border bg-background hover:bg-muted font-medium"
              >
                {k}
              </button>
            ))}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button
            type="button"
            onClick={confirm}
            disabled={tenderedNum < totalIDR || submitting}
            className="w-full"
            size="lg"
          >
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            {submitting ? (
              <Trans>Memproses…</Trans>
            ) : offline ? (
              <Trans>Simpan & cetak struk</Trans>
            ) : (
              <Trans>Konfirmasi</Trans>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
