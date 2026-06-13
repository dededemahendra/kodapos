import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react';
import { type ReactNode, useEffect } from 'react';
import { AppHeader } from '~/components/app-header';
import { AppSidebar } from '~/components/app-sidebar';
import { RegisterTopBar } from '~/components/sale/register-top-bar';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import { LoadingCounter } from '~/components/ui/loading-counter';
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
        <LoadingCounter />
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
  // Use the cached reactive query so the gate resolves synchronously on
  // re-render rather than after an awaited fetch. `undefined` = still loading;
  // we MUST NOT render `_pos` content until we know the cafe state, otherwise a
  // cafe-less user briefly sees the app before the onboarding redirect fires.
  const cafe = useQuery(api.cafes.myCafe, {});
  const path = useRouterState({ select: (s) => s.location.pathname });
  // A cafe-less authenticated user (e.g. a Google sign-up that skipped the
  // inline cafe-creation step) needs to land in onboarding to create one;
  // an owner mid-onboarding (cafe exists but no setupCompletedAt) too. The
  // onboarding routes are exempt to avoid a redirect loop.
  const alreadyOnOnboarding = path.startsWith('/onboarding');
  const needsOnboarding = cafe !== undefined && (cafe === null || !cafe.setupCompletedAt);

  useEffect(() => {
    if (needsOnboarding && !alreadyOnOnboarding && typeof window !== 'undefined') {
      window.location.replace('/onboarding/profile');
    }
  }, [needsOnboarding, alreadyOnOnboarding]);

  // Loading: don't flash app content.
  if (cafe === undefined) {
    return <LoadingCounter />;
  }
  // Redirecting a cafe-less user (and not already on onboarding): render nothing.
  if (needsOnboarding && !alreadyOnOnboarding) {
    return null;
  }
  return <>{children}</>;
}
