import { createFileRoute } from '@tanstack/react-router';
import { RequirePermission } from '~/components/permission/require-permission';
import { Dashboard } from '~/components/dashboard';

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
