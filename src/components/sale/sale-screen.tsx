import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { useReducer } from 'react';
import { Spinner } from '~/components/ui/spinner';
import { cartReducer, initialCart } from './cart-reducer';
import { MenuPane, type ItemForSale } from './menu-pane';

function genLineKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SaleScreen() {
  const categories = useQuery(api.menu.categories.list, {});
  const items = useQuery(api.menu.items.listForSale, {});
  const [_cart, dispatch] = useReducer(cartReducer, initialCart);

  if (categories === undefined || items === undefined) {
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
      <aside className="border-l border-border p-3 overflow-y-auto">
        <h2 className="text-sm font-semibold mb-2">Pesanan</h2>
        <p className="text-fg-muted text-sm">Cart pane — wired in Task 9.</p>
      </aside>
    </div>
  );
}
