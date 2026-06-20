import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Button } from '~/components/ui/button';
import { RegisterPreview } from './register-preview';

const CAPABILITIES = [
  <Trans key="c1">Kasir</Trans>,
  <Trans key="c2">Meja</Trans>,
  <Trans key="c3">Layar dapur</Trans>,
  <Trans key="c4">Pesan mandiri QR</Trans>,
  <Trans key="c5">Stok dan resep</Trans>,
  <Trans key="c6">QRIS</Trans>,
  <Trans key="c7">Loyalitas</Trans>,
  <Trans key="c8">Laporan</Trans>,
];

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-6 pt-20 text-center">
      <span className="inline-block rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
        <Trans>POS untuk kafe dan resto</Trans>
      </span>
      <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
        <Trans>Jalankan kafe Anda, bukan kasirnya.</Trans>
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
        <Trans>
          Satu aplikasi untuk kasir, stok, dan laporan. Jual lebih cepat, jaga margin, dan ambil
          keputusan dengan bantuan AI.
        </Trans>
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link to="/signup"><Trans>Mulai gratis</Trans></Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="#fitur"><Trans>Lihat fitur</Trans></a>
        </Button>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        <Trans>Gratis selama akses awal. Tanpa kartu kredit.</Trans>
      </p>
      <RegisterPreview />
      <div className="mx-auto mt-9 flex max-w-2xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {CAPABILITIES.map((c, i) => (
          <span key={i} className="whitespace-nowrap">{c}</span>
        ))}
      </div>
    </section>
  );
}
