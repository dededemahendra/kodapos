import { createFileRoute } from '@tanstack/react-router';
import { Dashboard } from '~/components/dashboard';
import { RequirePermission } from '~/components/permission/require-permission';

export const Route = createFileRoute('/_pos/dashboard')({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <RequirePermission perm="canViewReports">
      <Dashboard />
    </RequirePermission>
  );
}
