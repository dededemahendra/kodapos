import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { Authenticated, AuthLoading, Unauthenticated, useConvex } from 'convex/react';
import { type ReactNode, useEffect } from 'react';
import { PosNav } from '~/components/pos-nav';
import { Spinner } from '~/components/ui/spinner';

export const Route = createFileRoute('/_pos')({
  component: PosLayout,
});

// Routes where the global nav would get in the way (full-screen flows).
const NAV_HIDDEN_PREFIXES = ['/onboarding', '/pin', '/shift'];

function PosLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const showNav = !NAV_HIDDEN_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

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
        <OnboardingGate>
          {showNav ? <PosNav /> : null}
          <Outlet />
        </OnboardingGate>
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

function OnboardingGate({ children }: { children: ReactNode }) {
  const convex = useConvex();
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cafe = await convex.query(api.cafes.myCafe);
      if (cancelled) return;
      const needsOnboarding = cafe !== null && !cafe.setupCompletedAt;
      const alreadyOnOnboarding = path.startsWith('/onboarding');
      if (needsOnboarding && !alreadyOnOnboarding && typeof window !== 'undefined') {
        window.location.replace('/onboarding/profile');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [convex, path]);
  return <>{children}</>;
}
