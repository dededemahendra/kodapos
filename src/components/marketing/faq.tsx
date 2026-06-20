import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { SectionHeading } from './section-heading';

const QA: { q: ReactNode; a: ReactNode }[] = [
  { q: <Trans>Apakah perlu perangkat khusus?</Trans>, a: <Trans>Tidak. kodapos berjalan di browser, jadi bisa dipakai di tablet, HP, atau laptop yang sudah Anda punya.</Trans> },
  { q: <Trans>Bagaimana cara pindah dari sistem lama?</Trans>, a: <Trans>Anda cukup membuat menu dan stok awal. Tim kami siap membantu proses perpindahan lewat WhatsApp.</Trans> },
  { q: <Trans>Apakah mendukung QRIS?</Trans>, a: <Trans>Ya. kodapos mendukung QRIS statis dan dinamis, plus tunai, split, dan kartu hadiah.</Trans> },
  { q: <Trans>Apakah data saya aman?</Trans>, a: <Trans>Data tersimpan aman di cloud dan hanya bisa diakses oleh akun kafe Anda.</Trans> },
  { q: <Trans>Bisakah dipakai banyak kasir?</Trans>, a: <Trans>Bisa. Atur staf, peran, dan shift, lalu pantau aktivitas tiap kasir.</Trans> },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading>
          <Trans>Pertanyaan umum</Trans>
        </SectionHeading>
        <div className="mx-auto max-w-2xl">
          {QA.map((item, i) => (
            <div key={i} className="border-b border-border py-5">
              <h3 className="text-base font-semibold">{item.q}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
