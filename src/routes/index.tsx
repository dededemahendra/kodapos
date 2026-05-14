import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-brand-600">kodapos</h1>
      <p className="text-fg-muted mt-2">Phase 0 — foundations week.</p>
      <div className="mt-6 p-4 rounded-md bg-surface border border-border">
        Tailwind v4 verified.
      </div>
    </main>
  );
}
