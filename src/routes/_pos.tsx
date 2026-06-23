import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from 'convex/react';
import { type ReactNode, useEffect, useState } from 'react';
import { AppHeader } from '~/components/app-header';
import { CommandPalette } from '~/components/command-palette';
import { AppSidebar } from '~/components/app-sidebar';
import { RegisterTopBar } from '~/components/sale/register-top-bar';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import { NoAccess } from '~/components/no-access';
import { LoadingCounter } from '~/components/ui/loading-counter';
import { Toaster } from '~/components/ui/sonner';
import { useAutoLock } from '~/lib/use-auto-lock';

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
        <AutoLock />
        <CommandPalette />
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

// Arms the idle auto-lock only while authenticated (renders nothing).
function AutoLock() {
  useAutoLock();
  return null;
}

function SignedOutRedirect() {
  if (typeof window !== 'undefined') {
    window.location.replace('/signin');
  }
  return null;
}

function OnboardingGate({ children }: { children: ReactNode }) {
  const cafe = useQuery(api.cafes.myCafe, {});
  const path = useRouterState({ select: (s) => s.location.pathname });
  const acceptInvites = useMutation(api.invites.acceptPendingInvites);
  const [accepting, setAccepting] = useState(true);

  // After any sign-in, convert a pending manager invite into access. Idempotent
  // and safe to call once per mount; it no-ops for owners and the uninvited.
  useEffect(() => {
    let cancelled = false;
    acceptInvites({})
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAccepting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [acceptInvites]);

  const alreadyOnOnboarding = path.startsWith('/onboarding');
  // An owner mid-onboarding (cafe exists but no setupCompletedAt) is routed to
  // the wizard. A user with NO accessible outlet (cafe === null) is NOT pushed
  // into onboarding any more; they see the no-access screen (which offers an
  // explicit "create your own business").
  const needsOnboarding = cafe !== undefined && cafe !== null && !cafe.setupCompletedAt;

  useEffect(() => {
    if (needsOnboarding && !alreadyOnOnboarding && typeof window !== 'undefined') {
      window.location.replace('/onboarding/profile');
    }
  }, [needsOnboarding, alreadyOnOnboarding]);

  // Still resolving cafe state or still accepting invites: don't flash content
  // (an invited manager's cafe becomes non-null once accept commits).
  if (cafe === undefined || accepting) {
    return <LoadingCounter />;
  }
  // Signed in but no accessible outlet, and no invite was accepted: no-access.
  if (cafe === null && !alreadyOnOnboarding) {
    return <NoAccess />;
  }
  if (needsOnboarding && !alreadyOnOnboarding) {
    return null;
  }
  return <>{children}</>;
}
