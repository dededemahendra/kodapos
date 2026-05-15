import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_pos/dashboard')({
  component: Dashboard,
});

function Dashboard() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-fg-muted mt-2">
        Placeholder — wired up in later tasks.
      </p>
    </main>
  );
}
