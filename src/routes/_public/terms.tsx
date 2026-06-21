import { createFileRoute } from '@tanstack/react-router';
import { LegalPage } from '~/components/legal/legal-page';
import { useLocale } from '~/components/locale-provider';
import { TERMS } from '~/content/legal/terms';

export const Route = createFileRoute('/_public/terms')({
  head: () => ({
    meta: [
      { title: 'Terms of Service, kodapos' },
      { name: 'description', content: 'kodapos Terms of Service.' },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const { locale } = useLocale();
  return <LegalPage doc={TERMS[locale]} />;
}
