import { useAuthActions } from '@convex-dev/auth/react';
import { Link } from '@tanstack/react-router';
import { Button } from '~/components/ui/button';

// The operator console is an internal, English-only surface (its page bodies are
// plain English and it is excluded from the i18n catalog), so its chrome is too.

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
            Users
          </Link>
          <Link to="/businesses" className="hover:text-foreground">
            Businesses
          </Link>
          <Link to="/audit" className="hover:text-foreground">
            Audit
          </Link>
        </nav>
      </div>
      <Button variant="outline" size="sm" onClick={() => void signOut()}>
        Sign out
      </Button>
    </header>
  );
}
