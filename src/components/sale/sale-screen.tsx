import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { useReducer, useState } from 'react';
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

function genLineKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SaleScreen() {
  const categories = useQuery(api.menu.categories.list, {});
  const items = useQuery(api.menu.items.listForSale, {});
  const cafe = useQuery(api.cafes.myCafe, {});
  const [cart, dispatch] = useReducer(cartReducer, initialCart);
  const [clearOpen, setClearOpen] = useState(false);

  if (categories === undefined || items === undefined || cafe === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-2 text-fg-muted">
        <Spinner />
        <span>Memuat menu…</span>
      </div>
    );
  }

  function onItemTap(row: ItemForSale) {
    if (row.attachedGroups.length > 0) {
      // Modifier dialog wired in Task 10. No-op for now.
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
        taxEnabled={cafe?.taxEnabled === true}
        taxRatePct={cafe?.taxRatePct ?? 0}
        onBayar={() => {
          // Wired in Task 11 (CashPaymentDialog).
          console.warn('Bayar — wired in Task 11');
        }}
        onKosongkan={() => setClearOpen(true)}
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
    </div>
  );
}
