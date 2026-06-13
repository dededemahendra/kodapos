import { Trans } from '@lingui/react/macro';
import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { Authenticated, AuthLoading, Unauthenticated, useConvex, useQuery } from 'convex/react';
import { type ReactNode, useEffect } from 'react';
import { AppHeader } from '~/components/app-header';
import { AppSidebar } from '~/components/app-sidebar';
import { RegisterTopBar } from '~/components/sale/register-top-bar';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import { Spinner } from '~/components/ui/spinner';
import { Toaster } from '~/components/ui/sonner';

export const Route = createFileRoute('/_pos')({
  component: PosLayout,
});

const matchesPrefix = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(`${p}/`));

// Self-contained full-screen wizards: no sidebar AND no operational top bar.
const WIZARD_PREFIXES = ['/onboarding', '/pin', '/shift'];
// Operational cashier screens: chrome-free, but share the register top bar
// (cafe + Meja/Dapur/Riwayat/Shift/Admin) so they stay one tap apart.
const OPERATIONAL_PREFIXES = ['/sale', '/tables', '/kitchen', '/self-orders'];

function PosLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const cafe = useQuery(api.cafes.myCafe, {});
  // While the owner is still mid-onboarding (cafe exists but no
  // setupCompletedAt) treat everything as a wizard so the stepper doesn't
  // overlap the sidebar when onboarding navigates into /menu/* or /settings/*.
  const needsOnboarding = cafe !== undefined && cafe !== null && !cafe.setupCompletedAt;
  const isWizard = needsOnboarding || matchesPrefix(path, WIZARD_PREFIXES);
  const isOperational = !isWizard && matchesPrefix(path, OPERATIONAL_PREFIXES);
  const showNav = !isWizard && !isOperational;

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
          ) : isOperational ? (
            <div className="flex h-screen flex-col">
              <RegisterTopBar />
              <div className="min-h-0 flex-1 overflow-auto">
                <Outlet />
              </div>
            </div>
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
      // A cafe-less authenticated user (e.g. a Google sign-up that skipped the
      // inline cafe-creation step) needs to land in onboarding to create one;
      // an owner mid-onboarding (cafe exists but no setupCompletedAt) too.
      const needsOnboarding = cafe === null || !cafe.setupCompletedAt;
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
