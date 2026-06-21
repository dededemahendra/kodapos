'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { cn } from '~/lib/utils';

interface MeteorsProps {
  number?: number;
  minDelay?: number;
  maxDelay?: number;
  minDuration?: number;
  maxDuration?: number;
  angle?: number;
  className?: string;
}

/**
 * Animated meteor streaks (magicui Meteors). Positions/timing are randomized on
 * the client in an effect, so the server renders nothing and there is no
 * hydration mismatch. Colored with theme tokens so it reads in light and dark.
 */
export function Meteors({
  number = 20,
  minDelay = 0.2,
  maxDelay = 1.2,
  minDuration = 2,
  maxDuration = 10,
  angle = 215,
  className,
}: MeteorsProps) {
  const [styles, setStyles] = useState<CSSProperties[]>([]);

  useEffect(() => {
    const next: CSSProperties[] = Array.from({ length: number }).map(() => ({
      '--angle': `${-angle}deg`,
      top: '-5%',
      left: `${Math.floor(Math.random() * 100)}%`,
      animationDelay: `${Math.random() * (maxDelay - minDelay) + minDelay}s`,
      animationDuration: `${Math.floor(Math.random() * (maxDuration - minDuration) + minDuration)}s`,
    })) as CSSProperties[];
    setStyles(next);
  }, [number, minDelay, maxDelay, minDuration, maxDuration, angle]);

  return (
    <>
      {styles.map((style, idx) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: positions are stable for the render
          key={idx}
          style={style}
          className={cn(
            'pointer-events-none absolute size-1 rotate-[var(--angle)] animate-meteor rounded-full bg-foreground/80 shadow-[0_0_6px_1px_var(--color-foreground)]',
            className,
          )}
        >
          <div className="pointer-events-none absolute top-1/2 h-0.5 w-[80px] -translate-y-1/2 bg-gradient-to-r from-foreground/70 to-transparent" />
        </span>
      ))}
    </>
  );
}
