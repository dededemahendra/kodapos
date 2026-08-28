// biome-ignore-all lint/security/noDangerouslySetInnerHtml: JSON.stringify of static, app-controlled JSON-LD objects for SEO
import { createFileRoute } from '@tanstack/react-router';
import { useLocale } from '~/components/locale-provider';
import { FeaturePage } from '~/components/marketing/feature-page';
import { PESANAN } from '~/content/marketing/pesanan';
import type { FaqBlock } from '~/content/marketing/types';
import type { Localized } from '~/lib/localized';
import { localized } from '~/lib/localized';
import { breadcrumbJsonLd, faqJsonLd, seo } from '~/lib/seo';

export const Route = createFileRoute('/_public/fitur/pesanan')({
  // `head()` runs outside React and cannot read the active locale, so the
  // Indonesian copy is authoritative here — matching og:locale=id_ID in seo().
  // Sourced from the content module so the title has one home.
  head: () =>
    seo({
      title: PESANAN.seoTitle.id,
      description: PESANAN.seoDescription.id,
      path: '/fitur/pesanan',
      // Unpublished until public/shots/ is captured: the page's screenshots
      // do not exist yet. Drop `noindex` when they land.
      noindex: true,
    }),
  component: PesananPage,
});

// Matches the "Fitur" nav label used elsewhere (marketing-header.tsx,
// marketing-footer.tsx), kept local since breadcrumbJsonLd needs a plain
// string rather than a <Trans> node.
const FITUR_LABEL: Localized = { id: 'Fitur', en: 'Features' };

function PesananPage() {
  const { locale } = useLocale();

  // Structured data is built from PESANAN's own `faq` section (in the active
  // locale) so the JSON-LD and the visible FAQ text can never diverge.
  const faqSection = PESANAN.sections.find(
    (section): section is FaqBlock => section.kind === 'faq'
  );
  const faqLd = faqJsonLd(
    (faqSection?.items ?? []).map((item) => ({
      q: localized(item.q, locale),
      a: localized(item.a, locale),
    }))
  );
  const breadcrumbLd = breadcrumbJsonLd([
    { name: localized(FITUR_LABEL, locale), path: '/fitur' },
    { name: localized(PESANAN.navLabel, locale), path: '/fitur/pesanan' },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {faqLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      ) : null}
      <FeaturePage content={PESANAN} />
    </>
  );
}
