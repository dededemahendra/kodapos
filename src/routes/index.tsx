import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <main style={{ padding: 32, fontFamily: 'system-ui, sans-serif' }}>
      <h1>kodapos</h1>
      <p>Phase 0 foundations week.</p>
    </main>
  );
}
