import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  CreditCard,
  Heart,
  LayoutGrid,
  LineChart,
  Package,
  Rocket,
  RotateCcw,
  Settings,
  ShoppingCart,
  Tag,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { PageHeader } from '~/components/ui/page-header';
import { DOCS, type DocIcon, type DocTopic } from '~/lib/docs-content';
import type { Locale } from '~/lib/locale';
import { localized } from '~/lib/localized';
import { cn } from '~/lib/utils';

export const Route = createFileRoute('/_pos/docs')({
  validateSearch: (search: Record<string, unknown>): { topic?: string } =>
    typeof search.topic === 'string' ? { topic: search.topic } : {},
  component: DocsPage,
});

const ICONS: Record<DocIcon, ComponentType<{ className?: string }>> = {
  start: Rocket,
  register: ShoppingCart,
  payments: CreditCard,
  void: RotateCcw,
  menu: UtensilsCrossed,
  inventory: Package,
  customers: Heart,
  promos: Tag,
  tables: LayoutGrid,
  staff: Users,
  reports: LineChart,
  settings: Settings,
};

function DocsPage() {
  const { topic } = Route.useSearch();
  const { i18n } = useLingui();
  const locale: Locale = i18n.locale === 'en' ? 'en' : 'id';

  const active: DocTopic = DOCS.find((d) => d.slug === topic) ?? DOCS[0]!;

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Dokumentasi</Trans>}
        description={<Trans>Panduan lengkap setiap fitur kodapos.</Trans>}
      />

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Topic nav */}
        <nav className="shrink-0 md:w-56">
          <ul className="flex flex-row flex-wrap gap-1 md:flex-col">
            {DOCS.map((d) => {
              const Icon = ICONS[d.icon];
              const isActive = d.slug === active.slug;
              return (
                <li key={d.slug}>
                  <Link
                    to="/docs"
                    search={{ topic: d.slug }}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-muted font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{localized(d.title, locale)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Article */}
        <article className="min-w-0 max-w-2xl flex-1">
          <header className="mb-4">
            <h2 className="text-xl font-bold">{localized(active.title, locale)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {localized(active.summary, locale)}
            </p>
          </header>
          <div className="space-y-6">
            {active.sections.map((section, si) => (
              <section key={`${active.slug}-s${si}`} className="space-y-2">
                <h3 className="font-semibold">{localized(section.heading, locale)}</h3>
                {section.blocks.map((block, bi) =>
                  block.type === 'p' ? (
                    <p
                      key={`${active.slug}-s${si}-b${bi}`}
                      className="text-sm leading-relaxed text-muted-foreground"
                    >
                      {localized(block.text, locale)}
                    </p>
                  ) : (
                    <ul
                      key={`${active.slug}-s${si}-b${bi}`}
                      className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground"
                    >
                      {block.items.map((item, ii) => (
                        <li key={`${active.slug}-s${si}-b${bi}-i${ii}`}>{localized(item, locale)}</li>
                      ))}
                    </ul>
                  )
                )}
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
