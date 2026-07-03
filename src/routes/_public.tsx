import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { currentHostApp } from '~/lib/host';

export const Route = createFileRoute('/_public')({
  component: PublicLayout,
});

function PublicLayout() {
  // On the admin host, the tenant routes (incl. the marketing home at `/`) must
  // not render; send the operator to the admin landing.
  useEffect(() => {
    if (currentHostApp() === 'admin') window.location.replace('/overview');
  }, []);
  if (currentHostApp() === 'admin') return null;

  return (
    <div data-density="comfortable">
      <Outlet />
    </div>
  );
}
