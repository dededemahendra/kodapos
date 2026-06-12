import { Trans } from '@lingui/react/macro';
import { Button } from '~/components/ui/button';
import { formatIDR } from '~/lib/money';
import type { CartLine, MenuItem, PublicMenu } from './types';

/** A generic bucket label for items whose category isn't in the list. */
const UNCATEGORIZED = '__uncategorized__';

/**
 * Read-only menu view: cafe header, category-grouped item rows, and a sticky
 * bottom cart bar. Tapping an item bubbles up to the parent, which decides
 * whether to open the picker sheet or add qty 1 directly.
 */
export function PublicMenuView({
  menu,
  cart,
  onItemTap,
  onOpenCart,
}: {
  menu: PublicMenu;
  cart: CartLine[];
  onItemTap: (item: MenuItem) => void;
  onOpenCart: () => void;
}) {
  const categoryName = new Map(menu.categories.map((c) => [c.id as string, c.name]));

  // Group items by category, preserving the menu's item order within each group.
  const groups = new Map<string, { name: string; items: MenuItem[] }>();
  for (const item of menu.items) {
    const key = categoryName.has(item.categoryId) ? (item.categoryId as string) : UNCATEGORIZED;
    const name = categoryName.get(item.categoryId) ?? '';
    if (!groups.has(key)) groups.set(key, { name, items: [] });
    groups.get(key)?.items.push(item);
  }

  const cartCount = cart.reduce((sum, l) => sum + l.qty, 0);
  const cartSubtotal = cart.reduce((sum, l) => sum + l.qty * l.unitPriceIDR, 0);

  return (
    <div className="min-h-screen pb-24">
      <header className="flex items-center gap-3 border-b border-border bg-background p-4">
        {menu.cafe.logoUrl ? (
          <img
            src={menu.cafe.logoUrl}
            alt={menu.cafe.name}
            className="size-10 rounded-md object-cover"
          />
        ) : null}
        <div>
          <h1 className="text-lg font-bold">{menu.cafe.name}</h1>
          <p className="text-sm text-muted-foreground">
            <Trans>Meja {menu.table.name}</Trans>
          </p>
        </div>
      </header>

      <div className="space-y-6 p-4">
        {[...groups.values()].map((group, idx) => (
          <section key={group.name || `uncat-${idx}`}>
            {group.name ? (
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.name}
              </h2>
            ) : null}
            <ul className="space-y-2">
              {group.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onItemTap(item)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-ring"
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="size-14 shrink-0 rounded-md object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className="text-sm tabular-nums text-muted-foreground">
                        {formatIDR(item.priceIDR)}
                      </div>
                    </div>
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-medium text-primary-foreground"
                    >
                      +
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {cartCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background p-3 shadow-lg">
          <Button type="button" size="lg" className="w-full justify-between" onClick={onOpenCart}>
            <span>
              <Trans>Lihat keranjang ({cartCount})</Trans>
            </span>
            <span className="tabular-nums">{formatIDR(cartSubtotal)}</span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
