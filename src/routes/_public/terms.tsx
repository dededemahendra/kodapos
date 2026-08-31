import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { LegalPage } from '~/components/legal/legal-page';
import { useLocale } from '~/components/locale-provider';
import { TERMS } from '~/content/legal/terms';
import { seo } from '~/lib/seo';
import { headTitle, usePageTitle } from '~/lib/use-page-title';

const TITLE = msg`Syarat Layanan`;

export const Route = createFileRoute('/_public/terms')({
  head: () =>
    seo({
      title: headTitle(TITLE),
      description:
        'Syarat Layanan kodapos: ketentuan penggunaan aplikasi kasir (POS) untuk kafe dan resto.',
      path: '/terms',
    }),
  component: TermsPage,
});

function TermsPage() {
  usePageTitle(TITLE);
  const { locale } = useLocale();
  return <LegalPage doc={TERMS[locale]} />;
}
