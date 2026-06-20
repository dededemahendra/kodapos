import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { SectionHeading } from './section-heading';

const STEPS: { title: ReactNode; desc: ReactNode }[] = [
  { title: <Trans>Daftar dan atur menu</Trans>, desc: <Trans>Buat akun, lalu tambahkan menu, harga, dan stok dalam hitungan menit.</Trans> },
  { title: <Trans>Mulai berjualan</Trans>, desc: <Trans>Terima pesanan di kasir, meja, atau lewat QR. Bayar dengan QRIS atau tunai.</Trans> },
  { title: <Trans>Pantau dan kembangkan</Trans>, desc: <Trans>Lihat laporan harian dan biarkan AI menyarankan stok serta menu terlaris.</Trans> },
];

export function HowItWorks() {
  return (
    <section id="cara" className="scroll-mt-16 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading sub={<Trans>Tanpa pelatihan panjang, tanpa pemasangan rumit.</Trans>}>
          <Trans>Mulai dalam tiga langkah</Trans>
        </SectionHeading>
        <div className="grid gap-7 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={i}>
              <div className="mb-3.5 flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {i + 1}
              </div>
              <h3 className="text-base font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
