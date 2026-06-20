import { Trans } from '@lingui/react/macro';
import { SectionHeading } from './section-heading';

const LETTERS = ['A', 'B', 'C'];

export function Testimonials() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading>
          <Trans>Dipakai pemilik kafe seperti Anda</Trans>
        </SectionHeading>
        <div className="grid gap-5 md:grid-cols-3">
          {LETTERS.map((letter) => (
            <figure key={letter} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
              <blockquote className="text-[15px] leading-relaxed">
                <Trans>[Contoh testimoni. Ganti dengan kutipan pelanggan asli sebelum tayang.]</Trans>
              </blockquote>
              <figcaption className="mt-auto flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-bold">
                  {letter}
                </span>
                <span className="text-sm">
                  <span className="block font-semibold"><Trans>Nama Pemilik</Trans></span>
                  <span className="block text-muted-foreground"><Trans>Nama Kafe, Kota</Trans></span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          <Trans>Placeholder. Akan diganti dengan testimoni pelanggan asli.</Trans>
        </p>
      </div>
    </section>
  );
}
