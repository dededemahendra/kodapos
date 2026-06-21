import { Trans } from '@lingui/react/macro';
import { ArrowUp, ClipboardList, CreditCard, Globe, Plus, Sparkles } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { SectionHeading } from './section-heading';

/** Trigger once when 80px inside viewport */
const VP = { once: true, margin: '-80px' } as const;

// Card 1 illustration: menu setup mock
function MenuSetupIllustration() {
  const items = [
    { w: 'w-20' },
    { w: 'w-16' },
    { w: 'w-24' },
  ];
  return (
    <motion.div
      className="rounded-lg border border-border bg-muted/40 p-3 space-y-2"
      aria-hidden="true"
      initial="hidden"
      whileInView="visible"
      viewport={VP}
      variants={{ visible: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } } }}
    >
      {items.map((item, i) => (
        <motion.div
          // biome-ignore lint/suspicious/noArrayIndexKey: static illustration rows
          key={i}
          className="flex items-center gap-2"
          variants={{
            hidden: { opacity: 0, x: -6 },
            visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: 'easeOut' } },
          }}
        >
          {/* thumbnail circle */}
          <div className="size-6 shrink-0 rounded-full bg-primary/20" />
          {/* name bar */}
          <div className={`h-2 ${item.w} rounded-full bg-muted-foreground/20`} />
          {/* spacer */}
          <div className="flex-1" />
          {/* price bar */}
          <div className="h-2 w-10 rounded-full bg-primary/30" />
        </motion.div>
      ))}
    </motion.div>
  );
}

// Card 2 illustration: order + payment mock

/** 5×5 grid of dots imitating a QR-code pattern */
function QrDots() {
  return (
    <div className="grid grid-cols-5 gap-0.5" aria-hidden="true">
      {Array.from({ length: 25 }).map((_, i) => {
        // corner marks + a few interior cells to suggest QR
        const corner =
          [0, 1, 5, 6, 4, 9, 15, 16, 20, 21].includes(i) ||
          [3, 4, 8, 9, 18, 19, 23, 24].includes(i);
        const interior = [12, 7, 17, 11, 13].includes(i);
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static illustration grid
            key={i}
            className={`size-1 rounded-[1px] ${corner || interior ? 'bg-primary' : 'bg-primary/20'}`}
          />
        );
      })}
    </div>
  );
}

function OrderPaymentIllustration() {
  return (
    <motion.div
      className="rounded-lg border border-border bg-muted/40 p-3 space-y-2"
      aria-hidden="true"
      initial="hidden"
      whileInView="visible"
      viewport={VP}
      variants={{
        hidden: { opacity: 0, y: 6 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut', delay: 0.1 } },
      }}
    >
      {/* two line items */}
      <div className="flex items-center gap-2">
        <div className="h-2 w-20 rounded-full bg-muted-foreground/25" />
        <div className="flex-1" />
        <div className="h-2 w-10 rounded-full bg-muted-foreground/25" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 w-14 rounded-full bg-muted-foreground/20" />
        <div className="flex-1" />
        <div className="h-2 w-8 rounded-full bg-muted-foreground/20" />
      </div>
      {/* total row */}
      <div className="flex items-center gap-2 border-t border-border pt-2">
        <div className="h-2 w-8 rounded-full bg-foreground/30" />
        <div className="flex-1" />
        <div className="h-2 w-12 rounded-full bg-primary/50" />
      </div>
      {/* QRIS hint */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="rounded-md border border-border bg-background p-1.5">
          <QrDots />
        </div>
        <div className="rounded-full bg-primary px-3 py-1 text-[10px] font-semibold leading-none text-primary-foreground">
          Bayar
        </div>
      </div>
    </motion.div>
  );
}

// Card 3 illustration: reports + AI chat mock
function ReportsAiIllustration() {
  const bars = [42, 68, 54, 88, 62] as const;
  return (
    <div className="space-y-2" aria-hidden="true">
      {/* mini bar chart */}
      <motion.div
        className="flex h-10 items-end gap-1.5"
        initial="hidden"
        whileInView="visible"
        viewport={VP}
        variants={{ visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
      >
        {bars.map((h, i) => (
          <motion.div
            // biome-ignore lint/suspicious/noArrayIndexKey: static bar heights
            key={i}
            className={`flex-1 origin-bottom rounded-sm ${i % 2 === 0 ? 'bg-primary' : 'bg-primary/40'}`}
            style={{ height: `${h}%` }}
            variants={{
              hidden: { scaleY: 0, opacity: 0 },
              visible: { scaleY: 1, opacity: 1, transition: { duration: 0.4, ease: 'easeOut' } },
            }}
          />
        ))}
      </motion.div>

      {/* AI chat input: prompt on its own line, controls below */}
      <motion.div
        className="rounded-lg border border-border bg-muted/40 p-2"
        initial="hidden"
        whileInView="visible"
        viewport={VP}
        variants={{
          hidden: { opacity: 0, y: 4 },
          visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut', delay: 0.35 } },
        }}
      >
        <p className="line-clamp-1 px-0.5 text-[11px] leading-relaxed text-foreground/80">
          <Trans>Menu apa yang paling laris minggu ini?</Trans>
        </p>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-1.5">
            <Button variant="outline" size="icon" className="size-6 [&_svg]:size-3" tabIndex={-1}>
              <Plus aria-hidden="true" />
            </Button>
            <Button variant="outline" size="icon" className="size-6 [&_svg]:size-3" tabIndex={-1}>
              <Globe aria-hidden="true" />
            </Button>
          </div>
          <Button size="icon" className="size-6 [&_svg]:size-3" tabIndex={-1}>
            <ArrowUp aria-hidden="true" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// Main component

const STEPS = [
  {
    badge: '1',
    icon: ClipboardList,
    title: <Trans>Daftar dan atur menu</Trans>,
    desc: <Trans>Buat akun, lalu tambahkan menu, harga, dan stok dalam hitungan menit.</Trans>,
    illustration: <MenuSetupIllustration />,
  },
  {
    badge: '2',
    icon: CreditCard,
    title: <Trans>Mulai berjualan</Trans>,
    desc: <Trans>Terima pesanan di kasir, meja, atau lewat QR. Bayar dengan QRIS atau tunai.</Trans>,
    illustration: <OrderPaymentIllustration />,
  },
  {
    badge: '3',
    icon: Sparkles,
    title: <Trans>Pantau dan kembangkan</Trans>,
    desc: <Trans>Lihat laporan harian dan biarkan AI menyarankan stok serta menu terlaris.</Trans>,
    illustration: <ReportsAiIllustration />,
  },
] as const;

export function HowItWorks() {
  return (
    <MotionConfig reducedMotion="user">
      <section id="how-it-works" className="scroll-mt-16 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <SectionHeading sub={<Trans>Tanpa pelatihan panjang, tanpa pemasangan rumit.</Trans>}>
            <Trans>Mulai dalam tiga langkah</Trans>
          </SectionHeading>

          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.badge}
                  initial="hidden"
                  whileInView="visible"
                  viewport={VP}
                  variants={{
                    hidden: { opacity: 0, y: 16 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.45, ease: 'easeOut', delay: i * 0.1 },
                    },
                  }}
                >
                  <Card className="h-full bg-card border-border">
                    <CardContent className="p-5 flex flex-col gap-4">
                      {/* badge + icon row */}
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold leading-none text-primary-foreground">
                          {step.badge}
                        </span>
                        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                      </div>

                      {/* title + description */}
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{step.desc}</p>
                      </div>

                      {/* mini illustration */}
                      <div className="mt-auto">
                        {step.illustration}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
