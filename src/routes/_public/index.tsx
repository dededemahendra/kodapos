import { createFileRoute } from '@tanstack/react-router';
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
  head: () => ({
    meta: [
      { title: 'kodapos, POS pintar untuk kafe dan resto' },
      {
        name: 'description',
        content:
          'Satu aplikasi untuk kasir, stok, dan laporan. Jual lebih cepat, jaga margin, dan ambil keputusan dengan bantuan AI.',
      },
    ],
  }),
  component: PublicHome,
});

function PublicHome() {
  return (
    <div id="top" className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main>
        <Hero />
        <FeatureSection />
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
