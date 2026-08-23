// src/lib/shots.ts
/**
 * The screenshots the marketing pages embed. Single source of truth for the
 * `<Shot>` component (which renders them). The Node capture script
 * (`scripts/capture-shots.mjs`) does not import this file — it reads
 * `scripts/lib/shots-manifest.mjs` instead, because a Node script cannot
 * safely regex-parse a TypeScript object literal (a formatter reflowing it
 * would silently break parsing and the pipeline would capture the wrong
 * set). The two manifests are kept in sync by `tests/lib/shots.test.ts`,
 * which fails if they ever drift apart.
 *
 * `waitFor` is a selector that only appears once Convex data has painted —
 * `networkidle` alone fires while the screen is still an empty skeleton.
 * `order-public` has no fixed path: the capture script substitutes the
 * seeded table's qrToken at runtime.
 */
export interface Shot {
  readonly id: string;
  /** App path to visit. `:qrToken` is substituted by the capture script. */
  readonly path: string;
  readonly waitFor: string;
  /** Why this shot exists — read by whoever regenerates it later. */
  readonly description: string;
}

export const SHOTS = [
  {
    id: 'tables',
    path: '/tables',
    waitFor: 'text=/Rp/',
    description: 'Floor grid with occupied tables showing a running total.',
  },
  {
    id: 'self-orders',
    path: '/self-orders',
    waitFor: 'text=/Terima/',
    description: 'Pending QR self-order queue, including a pre-paid order.',
  },
  {
    id: 'kitchen',
    path: '/kitchen',
    waitFor: 'text=/Siap|Selesai/',
    description: 'Kitchen ticket board with new and ready tickets.',
  },
  {
    id: 'reservations',
    path: '/reservations',
    waitFor: 'table',
    description: 'Reservation list for the selected day with status badges.',
  },
  {
    id: 'order-public',
    path: '/order/:qrToken',
    waitFor: 'text=/Rp/',
    description: 'Customer-facing QR ordering page with the sellable menu.',
  },
] as const satisfies readonly Shot[];

export type ShotId = (typeof SHOTS)[number]['id'];

export type ShotTheme = 'light' | 'dark';

export function shotSrc(id: ShotId, theme: ShotTheme): string {
  return `/shots/${id}-${theme}.webp`;
}
