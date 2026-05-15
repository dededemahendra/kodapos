import { createFileRoute } from '@tanstack/react-router';
import { Coffee } from 'lucide-react';
import { Button } from '~/components/ui/button';

export const Route = createFileRoute('/_public/')({
  component: PublicHome,
});

function PublicHome() {
  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <header className="flex items-center gap-3">
        <Coffee className="size-8 text-brand-600" />
        <h1 className="text-3xl font-bold text-brand-600">kodapos</h1>
      </header>
      <p className="text-fg-muted mt-2">
        AI-native POS untuk kafe & QSR Indonesia.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <a href="/signin">Masuk</a>
        </Button>
        <Button variant="outline" asChild>
          <a href="/signup">Daftar</a>
        </Button>
      </div>
    </main>
  );
}
