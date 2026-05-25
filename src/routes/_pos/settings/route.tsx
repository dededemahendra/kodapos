import { createFileRoute, Link, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_pos/settings')({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className="p-6 flex gap-6">
      <aside className="w-48 shrink-0">
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Pengaturan</h2>
        <nav className="flex flex-col gap-1 text-sm">
          <Link
            to="/settings/profile"
            className="hover:underline"
            activeProps={{ className: 'font-semibold' }}
          >
            Profil kafe
          </Link>
          <Link
            to="/settings/staff"
            className="hover:underline"
            activeProps={{ className: 'font-semibold' }}
          >
            Staff
          </Link>
        </nav>
      </aside>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
