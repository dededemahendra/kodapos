import { Navigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import type { ReactNode } from 'react';
import { Spinner } from '~/components/ui/spinner';

export function ShiftGate({ children }: { children: ReactNode }) {
  const current = useQuery(api.shifts.current, {});
  if (current === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-2 text-fg-muted">
        <Spinner />
        <span>Memuat shift…</span>
      </div>
    );
  }
  if (current === null) {
    return <Navigate to="/shift/open" replace />;
  }
  return <>{children}</>;
}
