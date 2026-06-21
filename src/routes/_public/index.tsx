import { createFileRoute } from '@tanstack/react-router';
import { HOMEPAGE_JSON_LD, seo } from '~/lib/seo';
import { AiSpotlight } from '~/components/marketing/ai-spotlight';
import { CtaBand } from '~/components/marketing/cta-band';
import { Faq } from '~/components/marketing/faq';
import { FeatureSection } from '~/components/marketing/feature-section';
import { Hero } from '~/components/marketing/hero';
import { HowItWorks } from '~/components/marketing/how-it-works';
import { MarketingHeader } from '~/components/marketing/marketing-header';
import { MarketingFooter } from '~/components/marketing/marketing-footer';
import { Pricing } from '~/components/marketing/pricing';
import { Testimonials } from '~/components/marketing/testimonials';
import { WhyIndonesia } from '~/components/marketing/why-indonesia';

export const Route = createFileRoute('/_public/')({
  head: () => seo({ title: 'kodapos, POS pintar untuk kafe dan resto', path: '/' }),
  component: PublicHome,
});

function PublicHome() {
  return (
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
  );
}
