import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { useReducer, useState } from 'react';
import { useActiveCashier } from '~/lib/active-cashier';
import { CashPaymentDialog } from './cash-payment-dialog';
import { ReceiptPreview } from './receipt-preview';
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
import { cartReducer, initialCart } from './cart-reducer';
import { CartPane } from './cart-pane';
import { MenuPane, type ItemForSale } from './menu-pane';
import { ModifierPickerDialog } from './modifier-picker-dialog';

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
  const { cashierId } = useActiveCashier();
  const [cart, dispatch] = useReducer(cartReducer, initialCart);
  const [clearOpen, setClearOpen] = useState(false);
  const [pickerRow, setPickerRow] = useState<ItemForSale | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receiptOrderId, setReceiptOrderId] = useState<Id<'orders'> | null>(null);

  if (categories === undefined || items === undefined || cafe === undefined || shift === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-2 text-fg-muted">
        <Spinner />
        <span>Memuat menu…</span>
      </div>
    );
  }

  const subtotal = cart.lines.reduce((s, l) => s + l.qty * l.unitPriceIDR, 0);
  const taxEnabled = cafe?.taxEnabled === true;
  const taxRatePct = cafe?.taxRatePct ?? 0;
  const tax = taxEnabled ? Math.round((subtotal * taxRatePct) / 100) : 0;
  const total = subtotal + tax;

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
        taxEnabled={taxEnabled}
        taxRatePct={taxRatePct}
        onBayar={() => {
          if (cart.lines.length > 0) setPaymentOpen(true);
        }}
        onKosongkan={() => setClearOpen(true)}
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
            <AlertDialogTitle>Kosongkan keranjang?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua item akan dihapus dari pesanan ini.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                dispatch({ type: 'clearCart' });
                setClearOpen(false);
              }}
            >
              Kosongkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {shift && cashierId ? (
        <CashPaymentDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          totalIDR={total}
          cart={cart}
          shiftId={shift._id}
          cashierId={cashierId}
          onPaid={(orderId) => {
            setReceiptOrderId(orderId);
            dispatch({ type: 'clearCart' });
          }}
        />
      ) : null}
      <ReceiptPreview
        open={receiptOrderId !== null}
        onOpenChange={(open) => {
          if (!open) setReceiptOrderId(null);
        }}
        orderId={receiptOrderId}
        onDone={() => setReceiptOrderId(null)}
      />
    </div>
  );
}
