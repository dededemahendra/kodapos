import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_admin/overview')({
  component: () => <div>Overview</div>,
});
