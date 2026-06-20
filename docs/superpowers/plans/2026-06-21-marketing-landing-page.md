# Marketing Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder public landing page with a clean, responsive, bilingual marketing page that converts Indonesian cafe and QSR owners into sign-ups.

**Architecture:** A single public route (`/_public/`) composes focused section components from a new `src/components/marketing/` folder. All copy is wrapped in `lingui` `<Trans>` (Indonesian source, English filled). Colors use theme tokens so the page works in light and dark. CTAs use the existing shadcn `Button`; the brand uses `BrandMark`.

**Tech Stack:** React, TanStack Router (`createFileRoute`), lingui (`@lingui/react/macro`), Tailwind (theme tokens), shadcn `Button`, lucide-react icons.

## Global Constraints

- No `--` or em-dash (`—`) in any visible copy, Indonesian or English. Use commas, periods, parentheses. The middot `·` is allowed as a separator (it is not a dash).
- Bilingual via lingui: Indonesian is the source in `<Trans>`/`t`. After building, run `pnpm lingui:extract`, fill `src/locales/en/messages.po` with the English values from the spec, then `pnpm lingui:compile`. No missing English.
- Colors via Tailwind theme tokens only (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted`, `bg-card`, `bg-primary`, `text-primary-foreground`). No hardcoded hex, so light and dark both work.
- Typeface is Geist (already global). Reuse `~/components/brand-mark` `BrandMark` and `~/components/ui/button` `Button` (variant `default` for primary, `outline` for secondary).
- Internal links: "Daftar" and "Mulai gratis" link to `/signup`; "Masuk" links to `/signin` (TanStack `Link`). Section anchors are plain `<a href="#...">`.
- No backend changes, no new dependencies.
- Per-task verification: `pnpm typecheck` passes, plus a Playwright screenshot of `/` on the running dev server (`pnpm dev` at http://localhost:5173, public, no auth). The repo has no component-test infra (vitest runs in `edge-runtime`); do not add jsdom or RTL. Enforce the no-dash rule with a grep step.
- Commit after each task. End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Full BI/EN copy for every string is in `docs/superpowers/specs/2026-06-21-marketing-landing-page-design.md`.

Reusable screenshot script (used in verification steps), save once as `/tmp/lp_shot.py`:

```python
import sys
from playwright.sync_api import sync_playwright
path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/lp.png"
width = int(sys.argv[2]) if len(sys.argv) > 2 else 1280
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": width, "height": 900}, device_scale_factor=2)
    pg.goto("http://localhost:5173/", wait_until="networkidle")
    pg.wait_for_timeout(700)
    pg.screenshot(path=path, full_page=True)
    b.close()
print("saved", path)
```

---

### Task 1: Route shell, header, footer, SEO

**Files:**
- Create: `src/components/marketing/marketing-header.tsx`
- Create: `src/components/marketing/marketing-footer.tsx`
- Modify: `src/routes/_public/index.tsx` (full rewrite)
- Reference: `src/components/nav-user.tsx` (for `useLocale`/`LOCALES` usage), `src/routes/__root.tsx` (for `head()` shape)

**Interfaces:**
- Produces: `MarketingHeader` (no props), `MarketingFooter` (no props). The route renders `#top`, the header, a `<main>` with section placeholders (filled by later tasks), and the footer.

- [ ] **Step 1: Confirm locale helper shape**

Run: `sed -n '1,40p' src/lib/locale.ts`
Expected: a `LOCALES` array of `{ value, label }` and a `Locale` type. If the property names differ, adapt the header accordingly.

- [ ] **Step 2: Create the header**

`src/components/marketing/marketing-header.tsx`:

```tsx
import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Button } from '~/components/ui/button';
import { BrandMark } from '~/components/brand-mark';
import { useLocale } from '~/components/locale-provider';
import { LOCALES, type Locale } from '~/lib/locale';

export function MarketingHeader() {
  const { locale, setLocale } = useLocale();
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
        <a href="#top" className="flex items-center gap-2">
          <BrandMark className="h-5 w-auto text-foreground" />
          <span className="font-semibold">kodapos</span>
        </a>
        <nav className="ml-6 hidden gap-6 text-sm text-muted-foreground md:flex">
          <a href="#fitur" className="transition-colors hover:text-foreground"><Trans>Fitur</Trans></a>
          <a href="#cara" className="transition-colors hover:text-foreground"><Trans>Cara kerja</Trans></a>
          <a href="#harga" className="transition-colors hover:text-foreground"><Trans>Harga</Trans></a>
          <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center rounded-md border border-border p-0.5 sm:flex">
            {LOCALES.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => setLocale(l.value as Locale)}
                className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                  locale === l.value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {l.value.toUpperCase()}
              </button>
            ))}
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/signin"><Trans>Masuk</Trans></Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/signup"><Trans>Daftar</Trans></Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create the footer**

`src/components/marketing/marketing-footer.tsx`:

```tsx
import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { BrandMark } from '~/components/brand-mark';

export function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <BrandMark className="h-5 w-auto text-foreground" />
              <span className="font-semibold">kodapos</span>
            </div>
            <p className="mt-3 max-w-64 text-sm text-muted-foreground">
              <Trans>POS pintar untuk kafe dan resto di Indonesia.</Trans>
            </p>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Trans>Produk</Trans></h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#fitur" className="hover:text-foreground"><Trans>Fitur</Trans></a></li>
              <li><a href="#harga" className="hover:text-foreground"><Trans>Harga</Trans></a></li>
              <li><a href="#faq" className="hover:text-foreground">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Trans>Akun</Trans></h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/signin" className="hover:text-foreground"><Trans>Masuk</Trans></Link></li>
              <li><Link to="/signup" className="hover:text-foreground"><Trans>Daftar</Trans></Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/privacy" className="hover:text-foreground"><Trans>Privasi</Trans></Link></li>
              <li><Link to="/terms" className="hover:text-foreground"><Trans>Ketentuan</Trans></Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-wrap justify-between gap-2 border-t border-border pt-6 text-sm text-muted-foreground">
          <span>© 2026 kodapos</span>
          <span><Trans>Dibuat untuk kafe Indonesia</Trans></span>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Rewrite the route**

`src/routes/_public/index.tsx` (replace entire file). Sections not yet built are commented so the file typechecks; uncomment as later tasks add them:

```tsx
import { createFileRoute } from '@tanstack/react-router';
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
        {/* <Hero /> Task 2 */}
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
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Visual check**

Ensure `pnpm dev` is running. Then:
Run: `python3 /tmp/lp_shot.py /tmp/lp1.png 1280 && python3 /tmp/lp_shot.py /tmp/lp1m.png 390`
Expected: header (logo, nav links on desktop only, ID/EN toggle, Masuk/Daftar) and footer render; on the 390px shot the nav links are hidden but the buttons remain. Open the PNGs to confirm.

- [ ] **Step 7: Commit**

```bash
git add src/components/marketing/marketing-header.tsx src/components/marketing/marketing-footer.tsx src/routes/_public/index.tsx
git commit -m "feat(marketing): landing shell with header, footer, SEO

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Hero and register preview

**Files:**
- Create: `src/components/marketing/register-preview.tsx`
- Create: `src/components/marketing/hero.tsx`
- Modify: `src/routes/_public/index.tsx` (uncomment `<Hero />`, add import)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `Hero` (no props). Renders inside `<main>` as the first section.

- [ ] **Step 1: Create the decorative register preview**

`src/components/marketing/register-preview.tsx`:

```tsx
export function RegisterPreview() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto mt-12 max-w-3xl rounded-2xl border border-border bg-muted/40 p-2.5 shadow-2xl"
    >
      <div className="flex h-8 items-center gap-1.5 px-3">
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
      </div>
      <div className="grid min-h-56 grid-cols-1 gap-2 rounded-xl border border-border bg-card p-2.5 sm:grid-cols-[1fr_220px]">
        <div className="grid grid-cols-3 content-start gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg border border-border bg-background" />
          ))}
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
          <div className="h-2.5 rounded bg-muted" />
          <div className="h-2.5 w-3/5 rounded bg-muted" />
          <div className="h-2.5 rounded bg-muted" />
          <div className="h-2.5 w-2/5 rounded bg-muted" />
          <div className="mt-auto h-9 rounded-lg bg-primary" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the hero**

`src/components/marketing/hero.tsx`:

```tsx
import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Button } from '~/components/ui/button';
import { RegisterPreview } from './register-preview';

const CAPABILITIES = [
  <Trans key="c1">Kasir</Trans>,
  <Trans key="c2">Meja</Trans>,
  <Trans key="c3">Layar dapur</Trans>,
  <Trans key="c4">Pesan mandiri QR</Trans>,
  <Trans key="c5">Stok dan resep</Trans>,
  <Trans key="c6">QRIS</Trans>,
  <Trans key="c7">Loyalitas</Trans>,
  <Trans key="c8">Laporan</Trans>,
];

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-6 pt-20 text-center">
      <span className="inline-block rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
        <Trans>POS untuk kafe dan resto</Trans>
      </span>
      <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
        <Trans>Jalankan kafe Anda, bukan kasirnya.</Trans>
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
        <Trans>
          Satu aplikasi untuk kasir, stok, dan laporan. Jual lebih cepat, jaga margin, dan ambil
          keputusan dengan bantuan AI.
        </Trans>
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link to="/signup"><Trans>Mulai gratis</Trans></Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="#fitur"><Trans>Lihat fitur</Trans></a>
        </Button>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        <Trans>Gratis selama akses awal. Tanpa kartu kredit.</Trans>
      </p>
      <RegisterPreview />
      <div className="mx-auto mt-9 flex max-w-2xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {CAPABILITIES.map((c, i) => (
          <span key={i} className="whitespace-nowrap">{c}</span>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire into the route**

In `src/routes/_public/index.tsx`, add `import { Hero } from '~/components/marketing/hero';` and replace `{/* <Hero /> Task 2 */}` with `<Hero />`.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Visual check**

Run: `python3 /tmp/lp_shot.py /tmp/lp2.png 1280 && python3 /tmp/lp_shot.py /tmp/lp2m.png 390`
Expected: centered hero with eyebrow, headline, subhead, two buttons, microcopy, register preview, and capability strip. On mobile the preview collapses to one column and buttons wrap. Open PNGs to confirm.

- [ ] **Step 6: Commit**

```bash
git add src/components/marketing/hero.tsx src/components/marketing/register-preview.tsx src/routes/_public/index.tsx
git commit -m "feat(marketing): hero section with register preview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Features (pillars and grid)

**Files:**
- Create: `src/components/marketing/section-heading.tsx` (shared by Tasks 3 to 6)
- Create: `src/components/marketing/feature-section.tsx`
- Modify: `src/routes/_public/index.tsx`

**Interfaces:**
- Produces: `SectionHeading` (`{ children, sub }: { children: ReactNode; sub?: ReactNode }`) and `FeatureSection` (no props, renders `<section id="fitur">`).

- [ ] **Step 1: Create the shared section heading**

`src/components/marketing/section-heading.tsx`:

```tsx
import type { ReactNode } from 'react';

export function SectionHeading({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mx-auto mb-11 max-w-2xl text-center">
      <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{children}</h2>
      {sub ? <p className="mt-3 text-lg text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Create the feature section**

`src/components/marketing/feature-section.tsx`:

```tsx
import { Trans } from '@lingui/react/macro';
import { Brain, Package, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionHeading } from './section-heading';

const PILLARS: { icon: ReactNode; title: ReactNode; desc: ReactNode }[] = [
  {
    icon: <Zap className="size-5" />,
    title: <Trans>Jual lebih cepat</Trans>,
    desc: (
      <Trans>
        Kasir, meja, layar dapur, dan pesan mandiri lewat QR. Terima QRIS, tunai, atau split tanpa
        ribet.
      </Trans>
    ),
  },
  {
    icon: <Package className="size-5" />,
    title: <Trans>Jaga margin</Trans>,
    desc: (
      <Trans>
        Lacak stok bahan dan resep, hitung harga pokok otomatis, dan lihat margin tiap menu.
      </Trans>
    ),
  },
  {
    icon: <Brain className="size-5" />,
    title: <Trans>Pahami bisnis Anda</Trans>,
    desc: (
      <Trans>
        Laporan penjualan dan laba rugi yang jelas, plus asisten AI dan prakiraan permintaan.
      </Trans>
    ),
  },
];

const FEATURES: { title: ReactNode; desc: ReactNode }[] = [
  { title: <Trans>Kasir cepat</Trans>, desc: <Trans>Antarmuka ringan yang siap dipakai di tablet, HP, atau laptop.</Trans> },
  { title: <Trans>Manajemen meja</Trans>, desc: <Trans>Buka, gabung, dan pindah meja. Pantau status tiap pesanan.</Trans> },
  { title: <Trans>Layar dapur</Trans>, desc: <Trans>Pesanan langsung tampil di dapur, rapi dan urut.</Trans> },
  { title: <Trans>Pesan mandiri QR</Trans>, desc: <Trans>Pelanggan memesan dari meja lewat kode QR.</Trans> },
  { title: <Trans>Stok dan resep</Trans>, desc: <Trans>Stok bahan berkurang otomatis dari resep tiap menu.</Trans> },
  { title: <Trans>QRIS dinamis</Trans>, desc: <Trans>Terima pembayaran QRIS langsung dari kasir.</Trans> },
  { title: <Trans>Loyalitas dan poin</Trans>, desc: <Trans>Kumpulkan pelanggan dan beri poin serta hadiah.</Trans> },
  { title: <Trans>Kartu hadiah</Trans>, desc: <Trans>Jual dan tukarkan saldo kartu hadiah.</Trans> },
  { title: <Trans>Shift dan absensi</Trans>, desc: <Trans>Buka tutup shift, jam kerja, dan serah terima kas.</Trans> },
  { title: <Trans>Promo dan diskon</Trans>, desc: <Trans>Atur promo, diskon manual, dan biaya layanan.</Trans> },
  { title: <Trans>Laporan dan laba rugi</Trans>, desc: <Trans>Penjualan, produk, kasir, dan laba rugi harian.</Trans> },
  { title: <Trans>Asisten AI</Trans>, desc: <Trans>Tanya data Anda dan dapatkan saran stok dengan kunci API sendiri.</Trans> },
];

export function FeatureSection() {
  return (
    <section id="fitur" className="scroll-mt-16 border-y border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading sub={<Trans>Dari pesanan pertama sampai laporan akhir bulan.</Trans>}>
          <Trans>Semua yang dibutuhkan kafe Anda, dalam satu tempat</Trans>
        </SectionHeading>
        <div className="grid gap-5 md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-6">
              <div className="mb-3.5 flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                {p.icon}
              </div>
              <h3 className="text-base font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={i} className="bg-card p-5">
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire into the route**

Add `import { FeatureSection } from '~/components/marketing/feature-section';` and replace the FeatureSection placeholder with `<FeatureSection />`.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Visual check**

Run: `python3 /tmp/lp_shot.py /tmp/lp3.png 1280 && python3 /tmp/lp_shot.py /tmp/lp3m.png 390`
Expected: 3 pillar cards with icons over a 12-cell feature grid with hairline dividers; both collapse to one column on mobile. Confirm.

- [ ] **Step 6: Commit**

```bash
git add src/components/marketing/section-heading.tsx src/components/marketing/feature-section.tsx src/routes/_public/index.tsx
git commit -m "feat(marketing): features section (pillars and grid)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: How it works and Why Indonesia

**Files:**
- Create: `src/components/marketing/how-it-works.tsx`
- Create: `src/components/marketing/why-indonesia.tsx`
- Modify: `src/routes/_public/index.tsx`

**Interfaces:**
- Consumes: `SectionHeading` from Task 3.
- Produces: `HowItWorks` (renders `<section id="cara">`) and `WhyIndonesia` (no id).

- [ ] **Step 1: Create how-it-works**

`src/components/marketing/how-it-works.tsx`:

```tsx
import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { SectionHeading } from './section-heading';

const STEPS: { title: ReactNode; desc: ReactNode }[] = [
  { title: <Trans>Daftar dan atur menu</Trans>, desc: <Trans>Buat akun, lalu tambahkan menu, harga, dan stok dalam hitungan menit.</Trans> },
  { title: <Trans>Mulai berjualan</Trans>, desc: <Trans>Terima pesanan di kasir, meja, atau lewat QR. Bayar dengan QRIS atau tunai.</Trans> },
  { title: <Trans>Pantau dan kembangkan</Trans>, desc: <Trans>Lihat laporan harian dan biarkan AI menyarankan stok serta menu terlaris.</Trans> },
];

export function HowItWorks() {
  return (
    <section id="cara" className="scroll-mt-16 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading sub={<Trans>Tanpa pelatihan panjang, tanpa pemasangan rumit.</Trans>}>
          <Trans>Mulai dalam tiga langkah</Trans>
        </SectionHeading>
        <div className="grid gap-7 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={i}>
              <div className="mb-3.5 flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {i + 1}
              </div>
              <h3 className="text-base font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create why-indonesia**

`src/components/marketing/why-indonesia.tsx`:

```tsx
import { Trans } from '@lingui/react/macro';
import { CloudSun, CreditCard, Languages, Receipt } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionHeading } from './section-heading';

const POINTS: { icon: ReactNode; title: ReactNode; desc: ReactNode }[] = [
  { icon: <CreditCard className="size-5" />, title: <Trans>QRIS bawaan</Trans>, desc: <Trans>Statis dan dinamis, langsung dari kasir tanpa alat tambahan.</Trans> },
  { icon: <Languages className="size-5" />, title: <Trans>Bahasa Indonesia</Trans>, desc: <Trans>Seluruh aplikasi dalam Bahasa Indonesia, mudah dipakai semua staf.</Trans> },
  { icon: <CloudSun className="size-5" />, title: <Trans>Prakiraan sadar cuaca</Trans>, desc: <Trans>AI membaca pola cuaca lokal untuk memperkirakan permintaan harian.</Trans> },
  { icon: <Receipt className="size-5" />, title: <Trans>Struk digital</Trans>, desc: <Trans>Kirim struk lewat email atau WhatsApp ke pelanggan Anda.</Trans> },
];

export function WhyIndonesia() {
  return (
    <section className="border-y border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading sub={<Trans>Bukan sekadar terjemahan. kodapos paham cara kerja usaha lokal.</Trans>}>
          <Trans>Dibuat untuk kafe dan resto di Indonesia</Trans>
        </SectionHeading>
        <div className="grid gap-5 sm:grid-cols-2">
          {POINTS.map((p, i) => (
            <div key={i} className="flex gap-4 rounded-xl border border-border bg-card p-5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                {p.icon}
              </div>
              <div>
                <h3 className="text-base font-semibold">{p.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire into the route**

Add imports and replace both placeholders with `<HowItWorks />` and `<WhyIndonesia />`.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Visual check**

Run: `python3 /tmp/lp_shot.py /tmp/lp4.png 1280`
Expected: numbered 3-step row, then a 2x2 local-fit grid with icons. Confirm.

- [ ] **Step 6: Commit**

```bash
git add src/components/marketing/how-it-works.tsx src/components/marketing/why-indonesia.tsx src/routes/_public/index.tsx
git commit -m "feat(marketing): how-it-works and why-Indonesia sections

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Testimonials and Pricing

**Files:**
- Create: `src/components/marketing/testimonials.tsx`
- Create: `src/components/marketing/pricing.tsx`
- Modify: `src/routes/_public/index.tsx`

**Interfaces:**
- Consumes: `SectionHeading` from Task 3, `Button` from shadcn.
- Produces: `Testimonials` (no id) and `Pricing` (renders `<section id="harga">`).

- [ ] **Step 1: Create testimonials (placeholder content)**

`src/components/marketing/testimonials.tsx`:

```tsx
import { Trans } from '@lingui/react/macro';
import { SectionHeading } from './section-heading';

const LETTERS = ['A', 'B', 'C'];

export function Testimonials() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading>
          <Trans>Dipakai pemilik kafe seperti Anda</Trans>
        </SectionHeading>
        <div className="grid gap-5 md:grid-cols-3">
          {LETTERS.map((letter) => (
            <figure key={letter} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
              <blockquote className="text-[15px] leading-relaxed">
                <Trans>[Contoh testimoni. Ganti dengan kutipan pelanggan asli sebelum tayang.]</Trans>
              </blockquote>
              <figcaption className="mt-auto flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-bold">
                  {letter}
                </span>
                <span className="text-sm">
                  <span className="block font-semibold"><Trans>Nama Pemilik</Trans></span>
                  <span className="block text-muted-foreground"><Trans>Nama Kafe, Kota</Trans></span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          <Trans>Placeholder. Akan diganti dengan testimoni pelanggan asli.</Trans>
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create pricing**

`src/components/marketing/pricing.tsx`:

```tsx
import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '~/components/ui/button';
import { SectionHeading } from './section-heading';

const INCLUDED: ReactNode[] = [
  <Trans key="i1">Semua fitur terbuka</Trans>,
  <Trans key="i2">Tanpa biaya pemasangan</Trans>,
  <Trans key="i3">Tanpa kartu kredit</Trans>,
  <Trans key="i4">Dukungan lewat WhatsApp</Trans>,
];

export function Pricing() {
  return (
    <section id="harga" className="scroll-mt-16 border-y border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading sub={<Trans>Mulai sekarang tanpa biaya selama masa akses awal.</Trans>}>
          <Trans>Harga sederhana</Trans>
        </SectionHeading>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
          <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-semibold">
            <Trans>Akses awal</Trans>
          </span>
          <div className="mt-3.5 text-4xl font-extrabold tracking-tight"><Trans>Gratis</Trans></div>
          <div className="text-sm text-muted-foreground"><Trans>untuk saat ini</Trans></div>
          <ul className="my-6 space-y-2.5 text-left">
            {INCLUDED.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Button asChild size="lg" className="w-full">
            <Link to="/signup"><Trans>Mulai gratis</Trans></Link>
          </Button>
          <p className="mt-3.5 text-xs text-muted-foreground">
            <Trans>Harga akan diumumkan sebelum masa akses awal berakhir.</Trans>
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire into the route**

Add imports and replace both placeholders with `<Testimonials />` and `<Pricing />`.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Visual check**

Run: `python3 /tmp/lp_shot.py /tmp/lp5.png 1280`
Expected: 3 testimonial cards with a visible placeholder note, then a centered pricing card with a checklist and full-width CTA. Confirm.

- [ ] **Step 6: Commit**

```bash
git add src/components/marketing/testimonials.tsx src/components/marketing/pricing.tsx src/routes/_public/index.tsx
git commit -m "feat(marketing): testimonials (placeholder) and pricing sections

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: FAQ and final CTA band

**Files:**
- Create: `src/components/marketing/faq.tsx`
- Create: `src/components/marketing/cta-band.tsx`
- Modify: `src/routes/_public/index.tsx`

**Interfaces:**
- Consumes: `SectionHeading` from Task 3, `Button` from shadcn.
- Produces: `Faq` (renders `<section id="faq">`) and `CtaBand` (no id).

- [ ] **Step 1: Create FAQ**

`src/components/marketing/faq.tsx`:

```tsx
import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { SectionHeading } from './section-heading';

const QA: { q: ReactNode; a: ReactNode }[] = [
  { q: <Trans>Apakah perlu perangkat khusus?</Trans>, a: <Trans>Tidak. kodapos berjalan di browser, jadi bisa dipakai di tablet, HP, atau laptop yang sudah Anda punya.</Trans> },
  { q: <Trans>Bagaimana cara pindah dari sistem lama?</Trans>, a: <Trans>Anda cukup membuat menu dan stok awal. Tim kami siap membantu proses perpindahan lewat WhatsApp.</Trans> },
  { q: <Trans>Apakah mendukung QRIS?</Trans>, a: <Trans>Ya. kodapos mendukung QRIS statis dan dinamis, plus tunai, split, dan kartu hadiah.</Trans> },
  { q: <Trans>Apakah data saya aman?</Trans>, a: <Trans>Data tersimpan aman di cloud dan hanya bisa diakses oleh akun kafe Anda.</Trans> },
  { q: <Trans>Bisakah dipakai banyak kasir?</Trans>, a: <Trans>Bisa. Atur staf, peran, dan shift, lalu pantau aktivitas tiap kasir.</Trans> },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading>
          <Trans>Pertanyaan umum</Trans>
        </SectionHeading>
        <div className="mx-auto max-w-2xl">
          {QA.map((item, i) => (
            <div key={i} className="border-b border-border py-5">
              <h3 className="text-base font-semibold">{item.q}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create the CTA band**

`src/components/marketing/cta-band.tsx`:

```tsx
import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Button } from '~/components/ui/button';

export function CtaBand() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-5xl rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          <Trans>Siap mempercepat kafe Anda?</Trans>
        </h2>
        <p className="mx-auto mt-3.5 max-w-md text-primary-foreground/75">
          <Trans>Coba kodapos gratis hari ini. Tanpa kartu kredit.</Trans>
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" variant="secondary">
            <a href="#fitur"><Trans>Lihat fitur</Trans></a>
          </Button>
          <Button asChild size="lg" className="bg-background text-foreground hover:bg-background/90">
            <Link to="/signup"><Trans>Mulai gratis</Trans></Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire into the route**

Add imports and replace both placeholders with `<Faq />` and `<CtaBand />`. The route file now imports and renders all eight sections.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Visual check**

Run: `python3 /tmp/lp_shot.py /tmp/lp6.png 1280`
Expected: FAQ list with dividers, then an inverted (primary background) CTA band with two buttons. Confirm.

- [ ] **Step 6: Commit**

```bash
git add src/components/marketing/faq.tsx src/components/marketing/cta-band.tsx src/routes/_public/index.tsx
git commit -m "feat(marketing): FAQ and final CTA band

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: i18n fill, dash check, and full QA

**Files:**
- Modify: `src/locales/en/messages.po` (fill new English strings)
- Modify: `src/locales/id/messages.po` (regenerated by extract)

**Interfaces:**
- Consumes: all `<Trans>` strings added in Tasks 1 to 6.

- [ ] **Step 1: Extract**

Run: `pnpm lingui:extract`
Expected: the summary lists new messages; the `en` row shows a Missing count greater than zero.

- [ ] **Step 2: Fill English**

For every new `msgid` from the marketing components in `src/locales/en/messages.po` whose `msgstr` is empty, set the English value from the spec (`docs/superpowers/specs/2026-06-21-marketing-landing-page-design.md`, Content section). Examples (fill all, not only these):

```
msgid "Jalankan kafe Anda, bukan kasirnya."
msgstr "Run your cafe, not the register."

msgid "Satu aplikasi untuk kasir, stok, dan laporan. Jual lebih cepat, jaga margin, dan ambil keputusan dengan bantuan AI."
msgstr "One app for the register, stock, and reports. Sell faster, protect your margins, and decide with help from AI."

msgid "Mulai gratis"
msgstr "Start free"

msgid "[Contoh testimoni. Ganti dengan kutipan pelanggan asli sebelum tayang.]"
msgstr "[Sample testimonial. Replace with a real customer quote before launch.]"
```

- [ ] **Step 3: Verify no missing English, then compile**

Run: `pnpm lingui:extract && pnpm lingui:compile`
Expected: the `en` Missing count is 0; compile reports Done.

- [ ] **Step 4: Dash check (enforce the no-dash rule)**

Run: `grep -RnE "\-\-|—" src/components/marketing src/routes/_public/index.tsx`
Expected: no output (exit code 1). If anything prints, rewrite that copy without dashes and re-extract.

Also check the filled English copy:
Run: `grep -nE "\-\-|—" src/locales/en/messages.po | grep -iE "kafe|cafe|kasir|register|margin|QRIS|stok|stock" `
Expected: no marketing lines with dashes.

- [ ] **Step 5: Typecheck and tests**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean; full suite passes (no logic changed).

- [ ] **Step 6: Production build**

Run: `pnpm build`
Expected: build completes with no errors.

- [ ] **Step 7: Full visual QA (desktop and mobile, light and dark, both languages)**

With `pnpm dev` running, capture matrix screenshots:

```python
# /tmp/lp_qa.py
from playwright.sync_api import sync_playwright
shots = [("desktop", 1280), ("mobile", 390)]
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    for theme in ["light", "dark"]:
        for name, w in shots:
            pg = b.new_page(viewport={"width": w, "height": 900}, device_scale_factor=2,
                            color_scheme=theme)
            pg.goto("http://localhost:5173/", wait_until="networkidle")
            # set stored theme so the app's no-flash script applies it
            pg.evaluate(f"localStorage.setItem('kodapos.theme', '{theme}')")
            pg.reload(wait_until="networkidle")
            pg.wait_for_timeout(600)
            pg.screenshot(path=f"/tmp/lp_{theme}_{name}.png", full_page=True)
            pg.close()
    b.close()
print("done")
```

Run: `python3 /tmp/lp_qa.py`
Expected: open the four PNGs. The page is readable and well-spaced in light and dark, sections stack cleanly on mobile, no content overflows, dashes absent. Use the in-page ID/EN toggle manually if you want to eyeball the English copy, or trust the filled catalog.

- [ ] **Step 8: Commit**

```bash
git add src/locales/en/messages.po src/locales/id/messages.po
git commit -m "feat(marketing): fill English catalog for the landing page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notes for the reviewer

- The page reuses the existing design system end to end (Geist, theme tokens, `Button`, `BrandMark`), so it inherits light and dark automatically.
- Testimonials are deliberately placeholder copy with a visible note; replace with real quotes before any public launch.
- Pricing reflects that no billing model exists yet (free early access). If a pricing model lands later, revisit `pricing.tsx`.
- After merge, the page is live at `/` for unauthenticated visitors; `/signin` and `/signup` are unchanged.
