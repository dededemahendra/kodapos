import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { useLocale } from '~/components/locale-provider';
import { MarketingFooter } from '~/components/marketing/marketing-footer';
import { MarketingHeader } from '~/components/marketing/marketing-header';
import { Badge } from '~/components/ui/badge';
import { CHANGELOG, localized } from '~/lib/changelog';
import { seo } from '~/lib/seo';

export const Route = createFileRoute('/_public/changelog')({
  head: () =>
    seo({
      title: 'Pembaruan kodapos, apa yang baru',
      description:
        'Catatan perubahan kodapos: fitur baru, peningkatan, dan perbaikan terbaru untuk POS kafe dan resto Anda.',
      path: '/changelog',
    }),
  component: ChangelogPage,
});

function ChangelogPage() {
  const { locale } = useLocale();
  const intlLocale = locale === 'en' ? 'en-US' : 'id-ID';
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(intlLocale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  return (
    <div id="top" className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main className="mx-auto max-w-2xl px-6 py-16 md:py-24">
        <header className="mb-14 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            <Trans>Pembaruan</Trans>
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">
            <Trans>Apa yang baru di kodapos</Trans>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-muted-foreground">
            <Trans>
              Fitur baru, peningkatan, dan perbaikan yang kami kirimkan untuk kafe dan resto Anda.
            </Trans>
          </p>
        </header>

        <ol className="relative border-l border-border">
          {CHANGELOG.map((entry) => (
            <li key={entry.version} className="ml-6 pb-12 last:pb-0">
              <span
                aria-hidden="true"
                className="absolute -left-[6.5px] mt-1.5 size-3 rounded-full border-2 border-background bg-primary"
              />
              <div className="flex items-center gap-2">
                <Badge variant="secondary">v{entry.version}</Badge>
                <time dateTime={entry.date} className="text-xs text-muted-foreground">
                  {fmtDate(entry.date)}
                </time>
              </div>
              <h2 className="mt-2 text-lg font-semibold">{localized(entry.title, locale)}</h2>
              <p className="mt-1 leading-relaxed text-muted-foreground">
                {localized(entry.summary, locale)}
              </p>
            </li>
          ))}
        </ol>
      </main>
      <MarketingFooter />
    </div>
  );
}
