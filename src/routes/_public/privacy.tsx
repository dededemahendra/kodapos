import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { LegalPage } from '~/components/legal/legal-page';
import { useLocale } from '~/components/locale-provider';
import { PRIVACY } from '~/content/legal/privacy';
import { seo } from '~/lib/seo';
import { headTitle, usePageTitle } from '~/lib/use-page-title';

const TITLE = msg`Kebijakan Privasi`;

export const Route = createFileRoute('/_public/privacy')({
  head: () =>
    seo({
      title: headTitle(TITLE),
      description:
        'Kebijakan Privasi kodapos: bagaimana kami mengumpulkan, menggunakan, dan melindungi data pribadi sesuai UU PDP.',
      path: '/privacy',
    }),
  component: PrivacyPage,
});

function PrivacyPage() {
  usePageTitle(TITLE);
  const { locale } = useLocale();
  return <LegalPage doc={PRIVACY[locale]} />;
}
