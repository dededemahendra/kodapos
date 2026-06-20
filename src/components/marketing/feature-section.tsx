import { Trans } from '@lingui/react/macro';
import { Brain, Package, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionHeading } from './section-heading';

const PILLARS: { icon: ReactNode; title: ReactNode; desc: ReactNode }[] = [
  {
    icon: <Zap className="size-5" />,
    title: <Trans>Jual lebih cepat</Trans>,
    desc: (
      <Trans>
        Kasir, meja, layar dapur, dan pesan mandiri lewat QR. Terima QRIS, tunai, atau split tanpa
        ribet.
      </Trans>
    ),
  },
  {
    icon: <Package className="size-5" />,
    title: <Trans>Jaga margin</Trans>,
    desc: (
      <Trans>
        Lacak stok bahan dan resep, hitung harga pokok otomatis, dan lihat margin tiap menu.
      </Trans>
    ),
  },
  {
    icon: <Brain className="size-5" />,
    title: <Trans>Pahami bisnis Anda</Trans>,
    desc: (
      <Trans>
        Laporan penjualan dan laba rugi yang jelas, plus asisten AI dan prakiraan permintaan.
      </Trans>
    ),
  },
];

const FEATURES: { title: ReactNode; desc: ReactNode }[] = [
  { title: <Trans>Kasir cepat</Trans>, desc: <Trans>Antarmuka ringan yang siap dipakai di tablet, HP, atau laptop.</Trans> },
  { title: <Trans>Manajemen meja</Trans>, desc: <Trans>Buka, gabung, dan pindah meja. Pantau status tiap pesanan.</Trans> },
  { title: <Trans>Layar dapur</Trans>, desc: <Trans>Pesanan langsung tampil di dapur, rapi dan urut.</Trans> },
  { title: <Trans>Pesan mandiri QR</Trans>, desc: <Trans>Pelanggan memesan dari meja lewat kode QR.</Trans> },
  { title: <Trans>Stok dan resep</Trans>, desc: <Trans>Stok bahan berkurang otomatis dari resep tiap menu.</Trans> },
  { title: <Trans>QRIS dinamis</Trans>, desc: <Trans>Terima pembayaran QRIS langsung dari kasir.</Trans> },
  { title: <Trans>Loyalitas dan poin</Trans>, desc: <Trans>Kumpulkan pelanggan dan beri poin serta hadiah.</Trans> },
  { title: <Trans>Kartu hadiah</Trans>, desc: <Trans>Jual dan tukarkan saldo kartu hadiah.</Trans> },
  { title: <Trans>Shift dan absensi</Trans>, desc: <Trans>Buka tutup shift, jam kerja, dan serah terima kas.</Trans> },
  { title: <Trans>Promo dan diskon</Trans>, desc: <Trans>Atur promo, diskon manual, dan biaya layanan.</Trans> },
  { title: <Trans>Laporan dan laba rugi</Trans>, desc: <Trans>Penjualan, produk, kasir, dan laba rugi harian.</Trans> },
  { title: <Trans>Asisten AI</Trans>, desc: <Trans>Tanya data Anda dan dapatkan saran stok dengan kunci API sendiri.</Trans> },
];

export function FeatureSection() {
  return (
    <section id="fitur" className="scroll-mt-16 border-y border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading sub={<Trans>Dari pesanan pertama sampai laporan akhir bulan.</Trans>}>
          <Trans>Semua yang dibutuhkan kafe Anda, dalam satu tempat</Trans>
        </SectionHeading>
        <div className="grid gap-5 md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-6">
              <div className="mb-3.5 flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                {p.icon}
              </div>
              <h3 className="text-base font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={i} className="bg-card p-5">
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
