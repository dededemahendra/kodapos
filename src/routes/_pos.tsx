import { Trans } from '@lingui/react/macro';
import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { Authenticated, AuthLoading, Unauthenticated, useConvex, useQuery } from 'convex/react';
import { type ReactNode, useEffect } from 'react';
import { AppHeader } from '~/components/app-header';
import { AppSidebar } from '~/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import { Spinner } from '~/components/ui/spinner';
import { Toaster } from '~/components/ui/sonner';

export const Route = createFileRoute('/_pos')({
  component: PosLayout,
});

// Routes where the sidebar would get in the way (full-screen flows).
const NAV_HIDDEN_PREFIXES = ['/onboarding', '/pin', '/shift'];

function PosLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const cafe = useQuery(api.cafes.myCafe, {});
  const urlHidden = NAV_HIDDEN_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`)
  );
  // Hide the sidebar both for URL-marked full-screen flows AND while the
  // owner is still mid-onboarding (cafe exists but no setupCompletedAt).
  // The second case avoids the wizard-stepper + sidebar overlap when
  // onboarding routes navigate into /menu/* or /settings/* mid-flow.
  const needsOnboarding = cafe !== undefined && cafe !== null && !cafe.setupCompletedAt;
  const showNav = !urlHidden && !needsOnboarding;

  return (
    <div className="min-h-screen bg-muted">
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
          <Spinner />
          <span><Trans>Memuat sesi…</Trans></span>
        </div>
      </AuthLoading>
      <Unauthenticated>
        <SignedOutRedirect />
      </Unauthenticated>
      <Authenticated>
        <OnboardingGate>
          {showNav ? (
            <SidebarProvider>
              <AppSidebar />
              <SidebarInset>
                <AppHeader />
                <Outlet />
              </SidebarInset>
            </SidebarProvider>
          ) : (
            <Outlet />
          )}
        </OnboardingGate>
        <Toaster />
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
