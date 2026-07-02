import { useAuthActions } from '@convex-dev/auth/react';
import { Trans } from '@lingui/react/macro';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react';
import { useEffect } from 'react';
import { AdminShell } from '~/components/admin/admin-shell';
import { Button } from '~/components/ui/button';
import { LoadingCounter } from '~/components/ui/loading-counter';
import { currentHostApp } from '~/lib/host';

export const Route = createFileRoute('/_admin')({
  component: AdminLayout,
});

function AdminLayout() {
  // Host gate: the admin app only serves the admin host. On any other host,
  // bounce to the tenant root. Runs client-side (SSR has no window), matching
  // the app's existing client-redirect pattern (see _pos.tsx SignedOutRedirect).
  useEffect(() => {
    if (currentHostApp() !== 'admin') window.location.replace('/');
  }, []);
  if (currentHostApp() !== 'admin') return null;

  return (
    <>
      <AuthLoading>
        <LoadingCounter />
      </AuthLoading>
      <Unauthenticated>
        <Outlet />
      </Unauthenticated>
      <Authenticated>
        <OperatorGate />
      </Authenticated>
    </>
  );
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
