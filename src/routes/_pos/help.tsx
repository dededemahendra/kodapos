import { Trans, useLingui } from '@lingui/react/macro';
import { useLingui as useLinguiReact } from '@lingui/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  Boxes,
  ChevronDown,
  CreditCard,
  LifeBuoy,
  Rocket,
  Search,
  Users,
} from 'lucide-react';
import { type ComponentType, useMemo, useState } from 'react';
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
import { PageHeader } from '~/components/ui/page-header';
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

const CARD_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  rocket: Rocket,
  creditCard: CreditCard,
  users: Users,
  boxes: Boxes,
};

function HelpPage() {
  const { t } = useLingui();
  const { i18n } = useLinguiReact();
  const locale: Locale = i18n.locale === 'en' ? 'en' : 'id';

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<HelpCategory | 'all'>('all');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQ.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      const hay = `${localized(item.question, locale)} ${localized(item.answer, locale)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, category, locale]);

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Pusat Bantuan</Trans>}
        description={<Trans>Temukan jawaban dan pelajari cara memakai kodapos.</Trans>}
      />

      <div className="mx-auto max-w-3xl space-y-8">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t`Cari bantuan, mis. QRIS, shift, stok`}
            className="pl-9"
            aria-label={t`Cari bantuan`}
          />
        </div>

        {/* Getting started */}
        {!query && category === 'all' ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              <Trans>Mulai cepat</Trans>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {GETTING_STARTED.map((c) => {
                const Icon = CARD_ICONS[c.icon] ?? Rocket;
                return (
                  <Link
                    key={c.docSlug}
                    to="/docs"
                    search={{ topic: c.docSlug }}
                    className="group"
                  >
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
        ) : null}

        {/* Category filter */}
        <div className="flex flex-wrap gap-2">
          <CategoryChip active={category === 'all'} onClick={() => setCategory('all')}>
            <Trans>Semua</Trans>
          </CategoryChip>
          {HELP_CATEGORIES.map((c) => (
            <CategoryChip
              key={c.key}
              active={category === c.key}
              onClick={() => setCategory(c.key)}
            >
              {localized(c.label, locale)}
            </CategoryChip>
          ))}
        </div>

        {/* FAQ */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            <Trans>Pertanyaan umum</Trans>
          </h2>
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
            <div className="divide-y rounded-lg border">
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
      </div>
    </main>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted'
      )}
    >
      {children}
    </button>
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
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium"
        aria-expanded={open}
      >
        <span>{question}</span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <div className="px-4 pb-4 text-sm text-muted-foreground">
          <p className="whitespace-pre-line">{answer}</p>
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
