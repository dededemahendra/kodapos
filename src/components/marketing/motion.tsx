'use client';

import { MotionConfig, motion } from 'motion/react';
import type { ReactNode } from 'react';

/** Trigger once when the element is 80px inside the viewport. */
export const VP = { once: true, margin: '-80px' } as const;

/**
 * The scroll-reveal wrapper every marketing section repeats by hand: honours
 * the user's reduced-motion preference, then fades and rises once on entry.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={VP}
        transition={{ duration: 0.5, ease: 'easeOut', delay }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
