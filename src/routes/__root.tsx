import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { I18nProvider } from '@lingui/react';
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { convex } from '~/lib/convex';
import { i18n } from '~/lib/i18n';
import globalsCss from '~/styles/globals.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'kodapos' },
    ],
    links: [{ rel: 'stylesheet', href: globalsCss }],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3 text-center p-6">
      <h1 className="text-2xl font-bold">Halaman tidak ditemukan</h1>
      <p className="text-fg-muted text-sm">URL yang kamu buka tidak ada di kodapos.</p>
      <Link to="/" className="text-brand-700 underline">
        Kembali ke beranda
      </Link>
    </main>
  );
}

function RootComponent() {
  return (
    <RootDocument>
      <I18nProvider i18n={i18n}>
        <ConvexAuthProvider client={convex}>
          <Outlet />
        </ConvexAuthProvider>
      </I18nProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
