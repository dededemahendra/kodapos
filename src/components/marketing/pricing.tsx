import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';

/** Shared viewport settings: trigger once when the element is 80px inside the viewport */
const VP = { once: true, margin: '-80px' } as const;

const FREE_FEATURES = [
  <Trans key="f1">Semua fitur inti</Trans>,
  <Trans key="f2">Kasir, stok, dan laporan</Trans>,
  <Trans key="f3">Tanpa kartu kredit</Trans>,
  <Trans key="f4">Dukungan lewat WhatsApp</Trans>,
];

const PRO_FEATURES = [
  <Trans key="p1">Semua di paket Gratis</Trans>,
  <Trans key="p2">Asisten AI dan prakiraan permintaan</Trans>,
  <Trans key="p3">Kelola banyak cabang</Trans>,
  <Trans key="p4">Dukungan prioritas</Trans>,
];

const BUSINESS_FEATURES = [
  <Trans key="b1">Semua di paket Pro</Trans>,
  <Trans key="b2">Banyak outlet skala besar</Trans>,
  <Trans key="b3">Integrasi khusus</Trans>,
  <Trans key="b4">Manajer akun khusus</Trans>,
];

export function Pricing() {
  return (
    <MotionConfig reducedMotion="user">
      <section id="pricing" className="scroll-mt-16 border-y border-border bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          {/* Header */}
          <div className="mx-auto mb-11 max-w-2xl text-center">
            <Badge variant="outline" className="mb-4">
              <Trans>Harga</Trans>
            </Badge>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              <Trans>Harga sederhana</Trans>
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              <Trans>Mulai gratis hari ini. Paket Pro dan Bisnis segera hadir.</Trans>
            </p>
          </div>

          {/* 3-tier grid */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Tier 1: Free */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VP}
              transition={{ duration: 0.45, ease: 'easeOut', delay: 0 }}
            >
              <Card className="flex h-full flex-col">
                <CardHeader>
                  <CardTitle>
                    <Trans>Gratis</Trans>
                  </CardTitle>
                  <CardDescription>
                    <Trans>Untuk mulai berjualan.</Trans>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="mb-6">
                    <span className="text-4xl font-extrabold tracking-tight">
                      <Trans>Gratis</Trans>
                    </span>
                    <p className="mt-1 text-sm text-muted-foreground">
                      <Trans>selama akses awal</Trans>
                    </p>
                  </div>
                  <ul className="space-y-2.5">
                    {FREE_FEATURES.map((item, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: static list
                      <li key={i} className="flex items-start gap-2.5 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button asChild className="w-full">
                    <Link to="/signin">
                      <Trans>Mulai gratis</Trans>
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>

            {/* Tier 2: Pro (highlighted) */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VP}
              transition={{ duration: 0.45, ease: 'easeOut', delay: 0.1 }}
            >
              <Card className="relative flex h-full flex-col ring-2 ring-primary shadow-2xl">
                {/* Popular badge */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge>
                    <Trans>Populer</Trans>
                  </Badge>
                </div>
                <CardHeader className="pt-8">
                  <CardTitle>
                    <Trans>Pro</Trans>
                  </CardTitle>
                  <CardDescription>
                    <Trans>Untuk kafe yang berkembang.</Trans>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="mb-6">
                    <span className="text-4xl font-extrabold tracking-tight">
                      <Trans>Segera</Trans>
                    </span>
                    <p className="mt-1 text-sm text-muted-foreground">
                      <Trans>harga diumumkan nanti</Trans>
                    </p>
                  </div>
                  <ul className="space-y-2.5">
                    {PRO_FEATURES.map((item, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: static list
                      <li key={i} className="flex items-start gap-2.5 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button asChild className="w-full">
                    <Link to="/signin">
                      <Trans>Mulai gratis</Trans>
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>

            {/* Tier 3: Business */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VP}
              transition={{ duration: 0.45, ease: 'easeOut', delay: 0.2 }}
            >
              <Card className="flex h-full flex-col">
                <CardHeader>
                  <CardTitle>
                    <Trans>Bisnis</Trans>
                  </CardTitle>
                  <CardDescription>
                    <Trans>Untuk banyak outlet.</Trans>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="mb-6">
                    <span className="text-4xl font-extrabold tracking-tight">
                      <Trans>Hubungi kami</Trans>
                    </span>
                  </div>
                  <ul className="space-y-2.5">
                    {BUSINESS_FEATURES.map((item, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: static list
                      <li key={i} className="flex items-start gap-2.5 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" asChild className="w-full">
                    <a href="#">
                      <Trans>Hubungi kami</Trans>
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          </div>

          {/* Footer note */}
          <p className="mt-8 text-center text-sm text-muted-foreground">
            <Trans>Harga akan diumumkan sebelum masa akses awal berakhir.</Trans>
          </p>
        </div>
      </section>
    </MotionConfig>
  );
}
