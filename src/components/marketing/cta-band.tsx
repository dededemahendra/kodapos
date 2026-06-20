import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Button } from '~/components/ui/button';

export function CtaBand() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-5xl rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          <Trans>Siap mempercepat kafe Anda?</Trans>
        </h2>
        <p className="mx-auto mt-3.5 max-w-md text-primary-foreground/75">
          <Trans>Coba kodapos gratis hari ini. Tanpa kartu kredit.</Trans>
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" variant="secondary">
            <a href="#fitur"><Trans>Lihat fitur</Trans></a>
          </Button>
          <Button asChild size="lg" className="bg-background text-foreground hover:bg-background/90">
            <Link to="/signup"><Trans>Mulai gratis</Trans></Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
