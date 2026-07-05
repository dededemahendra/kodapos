import { useAuthActions } from '@convex-dev/auth/react';
import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Button } from '~/components/ui/button';

export function AdminTopBar() {
  const { signOut } = useAuthActions();
  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6">
      <div className="flex items-center gap-6">
        <Link to="/overview" className="font-semibold">
          kodapos <span className="text-muted-foreground">admin</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link to="/users" className="hover:text-foreground">
            <Trans>Users</Trans>
          </Link>
          <Link to="/businesses" className="hover:text-foreground">
            <Trans>Businesses</Trans>
          </Link>
        </nav>
      </div>
      <Button variant="outline" size="sm" onClick={() => void signOut()}>
        <Trans>Keluar</Trans>
      </Button>
    </header>
  );
}
