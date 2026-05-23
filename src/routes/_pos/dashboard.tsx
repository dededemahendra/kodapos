import { createFileRoute, Navigate } from '@tanstack/react-router';

// Phase 0 dashboard kept as a redirect — old links (and the signin flow before
// it was updated) used /dashboard as the landing page. /menu is now the home.
export const Route = createFileRoute('/_pos/dashboard')({
  component: DashboardRedirect,
});

function DashboardRedirect() {
  return <Navigate to="/menu" replace />;
}
