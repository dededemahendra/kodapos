import { Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { AlertTriangle, BellIcon, BellOff, ConciergeBell } from 'lucide-react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { useBoolPreference } from '~/lib/preferences';

/**
 * Notification center in the header. Aggregates the live operational signals the
 * app already computes (incoming self-orders, low ingredient stock) into a
 * dropdown with a count badge, each row linking to where it's resolved. There's
 * no separate notifications store; these are derived from existing queries so
 * the badge always reflects current state.
 */
export function NotificationsMenu() {
  const { t } = useLingui();
  // Low-stock notifications honour the same opt-out as the register indicator.
  const [lowStockAlerts] = useBoolPreference('lowStockAlerts', true);
  const lowStock = useQuery(api.dashboard.lowStock, lowStockAlerts ? {} : 'skip');
  const selfOrders = useQuery(api.selfOrders.queue);

  const lowStockCount = lowStockAlerts ? (lowStock?.count ?? 0) : 0;
  const selfOrderCount = selfOrders?.length ?? 0;
  const total = lowStockCount + selfOrderCount;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t`Notifikasi`}
          size="icon-sm"
          variant="outline"
          className="relative"
        >
          <BellIcon />
          {total > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-white">
              {total > 9 ? '9+' : total}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>
          <Trans>Notifikasi</Trans>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {total === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-2 py-6 text-center text-muted-foreground">
            <BellOff className="size-5 opacity-50" />
            <p className="text-sm">
              <Trans>Tidak ada notifikasi baru</Trans>
            </p>
          </div>
        ) : (
          <>
            {selfOrderCount > 0 ? (
              <DropdownMenuItem asChild>
                <Link to="/self-orders">
                  <ConciergeBell />
                  <span className="flex-1">
                    <Trans>{selfOrderCount} pesanan masuk menunggu</Trans>
                  </span>
                </Link>
              </DropdownMenuItem>
            ) : null}
            {lowStockCount > 0 ? (
              <DropdownMenuItem asChild>
                <Link to="/inventory">
                  <AlertTriangle />
                  <span className="flex-1">
                    <Trans>{lowStockCount} bahan perlu diisi ulang</Trans>
                  </span>
                </Link>
              </DropdownMenuItem>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
