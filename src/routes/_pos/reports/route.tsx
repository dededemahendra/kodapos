import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_pos/reports')({
  component: () => <Outlet />,
});
