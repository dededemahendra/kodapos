'use client';

import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Check, Minus } from 'lucide-react';
import { useLocale } from '~/components/locale-provider';
import { CtaBand } from '~/components/marketing/cta-band';
import { MarketingFooter } from '~/components/marketing/marketing-footer';
import { MarketingHeader } from '~/components/marketing/marketing-header';
import { Reveal } from '~/components/marketing/motion';
import { SectionHeading } from '~/components/marketing/section-heading';
import { ScreenshotFrame, Shot } from '~/components/marketing/shot';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import type { FeaturePageContent } from '~/content/marketing/types';
import { track } from '~/lib/analytics/track';
import { localized } from '~/lib/localized';

/**
 * Renders a marketing feature page from a content document. The shell matches
 * changelog.tsx; each section kind maps onto an existing visual pattern in
 * components/marketing so these pages read as native, not bolted on.
 */
export function FeaturePage({ content }: { content: FeaturePageContent }) {
  const { locale } = useLocale();
  const L = (v: Parameters<typeof localized>[0]) => localized(v, locale);

  // Capability sections alternate a muted band so the page has rhythm.
  let capabilityIndex = -1;

  return (
    <div id="top" className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main>
        {content.sections.map((section, i) => {
          switch (section.kind) {
            case 'hero':
              return (
                <section key={i} className="mx-auto max-w-6xl px-6 pt-20 md:pt-28">
                  <Reveal className="mx-auto max-w-2xl text-center">
                    <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                      {L(section.eyebrow)}
                    </p>
                    <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
                      {L(section.title)}
                    </h1>
                    <p className="mt-4 text-lg text-muted-foreground">{L(section.lede)}</p>
                    <Button asChild size="lg" className="mt-8">
                      <Link
                        to="/signin"
                        onClick={() =>
                          track('marketing_cta_clicked', {
                            location: 'feature_page',
                            label: 'start_free',
                          })
                        }
                      >
                        <Trans>Mulai gratis</Trans>
                      </Link>
                    </Button>
                  </Reveal>
                  {section.shot && section.shotAlt ? (
                    <Reveal className="mt-14">
                      <ScreenshotFrame fadeFrom={60}>
                        <Shot id={section.shot} alt={L(section.shotAlt)} priority />
                      </ScreenshotFrame>
                    </Reveal>
                  ) : null}
                </section>
              );

            case 'capability': {
              capabilityIndex += 1;
              const band = capabilityIndex % 2 === 1;
              const imageFirst = section.side === 'left';
              return (
                <section
                  key={i}
                  id={section.id}
                  className={`scroll-mt-16 py-20 ${band ? 'border-y border-border bg-muted/30' : ''}`}
                >
                  <div className="mx-auto grid max-w-5xl items-center gap-10 px-6 md:grid-cols-2">
                    <Reveal className={imageFirst ? 'md:order-2' : ''}>
                      <h2 className="text-3xl font-extrabold tracking-tight">{L(section.heading)}</h2>
                      <p className="mt-3 leading-relaxed text-muted-foreground">{L(section.body)}</p>
                      <ul className="mt-6 space-y-2.5">
                        {section.bullets.map((b, bi) => (
                          <li key={bi} className="flex items-start gap-2.5 text-sm">
                            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                            <span>{L(b)}</span>
                          </li>
                        ))}
                      </ul>
                    </Reveal>
                    {section.shot && section.shotAlt ? (
                      <Reveal className={imageFirst ? 'md:order-1' : ''}>
                        <ScreenshotFrame fadeFrom={100}>
                          <Shot id={section.shot} alt={L(section.shotAlt)} />
                        </ScreenshotFrame>
                      </Reveal>
                    ) : null}
                  </div>
                </section>
              );
            }

            case 'flow':
              return (
                <section key={i} className="py-20">
                  <div className="mx-auto max-w-5xl px-6">
                    <SectionHeading>{L(section.heading)}</SectionHeading>
                    <div className="grid gap-5 md:grid-cols-3">
                      {section.steps.map((step, si) => (
                        <Reveal key={si} delay={si * 0.08}>
                          <Card className="h-full">
                            <CardContent className="p-6">
                              <span className="text-sm font-semibold text-primary">
                                {String(si + 1).padStart(2, '0')}
                              </span>
                              <h3 className="mt-2 font-semibold">{L(step.title)}</h3>
                              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                                {L(step.body)}
                              </p>
                            </CardContent>
                          </Card>
                        </Reveal>
                      ))}
                    </div>
                  </div>
                </section>
              );

            case 'truth':
              // A statement of scope, not a warning. Same visual weight as any
              // other section: no alert colours, no cautionary iconography.
              return (
                <section key={i} className="border-y border-border bg-muted/30 py-20">
                  <div className="mx-auto max-w-5xl px-6">
                    <SectionHeading align="left" sub={L(section.lede)}>
                      {L(section.heading)}
                    </SectionHeading>
                    <div className="grid gap-10 md:grid-cols-2">
                      <Reveal>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          <Trans>Yang sudah bisa</Trans>
                        </h3>
                        <ul className="mt-4 space-y-2.5">
                          {section.does.map((d, di) => (
                            <li key={di} className="flex items-start gap-2.5 text-sm">
                              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                              <span>{L(d)}</span>
                            </li>
                          ))}
                        </ul>
                      </Reveal>
                      <Reveal delay={0.08}>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          <Trans>Yang belum</Trans>
                        </h3>
                        <ul className="mt-4 space-y-2.5">
                          {section.doesNot.map((d, di) => (
                            <li
                              key={di}
                              className="flex items-start gap-2.5 text-sm text-muted-foreground"
                            >
                              <Minus className="mt-0.5 size-4 shrink-0" />
                              <span>{L(d)}</span>
                            </li>
                          ))}
                        </ul>
                      </Reveal>
                    </div>
                  </div>
                </section>
              );

            case 'faq':
              return (
                <section key={i} id="fitur-faq" className="scroll-mt-16 py-20">
                  <div className="mx-auto max-w-6xl px-6">
                    <SectionHeading>{L(section.heading)}</SectionHeading>
                    <Reveal className="mx-auto max-w-2xl">
                      <Accordion type="single" collapsible>
                        {section.items.map((item, qi) => (
                          <AccordionItem key={qi} value={`q-${qi}`}>
                            <AccordionTrigger>{L(item.q)}</AccordionTrigger>
                            <AccordionContent>
                              <span className="text-muted-foreground">{L(item.a)}</span>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </Reveal>
                  </div>
                </section>
              );

            case 'cta':
              return <CtaBand key={i} />;

            default:
              return null;
          }
        })}
      </main>
      <MarketingFooter />
    </div>
  );
}
