import { useAuthActions } from '@convex-dev/auth/react';
import { Link, useRouterState } from '@tanstack/react-router';
import { Coffee } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { useActiveCashier } from '~/lib/active-cashier';

const LINKS = [
  { to: '/sale', label: 'Kasir' },
  { to: '/history', label: 'Riwayat' },
  { to: '/menu', label: 'Menu' },
  { to: '/inventory', label: 'Inventaris' },
  { to: '/settings/profile', label: 'Pengaturan' },
] as const;

export function PosNav() {
  const { signOut } = useAuthActions();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { clearCashier } = useActiveCashier();

  async function handleSignOut() {
    clearCashier();
    await signOut();
    window.location.replace('/');
  }

  return (
    <nav className="border-b border-border bg-background">
      <div className="max-w-6xl mx-auto px-4 h-12 flex items-center gap-1">
        <Link to="/menu" className="flex items-center gap-1.5 mr-3 text-primary">
          <Coffee className="size-4" />
          <span className="font-semibold text-sm">kodapos</span>
        </Link>
        {LINKS.map((link) => {
          const active =
            link.to === '/settings/profile'
              ? path.startsWith('/settings')
              : path === link.to || path.startsWith(`${link.to}/`);
          return (
            <Link
              key={link.to}
              to={link.to}
              className={`text-sm px-3 py-1.5 rounded-md ${
                active
                  ? 'bg-accent text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="ml-auto text-muted-foreground"
        >
          Keluar
        </Button>
      </div>
    </nav>
  );
}
