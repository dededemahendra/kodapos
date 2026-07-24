// The file and its `#pricing` anchor keep the "pricing" name even though the
// product is now presented as free: the anchor is linked from the header and
// footer and shared as kodapos.app/#pricing, and `location: 'pricing'` is a
// value in the analytics CtaLocation union collecting funnel data. Renaming
// would split the funnel for no user-visible gain. The name outlived the price.
import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { track } from '~/lib/analytics/track';

/** Shared viewport settings: trigger once when the element is 80px inside the viewport */
const VP = { once: true, margin: '-80px' } as const;

const FREE_FEATURES = [
  <Trans key="f1">Kasir, stok, dan laporan lengkap</Trans>,
  <Trans key="f2">Asisten AI dan prakiraan permintaan</Trans>,
  <Trans key="f3">Kelola banyak outlet</Trans>,
  <Trans key="f4">Meja, reservasi, dan pesan mandiri (QR)</Trans>,
  <Trans key="f5">Dukungan lewat WhatsApp</Trans>,
  <Trans key="f6">Tanpa kartu kredit</Trans>,
];

export function Pricing() {
  return (
    <MotionConfig reducedMotion="user">
      <section id="pricing" className="scroll-mt-16 border-y border-border bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            <Card className="mx-auto max-w-2xl">
              <CardContent className="flex flex-col items-center px-8 py-12 text-center">
                <Badge variant="outline" className="mb-4">
                  <Trans>Gratis</Trans>
                </Badge>
                <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                  <Trans>Gratis sepenuhnya</Trans>
                </h2>
                <p className="mt-3 text-lg text-muted-foreground">
                  <Trans>Semua fitur, tanpa biaya, tanpa kartu kredit.</Trans>
                </p>

                <ul className="mt-8 grid w-full max-w-md gap-2.5 text-left sm:grid-cols-2">
                  {FREE_FEATURES.map((item, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static list
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <Button asChild size="lg" className="mt-10">
                  <Link
                    to="/signin"
                    onClick={() =>
                      track('marketing_cta_clicked', { location: 'pricing', label: 'start_free' })
                    }
                  >
                    <Trans>Mulai gratis</Trans>
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>
    </MotionConfig>
  );
}
