import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { createFileRoute } from '@tanstack/react-router';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { PageHeader } from '~/components/ui/page-header';
import { CHANGELOG, localized } from '~/lib/changelog';
import type { Locale } from '~/lib/locale';
import { getDateFormat } from '~/lib/preferences';

export const Route = createFileRoute('/_pos/changelog')({
  component: ChangelogPage,
});

const DATE_FORMATS: Record<string, Intl.DateTimeFormatOptions> = {
  'dmy-short': { day: 'numeric', month: 'short', year: 'numeric' },
  'dmy-numeric': { day: '2-digit', month: '2-digit', year: 'numeric' },
  iso: { year: 'numeric', month: '2-digit', day: '2-digit' },
};

function ChangelogPage() {
  const { i18n } = useLingui();
  const locale: Locale = i18n.locale === 'en' ? 'en' : 'id';
  const intlLocale = locale === 'en' ? 'en-US' : 'id-ID';
  const fmt = DATE_FORMATS[getDateFormat()] ?? DATE_FORMATS['dmy-short'];

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Pembaruan</Trans>}
        description={<Trans>Apa yang baru di kodapos.</Trans>}
      />
      <div className="mx-auto max-w-2xl space-y-4">
        {CHANGELOG.map((entry) => (
          <Card key={entry.version}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">v{entry.version}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.date).toLocaleDateString(intlLocale, fmt)}
                </span>
              </div>
              <CardTitle className="text-base">{localized(entry.title, locale)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {localized(entry.summary, locale)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
