import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react';
import { MenuBoard } from '~/components/menu-board/menu-board';
import { Skeleton } from '~/components/ui/skeleton';

// Standalone full-screen customer-facing menu board. Lives at the top level
// (NOT under _pos) so it renders bare, with no app sidebar/chrome, while still
// inheriting Convex/auth context from __root. Staff open it on the device
// driving the TV, go fullscreen, and leave it; the session persists across
// restarts. Convex reactivity keeps it live when the menu changes.
export const Route = createFileRoute('/menu-board')({
  component: MenuBoardPage,
});

function MenuBoardPage() {
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
