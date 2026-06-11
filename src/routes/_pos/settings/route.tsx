import { createFileRoute, Outlet } from '@tanstack/react-router';
import { RequirePermission } from '~/components/permission/require-permission';

export const Route = createFileRoute('/_pos/settings')({
  component: SettingsLayout,
});

// No settings-level rail here: the main app sidebar's "Pengaturan" submenu
// already navigates between settings pages, and the General page provides its
// own section rail. This avoids a redundant double sidebar.
function SettingsLayout() {
  return (
    <RequirePermission owner>
      <div className="p-6">
        <Outlet />
      </div>
    </RequirePermission>
  );
}
