import { Trans, useLingui } from '@lingui/react/macro';
import { useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import {
  Calculator,
  Clock,
  Plus,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { navGroups, type SidebarNavItem } from '~/components/app-shared';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import { Skeleton } from '~/components/ui/skeleton';
import { formatIDR } from '~/lib/money';
import { usePermissions } from '~/lib/permissions';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { t, i18n } = useLingui();
  const { can, isOwner, isPlatformAdmin, isLoading: permLoading } = usePermissions();

  const trimmed = query.trim();
  const isLive = open && trimmed.length >= 2;
  const liveResults = useQuery(
    api.search.global,
    isLive ? { term: trimmed } : 'skip'
  );

  // ⌘K / Ctrl+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Clear query when dialog closes
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  function select(fn: () => void) {
    setOpen(false);
    fn();
  }

  // Permission-filtered nav items (mirrors app-sidebar logic)
  const allowed = (req?: SidebarNavItem['requires']) =>
    !req ||
    permLoading ||
    (req === 'owner' ? isOwner : req === 'platformAdmin' ? isPlatformAdmin : can(req));
  const permittedNav = navGroups.flatMap((g) =>
    g.items.flatMap((item) => {
      if (!allowed(item.requires)) return [];
      if (item.subItems?.length) {
        return item.subItems.filter((s) => s.path && allowed(s.requires));
      }
      return item.path ? [item] : [];
    })
  );

  const queryLower = trimmed.toLowerCase();
  const matchingNav = queryLower
    ? permittedNav.filter(
        (item) =>
          i18n._(item.title).toLowerCase().includes(queryLower) ||
          (item.path ?? '').toLowerCase().includes(queryLower)
      )
    : permittedNav;

  const QUICK_ACTIONS = [
    { key: 'sale', label: t`Buka kasir`, icon: <Calculator className="size-4" />, path: '/sale' },
    { key: 'menu', label: t`Kelola menu`, icon: <Plus className="size-4" />, path: '/menu' },
    { key: 'shift', label: t`Buka shift`, icon: <Clock className="size-4" />, path: '/shift/open' },
    { key: 'customers', label: t`Kelola pelanggan`, icon: <Users className="size-4" />, path: '/customers' },
  ] as const;

  const matchingActions = queryLower
    ? QUICK_ACTIONS.filter((a) => a.label.toLowerCase().includes(queryLower))
    : QUICK_ACTIONS;

  const hasLiveResults =
    (liveResults?.menuItems.length ?? 0) > 0 ||
    (liveResults?.customers.length ?? 0) > 0;
  const isLoading = isLive && liveResults === undefined;

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <CommandInput
        placeholder={t`Cari...`}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {!isLoading && !hasLiveResults && matchingActions.length === 0 && matchingNav.length === 0 && (
          <CommandEmpty>
            <Trans>Tidak ada hasil untuk "{query}"</Trans>
          </CommandEmpty>
        )}

        {matchingActions.length > 0 && (
          <CommandGroup heading={t`Tindakan Cepat`}>
            {matchingActions.map((action) => (
              <CommandItem
                key={action.key}
                value={`action-${action.key}`}
                onSelect={() =>
                  select(() => void navigate({ to: action.path as '/' }))
                }
              >
                {action.icon}
                {action.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matchingNav.length > 0 && (
          <CommandGroup heading={t`Halaman`}>
            {matchingNav.slice(0, 12).map((item) => (
              <CommandItem
                key={item.path}
                value={`nav-${item.path}`}
                onSelect={() =>
                  select(() => void navigate({ to: item.path! as '/' }))
                }
              >
                {item.icon}
                <span>{i18n._(item.title)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {isLoading && (
          <CommandGroup heading={t`Item Menu`}>
            <CommandItem disabled value="loading-menu">
              <Skeleton className="h-4 w-40" />
            </CommandItem>
          </CommandGroup>
        )}

        {!isLoading && (liveResults?.menuItems.length ?? 0) > 0 && (
          <CommandGroup heading={t`Item Menu`}>
            {liveResults!.menuItems.map((item) => (
              <CommandItem
                key={item._id}
                value={`menu-${item._id}`}
                onSelect={() =>
                  select(() => void navigate({ to: '/menu' }))
                }
              >
                <UtensilsCrossed className="size-4" />
                <span>{item.name}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {formatIDR(item.priceIDR)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {isLoading && (
          <CommandGroup heading={t`Pelanggan`}>
            <CommandItem disabled value="loading-customers">
              <Skeleton className="h-4 w-36" />
            </CommandItem>
          </CommandGroup>
        )}

        {!isLoading && (liveResults?.customers.length ?? 0) > 0 && (
          <CommandGroup heading={t`Pelanggan`}>
            {liveResults!.customers.map((customer) => (
              <CommandItem
                key={customer._id}
                value={`customer-${customer._id}`}
                onSelect={() =>
                  select(() => void navigate({ to: '/customers' }))
                }
              >
                <Users className="size-4" />
                <span>{customer.name}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {customer.phone}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
