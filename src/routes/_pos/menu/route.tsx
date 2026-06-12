import { Trans } from '@lingui/react/macro';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { RequirePermission } from '~/components/permission/require-permission';

export const Route = createFileRoute('/_pos/menu')({
  component: MenuLayout,
});

function MenuLayout() {
  return (
    <RequirePermission perm="canEditMenu">
    <div className="p-6">
      <nav className="flex gap-4 border-b border-border mb-4 text-sm">
        <Link
          to="/menu"
          className="py-2 px-1 -mb-px border-b-2 border-transparent hover:border-ring"
          activeProps={{ className: 'border-ring font-semibold' }}
          activeOptions={{ exact: true }}
        >
          <Trans>Items</Trans>
        </Link>
        <Link
          to="/menu/categories"
          className="py-2 px-1 -mb-px border-b-2 border-transparent hover:border-ring"
          activeProps={{ className: 'border-ring font-semibold' }}
        >
          <Trans>Kategori</Trans>
        </Link>
        <Link
          to="/menu/modifiers"
          className="py-2 px-1 -mb-px border-b-2 border-transparent hover:border-ring"
          activeProps={{ className: 'border-ring font-semibold' }}
        >
          <Trans>Grup Modifier</Trans>
        </Link>
        <Link
          to="/menu/labels"
          className="py-2 px-1 -mb-px border-b-2 border-transparent hover:border-ring"
          activeProps={{ className: 'border-ring font-semibold' }}
        >
          <Trans>Label Barcode</Trans>
        </Link>
      </nav>
      <Outlet />
    </div>
    </RequirePermission>
  );
}
