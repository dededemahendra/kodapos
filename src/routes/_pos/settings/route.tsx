import { Trans } from '@lingui/react/macro';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_pos/settings')({
  component: SettingsLayout,
});

const linkClass = 'hover:underline';
const activeProps = { className: 'font-semibold' } as const;

function SettingsLayout() {
  return (
    <div className="p-6 flex gap-6">
      <aside className="w-48 shrink-0 flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          <Trans>Pengaturan</Trans>
        </h2>
        <nav className="flex flex-col gap-1 text-sm">
          <Link to="/settings/general" className={linkClass} activeProps={activeProps}>
            <Trans>Umum</Trans>
          </Link>
          <Link to="/settings/profile" className={linkClass} activeProps={activeProps}>
            <Trans>Profil kafe</Trans>
          </Link>
          <Link to="/settings/staff" className={linkClass} activeProps={activeProps}>
            <Trans>Staf</Trans>
          </Link>
        </nav>
      </aside>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
