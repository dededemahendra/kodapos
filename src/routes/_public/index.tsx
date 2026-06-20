import { createFileRoute } from '@tanstack/react-router';
import { Hero } from '~/components/marketing/hero';
import { MarketingHeader } from '~/components/marketing/marketing-header';
import { MarketingFooter } from '~/components/marketing/marketing-footer';

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
        {/* <FeatureSection /> Task 3 */}
        {/* <HowItWorks /> Task 4 */}
        {/* <WhyIndonesia /> Task 4 */}
        {/* <Testimonials /> Task 5 */}
        {/* <Pricing /> Task 5 */}
        {/* <Faq /> Task 6 */}
        {/* <CtaBand /> Task 6 */}
      </main>
      <MarketingFooter />
    </div>
  );
}
