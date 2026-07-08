import { useAuthActions } from '@convex-dev/auth/react';
import { Trans } from '@lingui/react/macro';
import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react';
import { useEffect } from 'react';
import { AdminShell } from '~/components/admin/admin-shell';
import { Button } from '~/components/ui/button';
import { LoadingCounter } from '~/components/ui/loading-counter';
import { currentHostApp, hostRoutingEnforced } from '~/lib/host';

export const Route = createFileRoute('/_admin')({
  component: AdminLayout,
});

function AdminLayout() {
  // Host gate: in production the admin app only serves the admin host; on any
  // other host, bounce to the tenant root. Disabled in dev (hostRoutingEnforced)
  // so a single origin (localhost:5173) serves both apps by path. Runs
  // client-side (SSR has no window), matching the app's existing client-redirect
  // pattern (see _pos.tsx SignedOutRedirect).
  const gated = hostRoutingEnforced() && currentHostApp() !== 'admin';
  useEffect(() => {
    if (gated) window.location.replace('/');
  }, [gated]);
  if (gated) return null;

  return (
    <>
      <AuthLoading>
        <LoadingCounter />
      </AuthLoading>
      <Unauthenticated>
        <OperatorSignInGate />
      </Unauthenticated>
      <Authenticated>
        <OperatorGate />
      </Authenticated>
    </>
  );
}

// Unauthenticated on the admin host: route everything to the operator sign-in
// so a signed-out visitor lands on /login rather than a bare route Outlet (or a
// query that throws). The /login route itself renders through the Outlet.
function OperatorSignInGate() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (path !== '/login') window.location.replace('/login');
  }, [path]);
  if (path !== '/login') return null;
  return <Outlet />;
}

// Only platform admins may enter. A non-operator who somehow authenticates is
// signed out and shown a terminal "not authorized" notice.
function OperatorGate() {
  const me = useQuery(api.admin.me, {});
  const { signOut } = useAuthActions();
  if (me === undefined) return <LoadingCounter />;
  if (me?.isPlatformAdmin !== true) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          <Trans>Akun ini tidak memiliki akses operator.</Trans>
        </p>
        <Button onClick={() => void signOut()}>
          <Trans>Keluar</Trans>
        </Button>
      </div>
    );
  }
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
