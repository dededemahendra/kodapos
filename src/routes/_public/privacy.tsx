import { createFileRoute } from '@tanstack/react-router';
import { LegalPage } from '~/components/legal/legal-page';
import { useLocale } from '~/components/locale-provider';
import { PRIVACY } from '~/content/legal/privacy';

export const Route = createFileRoute('/_public/privacy')({
  head: () => ({
    meta: [
      { title: 'Privacy Policy, kodapos' },
      { name: 'description', content: 'kodapos Privacy Policy.' },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { locale } = useLocale();
  return <LegalPage doc={PRIVACY[locale]} />;
}
