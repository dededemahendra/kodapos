import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { I18nProvider } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router';
import { useEffect, type ReactNode } from 'react';
import { AnalyticsProvider } from '~/components/analytics-provider';
import { LocaleProvider } from '~/components/locale-provider';
import { captureError } from '~/lib/analytics/client';
import { authStorage } from '~/lib/auth-storage';
import { convex } from '~/lib/convex';
import { i18n } from '~/lib/i18n';
import { applyDensity, applyTheme, getDensity, getTheme } from '~/lib/preferences';
import globalsCss from '~/styles/globals.css?url';
import faviconUrl from '~/assets/kodapos-logo.svg?url';

// Runs in <head> before paint to set the `.dark` class from the stored theme
// preference, avoiding a light/dark flash on first render. Self-invoking, no
// imports, wrapped in try/catch so storage being unavailable never breaks paint.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('kodapos.theme');var dark=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(dark)document.documentElement.classList.add('dark');}catch(e){}})();`;

// Runs in <head> before React (and before the marketing page renders/hydrates):
// if the visitor lands on the site root `/` while already signed in, jump
// straight to the dashboard. Convex Auth is a client-side token (no SSR cookie),
// so this is the earliest point we can know — redirecting here avoids rendering
// and hydrating the whole marketing page just to bounce off it. We match any
// `__convexAuthJWT_<namespace>` key (the namespace is the deployment URL) so we
// don't hard-code it. `<RedirectWhenAuthenticated>` remains the fallback for
// in-app (client-side) navigation, where this script does not re-run.
const AUTH_REDIRECT_SCRIPT = `(function(){try{if(location.pathname!=='/')return;var s=window.localStorage;for(var i=0;i<s.length;i++){var k=s.key(i);if(k&&k.lastIndexOf('__convexAuthJWT_',0)===0&&s.getItem(k)){location.replace('/dashboard');return;}}}catch(e){}})();`;

export const Route = createRootRoute({
  errorComponent: RootErrorBoundary,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'kodapos' },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: faviconUrl },
      { rel: 'stylesheet', href: globalsCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap',
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
});

/**
 * The root route's errorComponent renders in place of RootComponent, so the
 * I18nProvider set up there is not in scope. Provide it here too, or every
 * <Trans> in this boundary crashes ("rendered without I18nProvider").
 *
 * A named component rather than the inline arrow this used to be, because it
 * now needs an effect: React catches render-time throws and routes them here
 * instead of to window.onerror, so PostHog's exception autocapture never sees
 * them. Reporting from the boundary is the only way the crashes a user actually
 * notices reach error tracking. captureError is inert until analytics has
 * initialized, so this is a no-op in dev, in previews and on customer surfaces.
 */
function RootErrorBoundary({ error, reset }: { error: unknown; reset: () => void }) {
  // Keyed on `error` rather than mount so a second, different crash after a
  // reset() is reported too, instead of being swallowed as a re-render.
  useEffect(() => {
    captureError(error);
  }, [error]);

  return (
    <I18nProvider i18n={i18n}>
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 text-center p-6">
        <h1 className="text-2xl font-bold"><Trans>Terjadi kesalahan</Trans></h1>
        <p className="text-muted-foreground text-sm max-w-md">
          {error instanceof Error ? error.message : <Trans>Sesuatu yang tidak terduga terjadi.</Trans>}
        </p>
        <div className="flex gap-3">
          <button onClick={reset} className="text-primary underline text-sm"><Trans>Coba lagi</Trans></button>
          <Link to="/dashboard" className="text-primary underline text-sm"><Trans>Ke dasbor</Trans></Link>
        </div>
      </main>
    </I18nProvider>
  );
}

function NotFound() {
  // Like errorComponent, notFoundComponent renders outside RootComponent's
  // I18nProvider, so it needs its own.
  return (
    <I18nProvider i18n={i18n}>
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 text-center p-6">
        <h1 className="text-2xl font-bold"><Trans>Halaman tidak ditemukan</Trans></h1>
        <p className="text-muted-foreground text-sm"><Trans>URL yang kamu buka tidak ada di kodapos.</Trans></p>
        <Link to="/" className="text-primary underline">
          <Trans>Kembali ke beranda</Trans>
        </Link>
      </main>
    </I18nProvider>
  );
}

function RootComponent() {
  useEffect(() => {
    applyDensity(getDensity());
    applyTheme(getTheme());

    // Keep "system" theme tracking OS changes live.
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (getTheme() === 'system') applyTheme('system');
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return (
    <RootDocument>
      <I18nProvider i18n={i18n}>
        <LocaleProvider>
          <ConvexAuthProvider client={convex} storage={authStorage}>
            <AnalyticsProvider />
            <Outlet />
          </ConvexAuthProvider>
        </LocaleProvider>
      </I18nProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        {/* Auth redirect runs first: a signed-in visitor to `/` is sent to the
            dashboard before the marketing page renders. */}
        <script dangerouslySetInnerHTML={{ __html: AUTH_REDIRECT_SCRIPT }} />
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body translate="no">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
