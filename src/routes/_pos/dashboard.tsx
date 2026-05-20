import { useAuthActions } from '@convex-dev/auth/react';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { Button } from '~/components/ui/button';

export const Route = createFileRoute('/_pos/dashboard')({
  component: Dashboard,
});

function Dashboard() {
  const { signOut } = useAuthActions();
  const greeting = useQuery(api.users.hello);

  async function handleSignOut() {
    await signOut();
    window.location.replace('/');
  }

  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button variant="outline" onClick={handleSignOut}>
          Keluar
        </Button>
      </header>
      <section className="p-4 rounded-md bg-bg border border-border">
        {greeting === undefined ? (
          <p className="text-fg-muted">Memuat…</p>
        ) : greeting === null ? (
          <p className="text-fg-muted">Belum login.</p>
        ) : (
          <p className="text-lg">{greeting}</p>
        )}
      </section>
    </main>
  );
}
