import { createFileRoute } from '@tanstack/react-router';
import { FeaturePage } from '~/components/marketing/feature-page';
import { PESANAN } from '~/content/marketing/pesanan';
import { seo } from '~/lib/seo';

export const Route = createFileRoute('/_public/fitur/pesanan')({
  // `head()` runs outside React and cannot read the active locale, so the
  // Indonesian copy is authoritative here — matching og:locale=id_ID in seo().
  // Sourced from the content module so the title has one home.
  head: () =>
    seo({
      title: PESANAN.seoTitle.id,
      description: PESANAN.seoDescription.id,
      path: '/fitur/pesanan',
    }),
  component: () => <FeaturePage content={PESANAN} />,
});
