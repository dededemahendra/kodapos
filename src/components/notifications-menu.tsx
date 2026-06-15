import { Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import {
  AlertTriangle,
  BellIcon,
  BellOff,
  ChevronRight,
  ConciergeBell,
  X,
} from 'lucide-react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type ReactNode, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { formatIDR } from '~/lib/money';
import { useBoolPreference } from '~/lib/preferences';
import { cn } from '~/lib/utils';

// Dismissed notifications are remembered per-device in localStorage. Keys encode
// the signal's identity + its state, so a low-stock alert re-appears if the
// quantity changes after being cleared, and a new incoming order is never hidden.
const DISMISSED_KEY = 'kodapos.dismissedNotifications';

function loadDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore (private mode, quota) */
  }
}

const orderKey = (id: string) => `so:${id}`;
const lowKey = (id: string, qty: number) => `ls:${id}:${qty}`;

/**
 * Notification center in the header. Aggregates the live operational signals the
 * app already computes (incoming self-orders, low ingredient stock) into rich,
 * per-item rows that link to where they're resolved and can be dismissed
 * individually or all at once. Dismissals persist per-device.
 */
export function NotificationsMenu() {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  const [lowStockAlerts] = useBoolPreference('lowStockAlerts', true);
  const lowStock = useQuery(api.dashboard.lowStock, lowStockAlerts ? {} : 'skip');
  const selfOrders = useQuery(api.selfOrders.queue);

  const orders = (selfOrders ?? []).filter((o) => !dismissed.has(orderKey(o.id)));
  const lowItems = (lowStockAlerts ? (lowStock?.items ?? []) : []).filter(
    (i) => !dismissed.has(lowKey(i.id, i.currentStockQty))
  );
  const moreLowStock = lowStockAlerts
    ? Math.max(0, (lowStock?.count ?? 0) - (lowStock?.items?.length ?? 0))
    : 0;
  const total = orders.length + lowItems.length;

  function dismiss(...keys: string[]) {
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      saveDismissed(next);
      return next;
    });
  }

  function clearAll() {
    dismiss(
      ...orders.map((o) => orderKey(o.id)),
      ...lowItems.map((i) => lowKey(i.id, i.currentStockQty))
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
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
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-sm font-semibold">
            <Trans>Notifikasi</Trans>
          </span>
          {total > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={clearAll}
            >
              <Trans>Bersihkan</Trans>
            </Button>
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
                dismissLabel={t`Tutup notifikasi`}
                onNavigate={() => setOpen(false)}
                onDismiss={() => dismiss(orderKey(o.id))}
              />
            ))}
            {lowItems.map((i) => (
              <NotificationRow
                key={i.id}
                to="/inventory"
                tone="bg-amber-500/15 text-amber-600 dark:text-amber-500"
                icon={<AlertTriangle className="size-4" />}
                title={i.name}
                subtitle={t`Sisa ${i.currentStockQty} ${i.unit}, ambang ${i.reorderThreshold}`}
                dismissLabel={t`Tutup notifikasi`}
                onNavigate={() => setOpen(false)}
                onDismiss={() => dismiss(lowKey(i.id, i.currentStockQty))}
              />
            ))}
            {moreLowStock > 0 ? (
              <Link
                to="/inventory"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Trans>Lihat semua {moreLowStock} bahan stok rendah lainnya</Trans>
                <ChevronRight className="size-3.5" />
              </Link>
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
  dismissLabel,
  onNavigate,
  onDismiss,
}: {
  to: '/self-orders' | '/inventory';
  tone: string;
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  dismissLabel: string;
  onNavigate: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="group/n flex items-start gap-1 px-2">
      <Link
        to={to}
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-md px-1 py-2 hover:bg-muted/50"
      >
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
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
        }}
        className="mt-2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover/n:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
