import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { MotionConfig, motion, type Variants } from 'motion/react';
import { Button } from '~/components/ui/button';
import { DotPattern } from '~/components/ui/dot-pattern';

/** Trigger once when 80px inside viewport */
const VP = { once: true, margin: '-80px' } as const;

const band: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};
const content: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

export function CtaBand() {
  return (
    <MotionConfig reducedMotion="user">
      <section className="px-6 py-20">
        <motion.div
          className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground"
          initial="hidden"
          whileInView="visible"
          viewport={VP}
          variants={band}
        >
          <DotPattern
            cr={1.1}
            className="fill-primary-foreground/15 [mask-image:radial-gradient(420px_circle_at_center,white,transparent)]"
          />
          <motion.div className="relative z-10" variants={content}>
            <motion.h2
              className="text-3xl font-extrabold tracking-tight sm:text-4xl"
              variants={item}
            >
              <Trans>Siap mempercepat kafe Anda?</Trans>
            </motion.h2>
            <motion.p className="mx-auto mt-3.5 max-w-md text-primary-foreground/75" variants={item}>
              <Trans>Coba kodapos gratis hari ini. Tanpa kartu kredit.</Trans>
            </motion.p>
            <motion.div className="mt-6 flex flex-wrap justify-center gap-3" variants={item}>
              <Button asChild size="lg" variant="secondary">
                <a href="#features">
                  <Trans>Lihat fitur</Trans>
                </a>
              </Button>
              <Button asChild size="lg" className="bg-background text-foreground hover:bg-background/90">
                <Link to="/signin">
                  <Trans>Mulai gratis</Trans>
                </Link>
              </Button>
            </motion.div>
          </motion.div>
        </motion.div>
      </section>
    </MotionConfig>
  );
}
