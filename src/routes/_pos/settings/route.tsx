import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_pos/settings')({
  component: SettingsLayout,
});

// No settings-level rail here: the main app sidebar's "Pengaturan" submenu
// already navigates between settings pages, and the General page provides its
// own section rail. This avoids a redundant double sidebar.
function SettingsLayout() {
  return (
    <div className="p-6">
      <Outlet />
    </div>
  );
}
