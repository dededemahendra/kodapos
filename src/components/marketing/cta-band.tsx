import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Button } from '~/components/ui/button';
import { DotPattern } from '~/components/ui/dot-pattern';

export function CtaBand() {
  return (
    <section className="px-6 py-20">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground">
        <DotPattern
          cr={1.1}
          className="fill-primary-foreground/15 [mask-image:radial-gradient(420px_circle_at_center,white,transparent)]"
        />
        <div className="relative z-10">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            <Trans>Siap mempercepat kafe Anda?</Trans>
          </h2>
          <p className="mx-auto mt-3.5 max-w-md text-primary-foreground/75">
            <Trans>Coba kodapos gratis hari ini. Tanpa kartu kredit.</Trans>
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="secondary">
              <a href="#features">
                <Trans>Lihat fitur</Trans>
              </a>
            </Button>
            <Button asChild size="lg" className="bg-background text-foreground hover:bg-background/90">
              <Link to="/signup">
                <Trans>Mulai gratis</Trans>
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
