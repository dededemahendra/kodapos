import type { ReactNode } from 'react';
import { MotionConfig, motion, type Variants } from 'motion/react';

/** Trigger once when 80px inside viewport */
const VP = { once: true, margin: '-80px' } as const;

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

/** Centered section title (+ optional subtitle). Reveals on scroll, the title
 *  then the subtitle, matching the staggered entrance the section bodies use. */
export function SectionHeading({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className="mx-auto mb-11 max-w-2xl text-center"
        initial="hidden"
        whileInView="visible"
        viewport={VP}
        variants={container}
      >
        <motion.h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" variants={item}>
          {children}
        </motion.h2>
        {sub ? (
          <motion.p className="mt-3 text-lg text-muted-foreground" variants={item}>
            {sub}
          </motion.p>
        ) : null}
      </motion.div>
    </MotionConfig>
  );
}
