// CORS for the one browser-facing HTTP route (`/ai/stream`). Every other route
// in `http.ts` is server-to-server and needs none of this.

/**
 * Whether a request's `Origin` may call the browser-facing routes.
 *
 * Matches the deployment's configured `SITE_URL` exactly (a prefix match would
 * let `https://kodapos.app.evil.example` through) plus any localhost port for
 * local development.
 */
export function isAllowedOrigin(origin: string | null, siteUrl: string | undefined): boolean {
  if (!origin) return false;
  if (siteUrl && origin === siteUrl.replace(/\/+$/, '')) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

/**
 * Echoes the request origin when allowlisted rather than sending `*`, and sets
 * `Vary: Origin` so a cache never serves one origin's response to another.
 * An origin that is not allowed simply gets no CORS header, which the browser
 * turns into the usual cross-origin block.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (!isAllowedOrigin(origin, process.env.SITE_URL)) return { vary: 'Origin' };
  return {
    'access-control-allow-origin': origin as string,
    vary: 'Origin',
  };
}

/** Preflight answer for a browser-facing route. */
export function preflightResponse(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(req.headers.get('Origin')),
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '86400',
    },
  });
}
