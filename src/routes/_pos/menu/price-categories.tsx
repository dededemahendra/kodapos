import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_pos/menu/price-categories')({
  component: PriceCategoriesLayout,
});

function PriceCategoriesLayout() {
  return <Outlet />;
}
