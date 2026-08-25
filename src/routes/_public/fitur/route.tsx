import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_public/fitur')({
  component: FiturLayout,
});

// Must literally render <Outlet /> — tests/routes/route-outlet.test.ts fails CI
// otherwise (see the /_pos/menu/modifiers bug it was written to catch).
function FiturLayout() {
  return <Outlet />;
}
