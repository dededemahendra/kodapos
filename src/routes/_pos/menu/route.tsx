import { createFileRoute, Link, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_pos/menu')({
  component: MenuLayout,
});

function MenuLayout() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <nav className="flex gap-4 border-b border-border mb-4 text-sm">
        {/* `/menu` index route lands in Task 17; cast can drop once it exists. */}
        <Link
          to={'/menu' as never}
          className="py-2 px-1 -mb-px border-b-2 border-transparent hover:border-brand-500"
          activeProps={{ className: 'border-brand-500 font-semibold' }}
          activeOptions={{ exact: true }}
        >
          Items
        </Link>
        <Link
          to="/menu/categories"
          className="py-2 px-1 -mb-px border-b-2 border-transparent hover:border-brand-500"
          activeProps={{ className: 'border-brand-500 font-semibold' }}
        >
          Kategori
        </Link>
        <Link
          to="/menu/modifiers"
          className="py-2 px-1 -mb-px border-b-2 border-transparent hover:border-brand-500"
          activeProps={{ className: 'border-brand-500 font-semibold' }}
        >
          Grup Modifier
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}
