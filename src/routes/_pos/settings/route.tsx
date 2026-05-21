import { createFileRoute, Link, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_pos/settings')({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className="max-w-5xl mx-auto p-6 flex gap-6">
      <aside className="w-48 shrink-0">
        <h2 className="text-xs uppercase tracking-wide text-fg-muted mb-3">Pengaturan</h2>
        <nav className="flex flex-col gap-1 text-sm">
          <Link
            to="/settings/profile"
            className="hover:underline"
            activeProps={{ className: 'font-semibold' }}
          >
            Profil kafe
          </Link>
        </nav>
      </aside>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
