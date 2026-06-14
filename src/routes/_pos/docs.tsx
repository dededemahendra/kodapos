import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ChevronRight,
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
import { type ComponentType, useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  DOC_GROUPS,
  DOC_ORDER,
  DOCS,
  type DocIcon,
  type DocTopic,
  sectionId,
} from '~/lib/docs-content';
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

const bySlug = (slug: string): DocTopic | undefined => DOCS.find((d) => d.slug === slug);

function DocsPage() {
  const { topic } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { i18n } = useLingui();
  const locale: Locale = i18n.locale === 'en' ? 'en' : 'id';

  const active: DocTopic = bySlug(topic ?? '') ?? DOCS[0]!;
  const ids = active.sections.map((s, i) => sectionId(active.slug, s.heading, i));

  const idx = DOC_ORDER.indexOf(active.slug);
  const prev = idx > 0 ? bySlug(DOC_ORDER[idx - 1]!) : undefined;
  const next = idx >= 0 && idx < DOC_ORDER.length - 1 ? bySlug(DOC_ORDER[idx + 1]!) : undefined;

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl gap-8 px-4 py-6 lg:px-6">
      {/* Left: grouped nav */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto pb-8">
          <DocsNav activeSlug={active.slug} locale={locale} />
        </div>
      </aside>

      {/* Center: article */}
      <div className="min-w-0 flex-1">
        {/* Mobile topic switcher */}
        <div className="mb-4 lg:hidden">
          <Select
            value={active.slug}
            onValueChange={(v) => void navigate({ search: { topic: v } })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOC_GROUPS.map((g) => (
                <SelectGroup key={g.label.en}>
                  <SelectLabel>{localized(g.label, locale)}</SelectLabel>
                  {g.slugs.map((slug) => {
                    const tpc = bySlug(slug);
                    return tpc ? (
                      <SelectItem key={slug} value={slug}>
                        {localized(tpc.title, locale)}
                      </SelectItem>
                    ) : null;
                  })}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <article className="mx-auto min-w-0 max-w-3xl">
          {/* Breadcrumb */}
          <nav className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
            <Link to="/docs" search={{ topic: DOCS[0]!.slug }} className="hover:text-foreground">
              <Trans>Dokumentasi</Trans>
            </Link>
            <ChevronRight className="size-3" />
            <span className="text-foreground">{localized(active.title, locale)}</span>
          </nav>

          <header className="mb-6 border-b pb-6">
            <h1 className="text-3xl font-bold tracking-tight">{localized(active.title, locale)}</h1>
            <p className="mt-2 text-base text-muted-foreground">
              {localized(active.summary, locale)}
            </p>
          </header>

          <div className="space-y-8">
            {active.sections.map((section, si) => (
              <section
                key={ids[si]}
                id={ids[si]}
                className="scroll-mt-20 space-y-3"
              >
                <h2 className="text-xl font-semibold tracking-tight">
                  {localized(section.heading, locale)}
                </h2>
                {section.blocks.map((block, bi) =>
                  block.type === 'p' ? (
                    <p key={`${ids[si]}-b${bi}`} className="leading-7 text-muted-foreground">
                      {localized(block.text, locale)}
                    </p>
                  ) : (
                    <ul
                      key={`${ids[si]}-b${bi}`}
                      className="list-disc space-y-1.5 pl-6 leading-7 text-muted-foreground marker:text-muted-foreground/50"
                    >
                      {block.items.map((item, ii) => (
                        <li key={`${ids[si]}-b${bi}-i${ii}`}>{localized(item, locale)}</li>
                      ))}
                    </ul>
                  )
                )}
              </section>
            ))}
          </div>

          {/* Prev / next pager */}
          <nav className="mt-12 grid gap-3 border-t pt-6 sm:grid-cols-2">
            {prev ? (
              <PagerLink dir="prev" slug={prev.slug} title={localized(prev.title, locale)} />
            ) : (
              <span />
            )}
            {next ? (
              <PagerLink dir="next" slug={next.slug} title={localized(next.title, locale)} />
            ) : (
              <span />
            )}
          </nav>
        </article>
      </div>

      {/* Right: on this page */}
      <aside className="hidden w-56 shrink-0 xl:block">
        <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto pb-8">
          <OnThisPage
            sections={active.sections.map((s, i) => ({
              id: ids[i]!,
              label: localized(s.heading, locale),
            }))}
          />
        </div>
      </aside>
    </div>
  );
}

function DocsNav({ activeSlug, locale }: { activeSlug: string; locale: Locale }) {
  return (
    <nav className="space-y-6 text-sm">
      {DOC_GROUPS.map((group) => (
        <div key={group.label.en}>
          <p className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {localized(group.label, locale)}
          </p>
          <ul className="space-y-0.5">
            {group.slugs.map((slug) => {
              const tpc = bySlug(slug);
              if (!tpc) return null;
              const Icon = ICONS[tpc.icon];
              const isActive = tpc.slug === activeSlug;
              return (
                <li key={slug}>
                  <Link
                    to="/docs"
                    search={{ topic: slug }}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
                      isActive
                        ? 'bg-muted font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{localized(tpc.title, locale)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function OnThisPage({ sections }: { sections: { id: string; label: string }[] }) {
  const activeId = useScrollSpy(sections.map((s) => s.id));
  if (sections.length === 0) return null;
  return (
    <div className="text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Trans>Di halaman ini</Trans>
      </p>
      <ul className="space-y-1 border-l">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={cn(
                '-ml-px block border-l py-1 pl-3 transition-colors',
                activeId === s.id
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PagerLink({
  dir,
  slug,
  title,
}: {
  dir: 'prev' | 'next';
  slug: string;
  title: string;
}) {
  return (
    <Link
      to="/docs"
      search={{ topic: slug }}
      className={cn(
        'rounded-lg border p-3 transition-colors hover:border-primary/50',
        dir === 'next' && 'sm:text-right'
      )}
    >
      <span className="block text-xs text-muted-foreground">
        {dir === 'prev' ? <Trans>Sebelumnya</Trans> : <Trans>Berikutnya</Trans>}
      </span>
      <span className="mt-0.5 block font-medium text-sm">{title}</span>
    </Link>
  );
}

/** Highlights the section currently scrolled into view. */
function useScrollSpy(ids: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);
  const key = ids.join('|');

  useEffect(() => {
    setActiveId(ids[0] ?? null);
    if (typeof window === 'undefined' || ids.length === 0) return;
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return activeId;
}
