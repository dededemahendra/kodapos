import type { ReactNode } from 'react';
import { type ShotId, shotSrc } from '~/lib/shots';

/**
 * The framed-screenshot chrome hero.tsx and ai-spotlight.tsx each hand-copy.
 * `fadeFrom` differs between them (55% vs 60%) so it stays a prop rather than
 * being unified away.
 */
export function ScreenshotFrame({
  children,
  fadeFrom = 60,
}: {
  children: ReactNode;
  fadeFrom?: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card">
      {children}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-background"
        style={{
          backgroundImage: `linear-gradient(to bottom, transparent ${fadeFrom}%, var(--background))`,
        }}
      />
    </div>
  );
}

/**
 * A captured app screenshot. Renders a light and a dark file and lets CSS pick,
 * because the viewer's theme is a class on <html>, not a media query the browser
 * can resolve at request time.
 *
 * `alt` is required and must describe what the screen SHOWS. These images are
 * the evidence for a feature claim, not decoration.
 */
export function Shot({
  id,
  alt,
  priority = false,
}: {
  id: ShotId;
  alt: string;
  priority?: boolean;
}) {
  const common = {
    alt,
    width: 1440,
    height: 900,
    loading: priority ? ('eager' as const) : ('lazy' as const),
    className: 'w-full',
  };
  return (
    <>
      <img {...common} src={shotSrc(id, 'light')} className={`${common.className} dark:hidden`} />
      <img
        {...common}
        src={shotSrc(id, 'dark')}
        className={`${common.className} hidden dark:block`}
      />
    </>
  );
}
