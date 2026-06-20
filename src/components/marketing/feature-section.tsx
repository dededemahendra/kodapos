import { Trans } from '@lingui/react/macro';
import { CloudSun, ShieldCheck } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { Card, CardContent } from '~/components/ui/card';
import { SectionHeading } from './section-heading';

/** Shared viewport settings: trigger once when the element is 80px inside the viewport */
const VP = { once: true, margin: '-80px' } as const;

export function FeatureSection() {
  return (
    <MotionConfig reducedMotion="user">
      <section id="fitur" className="scroll-mt-16 border-y border-border bg-muted/30 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <SectionHeading sub={<Trans>Dari pesanan pertama sampai laporan akhir bulan.</Trans>}>
            <Trans>Semua yang dibutuhkan kafe Anda, dalam satu tempat</Trans>
          </SectionHeading>

          <div className="grid grid-cols-6 gap-3">
            {/* Row 1: three cards */}

            {/* Card 1: Stat card - Berbasis web */}
            <Card className="col-span-full sm:col-span-3 lg:col-span-2">
              <CardContent className="p-6">
                <div className="mb-4 flex flex-col items-start gap-2">
                  {/* "100%" fades + rises slightly */}
                  <motion.span
                    className="text-4xl font-bold text-primary leading-none"
                    initial="hidden"
                    whileInView="visible"
                    viewport={VP}
                    variants={{
                      hidden: { opacity: 0, y: 6 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
                    }}
                  >
                    100%
                  </motion.span>
                  {/* Underline draws in via pathLength 0 → 1 */}
                  <svg
                    viewBox="0 0 80 12"
                    className="w-20 h-3 text-primary"
                    fill="none"
                    aria-hidden="true"
                  >
                    <motion.path
                      d="M2,8 C16,3 32,11 48,6 C60,2 70,9 78,7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="opacity-50"
                      initial="hidden"
                      whileInView="visible"
                      viewport={VP}
                      variants={{
                        hidden: { pathLength: 0, opacity: 0 },
                        visible: {
                          pathLength: 1,
                          opacity: 1,
                          transition: { duration: 0.7, ease: 'easeOut', delay: 0.2 },
                        },
                      }}
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium">
                  <Trans>Berbasis web</Trans>
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  <Trans>Jalan di tablet, HP, atau laptop.</Trans>
                </p>
              </CardContent>
            </Card>

            {/* Card 2: ShieldCheck card - Aman secara bawaan */}
            <Card className="col-span-full sm:col-span-3 lg:col-span-2">
              <CardContent className="p-6">
                <div className="mb-4 relative flex items-center justify-center" style={{ width: 64, height: 64 }}>
                  {/* Soft radial glow behind the shield */}
                  <div className="absolute inset-0 rounded-full bg-primary/5" />
                  {/* Outermost ring - fades in last (inside-out stagger reversed = outside-in reveal) */}
                  <motion.div
                    className="absolute inset-0 rounded-full border border-border/20"
                    initial="hidden"
                    whileInView="visible"
                    viewport={VP}
                    variants={{
                      hidden: { scale: 0.6, opacity: 0 },
                      visible: {
                        scale: 1,
                        opacity: 1,
                        transition: { duration: 0.6, ease: [0.34, 1.56, 0.64, 1], delay: 0.0 },
                      },
                    }}
                  />
                  {/* Middle ring */}
                  <motion.div
                    className="absolute inset-[8px] rounded-full border border-border/40"
                    initial="hidden"
                    whileInView="visible"
                    viewport={VP}
                    variants={{
                      hidden: { scale: 0.5, opacity: 0 },
                      visible: {
                        scale: 1,
                        opacity: 1,
                        transition: { duration: 0.55, ease: [0.34, 1.56, 0.64, 1], delay: 0.1 },
                      },
                    }}
                  />
                  {/* Inner ring */}
                  <motion.div
                    className="absolute inset-[16px] rounded-full border-2 border-border"
                    initial="hidden"
                    whileInView="visible"
                    viewport={VP}
                    variants={{
                      hidden: { scale: 0.4, opacity: 0 },
                      visible: {
                        scale: 1,
                        opacity: 1,
                        transition: { duration: 0.5, ease: [0.34, 1.56, 0.64, 1], delay: 0.2 },
                      },
                    }}
                  />
                  {/* Shield icon pops in last */}
                  <motion.div
                    className="relative z-10"
                    initial="hidden"
                    whileInView="visible"
                    viewport={VP}
                    variants={{
                      hidden: { scale: 0.85, opacity: 0 },
                      visible: {
                        scale: 1,
                        opacity: 1,
                        transition: { duration: 0.45, ease: [0.34, 1.56, 0.64, 1], delay: 0.3 },
                      },
                    }}
                  >
                    <ShieldCheck className="size-6 text-primary" />
                  </motion.div>
                </div>
                <h3 className="text-lg font-medium">
                  <Trans>Aman secara bawaan</Trans>
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  <Trans>Data kafe tersimpan aman di cloud dan hanya bisa diakses oleh akun Anda.</Trans>
                </p>
              </CardContent>
            </Card>

            {/* Card 3: Area-chart card - Laporan waktu nyata */}
            <Card className="col-span-full sm:col-span-3 lg:col-span-2">
              <CardContent className="p-6">
                <div className="mb-4 h-12 w-full text-primary">
                  <svg
                    viewBox="0 0 120 44"
                    className="h-full w-full"
                    fill="none"
                    aria-hidden="true"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {/* Faint baseline */}
                    <line x1="0" y1="42" x2="120" y2="42" stroke="currentColor" strokeWidth="1" className="opacity-20" />
                    {/* Gradient fill area fades in after the line */}
                    <motion.path
                      d="M0,36 C10,34 20,30 30,26 C40,22 50,28 60,20 C70,14 80,18 90,10 C100,4 110,8 120,5 L120,42 L0,42 Z"
                      fill="url(#areaGradient)"
                      initial="hidden"
                      whileInView="visible"
                      viewport={VP}
                      variants={{
                        hidden: { opacity: 0 },
                        visible: { opacity: 1, transition: { duration: 0.5, delay: 0.55 } },
                      }}
                    />
                    {/* Sparkline draws in */}
                    <motion.path
                      d="M0,36 C10,34 20,30 30,26 C40,22 50,28 60,20 C70,14 80,18 90,10 C100,4 110,8 120,5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial="hidden"
                      whileInView="visible"
                      viewport={VP}
                      variants={{
                        hidden: { pathLength: 0, opacity: 0 },
                        visible: {
                          pathLength: 1,
                          opacity: 1,
                          transition: { duration: 0.7, ease: 'easeOut', delay: 0.1 },
                        },
                      }}
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium">
                  <Trans>Laporan waktu nyata</Trans>
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  <Trans>Penjualan, produk, dan laba rugi yang diperbarui setiap transaksi.</Trans>
                </p>
              </CardContent>
            </Card>

            {/* Row 2: two wide cards */}

            {/* Card 4: Demand forecast - Prakiraan permintaan */}
            <Card className="col-span-full lg:col-span-3">
              <CardContent className="p-6">
                <div className="mb-4 relative h-12 w-full text-primary">
                  {/* CloudSun fades in */}
                  <motion.div
                    className="absolute top-0 right-0"
                    initial="hidden"
                    whileInView="visible"
                    viewport={VP}
                    variants={{
                      hidden: { opacity: 0 },
                      visible: { opacity: 1, transition: { duration: 0.5, delay: 0.6 } },
                    }}
                  >
                    <CloudSun className="size-5 text-muted-foreground opacity-60" aria-hidden="true" />
                  </motion.div>
                  <svg
                    viewBox="0 0 180 44"
                    className="h-full w-full"
                    fill="none"
                    aria-hidden="true"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.20" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {/* Gradient fill beneath smooth curve fades in */}
                    <motion.path
                      d="M0,38 C20,36 40,34 60,30 C80,26 100,20 120,14 C140,8 160,6 180,3 L180,42 L0,42 Z"
                      fill="url(#forecastGradient)"
                      initial="hidden"
                      whileInView="visible"
                      viewport={VP}
                      variants={{
                        hidden: { opacity: 0 },
                        visible: { opacity: 1, transition: { duration: 0.5, delay: 0.55 } },
                      }}
                    />
                    {/* Trend line draws in */}
                    <motion.path
                      d="M0,38 C20,36 40,34 60,30 C80,26 100,20 120,14 C140,8 160,6 180,3"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial="hidden"
                      whileInView="visible"
                      viewport={VP}
                      variants={{
                        hidden: { pathLength: 0, opacity: 0 },
                        visible: {
                          pathLength: 1,
                          opacity: 1,
                          transition: { duration: 0.75, ease: 'easeOut', delay: 0.05 },
                        },
                      }}
                    />
                    {/* Faint baseline */}
                    <line x1="0" y1="42" x2="180" y2="42" stroke="currentColor" strokeWidth="1" className="opacity-20" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium">
                  <Trans>Prakiraan permintaan</Trans>
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  <Trans>AI memperkirakan permintaan harian dari pola penjualan dan cuaca lokal.</Trans>
                </p>
              </CardContent>
            </Card>

            {/* Card 5: Customer loyalty - Loyalitas pelanggan */}
            <Card className="col-span-full lg:col-span-3">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-4">
                  {/* Overlapping avatar stack - staggered pop in */}
                  <div className="flex -space-x-3">
                    {[
                      { initial: 'A', label: 'Ayu', delay: 0.0 },
                      { initial: 'S', label: 'Sari', delay: 0.1 },
                      { initial: 'R', label: 'Rian', delay: 0.2 },
                    ].map(({ initial, label, delay }) => (
                      <motion.div
                        key={label}
                        title={label}
                        className="flex size-10 items-center justify-center rounded-full bg-muted ring-2 ring-background text-sm font-semibold text-foreground"
                        initial="hidden"
                        whileInView="visible"
                        viewport={VP}
                        variants={{
                          hidden: { scale: 0.7, opacity: 0, y: 4 },
                          visible: {
                            scale: 1,
                            opacity: 1,
                            y: 0,
                            transition: { duration: 0.45, ease: [0.34, 1.56, 0.64, 1], delay },
                          },
                        }}
                      >
                        {initial}
                      </motion.div>
                    ))}
                  </div>
                  {/* Name pills fade in after avatars */}
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { name: 'Ayu', delay: 0.35 },
                      { name: 'Sari', delay: 0.42 },
                      { name: 'Rian', delay: 0.49 },
                    ].map(({ name, delay }) => (
                      <motion.span
                        key={name}
                        className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground"
                        initial="hidden"
                        whileInView="visible"
                        viewport={VP}
                        variants={{
                          hidden: { opacity: 0 },
                          visible: { opacity: 1, transition: { duration: 0.4, delay } },
                        }}
                      >
                        {name}
                      </motion.span>
                    ))}
                  </div>
                </div>
                <h3 className="text-lg font-medium">
                  <Trans>Loyalitas pelanggan</Trans>
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  <Trans>Kumpulkan pelanggan, beri poin dan hadiah, lalu buat mereka kembali.</Trans>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
