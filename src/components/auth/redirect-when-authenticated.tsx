import { useNavigate } from '@tanstack/react-router';
import { Authenticated } from 'convex/react';
import { useEffect } from 'react';
import { LoadingCounter } from '~/components/ui/loading-counter';

/**
 * Client-side guard for PUBLIC pages: once the Convex Auth token resolves and
 * the visitor turns out to be signed in, send them to `/dashboard`.
 *
 * Rendered alongside a public page's content (not wrapping it), so the page
 * still server-renders for crawlers: an unauthenticated visitor never trips
 * `<Authenticated>`, and only a hydrated, signed-in browser redirects. The
 * full-screen cover masks the underlying public page during the brief hop.
 * Convex auth is a client-side token (no SSR cookie), so this client redirect is
 * the earliest point we know the visitor is signed in.
 */
function Redirect() {
  const navigate = useNavigate();
  useEffect(() => {
    // Client-side navigation (no full document reload); `replace` so the public
    // page doesn't linger in history behind the dashboard.
    void navigate({ to: '/dashboard', replace: true });
  }, [navigate]);
  // A plain `fixed inset-0` block (NOT a flex container): `LoadingCounter` is a
  // full-width, `min-h-screen` block, so it fills the cover. Nesting it inside a
  // centering flexbox would shrink it to its text width (a thin vertical strip).
  // `z-[60]` sits above the marketing header's `z-50`.
  return (
    <div className="fixed inset-0 z-[60]">
      <LoadingCounter />
    </div>
  );
}

export function RedirectWhenAuthenticated() {
  return (
    <Authenticated>
      <Redirect />
    </Authenticated>
  );
}
