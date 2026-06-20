import { Trans } from '@lingui/react/macro';
import { CloudSun, CreditCard, Languages, Receipt } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionHeading } from './section-heading';

const POINTS: { icon: ReactNode; title: ReactNode; desc: ReactNode }[] = [
  { icon: <CreditCard className="size-5" />, title: <Trans>QRIS bawaan</Trans>, desc: <Trans>Statis dan dinamis, langsung dari kasir tanpa alat tambahan.</Trans> },
  { icon: <Languages className="size-5" />, title: <Trans>Bahasa Indonesia</Trans>, desc: <Trans>Seluruh aplikasi dalam Bahasa Indonesia, mudah dipakai semua staf.</Trans> },
  { icon: <CloudSun className="size-5" />, title: <Trans>Prakiraan sadar cuaca</Trans>, desc: <Trans>AI membaca pola cuaca lokal untuk memperkirakan permintaan harian.</Trans> },
  { icon: <Receipt className="size-5" />, title: <Trans>Struk digital</Trans>, desc: <Trans>Kirim struk lewat email atau WhatsApp ke pelanggan Anda.</Trans> },
];

export function WhyIndonesia() {
  return (
    <section className="border-y border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading sub={<Trans>Bukan sekadar terjemahan. kodapos paham cara kerja usaha lokal.</Trans>}>
          <Trans>Dibuat untuk kafe dan resto di Indonesia</Trans>
        </SectionHeading>
        <div className="grid gap-5 sm:grid-cols-2">
          {POINTS.map((p, i) => (
            <div key={i} className="flex gap-4 rounded-xl border border-border bg-card p-5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                {p.icon}
              </div>
              <div>
                <h3 className="text-base font-semibold">{p.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
