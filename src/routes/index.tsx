import { createFileRoute } from '@tanstack/react-router';
import { Coffee, Sparkles } from 'lucide-react';
import { Button } from '~/components/ui/button';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <header className="flex items-center gap-3">
        <Coffee className="size-8 text-brand-600" />
        <h1 className="text-3xl font-bold text-brand-600">kodapos</h1>
      </header>
      <p className="text-fg-muted mt-2">Phase 0 — foundations week.</p>

      <section className="mt-6 flex gap-3">
        <Button>
          <Sparkles className="size-4" /> Default
        </Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button size="pos">Bayar</Button>
      </section>
    </main>
  );
}
