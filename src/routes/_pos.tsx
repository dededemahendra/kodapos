import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { Authenticated, AuthLoading, Unauthenticated, useConvex, useQuery } from 'convex/react';
import { type ReactNode, useEffect } from 'react';
import { AppSidebar } from '~/components/app-sidebar';
import { Separator } from '~/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '~/components/ui/sidebar';
import { Spinner } from '~/components/ui/spinner';

export const Route = createFileRoute('/_pos')({
  component: PosLayout,
});

// Routes where the sidebar would get in the way (full-screen flows).
const NAV_HIDDEN_PREFIXES = ['/onboarding', '/pin', '/shift'];

// Top-level route → label shown in the header bar. Anything not in this map
// falls back to no title (keeps the SidebarTrigger alone).
const PAGE_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: '/sale', title: 'Kasir' },
  { prefix: '/history', title: 'Riwayat' },
  { prefix: '/menu', title: 'Menu' },
  { prefix: '/inventory', title: 'Inventaris' },
  { prefix: '/settings', title: 'Pengaturan' },
];

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
  const pageTitle = PAGE_TITLES.find(
    (m) => path === m.prefix || path.startsWith(`${m.prefix}/`)
  )?.title;

  return (
    <div data-density="compact" className="min-h-screen bg-muted">
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
          <Spinner />
          <span>Memuat sesi…</span>
        </div>
      </AuthLoading>
      <Unauthenticated>
        <SignedOutRedirect />
      </Unauthenticated>
      <Authenticated>
        <OnboardingGate>
          {showNav ? (
            <SidebarProvider
              style={{ '--sidebar-width': '18rem' } as React.CSSProperties}
            >
              <AppSidebar />
              <SidebarInset>
                <header className="flex h-12 items-center gap-2 border-b border-border bg-background px-4">
                  <SidebarTrigger />
                  {pageTitle ? (
                    <>
                      <Separator orientation="vertical" className="h-4" />
                      <h1 className="text-sm font-semibold">{pageTitle}</h1>
                    </>
                  ) : null}
                </header>
                <Outlet />
              </SidebarInset>
            </SidebarProvider>
          ) : (
            <Outlet />
          )}
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
