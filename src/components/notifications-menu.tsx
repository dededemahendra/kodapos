import { Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { AlertTriangle, BellIcon, BellOff, ChevronRight, ConciergeBell } from 'lucide-react';
import { Trans, useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { formatIDR } from '~/lib/money';
import { useBoolPreference } from '~/lib/preferences';
import { cn } from '~/lib/utils';

/**
 * Notification center in the header. Aggregates the live operational signals the
 * app already computes (incoming self-orders, low ingredient stock) into rich,
 * per-item rows that link to where they're resolved. There's no separate
 * notifications store; these are derived from existing queries so the badge
 * always reflects current state.
 */
export function NotificationsMenu() {
  const { t } = useLingui();
  // Low-stock notifications honour the same opt-out as the register indicator.
  const [lowStockAlerts] = useBoolPreference('lowStockAlerts', true);
  const lowStock = useQuery(api.dashboard.lowStock, lowStockAlerts ? {} : 'skip');
  const selfOrders = useQuery(api.selfOrders.queue);

  const lowStockItems = lowStockAlerts ? (lowStock?.items ?? []) : [];
  const lowStockCount = lowStockAlerts ? (lowStock?.count ?? 0) : 0;
  const orders = selfOrders ?? [];
  const total = lowStockCount + orders.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={t`Notifikasi`} size="icon-sm" variant="outline" className="relative">
          <BellIcon />
          {total > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-white">
              {total > 9 ? '9+' : total}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 overflow-hidden p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-sm font-semibold">
            <Trans>Notifikasi</Trans>
          </span>
          {total > 0 ? (
            <Badge variant="secondary" className="tabular-nums">
              {total}
            </Badge>
          ) : null}
        </div>
        <DropdownMenuSeparator className="my-0" />

        {total === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <BellOff className="size-5 text-muted-foreground" />
            </span>
            <p className="text-sm font-medium">
              <Trans>Semua beres</Trans>
            </p>
            <p className="text-xs text-muted-foreground">
              <Trans>Tidak ada notifikasi baru.</Trans>
            </p>
          </div>
        ) : (
          <div className="max-h-[22rem] overflow-y-auto py-1">
            {orders.map((o) => (
              <NotificationRow
                key={o.id}
                to="/self-orders"
                tone="bg-primary/10 text-primary"
                icon={<ConciergeBell className="size-4" />}
                title={o.tableName ?? t`Pesanan masuk`}
                subtitle={`${o.lineCount} item · ${formatIDR(o.totalIDR ?? o.subtotalIDR)}`}
              />
            ))}
            {lowStockItems.map((i) => (
              <NotificationRow
                key={i.id}
                to="/inventory"
                tone="bg-amber-500/15 text-amber-600 dark:text-amber-500"
                icon={<AlertTriangle className="size-4" />}
                title={i.name}
                subtitle={t`Sisa ${i.currentStockQty} ${i.unit}, ambang ${i.reorderThreshold}`}
              />
            ))}
            {lowStockCount > lowStockItems.length ? (
              <DropdownMenuItem asChild className="cursor-pointer justify-center px-3 py-2 text-xs text-muted-foreground">
                <Link to="/inventory">
                  <Trans>Lihat semua {lowStockCount} bahan stok rendah</Trans>
                  <ChevronRight className="size-3.5" />
                </Link>
              </DropdownMenuItem>
            ) : null}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationRow({
  to,
  tone,
  icon,
  title,
  subtitle,
}: {
  to: '/self-orders' | '/inventory';
  tone: string;
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
}) {
  return (
    <DropdownMenuItem asChild className="cursor-pointer items-start gap-3 px-3 py-2.5">
      <Link to={to}>
        <span
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
            tone
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-snug">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
      </Link>
    </DropdownMenuItem>
  );
}
