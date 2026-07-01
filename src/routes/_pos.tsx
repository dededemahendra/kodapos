import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { Trans } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from 'convex/react';
import { type ReactNode, useEffect, useState } from 'react';
import { AppHeader } from '~/components/app-header';
import { CommandPalette } from '~/components/command-palette';
import { AppSidebar } from '~/components/app-sidebar';
import { RegisterTopBar } from '~/components/sale/register-top-bar';
import { Button } from '~/components/ui/button';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
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
  const [acceptFailed, setAcceptFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  // After any sign-in, convert a pending manager invite into access. Idempotent
  // and safe to call once per mount; it no-ops for owners and the uninvited.
  // Only clear `accepting` on SUCCESS. On failure we keep `accepting` true so
  // the redirect stays blocked (falling through would turn an invited manager
  // into the owner of a placeholder cafe and permanently strand their invite),
  // and surface a retry (`acceptFailed`) instead of a silent infinite spinner.
  // `retryNonce` re-runs this effect when the user taps retry.
  useEffect(() => {
    let cancelled = false;
    setAcceptFailed(false);
    setAccepting(true);
    acceptInvites({})
      .then(() => {
        if (!cancelled) setAccepting(false);
      })
      .catch((err) => {
        console.error('acceptPendingInvites failed', err);
        if (!cancelled) setAcceptFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [acceptInvites, retryNonce]);

  const alreadyOnOnboarding = path.startsWith('/onboarding');
  const noCafe = cafe === null;
  // An owner mid-onboarding (cafe exists but not yet completed) OR a brand-new
  // cafe-less user (passwordless/Google register) both belong in the wizard.
  const needsOnboarding = cafe !== undefined && cafe !== null && !cafe.setupCompletedAt;
  const shouldOnboard = (noCafe || needsOnboarding) && !alreadyOnOnboarding;

  // Wait for `acceptPendingInvites` to resolve before redirecting: until then an
  // invited manager still reads cafe === null, and redirecting would strand
  // their invite (see the accept effect above).
  useEffect(() => {
    if (shouldOnboard && !accepting && typeof window !== 'undefined') {
      window.location.replace('/onboarding/profile');
    }
  }, [shouldOnboard, accepting]);

  // acceptPendingInvites failed (rare, transient): offer an explicit retry
  // rather than trapping the user on a silent spinner. `accepting` stays true,
  // so the onboarding redirect remains blocked while this shows.
  if (acceptFailed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          <Trans>Terjadi kesalahan saat memverifikasi akses Anda.</Trans>
        </p>
        <Button
          onClick={() => {
            setAcceptFailed(false);
            setRetryNonce((n) => n + 1);
          }}
        >
          <Trans>Coba lagi</Trans>
        </Button>
      </div>
    );
  }
  // Still resolving cafe state or still accepting invites: don't flash content
  // (an invited manager's cafe becomes non-null once accept commits).
  if (cafe === undefined || accepting) {
    return <LoadingCounter />;
  }
  if (shouldOnboard) {
    return null; // redirecting to /onboarding/profile
  }
  return <>{children}</>;
}
