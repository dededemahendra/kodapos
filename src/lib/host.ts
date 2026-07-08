/**
 * Map a hostname to which app should serve it. The admin app owns any host
 * whose first dot-separated label is exactly `admin` (e.g. `admin.kodapos.app`,
 * and `admin.localhost` in dev). Everything else is the tenant POS app. This is
 * the single source of truth for host -> app, used identically on the server
 * (request host) and client (`window.location.host`).
 */
export type HostApp = 'admin' | 'tenant';

export function resolveHostApp(host: string): HostApp {
  const hostname = host.toLowerCase().split(':')[0] ?? '';
  const firstLabel = hostname.split('.')[0] ?? '';
  return firstLabel === 'admin' ? 'admin' : 'tenant';
}

/** Client-side current app; `'tenant'` during SSR (no `window`). */
export function currentHostApp(): HostApp {
  if (typeof window === 'undefined') return 'tenant';
  return resolveHostApp(window.location.host);
}

/**
 * Whether the host -> app split is enforced (redirects between admin and tenant
 * hosts). Enforced ONLY in production builds: prod serves the admin app from the
 * `admin.*` subdomain and the tenant app from the apex. In local dev (`pnpm dev`)
 * this is off, so a single origin (`localhost:5173`) serves BOTH apps by path
 * (the admin routes /overview, /login, /businesses, /audit, /users are unique),
 * and no `admin.localhost` host is needed.
 */
export function hostRoutingEnforced(): boolean {
  return import.meta.env.PROD;
}
