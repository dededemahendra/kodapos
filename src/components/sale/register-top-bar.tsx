import { Trans } from '@lingui/react/macro';
import { Link, useRouterState } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { Button } from '~/components/ui/button';
import { NavUser } from '~/components/nav-user';
import { usePermissions } from '~/lib/permissions';

export function RegisterTopBar() {
  const cafe = useQuery(api.cafes.myCafe, {});
  const { isOwner } = usePermissions();
  const path = useRouterState({ select: (s) => s.location.pathname });

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
