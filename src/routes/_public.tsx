import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { currentHostApp, hostRoutingEnforced } from '~/lib/host';

export const Route = createFileRoute('/_public')({
  component: PublicLayout,
});

function PublicLayout() {
  // In production, the admin host must not render tenant routes (incl. the
  // marketing home at `/`); send the operator to the admin landing. Disabled in
  // dev (hostRoutingEnforced) so localhost:5173 serves both apps by path.
  const redirectToAdmin = hostRoutingEnforced() && currentHostApp() === 'admin';
  useEffect(() => {
    if (redirectToAdmin) window.location.replace('/overview');
  }, [redirectToAdmin]);
  if (redirectToAdmin) return null;

  return (
    <div data-density="comfortable">
      <Outlet />
    </div>
  );
}
