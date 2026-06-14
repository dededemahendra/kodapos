import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { DEFAULT_SERVICE_CHARGE_NAME } from 'convex/lib/pricing';
import { useAction, useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Spinner } from '~/components/ui/spinner';
import { PinConfirmDialog, useOwnerPin } from '~/components/permission/pin-confirm-dialog';
import { useActiveCashier } from '~/lib/active-cashier';
import { formatIDR } from '~/lib/money';
import { usePermissions } from '~/lib/permissions';
import { usePreference, useBoolPreference } from '~/lib/preferences';
import { formatPromoValue } from '~/lib/promo';
import { toast } from '~/lib/toast';
import { RefundDialog } from './refund-dialog';

// Printed receipt is always English, kept out of the i18n catalog. Maps a stored
// payment method to its human label (cash is rendered separately above).
const PAYMENT_LABELS: Record<string, string> = {
  qris_static: 'QRIS',
  qris_dynamic: 'QRIS',
  giftcard: 'Gift card',
  card: 'Card',
  ewallet: 'E-Wallet',
  transfer: 'Bank Transfer',
};

const ORDER_TYPE_RECEIPT_LABEL: Record<'dine_in' | 'takeaway' | 'pickup', string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  pickup: 'Pickup',
};

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
  const { t } = useLingui();
  const { can } = usePermissions();
  const { cashierId } = useActiveCashier();
  const voidSale = useMutation(api.orders.voidSale);
  const sendReceipt = useAction(api.email.sendReceipt);
  const sendWaReceipt = useAction(api.whatsapp.sendReceipt);
  const settings = useQuery(api.settings.get);
  const waConnected =
    settings?.integrations.some((i) => i.key === 'whatsapp' && i.connected) ?? false;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waSending, setWaSending] = useState(false);

  // Optional printed order-number prefix (Settings → Pesanan → "Awalan nomor
  // pesanan"). Receipt content stays English/off-catalog.
  const [orderPrefix] = usePreference<string>('orderPrefix', '');
  // Owner-PIN gate for void/refund (Settings → Keamanan). Only meaningful when a
  // PIN is actually set; otherwise the action proceeds directly.
  const [pinForVoid] = useBoolPreference('pinForVoid', true);
  const { ownerId, hasPin, loaded: ownerLoaded } = useOwnerPin();
  const needPin = pinForVoid && hasPin;
  // Fail-closed: until the owner's PIN status is known, block void/refund so the
  // gate can't be bypassed in the brief staff.list loading window.
  const gateLoading = pinForVoid && !ownerLoaded;
  const [pinGate, setPinGate] = useState<'void' | 'refund' | null>(null);

  function openVoid(): void {
    setReason('');
    setConfirmOpen(true);
  }

  if (!orderId) return null;

  // Persisted discountIDR includes any point redemption (server folds promo +
  // redeem into one discount). Split them back out so the receipt shows the promo
  // discount and the points redeemed on separate lines.
  const pointsRedeemedIDR = order?.pointsRedeemedIDR ?? 0;
  const manualDiscountIDR = order?.manualDiscountIDR ?? 0;
  const promoDiscountIDR =
    (order?.discountIDR ?? 0) - pointsRedeemedIDR - manualDiscountIDR;

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
              {/* Printed receipt is always English, kept out of the i18n catalog. */}
              <div className="text-xs text-muted-foreground">
                Order #{orderPrefix}
                {order._id.slice(-4).toUpperCase()}
              </div>
              {order.orderType ? (
                <div className="text-xs text-muted-foreground">
                  Order type: {ORDER_TYPE_RECEIPT_LABEL[order.orderType]}
                </div>
              ) : null}
            </div>
            {/* Printed receipt is always English, kept out of the i18n catalog. */}
            {order.paymentStatus === 'void' ? (
              <div className="text-center font-bold text-destructive my-2">** VOID **</div>
            ) : null}
            {(order.refundedIDR ?? 0) > 0 ? (
              <div className="text-center my-2">
                <Badge variant="secondary">
                  <Trans>Direfund {formatIDR(order.refundedIDR ?? 0)}</Trans>
                </Badge>
              </div>
            ) : null}
            <hr className="border-dashed border-border my-2" />
            {order.lines.map((line, i) => (
              <div key={`${order._id}-line-${i}`} className="mb-1.5">
                <div className="flex justify-between">
                  <span>
                    {line.qty}× {line.nameSnapshot}
                    {line.variantName ? ` (${line.variantName})` : ''}
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
            {manualDiscountIDR > 0 ? (
              <div className="flex justify-between">
                <span>
                  <Trans>Diskon manual</Trans>
                </span>
                <span className="tabular-nums">−{formatIDR(manualDiscountIDR)}</span>
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
            {order.payments.map((p, i) =>
              p.method === 'cash' ? (
                <div key={`${order._id}-pay-${i}`}>
                  <div className="flex justify-between mt-1">
                    <span>
                      <Trans>Tunai</Trans>
                    </span>
                    <span className="tabular-nums">
                      {formatIDR(p.cashTenderedIDR ?? p.amountIDR)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>
                      <Trans>Kembalian</Trans>
                    </span>
                    <span className="tabular-nums">{formatIDR(p.changeIDR ?? 0)}</span>
                  </div>
                </div>
              ) : (
                <div key={`${order._id}-pay-${i}`} className="flex justify-between mt-1">
                  {/* Printed receipt is always English, kept out of the i18n catalog. */}
                  <span>Payment</span>
                  <span>
                    {PAYMENT_LABELS[p.method] ?? p.method} {formatIDR(p.amountIDR)}
                  </span>
                </div>
              )
            )}
            {order.customerId && order.pointsEarned !== undefined ? (
              <>
                <hr className="border-dashed border-border my-2" />
                {/* Printed receipt is always English, kept out of the i18n catalog. */}
                <div className="text-center text-xs">Points earned: +{order.pointsEarned}</div>
              </>
            ) : null}
          </div>
        )}
        <div className="flex gap-2 justify-between mt-4">
          <div className="flex gap-2">
            {order?.paymentStatus === 'paid' && can('canVoid') ? (
              <Button
                type="button"
                variant="destructive"
                disabled={gateLoading}
                onClick={() => {
                  if (needPin) setPinGate('void');
                  else openVoid();
                }}
              >
                <Trans>Batalkan pesanan</Trans>
              </Button>
            ) : null}
            {order?.paymentStatus === 'paid' &&
            can('canVoid') &&
            (order.refundedIDR ?? 0) < order.totalIDR ? (
              <Button
                type="button"
                variant="outline"
                disabled={gateLoading}
                onClick={() => {
                  if (needPin) setPinGate('refund');
                  else setRefundOpen(true);
                }}
              >
                <Trans>Refund</Trans>
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            {order ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline">
                    <Trans>Email struk</Trans>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72">
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!orderId) return;
                      const to = email.trim();
                      if (!to) return;
                      setSending(true);
                      try {
                        await sendReceipt({ orderId, to });
                        toast.success(t`Struk dikirim ke email.`);
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : t`Gagal mengirim email.`
                        );
                      } finally {
                        setSending(false);
                      }
                    }}
                  >
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@contoh.com"
                      aria-label={t`Email struk`}
                    />
                    <Button type="submit" disabled={sending || !email.trim()}>
                      {sending && <Spinner data-icon="inline-start" />}
                      <Trans>Kirim email</Trans>
                    </Button>
                  </form>
                </PopoverContent>
              </Popover>
            ) : null}
            {order && waConnected ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline">
                    <Trans>WhatsApp</Trans>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72">
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!orderId) return;
                      const to = waPhone.trim();
                      if (!to) return;
                      setWaSending(true);
                      try {
                        await sendWaReceipt({ orderId, to });
                        toast.success(t`Struk dikirim via WhatsApp.`);
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : t`Gagal mengirim WhatsApp.`
                        );
                      } finally {
                        setWaSending(false);
                      }
                    }}
                  >
                    <Input
                      type="tel"
                      value={waPhone}
                      onChange={(e) => setWaPhone(e.target.value)}
                      placeholder="08xxxxxxxxxx"
                      aria-label={t`Nomor WhatsApp`}
                    />
                    <Button type="submit" disabled={waSending || !waPhone.trim()}>
                      {waSending && <Spinner data-icon="inline-start" />}
                      <Trans>Kirim WhatsApp</Trans>
                    </Button>
                  </form>
                </PopoverContent>
              </Popover>
            ) : null}
            <Button type="button" variant="outline" onClick={() => window.print()}>
              <Trans>Cetak</Trans>
            </Button>
            <Button type="button" onClick={onDone}>
              <Trans>Selesai</Trans>
            </Button>
          </div>
        </div>
      </DialogContent>
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!voiding) setConfirmOpen(o);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Batalkan pesanan ini?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>
                Stok akan dikembalikan dan poin loyalitas dibatalkan. Tindakan ini tidak bisa
                diurungkan.
              </Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={120}
            placeholder={t`Alasan (opsional)`}
            aria-label="reason"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voiding}>
              <Trans>Batal</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={voiding}
              onClick={async (e) => {
                e.preventDefault();
                if (!orderId) return;
                setVoiding(true);
                try {
                  await voidSale({
                    orderId,
                    ...(reason.trim() ? { reason: reason.trim() } : {}),
                    ...(cashierId ? { cashierId } : {}),
                  });
                  toast.success(t`Pesanan dibatalkan.`);
                  setConfirmOpen(false);
                  onDone();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : t`Gagal membatalkan pesanan.`);
                } finally {
                  setVoiding(false);
                }
              }}
            >
              {voiding && <Spinner data-icon="inline-start" />}
              <Trans>Batalkan</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <RefundDialog
        orderId={orderId}
        open={refundOpen}
        onOpenChange={setRefundOpen}
        onDone={onDone}
      />
      <PinConfirmDialog
        open={pinGate !== null}
        ownerId={ownerId}
        onOpenChange={(o) => {
          if (!o) setPinGate(null);
        }}
        onConfirmed={() => {
          const gate = pinGate;
          setPinGate(null);
          if (gate === 'void') openVoid();
          else if (gate === 'refund') setRefundOpen(true);
        }}
        description={<Trans>Masukkan PIN pemilik untuk melanjutkan.</Trans>}
      />
    </Dialog>
  );
}
