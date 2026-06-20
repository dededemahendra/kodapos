'use client';

import { Children, type ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { cn } from '~/lib/utils';

const defaultContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const defaultItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

/**
 * Staggers its children into view on mount: the container orchestrates the
 * timing, each child animates with the item variant. Honors the user's
 * reduced-motion preference by rendering statically. Built on the installed
 * `motion` package; no extra dependency.
 */
export function AnimatedGroup({
  children,
  className,
  variants,
}: {
  children: ReactNode;
  className?: string;
  variants?: { container?: Variants; item?: Variants };
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={cn(className)}>{children}</div>;

  const container = variants?.container ?? defaultContainer;
  const item = variants?.item ?? defaultItem;

  return (
    <motion.div initial="hidden" animate="visible" variants={container} className={cn(className)}>
      {Children.map(children, (child, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static, non-reordering hero children
        <motion.div key={i} variants={item}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
