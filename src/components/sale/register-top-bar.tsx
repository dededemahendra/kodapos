import { Trans } from '@lingui/react/macro';
import { Link, useRouterState } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { AlertTriangle, Monitor } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { NavUser } from '~/components/nav-user';
import { usePermissions } from '~/lib/permissions';
import { useBoolPreference } from '~/lib/preferences';

export function RegisterTopBar() {
  const cafe = useQuery(api.cafes.myCafe, {});
  const { isOwner } = usePermissions();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const selfOrders = useQuery(api.selfOrders.queue);
  const pendingCount = selfOrders?.length ?? 0;
  // Low-stock warning indicator, opt-out via Settings → Notifikasi.
  const [lowStockAlerts] = useBoolPreference('lowStockAlerts', true);
  const lowStock = useQuery(api.dashboard.lowStock, lowStockAlerts ? {} : 'skip');
  const lowStockCount = lowStock?.count ?? 0;

  const isActive = (to: string) => path === to || path.startsWith(`${to}/`);

  return (
    <header className="sticky top-0 z-50 flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background px-4">
      <div className="flex items-center gap-2">
        {cafe?.name && (
          <span className="text-sm font-semibold">{cafe.name}</span>
        )}
        <Button
          asChild
          size="sm"
          variant={isActive('/tables') ? 'secondary' : 'ghost'}
        >
          <Link to="/tables"><Trans>Meja</Trans></Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={isActive('/self-orders') ? 'secondary' : 'ghost'}
        >
          <Link to="/self-orders">
            <Trans>Pesanan Masuk</Trans>
            {pendingCount > 0 ? (
              <Badge variant="destructive" className="ml-1.5">
                {pendingCount}
              </Badge>
            ) : null}
          </Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={isActive('/kitchen') ? 'secondary' : 'ghost'}
        >
          <Link to="/kitchen"><Trans>Dapur</Trans></Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={isActive('/history') ? 'secondary' : 'ghost'}
        >
          <Link to="/history"><Trans>Riwayat</Trans></Link>
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {lowStockAlerts && lowStockCount > 0 ? (
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="text-amber-600 hover:text-amber-600 dark:text-amber-500 dark:hover:text-amber-500"
          >
            <Link to="/inventory">
              <AlertTriangle />
              <Trans>Stok rendah</Trans>
              <Badge variant="destructive" className="ml-1.5">
                {lowStockCount}
              </Badge>
            </Link>
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => window.open('/display', 'kodaposCustomerDisplay')}
        >
          <Monitor /><Trans>Layar pelanggan</Trans>
        </Button>
        <Button
          asChild
          size="sm"
          variant={isActive('/shift') ? 'secondary' : 'ghost'}
        >
          <Link to="/shift/close"><Trans>Shift</Trans></Link>
        </Button>
        {isOwner && (
          <Button
            asChild
            size="sm"
            variant={isActive('/dashboard') ? 'secondary' : 'ghost'}
          >
            <Link to="/dashboard"><Trans>Admin</Trans></Link>
          </Button>
        )}
        <NavUser />
      </div>
    </header>
  );
}
