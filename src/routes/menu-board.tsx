import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react';
import { useEffect } from 'react';
import { MenuBoard } from '~/components/menu-board/menu-board';
import { Skeleton } from '~/components/ui/skeleton';
import { privatePage } from '~/lib/seo';
import { headTitle, usePageTitle } from '~/lib/use-page-title';

// How long to wait before reloading a failed board, to self-heal transient
// errors (network blip, token refresh, brief outlet suspension).
const RELOAD_AFTER_MS = 60000;

// Standalone full-screen customer-facing menu board. Lives at the top level
// (NOT under _pos) so it renders bare, with no app sidebar/chrome, while still
// inheriting Convex/auth context from __root. Staff open it on the device
// driving the TV, go fullscreen, and leave it; the session persists across
// restarts. Convex reactivity keeps it live when the menu changes.
const TITLE = msg`Papan Menu`;

export const Route = createFileRoute('/menu-board')({
  head: () => privatePage(headTitle(TITLE)),
  component: MenuBoardPage,
  // The board query can throw (auth/outlet errors, missing cafe). Without a
  // route-level boundary those throws bubble to __root's errorComponent,
  // which shows raw error text and "try again" / "dashboard" links: an app
  // error screen on a customer-facing TV. This boundary catches that render
  // error and shows a neutral fallback instead.
  errorComponent: BoardUnavailable,
});

function MenuBoardPage() {
  usePageTitle(TITLE);
  return (
    <>
      <AuthLoading>
        <BoardSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <SignedOutRedirect />
      </Unauthenticated>
      <Authenticated>
        <BoardData />
      </Authenticated>
    </>
  );
}

function BoardData() {
  const board = useQuery(api.menu.board.get, {});
  if (board === undefined) return <BoardSkeleton />;
  return <MenuBoard cafe={board.cafe} categories={board.categories} />;
}

function BoardSkeleton() {
  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex items-center gap-4 border-b px-8 py-5">
        <Skeleton className="h-12 w-12 rounded-md" />
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="grid flex-1 grid-cols-2 gap-6 p-8 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder count, order never changes
          <Skeleton key={i} className="h-full w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function SignedOutRedirect() {
  if (typeof window !== 'undefined') {
    window.location.replace('/signin');
  }
  return null;
}

function BoardUnavailable() {
  useEffect(() => {
    // Nobody is standing at the TV to click "try again", so reload on our
    // own after a wait, in case the failure was transient.
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      window.location.reload();
    }, RELOAD_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background">
      <p className="text-3xl font-semibold text-muted-foreground">
        <Trans>Menu segera hadir</Trans>
      </p>
    </div>
  );
}
