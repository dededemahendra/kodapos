import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react';
import { Spinner } from '~/components/ui/spinner';

export const Route = createFileRoute('/_pos')({
  component: PosLayout,
});

function PosLayout() {
  return (
    <div data-density="compact" className="min-h-screen bg-surface">
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center gap-2 text-fg-muted">
          <Spinner />
          <span>Memuat sesi…</span>
        </div>
      </AuthLoading>
      <Unauthenticated>
        <SignedOutRedirect />
      </Unauthenticated>
      <Authenticated>
        <Outlet />
      </Authenticated>
    </div>
  );
}

function SignedOutRedirect() {
  if (typeof window !== 'undefined') {
    window.location.replace('/signin');
  }
  return null;
}
