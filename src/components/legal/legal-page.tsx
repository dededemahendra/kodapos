import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { MarketingFooter } from '~/components/marketing/marketing-footer';
import { MarketingHeader } from '~/components/marketing/marketing-header';
import type { LegalBlock, LegalDoc } from '~/content/legal/types';

function Block({ block }: { block: LegalBlock }) {
  if (block.type === 'list') {
    return (
      <ul className="my-3 list-disc space-y-1.5 pl-6 text-muted-foreground">
        {block.items.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static legal content
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }
  return <p className="my-3 leading-relaxed text-muted-foreground">{block.text}</p>;
}

/**
 * Shared layout for the Terms and Privacy pages: marketing header + footer, a
 * visible "draft, pending legal review" notice, title, last-updated date, a
 * table of contents, and the numbered prose sections. The locale-specific
 * document is selected by the route and passed in.
 */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <div id="top" className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main className="mx-auto max-w-3xl px-6 py-12 md:py-16">
        {/* Honesty notice: this is an unreviewed template */}
        <div className="mb-8 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            <Trans>
              Dokumen ini adalah draf template dan belum ditinjau oleh penasihat hukum. Lengkapi
              rincian dalam tanda kurung dan tinjau bersama pengacara sebelum peluncuran resmi.
            </Trans>
          </p>
        </div>

        <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <Trans>Terakhir diperbarui</Trans>: {doc.effectiveDate}
        </p>
        <p className="mt-4 leading-relaxed text-muted-foreground">{doc.intro}</p>

        {/* Table of contents */}
        <nav className="mt-8 rounded-lg border border-border bg-muted/30 p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Trans>Daftar isi</Trans>
          </h2>
          <ol className="space-y-1 text-sm">
            {doc.sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-primary hover:underline">
                  {i + 1}. {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Sections */}
        <div className="mt-10 space-y-10">
          {doc.sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-20">
              <h2 className="text-lg font-semibold text-foreground">
                {i + 1}. {s.heading}
              </h2>
              {s.body.map((b, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static legal content
                <Block key={j} block={b} />
              ))}
            </section>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-6">
          <Link to="/" className="text-sm text-primary hover:underline">
            <Trans>Kembali ke beranda</Trans>
          </Link>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
