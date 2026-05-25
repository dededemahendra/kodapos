import { Trans } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Coffee } from 'lucide-react';
import { Button } from '~/components/ui/button';

export const Route = createFileRoute('/_public/')({
  component: PublicHome,
});

function PublicHome() {
  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <header className="flex items-center gap-3">
        <Coffee className="size-8 text-primary" />
        <h1 className="text-3xl font-bold text-primary">kodapos</h1>
      </header>
      <p className="text-muted-foreground mt-2">
        <Trans>AI-native POS untuk kafe & QSR Indonesia.</Trans>
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link to="/signin">
            <Trans>Masuk</Trans>
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/signup">
            <Trans>Daftar</Trans>
          </Link>
        </Button>
      </div>
    </main>
  );
}
