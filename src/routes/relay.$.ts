import { createFileRoute } from '@tanstack/react-router';
import { resolveRelayTarget } from '../lib/analytics/relay';

/**
 * Request headers are forwarded by ALLOWLIST, which is the point rather than a
 * style preference. Requests to /relay are same-origin, so the browser attaches
 * kodapos.app session cookies automatically. A denylist that forgot `cookie`
 * would hand our session cookies to a third party — a privacy regression this
 * proxy introduces and that direct ingestion never had. An allowlist cannot
 * forget.
 */
const FORWARDED_REQUEST_HEADERS = ['content-type', 'content-encoding', 'accept'];

export const Route = createFileRoute('/relay/$')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const incoming = new URL(request.url);
        const target = resolveRelayTarget(incoming.pathname, incoming.search);
        if (!target) return new Response('Not found', { status: 404 });

        const headers = new Headers();
        for (const name of FORWARDED_REQUEST_HEADERS) {
          const value = request.headers.get(name);
          if (value) headers.set(name, value);
        }

        // Without this every event geolocates to a Cloudflare datacenter
        // instead of the visitor, because the Worker is the origin PostHog
        // sees. The captured data already carries $geoip_* properties, so this
        // preserves existing behavior rather than collecting anything new.
        const clientIp = request.headers.get('cf-connecting-ip');
        if (clientIp) headers.set('x-forwarded-for', clientIp);

        // Buffered rather than streamed: analytics payloads are small, and a
        // streaming body would need `duplex: 'half'` and its platform caveats
        // for no benefit at this size.
        const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
        const body = hasBody ? await request.arrayBuffer() : undefined;

        let upstream: Response;
        try {
          upstream = await fetch(target.url, { method: request.method, headers, body: body ?? null });
        } catch {
          // Never rethrow. An analytics outage must not surface as an error
          // page over a register mid-sale.
          return new Response('Bad gateway', { status: 502 });
        }

        const responseHeaders = new Headers();
        const contentType = upstream.headers.get('content-type');
        if (contentType) responseHeaders.set('content-type', contentType);
        responseHeaders.set(
          'cache-control',
          // Extension scripts are version-stamped, so a long cache is safe and
          // means most loads never reach PostHog at all. Caching an ingestion
          // response would silently drop events.
          target.cacheable ? 'public, max-age=86400, immutable' : 'no-store',
        );

        return new Response(upstream.body, {
          status: upstream.status,
          headers: responseHeaders,
        });
      },
    },
  },
});
