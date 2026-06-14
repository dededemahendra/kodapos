import { Trans, useLingui } from '@lingui/react/macro';
import { useLingui as useLinguiReact } from '@lingui/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Boxes,
  ChevronDown,
  CreditCard,
  LifeBuoy,
  LineChart,
  Package,
  Rocket,
  Search,
  Settings,
  ShoppingCart,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import { type ComponentType, useMemo, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Input } from '~/components/ui/input';
import {
  FAQ,
  GETTING_STARTED,
  HELP_CATEGORIES,
  type HelpCategory,
} from '~/lib/help-content';
import type { Locale } from '~/lib/locale';
import { localized } from '~/lib/localized';
import { cn } from '~/lib/utils';

export const Route = createFileRoute('/_pos/help')({
  component: HelpPage,
});

type IconCmp = ComponentType<{ className?: string }>;

const CARD_ICONS: Record<string, IconCmp> = {
  rocket: Rocket,
  creditCard: CreditCard,
  users: Users,
  boxes: Boxes,
};

const CATEGORY_ICONS: Record<HelpCategory, IconCmp> = {
  start: Rocket,
  sales: ShoppingCart,
  payments: CreditCard,
  menu: UtensilsCrossed,
  inventory: Package,
  staff: Users,
  reports: LineChart,
  settings: Settings,
};

function HelpPage() {
  const { t } = useLingui();
  const { i18n } = useLinguiReact();
  const locale: Locale = i18n.locale === 'en' ? 'en' : 'id';

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<HelpCategory | 'all'>('all');
  const faqRef = useRef<HTMLElement>(null);

  const browsing = !query && category === 'all';

  const counts = useMemo(() => {
    const m = {} as Record<HelpCategory, number>;
    for (const f of FAQ) m[f.category] = (m[f.category] ?? 0) + 1;
    return m;
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQ.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      const hay = `${localized(item.question, locale)} ${localized(item.answer, locale)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, category, locale]);

  function openCategory(key: HelpCategory) {
    setCategory(key);
    setQuery('');
    requestAnimationFrame(() => faqRef.current?.scrollIntoView({ block: 'start' }));
  }

  function reset() {
    setCategory('all');
    setQuery('');
  }

  const activeLabel = HELP_CATEGORIES.find((c) => c.key === category)?.label;

  return (
    <main className="p-6">
      <div className="mx-auto max-w-4xl space-y-10">
        {/* Hero */}
        <section className="rounded-2xl border bg-muted/40 px-6 py-10 text-center">
          <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LifeBuoy className="size-5" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            <Trans>Pusat Bantuan</Trans>
          </h1>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
            <Trans>Temukan jawaban dan pelajari cara memakai kodapos.</Trans>
          </p>
          <div className="relative mx-auto mt-5 max-w-xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t`Cari bantuan, mis. QRIS, shift, stok`}
              className="h-11 rounded-xl pl-10 text-base shadow-sm"
              aria-label={t`Cari bantuan`}
            />
          </div>
        </section>

        {browsing ? (
          <>
            {/* Quick start */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                <Trans>Mulai cepat</Trans>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {GETTING_STARTED.map((c) => {
                  const Icon = CARD_ICONS[c.icon] ?? Rocket;
                  return (
                    <Link key={c.docSlug} to="/docs" search={{ topic: c.docSlug }} className="group">
                      <Card className="h-full transition-colors group-hover:border-primary/50">
                        <CardContent className="flex items-start gap-3 p-4">
                          <span className="rounded-md bg-muted p-2 text-primary">
                            <Icon className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{localized(c.title, locale)}</p>
                            <p className="text-xs text-muted-foreground">{localized(c.desc, locale)}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* Browse by topic */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                <Trans>Telusuri berdasarkan topik</Trans>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                {HELP_CATEGORIES.map((c) => {
                  const Icon = CATEGORY_ICONS[c.key];
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => openCategory(c.key)}
                      className="group flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
                    >
                      <span className="rounded-md bg-muted p-2 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <span className="font-medium text-sm">{localized(c.label, locale)}</span>
                      <span className="text-xs text-muted-foreground">
                        {(counts[c.key] ?? 0)} <Trans>artikel</Trans>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}

        {/* FAQ */}
        <section ref={faqRef} className="scroll-mt-20 space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {category !== 'all' && activeLabel ? (
                localized(activeLabel, locale)
              ) : query ? (
                <Trans>Hasil pencarian</Trans>
              ) : (
                <Trans>Pertanyaan umum</Trans>
              )}
              <span className="ml-2 font-normal text-muted-foreground/70">{results.length}</span>
            </h2>
            {!browsing ? (
              <Button variant="ghost" size="sm" onClick={reset}>
                <Trans>Tampilkan semua</Trans>
              </Button>
            ) : null}
          </div>

          {results.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LifeBuoy />
                </EmptyMedia>
                <EmptyTitle>
                  <Trans>Tidak ada hasil</Trans>
                </EmptyTitle>
                <EmptyDescription>
                  <Trans>Coba kata kunci lain atau pilih kategori berbeda.</Trans>
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="divide-y rounded-xl border">
              {results.map((item) => (
                <FaqRow
                  key={item.id}
                  question={localized(item.question, locale)}
                  answer={localized(item.answer, locale)}
                  {...(item.docSlug ? { docSlug: item.docSlug } : {})}
                />
              ))}
            </div>
          )}
        </section>

        {/* Still stuck → docs */}
        <section className="flex flex-col items-center justify-between gap-3 rounded-xl border bg-muted/30 p-5 text-center sm:flex-row sm:text-left">
          <div>
            <p className="font-medium text-sm">
              <Trans>Tidak menemukan yang Anda cari?</Trans>
            </p>
            <p className="text-sm text-muted-foreground">
              <Trans>Telusuri dokumentasi lengkap untuk panduan langkah demi langkah.</Trans>
            </p>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link to="/docs" search={{ topic: 'getting-started' }}>
              <Trans>Buka dokumentasi</Trans>
              <ArrowRight />
            </Link>
          </Button>
        </section>
      </div>
    </main>
  );
}

function FaqRow({
  question,
  answer,
  docSlug,
}: {
  question: string;
  answer: string;
  docSlug?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-medium hover:bg-muted/40"
        aria-expanded={open}
      >
        <span>{question}</span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <div className="animate-in fade-in-0 slide-in-from-top-1 px-4 pb-4 text-sm text-muted-foreground duration-200">
          <p className="whitespace-pre-line leading-6">{answer}</p>
          {docSlug ? (
            <Button asChild variant="link" size="sm" className="mt-1 h-auto px-0">
              <Link to="/docs" search={{ topic: docSlug }}>
                <Trans>Pelajari selengkapnya</Trans>
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
