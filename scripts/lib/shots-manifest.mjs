// scripts/lib/shots-manifest.mjs
/**
 * The screenshots the marketing pages embed. Single source of truth shared by
 * `scripts/capture-shots.mjs` (which produces the files) and, on the app
 * side, `src/lib/shots.ts` (which the `<Shot>` component reads), so a page
 * can never reference an image the pipeline does not capture.
 *
 * This is plain JavaScript, not a re-export from `src/lib/shots.ts`: the
 * capture script runs under Node and cannot safely regex-parse a TypeScript
 * object literal (a formatter reflowing it would silently break parsing and
 * the pipeline would capture the wrong set). The two manifests are kept in
 * sync by `tests/lib/shots.test.ts`, which fails if they ever drift apart —
 * add or edit a shot in both files, or the test catches it.
 *
 * `waitFor` is a selector that only appears once Convex data has painted —
 * `networkidle` alone fires while the screen is still an empty skeleton.
 * `order-public` has no fixed path: the capture script substitutes the
 * seeded table's qrToken at runtime.
 *
 * @typedef {{ id: string, path: string, waitFor: string }} ShotManifestEntry
 * @type {readonly ShotManifestEntry[]}
 */
export const SHOT_MANIFEST = [
  {
    id: 'tables',
    path: '/tables',
    waitFor: 'text=/Rp/',
  },
  {
    id: 'self-orders',
    path: '/self-orders',
    waitFor: 'text=/Terima/',
  },
  {
    id: 'kitchen',
    path: '/kitchen',
    waitFor: 'text=/Siap|Selesai/',
  },
  {
    id: 'reservations',
    path: '/reservations',
    waitFor: 'table',
  },
  {
    id: 'order-public',
    path: '/order/:qrToken',
    waitFor: 'text=/Rp/',
  },
];
