import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_admin/users')({
  component: () => <div>Users</div>,
});
