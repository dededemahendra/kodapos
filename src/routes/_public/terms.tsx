import { createFileRoute } from '@tanstack/react-router';
import { LegalPage } from '~/components/legal/legal-page';
import { useLocale } from '~/components/locale-provider';
import { TERMS } from '~/content/legal/terms';
import { seo } from '~/lib/seo';

export const Route = createFileRoute('/_public/terms')({
  head: () =>
    seo({
      title: 'Syarat Layanan, kodapos',
      description:
        'Syarat Layanan kodapos: ketentuan penggunaan aplikasi kasir (POS) untuk kafe dan resto.',
      path: '/terms',
    }),
  component: TermsPage,
});

function TermsPage() {
  const { locale } = useLocale();
  return <LegalPage doc={TERMS[locale]} />;
}
