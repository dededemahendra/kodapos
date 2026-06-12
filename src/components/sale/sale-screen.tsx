import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { DEFAULT_SERVICE_CHARGE_NAME, computeOrderTotals, promoDiscountIDR } from 'convex/lib/pricing';
import { useReducer, useState } from 'react';
import { Trans } from '@lingui/react/macro';
import { useActiveCashier } from '~/lib/active-cashier';
import { CashPaymentDialog } from './cash-payment-dialog';
import { QrisDynamicPaymentDialog } from './qris-dynamic-payment-dialog';
import { QrisStaticPaymentDialog } from './qris-static-payment-dialog';
import { SplitPaymentDialog } from './split-payment-dialog';
import { ReceiptPreview } from './receipt-preview';
import { CashMovementDialog } from '~/components/shift/cash-movement-dialog';
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
import { Spinner } from '~/components/ui/spinner';
import { cartReducer, initialCart, type CartState } from './cart-reducer';
import { CartPane } from './cart-pane';
import { HoldOrderDialog } from './hold-order-dialog';
import { HeldOrdersDialog } from './held-orders-dialog';
import { MenuPane, type ItemForSale } from './menu-pane';
import { ModifierPickerDialog } from './modifier-picker-dialog';
import { PromoPickerDialog } from './promo-picker-dialog';
import { ManualDiscountDialog } from './manual-discount-dialog';
import { PAYMENT_METHODS, type PaymentMethod } from './payment-methods';

function genLineKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SaleScreen() {
  const categories = useQuery(api.menu.categories.list, {});
  const items = useQuery(api.menu.items.listForSale, {});
  const cafe = useQuery(api.cafes.myCafe, {});
  const shift = useQuery(api.shifts.current, {});
  const settings = useQuery(api.settings.get, {});
  const { cashierId } = useActiveCashier();
  const [cart, dispatch] = useReducer(cartReducer, initialCart);
  const [clearOpen, setClearOpen] = useState(false);
  const [pickerRow, setPickerRow] = useState<ItemForSale | null>(null);
  const [openMethod, setOpenMethod] = useState<PaymentMethod | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [promoPickerOpen, setPromoPickerOpen] = useState(false);
  const [manualDiscountOpen, setManualDiscountOpen] = useState(false);
  const [receiptOrderId, setReceiptOrderId] = useState<Id<'orders'> | null>(null);
  const [kasOpen, setKasOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [recallTarget, setRecallTarget] = useState<CartState | null>(null);
  const held = useQuery(
    api.heldOrders.listForShift,
    shift ? { shiftId: shift._id } : 'skip'
  );

  if (
    categories === undefined ||
    items === undefined ||
    cafe === undefined ||
    shift === undefined ||
    settings === undefined
  ) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-2 text-muted-foreground">
        <Spinner />
        <span>
          <Trans>Memuat menu…</Trans>
        </span>
      </div>
    );
  }

  const subtotal = cart.lines.reduce((s, l) => s + l.qty * l.unitPriceIDR, 0);
  const promoDisc = cart.promo
    ? promoDiscountIDR(cart.promo.type, cart.promo.value, subtotal)
    : 0;
  const manualDisc = cart.manualDiscount
    ? promoDiscountIDR(cart.manualDiscount.type, cart.manualDiscount.value, subtotal - promoDisc)
    : 0;
  const discount = promoDisc + manualDisc;
  const taxEnabled = cafe?.taxEnabled === true;
  const taxRatePct = taxEnabled ? cafe?.taxRatePct ?? 0 : 0;
  const scEnabled = settings?.payment.serviceChargeEnabled === true;
  const scPct = scEnabled ? settings?.payment.serviceChargePct ?? 0 : 0;
  const scName = settings?.payment.serviceChargeName ?? DEFAULT_SERVICE_CHARGE_NAME;
  const { serviceChargeIDR, taxIDR: tax, totalIDR: total } = computeOrderTotals({
    subtotalIDR: subtotal,
    discountIDR: discount,
    serviceChargeEnabled: scEnabled,
    serviceChargePct: scPct,
    taxEnabled,
    taxRatePct,
  });

  const defaultMethod = settings.payment.defaultMethod;
  const ready = PAYMENT_METHODS.filter((m) => m.isReady(settings)).map((m) => m.method);
  // Sync tender methods a split can combine. Mirror the same gating the cash /
  // qris_static dialogs use: cash if enabled, qris_static if enabled + QR set.
  const splitCashEnabled = ready.includes('cash');
  const splitQrisStaticEnabled = ready.includes('qris_static');
  // A split needs at least two usable sync methods to be meaningful.
  const canSplit = splitCashEnabled && splitQrisStaticEnabled;
  // Dynamic QRIS supersedes static on the same rail: it auto-confirms via webhook
  // and is strictly preferable, so never show two identical "QRIS" buttons.
  const supported = ready.includes('qris_dynamic')
    ? ready.filter((m) => m !== 'qris_static')
    : ready;
  // Put the configured default first when it is in the supported set. Sort on a
  // boolean key so the comparator stays a valid total order as methods are added.
  const payMethods = [...supported].sort(
    (a, b) => Number(b === defaultMethod) - Number(a === defaultMethod)
  );

  function onItemTap(row: ItemForSale) {
    if (row.attachedGroups.length > 0) {
      setPickerRow(row);
      return;
    }
    dispatch({
      type: 'addLine',
      lineKey: genLineKey(),
      line: {
        menuItemId: row.item._id,
        nameSnapshot: row.item.name,
        qty: 1,
        unitPriceIDR: row.item.priceIDR,
        modifierOptionIds: [],
        modifierLabels: [],
      },
    });
  }

  return (
    <div className="grid grid-cols-[1fr_minmax(320px,30%)] h-[calc(100vh-3rem)]">
      <MenuPane categories={categories} items={items} onItemTap={onItemTap} />
      <CartPane
        cart={cart}
        dispatch={dispatch}
        subtotalIDR={subtotal}
        serviceChargeIDR={serviceChargeIDR}
        serviceChargeName={scName}
        serviceChargePct={scPct}
        taxEnabled={taxEnabled}
        taxRatePct={taxRatePct}
        taxIDR={tax}
        totalIDR={total}
        promo={cart.promo}
        discountIDR={discount}
        onAddPromo={() => setPromoPickerOpen(true)}
        onRemovePromo={() => dispatch({ type: 'setPromo', promo: null })}
        manualDiscount={cart.manualDiscount}
        onAddManualDiscount={() => setManualDiscountOpen(true)}
        onRemoveManualDiscount={() => dispatch({ type: 'setManualDiscount', manualDiscount: null })}
        payMethods={payMethods}
        onPay={(method) => {
          if (cart.lines.length > 0) setOpenMethod(method);
        }}
        {...(shift && cashierId && canSplit
          ? {
              onSplit: () => {
                if (cart.lines.length > 0) setSplitOpen(true);
              },
            }
          : {})}
        onKosongkan={() => setClearOpen(true)}
        {...(shift && cashierId
          ? {
              onKas: () => setKasOpen(true),
              onSwitch: true,
              onHold: () => setHoldOpen(true),
              onShowHeld: () => setHeldOpen(true),
              heldCount: held?.length ?? 0,
            }
          : {})}
      />
      <ModifierPickerDialog
        open={pickerRow !== null}
        onOpenChange={(open) => {
          if (!open) setPickerRow(null);
        }}
        row={pickerRow}
        onConfirm={(pick) => {
          if (!pickerRow) return;
          dispatch({
            type: 'addLine',
            lineKey: genLineKey(),
            line: {
              menuItemId: pickerRow.item._id,
              nameSnapshot: pickerRow.item.name,
              qty: pick.qty,
              unitPriceIDR: pick.unitPriceIDR,
              modifierOptionIds: pick.modifierOptionIds,
              modifierLabels: pick.modifierLabels,
            },
          });
          setPickerRow(null);
        }}
      />
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Kosongkan keranjang?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>Semua item akan dihapus dari pesanan ini.</Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans>Batal</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                dispatch({ type: 'clearCart' });
                setClearOpen(false);
              }}
            >
              <Trans>Kosongkan</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={recallTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRecallTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Ganti keranjang saat ini?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>Keranjang berisi item. Memuat pesanan ditahan akan menggantinya.</Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans>Batal</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (recallTarget) dispatch({ type: 'load', state: recallTarget });
                setRecallTarget(null);
              }}
            >
              <Trans>Muat</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {shift && cashierId ? (
        <>
          <CashMovementDialog open={kasOpen} onOpenChange={setKasOpen} shiftId={shift._id} />
          <HoldOrderDialog
            open={holdOpen}
            cart={cart}
            cashierId={cashierId}
            onOpenChange={setHoldOpen}
            onHeld={() => {
              dispatch({ type: 'clearCart' });
              setHoldOpen(false);
            }}
          />
          <HeldOrdersDialog
            open={heldOpen}
            held={held}
            genLineKey={genLineKey}
            onOpenChange={setHeldOpen}
            onRecall={(state) => {
              if (cart.lines.length > 0) setRecallTarget(state);
              else dispatch({ type: 'load', state });
            }}
          />
          <CashPaymentDialog
            open={openMethod === 'cash'}
            onOpenChange={(o) => {
              if (!o) setOpenMethod(null);
            }}
            subtotalIDR={subtotal}
            promoDiscountIDR={discount}
            serviceChargeEnabled={scEnabled}
            serviceChargePct={scPct}
            taxEnabled={taxEnabled}
            taxRatePct={taxRatePct}
            quickCashButtons={settings.payment.quickCashButtons}
            {...(cart.promo?._id ? { promoId: cart.promo._id } : {})}
            cart={cart}
            shiftId={shift._id}
            cashierId={cashierId}
            onPaid={(orderId) => {
              setReceiptOrderId(orderId);
              dispatch({ type: 'clearCart' });
            }}
          />
          <QrisStaticPaymentDialog
            open={openMethod === 'qris_static'}
            onOpenChange={(o) => {
              if (!o) setOpenMethod(null);
            }}
            subtotalIDR={subtotal}
            promoDiscountIDR={discount}
            serviceChargeEnabled={scEnabled}
            serviceChargePct={scPct}
            taxEnabled={taxEnabled}
            taxRatePct={taxRatePct}
            {...(settings.qrisImageUrl ? { qrisImageUrl: settings.qrisImageUrl } : {})}
            {...('qrisMerchantName' in settings.payment && settings.payment.qrisMerchantName ? { qrisMerchantName: settings.payment.qrisMerchantName } : {})}
            {...('qrisNmid' in settings.payment && settings.payment.qrisNmid ? { qrisNmid: settings.payment.qrisNmid } : {})}
            {...(cart.promo?._id ? { promoId: cart.promo._id } : {})}
            cart={cart}
            shiftId={shift._id}
            cashierId={cashierId}
            onPaid={(orderId) => {
              setReceiptOrderId(orderId);
              dispatch({ type: 'clearCart' });
            }}
          />
          <SplitPaymentDialog
            open={splitOpen}
            onOpenChange={setSplitOpen}
            subtotalIDR={subtotal}
            promoDiscountIDR={discount}
            serviceChargeEnabled={scEnabled}
            serviceChargePct={scPct}
            taxEnabled={taxEnabled}
            taxRatePct={taxRatePct}
            cashEnabled={splitCashEnabled}
            qrisStaticEnabled={splitQrisStaticEnabled}
            {...(cart.promo?._id ? { promoId: cart.promo._id } : {})}
            cart={cart}
            shiftId={shift._id}
            cashierId={cashierId}
            onPaid={(orderId) => {
              setReceiptOrderId(orderId);
              dispatch({ type: 'clearCart' });
            }}
          />
          <QrisDynamicPaymentDialog
            open={openMethod === 'qris_dynamic'}
            onOpenChange={(o) => {
              if (!o) setOpenMethod(null);
            }}
            subtotalIDR={subtotal}
            promoDiscountIDR={discount}
            serviceChargeEnabled={scEnabled}
            serviceChargePct={scPct}
            taxEnabled={taxEnabled}
            taxRatePct={taxRatePct}
            {...(cart.promo?._id ? { promoId: cart.promo._id } : {})}
            cart={cart}
            shiftId={shift._id}
            cashierId={cashierId}
            onPaid={(orderId) => {
              setReceiptOrderId(orderId);
              dispatch({ type: 'clearCart' });
            }}
          />
        </>
      ) : null}
      <ReceiptPreview
        open={receiptOrderId !== null}
        onOpenChange={(open) => {
          if (!open) setReceiptOrderId(null);
        }}
        orderId={receiptOrderId}
        onDone={() => setReceiptOrderId(null)}
      />
      <PromoPickerDialog
        open={promoPickerOpen}
        onOpenChange={setPromoPickerOpen}
        onSelect={(promo) => dispatch({ type: 'setPromo', promo })}
      />
      <ManualDiscountDialog
        open={manualDiscountOpen}
        current={cart.manualDiscount}
        onOpenChange={setManualDiscountOpen}
        onApply={(d) => dispatch({ type: 'setManualDiscount', manualDiscount: d })}
        onRemove={() => dispatch({ type: 'setManualDiscount', manualDiscount: null })}
      />
    </div>
  );
}
