import { useLingui } from '@lingui/react/macro';
import { Trans } from '@lingui/react/macro';
import { Link, useRouterState } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { AlertTriangle, ChefHat, Clock, History, LayoutGrid, Monitor, PackageSearch, Users } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { NavUser } from '~/components/nav-user';
import { usePermissions } from '~/lib/permissions';
import { useBoolPreference } from '~/lib/preferences';

export function RegisterTopBar() {
  const { t } = useLingui();
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
          <Link to="/tables">
            <LayoutGrid className="shrink-0" />
            <span className="hidden md:inline"><Trans>Meja</Trans></span>
          </Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={isActive('/self-orders') ? 'secondary' : 'ghost'}
        >
          <Link to="/self-orders">
            <Users className="shrink-0" />
            <span className="hidden md:inline"><Trans>Pesanan Masuk</Trans></span>
            {pendingCount > 0 ? (
              <Badge variant="destructive" className="ml-1">
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
          <Link to="/kitchen">
            <ChefHat className="shrink-0" />
            <span className="hidden md:inline"><Trans>Dapur</Trans></span>
          </Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={isActive('/history') ? 'secondary' : 'ghost'}
        >
          <Link to="/history">
            <History className="shrink-0" />
            <span className="hidden md:inline"><Trans>Riwayat</Trans></span>
          </Link>
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
              <AlertTriangle className="shrink-0" />
              <span className="hidden md:inline"><Trans>Stok rendah</Trans></span>
              <Badge variant="destructive" className="ml-1">
                {lowStockCount}
              </Badge>
            </Link>
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => window.open('/display', 'kodaposCustomerDisplay')}
          aria-label={t`Layar pelanggan`}
        >
          <Monitor className="shrink-0" />
          <span className="hidden lg:inline"><Trans>Layar pelanggan</Trans></span>
        </Button>
        <Button
          asChild
          size="sm"
          variant={isActive('/shift') ? 'secondary' : 'ghost'}
        >
          <Link to="/shift/close">
            <Clock className="shrink-0" />
            <span className="hidden lg:inline"><Trans>Shift</Trans></span>
          </Link>
        </Button>
        {isOwner && (
          <Button
            asChild
            size="sm"
            variant={isActive('/dashboard') ? 'secondary' : 'ghost'}
          >
            <Link to="/dashboard">
              <PackageSearch className="shrink-0" />
              <span className="hidden lg:inline"><Trans>Admin</Trans></span>
            </Link>
          </Button>
        )}
        <NavUser />
      </div>
    </header>
  );
}
