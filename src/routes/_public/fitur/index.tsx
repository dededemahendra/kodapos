import { Trans } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import { MarketingFooter } from '~/components/marketing/marketing-footer';
import { MarketingHeader } from '~/components/marketing/marketing-header';
import { Reveal } from '~/components/marketing/motion';
import { Card, CardContent } from '~/components/ui/card';
import { seo } from '~/lib/seo';

export const Route = createFileRoute('/_public/fitur/')({
  head: () =>
    seo({
      title: 'Fitur kodapos, semua yang dibutuhkan kafe Anda',
      description:
        'Kasir, pesanan, stok, laporan, pelanggan, dan tim. Lihat apa saja yang bisa kodapos lakukan untuk kafe dan resto Anda.',
      path: '/fitur',
      // Unpublished until public/shots/ is captured: the page's screenshots
      // do not exist yet. Drop `noindex` when they land.
      noindex: true,
    }),
  component: FiturIndex,
});

// Only pesanan has a page so far. The rest render as plain cards rather than
// dead links — a link that goes nowhere is worse than no link.
const AREAS = [
  { to: '/fitur/pesanan' as const, title: <Trans>Pesanan, meja, dan dapur</Trans>,
    body: <Trans>Meja, pesan mandiri lewat QR, reservasi, dan layar dapur.</Trans> },
  { to: null, title: <Trans>Kasir dan pembayaran</Trans>,
    body: <Trans>Kasir cepat, QRIS, struk, printer, dan shift kas.</Trans> },
  { to: null, title: <Trans>Stok dan resep</Trans>,
    body: <Trans>Inventaris, resep dan HPP, limbah, pembelian, dan pemasok.</Trans> },
  { to: null, title: <Trans>Laporan dan AI</Trans>,
    body: <Trans>Laporan waktu nyata, asisten AI, dan prakiraan permintaan.</Trans> },
  { to: null, title: <Trans>Pelanggan dan loyalitas</Trans>,
    body: <Trans>Pelanggan, poin dan hadiah, promo, dan kartu hadiah.</Trans> },
  { to: null, title: <Trans>Tim dan outlet</Trans>,
    body: <Trans>Staf, peran, jam kerja, shift, dan banyak outlet.</Trans> },
];

function FiturIndex() {
  return (
    <div id="top" className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            <Trans>Semua yang dibutuhkan kafe Anda</Trans>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            <Trans>Dari pesanan pertama sampai laporan akhir bulan.</Trans>
          </p>
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {AREAS.map((area, i) => {
            const body = (
              <CardContent className="p-6">
                <h2 className="font-semibold">{area.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{area.body}</p>
              </CardContent>
            );
            return (
              <Reveal key={i} delay={i * 0.05}>
                {area.to ? (
                  <Link to={area.to} className="block h-full transition-colors hover:border-primary">
                    <Card className="h-full">{body}</Card>
                  </Link>
                ) : (
                  <Card className="h-full">{body}</Card>
                )}
              </Reveal>
            );
          })}
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
