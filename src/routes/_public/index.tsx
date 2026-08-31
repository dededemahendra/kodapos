// biome-ignore-all lint/security/noDangerouslySetInnerHtml: JSON.stringify of a static, app-controlled JSON-LD object for SEO
import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { RedirectWhenAuthenticated } from '~/components/auth/redirect-when-authenticated';
import { AiSpotlight } from '~/components/marketing/ai-spotlight';
import { CtaBand } from '~/components/marketing/cta-band';
import { Faq } from '~/components/marketing/faq';
import { FeatureSection } from '~/components/marketing/feature-section';
import { Hero } from '~/components/marketing/hero';
import { HowItWorks } from '~/components/marketing/how-it-works';
import { MarketingFooter } from '~/components/marketing/marketing-footer';
import { MarketingHeader } from '~/components/marketing/marketing-header';
import { Pricing } from '~/components/marketing/pricing';
import { Testimonials } from '~/components/marketing/testimonials';
import { WhyIndonesia } from '~/components/marketing/why-indonesia';
import { HOMEPAGE_JSON_LD, seo } from '~/lib/seo';
import { headTitle, usePageTitle } from '~/lib/use-page-title';

const TITLE = msg`POS pintar untuk kafe dan resto`;

export const Route = createFileRoute('/_public/')({
  head: () => seo({ title: headTitle(TITLE), path: '/' }),
  component: PublicHome,
});

function PublicHome() {
  usePageTitle(TITLE);
  return (
    <>
      {/* Signed-in visitors skip the marketing page and land on the dashboard.
          Rendered here (not wrapping the markup) so the page still SSRs for SEO. */}
      <RedirectWhenAuthenticated />
      <div id="top" className="min-h-screen bg-background text-foreground">
        {/* Structured data: Organization + WebSite + SoftwareApplication. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(HOMEPAGE_JSON_LD) }}
        />
        <MarketingHeader />
        <main>
          <Hero />
          <FeatureSection />
          <AiSpotlight />
          <HowItWorks />
          <WhyIndonesia />
          <Testimonials />
          <Pricing />
          <Faq />
          <CtaBand />
        </main>
        <MarketingFooter />
      </div>
    </>
  );
}
