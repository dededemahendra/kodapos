import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { ArrowUp, Check, Sparkles } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { Button } from '~/components/ui/button';

/** Shared viewport settings: trigger once when the element is 80px inside the viewport */
const VP = { once: true, margin: '-80px' } as const;

function makeSlide(delay: number) {
  return {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.55, ease: [0.25, 0, 0, 1] as [number, number, number, number], delay },
    },
  };
}

export function AiSpotlight() {
  return (
    <MotionConfig reducedMotion="user">
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-10 md:grid-cols-2">
            {/* Left column: copy */}
            <div>
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={VP}
                variants={makeSlide(0)}
              >
                <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  <Trans>Asisten AI</Trans>
                </span>
              </motion.div>

              <motion.h2
                className="mt-4 text-3xl font-extrabold tracking-tight md:text-4xl"
                initial="hidden"
                whileInView="visible"
                viewport={VP}
                variants={makeSlide(0.08)}
              >
                <Trans>Tanya apa saja tentang bisnis Anda</Trans>
              </motion.h2>

              <motion.p
                className="mt-4 text-muted-foreground"
                initial="hidden"
                whileInView="visible"
                viewport={VP}
                variants={makeSlide(0.16)}
              >
                <Trans>
                  Asisten AI kodapos menjawab dari data kafe Anda sendiri. Tahu penjualan, stok, dan
                  menu terlaris tanpa membuka laporan.
                </Trans>
              </motion.p>

              <motion.ul
                className="mt-6 space-y-3"
                initial="hidden"
                whileInView="visible"
                viewport={VP}
                variants={makeSlide(0.24)}
              >
                {[
                  <Trans key="a">Jawaban instan dari data Anda</Trans>,
                  <Trans key="b">Saran stok otomatis</Trans>,
                  <Trans key="c">Pakai kunci API Anda sendiri</Trans>,
                ].map((label, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static decorative list
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600/10">
                      <Check className="size-3 text-emerald-600" />
                    </span>
                    {label}
                  </li>
                ))}
              </motion.ul>

              <motion.div
                className="mt-8"
                initial="hidden"
                whileInView="visible"
                viewport={VP}
                variants={makeSlide(0.32)}
              >
                <Button asChild>
                  <Link to="/signup">
                    <Trans>Mulai gratis</Trans>
                  </Link>
                </Button>
              </motion.div>
            </div>

            {/* Right column: AI chat mockup */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={VP}
              variants={makeSlide(0.12)}
            >
              <div className="rounded-2xl border border-border bg-card p-4 shadow-xl">
                {/* Chat window header */}
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="size-4 text-primary" />
                  </span>
                  <span className="text-sm font-medium">
                    <Trans>Asisten AI</Trans>
                  </span>
                </div>

                {/* Messages */}
                <div className="flex flex-col gap-3">
                  {/* User bubble */}
                  <motion.div
                    className="flex justify-end"
                    initial="hidden"
                    whileInView="visible"
                    viewport={VP}
                    variants={makeSlide(0.2)}
                  >
                    <div className="ml-auto max-w-[80%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">
                      <Trans>Berapa penjualan hari ini?</Trans>
                    </div>
                  </motion.div>

                  {/* AI bubble 1 */}
                  <motion.div
                    className="flex justify-start"
                    initial="hidden"
                    whileInView="visible"
                    viewport={VP}
                    variants={makeSlide(0.3)}
                  >
                    <div className="max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm text-foreground">
                      <Trans>
                        Penjualan hari ini Rp 2.450.000, naik 12% dari kemarin. Menu terlaris: Es
                        Kopi Susu.
                      </Trans>
                    </div>
                  </motion.div>

                  {/* AI bubble 2 */}
                  <motion.div
                    className="flex justify-start"
                    initial="hidden"
                    whileInView="visible"
                    viewport={VP}
                    variants={makeSlide(0.4)}
                  >
                    <div className="max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm text-foreground">
                      <Trans>Stok susu cukup untuk 2 hari. Mau saya buatkan daftar belanja?</Trans>
                    </div>
                  </motion.div>
                </div>

                {/* Faux input bar */}
                <div className="mt-4 flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2">
                  <span className="flex-1 text-sm text-muted-foreground">
                    <Trans>Tanya tentang penjualan, stok, pelanggan...</Trans>
                  </span>
                  <Button size="icon" className="size-7 shrink-0 rounded-full" tabIndex={-1}>
                    <ArrowUp className="size-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
