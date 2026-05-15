import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_pos')({
  component: PosLayout,
});

function PosLayout() {
  return (
    <div data-density="compact" className="min-h-screen bg-surface">
      <Outlet />
    </div>
  );
}
