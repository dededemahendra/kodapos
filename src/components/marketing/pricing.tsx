import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '~/components/ui/button';
import { SectionHeading } from './section-heading';

const INCLUDED: ReactNode[] = [
  <Trans key="i1">Semua fitur terbuka</Trans>,
  <Trans key="i2">Tanpa biaya pemasangan</Trans>,
  <Trans key="i3">Tanpa kartu kredit</Trans>,
  <Trans key="i4">Dukungan lewat WhatsApp</Trans>,
];

export function Pricing() {
  return (
    <section id="harga" className="scroll-mt-16 border-y border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading sub={<Trans>Mulai sekarang tanpa biaya selama masa akses awal.</Trans>}>
          <Trans>Harga sederhana</Trans>
        </SectionHeading>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
          <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-semibold">
            <Trans>Akses awal</Trans>
          </span>
          <div className="mt-3.5 text-4xl font-extrabold tracking-tight"><Trans>Gratis</Trans></div>
          <div className="text-sm text-muted-foreground"><Trans>untuk saat ini</Trans></div>
          <ul className="my-6 space-y-2.5 text-left">
            {INCLUDED.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Button asChild size="lg" className="w-full">
            <Link to="/signup"><Trans>Mulai gratis</Trans></Link>
          </Button>
          <p className="mt-3.5 text-xs text-muted-foreground">
            <Trans>Harga akan diumumkan sebelum masa akses awal berakhir.</Trans>
          </p>
        </div>
      </div>
    </section>
  );
}
