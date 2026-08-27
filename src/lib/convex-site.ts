/**
 * Convex serves function calls from `<deployment>.convex.cloud` and HTTP
 * actions from `<deployment>.convex.site`. Only the host differs, so the site
 * URL is derived rather than configured separately.
 */
export function toConvexSiteUrl(cloudUrl: string): string {
  return cloudUrl.replace(/\/+$/, '').replace('.convex.cloud', '.convex.site');
}

/** The deployment's HTTP-action origin, from the same env var as the client. */
export function convexSiteUrl(): string {
  return toConvexSiteUrl(import.meta.env.VITE_CONVEX_URL ?? '');
}
