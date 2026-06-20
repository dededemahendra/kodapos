import { Trans } from '@lingui/react/macro';
import { Check } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Badge } from '~/components/ui/badge';

/** Shared viewport settings: trigger once when the element is 80px inside the viewport */
const VP = { once: true, margin: '-80px' } as const;

const ADVANTAGES: { title: ReactNode; desc: ReactNode }[] = [
  {
    title: <Trans>QRIS bawaan</Trans>,
    desc: <Trans>Statis dan dinamis, langsung dari kasir tanpa alat tambahan.</Trans>,
  },
  {
    title: <Trans>Bahasa Indonesia</Trans>,
    desc: <Trans>Seluruh aplikasi dalam Bahasa Indonesia, mudah dipakai semua staf.</Trans>,
  },
  {
    title: <Trans>Prakiraan sadar cuaca</Trans>,
    desc: <Trans>AI membaca pola cuaca lokal untuk memperkirakan permintaan harian.</Trans>,
  },
  {
    title: <Trans>Struk digital</Trans>,
    desc: <Trans>Kirim struk lewat email atau WhatsApp ke pelanggan Anda.</Trans>,
  },
  {
    title: <Trans>Dukungan WhatsApp</Trans>,
    desc: <Trans>Bantuan langsung lewat WhatsApp saat Anda membutuhkannya.</Trans>,
  },
  {
    title: <Trans>Tanpa perangkat khusus</Trans>,
    desc: <Trans>Cukup tablet, HP, atau laptop yang sudah Anda punya.</Trans>,
  },
];

export function WhyIndonesia() {
  return (
    <MotionConfig reducedMotion="user">
      <section className="border-y border-border bg-muted/30 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex flex-col items-start gap-4">
            <Badge variant="secondary">
              <Trans>Untuk Indonesia</Trans>
            </Badge>
            <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
              <Trans>Dibuat untuk kafe dan resto di Indonesia</Trans>
            </h2>
            <p className="max-w-xl text-lg text-muted-foreground">
              <Trans>Bukan sekadar terjemahan. kodapos paham cara kerja usaha lokal.</Trans>
            </p>
            <motion.div
              className="grid grid-cols-1 gap-x-10 gap-y-8 pt-8 sm:grid-cols-2 lg:grid-cols-3"
              initial="hidden"
              whileInView="visible"
              viewport={VP}
              variants={{
                visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
              }}
            >
              {ADVANTAGES.map((item, i) => (
                <motion.div
                  // biome-ignore lint/suspicious/noArrayIndexKey: static list
                  key={i}
                  className="flex items-start gap-3"
                  variants={{
                    hidden: { opacity: 0, y: 12 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
                  }}
                >
                  <Check className="mt-1 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
