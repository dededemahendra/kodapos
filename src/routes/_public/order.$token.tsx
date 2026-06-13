import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useAction, useMutation, useQuery } from 'convex/react';
import { CheckCircle2, Clock, QrCode, XCircle } from 'lucide-react';
import { useState } from 'react';
import { CartReviewSheet } from '~/components/public/cart-review-sheet';
import { ItemPickerSheet } from '~/components/public/item-picker-sheet';
import { PublicMenuView } from '~/components/public/public-menu';
import { QrPaymentView } from '~/components/public/qr-payment-view';
import { cartLineKey, type CartLine, type MenuItem, type PickResult } from '~/components/public/types';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';

export const Route = createFileRoute('/_public/order/$token')({
  component: OrderPage,
});

/** Mint a fresh idempotency client id. Unique per attempt (one page load, or a
 *  reset after a "Pesan lagi"). */
function newClientId(): string {
  return crypto.randomUUID();
}

function OrderPage() {
  const { token } = Route.useParams();
  const menu = useQuery(api.public.menuForTable, { qrToken: token });

  // Local lean cart state — NOT the staff reducer.
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pickerItem, setPickerItem] = useState<MenuItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [note, setNote] = useState('');

  // clientId minted ONCE per attempt so a retry after a network failure replays
  // the same idempotent submit (the server returns the existing row).
  const [clientId, setClientId] = useState(() => newClientId());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selfOrderId, setSelfOrderId] = useState<Id<'selfOrders'> | null>(null);

  // Pay-now (QRIS) state. `charge` holds the last issued charge so the QR view
  // always has a qrString/amount/expiry even before the status query catches up.
  const [payMode, setPayMode] = useState(false);
  const [charge, setCharge] = useState<{
    qrString: string;
    expiresAt: number;
    totalIDR: number;
  } | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const submit = useMutation(api.public.submitSelfOrder);
  const createCharge = useAction(api.public.createSelfOrderCharge);
  const status = useQuery(
    api.public.selfOrderStatus,
    selfOrderId ? { selfOrderId, qrToken: token } : 'skip'
  );

  // --- cart mutators ---------------------------------------------------------
  function addLine(pick: PickResult) {
    const key = cartLineKey(pick.menuItemId, pick.variantId, pick.modifierOptionIds);
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, qty: Math.min(99, l.qty + pick.qty) } : l
        );
      }
      return [
        ...prev,
        {
          key,
          menuItemId: pick.menuItemId,
          name: pick.name,
          qty: pick.qty,
          unitPriceIDR: pick.unitPriceIDR,
          ...(pick.variantId ? { variantId: pick.variantId } : {}),
          ...(pick.variantName ? { variantName: pick.variantName } : {}),
          modifierOptionIds: pick.modifierOptionIds,
          modifierLabels: pick.modifierLabels,
        },
      ];
    });
  }

  function handleItemTap(item: MenuItem) {
    if (item.variants.length > 0 || item.modifierGroups.length > 0) {
      setPickerItem(item);
      setPickerOpen(true);
      return;
    }
    addLine({
      menuItemId: item.id,
      name: item.name,
      qty: 1,
      unitPriceIDR: item.priceIDR,
      modifierOptionIds: [],
      modifierLabels: [],
    });
  }

  function setQty(key: string, qty: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, qty: Math.min(99, qty) } : l))
        .filter((l) => l.qty > 0)
    );
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  /** Submit the self-order (idempotent via clientId). Returns its id. */
  async function submitOrder(): Promise<Id<'selfOrders'>> {
    const result = await submit({
      qrToken: token,
      clientId,
      lines: cart.map((l) => ({
        menuItemId: l.menuItemId,
        qty: l.qty,
        ...(l.variantId ? { variantId: l.variantId } : {}),
        modifierOptionIds: l.modifierOptionIds,
      })),
      ...(note.trim() ? { customerNote: note.trim() } : {}),
    });
    return result.selfOrderId;
  }

  // Pay-at-counter: the existing, unchanged flow.
  async function handleSubmit() {
    if (cart.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = await submitOrder();
      setSelfOrderId(id);
      setCartOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Pay-now (QRIS): submit, then create a charge and switch to the QR view.
  async function handlePayNow() {
    if (cart.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = await submitOrder();
      const result = await createCharge({ qrToken: token, selfOrderId: id });
      setSelfOrderId(id);
      setCharge(result);
      setPayMode(true);
      setCartOpen(false);
    } catch (err) {
      // The charge action can throw (e.g. QRIS suddenly unavailable). Surface it
      // inline; the cart still offers "Bayar di kasir" as a fallback.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function regenerateCharge() {
    if (!selfOrderId) return;
    setRegenerating(true);
    setError(null);
    try {
      const result = await createCharge({ qrToken: token, selfOrderId });
      setCharge(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegenerating(false);
    }
  }

  // Fallback from the QR view to pay-at-counter: keep the same self-order (it is
  // already submitted) and just show the standard confirmation.
  function payAtCounterFallback() {
    setPayMode(false);
    setCharge(null);
    setError(null);
  }

  function orderAgain() {
    setCart([]);
    setNote('');
    setSelfOrderId(null);
    setError(null);
    setPayMode(false);
    setCharge(null);
    setClientId(newClientId());
  }

  // --- render ----------------------------------------------------------------
  // Pay-now QR view: while in payMode show the QR + countdown + paid transition.
  if (payMode && charge) {
    const paymentStatus = status?.paymentStatus ?? 'awaiting';
    return (
      <QrPaymentView
        // The status query exposes the QR/amount/expiry only while awaiting; the
        // last `charge` result is the authoritative source otherwise.
        qrString={status?.qrString ?? charge.qrString}
        totalIDR={status?.totalIDR ?? charge.totalIDR}
        expiresAt={status?.expiresAt ?? charge.expiresAt}
        paymentStatus={paymentStatus}
        orderStatus={status?.status ?? 'new'}
        regenerating={regenerating}
        error={error}
        onRegenerate={regenerateCharge}
        onPayAtCounter={payAtCounterFallback}
      />
    );
  }

  if (selfOrderId) {
    return <ConfirmationView status={status?.status ?? 'new'} onOrderAgain={orderAgain} />;
  }

  if (menu === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  if (menu === null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <QrCode />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>QR tidak valid</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>Kode QR ini tidak dikenali. Mohon pindai ulang QR di meja Anda.</Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <>
      <PublicMenuView
        menu={menu}
        cart={cart}
        onItemTap={handleItemTap}
        onOpenCart={() => setCartOpen(true)}
      />
      <ItemPickerSheet
        item={pickerItem}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onConfirm={addLine}
      />
      <CartReviewSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        cart={cart}
        pricing={menu.pricing}
        note={note}
        onNoteChange={setNote}
        onSetQty={setQty}
        onRemove={removeLine}
        onSubmit={handleSubmit}
        onPayNow={handlePayNow}
        payNowAvailable={menu.payNowAvailable}
        submitting={submitting}
        error={error}
      />
    </>
  );
}

function ConfirmationView({
  status,
  onOrderAgain,
}: {
  status: 'new' | 'accepted' | 'rejected';
  onOrderAgain: () => void;
}) {
  const { t } = useLingui();

  const sub =
    status === 'accepted'
      ? { icon: CheckCircle2, tone: 'text-green-600', label: t`Pesanan diterima ✓` }
      : status === 'rejected'
        ? { icon: XCircle, tone: 'text-destructive', label: t`Pesanan ditolak` }
        : { icon: Clock, tone: 'text-muted-foreground', label: t`Menunggu konfirmasi…` };
  const SubIcon = sub.icon;

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <CheckCircle2 className="size-12 text-primary" aria-hidden />
          <h1 className="text-xl font-semibold">
            <Trans>Pesanan terkirim</Trans>
          </h1>
          <div className={`flex items-center gap-2 text-sm ${sub.tone}`}>
            <SubIcon className="size-4" aria-hidden />
            <span>{sub.label}</span>
          </div>
          <Button type="button" variant="outline" className="mt-2 w-full" onClick={onOrderAgain}>
            <Trans>Pesan lagi</Trans>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
