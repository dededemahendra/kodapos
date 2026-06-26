import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { I18nProvider } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router';
import { useEffect, type ReactNode } from 'react';
import { LocaleProvider } from '~/components/locale-provider';
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

export const Route = createRootRoute({
  // The root route's errorComponent renders in place of RootComponent, so the
  // I18nProvider set up there is not in scope. Provide it here too, or every
  // <Trans> in this boundary crashes ("rendered without I18nProvider").
  errorComponent: ({ error, reset }) => (
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
  ),
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
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=JetBrains+Mono:wght@100..800&display=swap',
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
});

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
