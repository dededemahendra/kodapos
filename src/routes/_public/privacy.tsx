import { createFileRoute } from '@tanstack/react-router';
import { LegalPage } from '~/components/legal/legal-page';
import { useLocale } from '~/components/locale-provider';
import { PRIVACY } from '~/content/legal/privacy';
import { seo } from '~/lib/seo';

export const Route = createFileRoute('/_public/privacy')({
  head: () =>
    seo({
      title: 'Kebijakan Privasi, kodapos',
      description:
        'Kebijakan Privasi kodapos: bagaimana kami mengumpulkan, menggunakan, dan melindungi data pribadi sesuai UU PDP.',
      path: '/privacy',
    }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { locale } = useLocale();
  return <LegalPage doc={PRIVACY[locale]} />;
}
