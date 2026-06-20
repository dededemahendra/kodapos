import { Trans } from '@lingui/react/macro';
import { MotionConfig, motion } from 'motion/react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '~/components/ui/accordion';
import { SectionHeading } from './section-heading';

const VP = { once: true, margin: '-80px' } as const;

const QA = [
  {
    value: 'item-1',
    q: <Trans>Apakah perlu perangkat khusus?</Trans>,
    a: <Trans>Tidak. kodapos berjalan di browser, jadi bisa dipakai di tablet, HP, atau laptop yang sudah Anda punya.</Trans>,
  },
  {
    value: 'item-2',
    q: <Trans>Bagaimana cara pindah dari sistem lama?</Trans>,
    a: <Trans>Anda cukup membuat menu dan stok awal. Tim kami siap membantu proses perpindahan lewat WhatsApp.</Trans>,
  },
  {
    value: 'item-3',
    q: <Trans>Apakah mendukung QRIS?</Trans>,
    a: <Trans>Ya. kodapos mendukung QRIS statis dan dinamis, plus tunai, split, dan kartu hadiah.</Trans>,
  },
  {
    value: 'item-4',
    q: <Trans>Apakah data saya aman?</Trans>,
    a: <Trans>Data tersimpan aman di cloud dan hanya bisa diakses oleh akun kafe Anda.</Trans>,
  },
  {
    value: 'item-5',
    q: <Trans>Bisakah dipakai banyak kasir?</Trans>,
    a: <Trans>Bisa. Atur staf, peran, dan shift, lalu pantau aktivitas tiap kasir.</Trans>,
  },
];

export function Faq() {
  return (
    <MotionConfig reducedMotion="user">
      <section id="faq" className="scroll-mt-16 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeading>
            <Trans>Pertanyaan umum</Trans>
          </SectionHeading>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <Accordion type="single" collapsible className="mx-auto max-w-2xl">
              {QA.map((item) => (
                <AccordionItem key={item.value} value={item.value}>
                  <AccordionTrigger>{item.q}</AccordionTrigger>
                  <AccordionContent>
                    <span className="text-muted-foreground">{item.a}</span>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>
    </MotionConfig>
  );
}
