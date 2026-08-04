import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_pos/menu/modifiers')({
  component: ModifierGroupsLayout,
});

function ModifierGroupsLayout() {
  return <Outlet />;
}
