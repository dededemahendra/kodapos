# Free pricing, design

**Date:** 2026-07-24
**Status:** Approved, ready for planning

## Background

kodapos is to be presented as free. The homepage currently implies the opposite.

There is **no billing anywhere in the product**. No subscription table, no plan field on `businesses`, no Stripe or payment-provider integration for the SaaS itself, no gating of any feature behind a tier. `convex/lib/pricing.ts` exists but is menu-item sale pricing, unrelated to plans. Nothing needs to be switched off; nothing is currently charged.

What exists is marketing copy. `src/components/marketing/pricing.tsx` (218 lines) renders a three-tier grid:

| Tier | State today |
|---|---|
| Gratis | Real. CTA to `/signin`. |
| Pro | Badge "Segera" (coming soon). No price. CTA to `/signin`. |
| Bisnis | Badge "Segera". No price. Outline CTA. |

So the page already shows **no rupiah figure anywhere**. The problem is structural rather than numeric: three tiers, with the strongest features (asisten AI, prakiraan permintaan, banyak cabang) listed under a Pro tier, tells a visitor that those features cost money. They do not. They ship today and are free to every user.

Structured data is already correct: `src/lib/seo.ts:83` declares `offers: { '@type': 'Offer', price: '0', priceCurrency: 'IDR' }`. The FAQ contains no cost question.

## Goals

- The homepage states plainly that the product is free.
- Features previously advertised as Pro are shown as included, because they are.
- No claim contradicts the Terms of Service.
- The analytics funnel shipped in PR #159 keeps working across the change.

## Non-goals

- Any change to billing (there is none to change).
- Any change to the Terms of Service.
- Any promise that the product is free permanently.

## Decision

Replace the three-tier grid with a single "free" band in the same slot on the page.

### 1. `src/components/marketing/pricing.tsx`

Replace the tier grid with one centered band:

- Badge: `Gratis`
- Heading: `Gratis sepenuhnya`
- Subhead: `Semua fitur, tanpa biaya, tanpa kartu kredit.`
- One feature list, merging the old Free and Pro lists:
  - Kasir, stok, dan laporan lengkap
  - Asisten AI dan prakiraan permintaan
  - Kelola banyak outlet
  - Meja, reservasi, dan pesan mandiri (QR)
  - Dukungan lewat WhatsApp
  - Tanpa kartu kredit
- One primary CTA: `Mulai gratis`, linking to `/signin`

The `MotionConfig reducedMotion="user"` wrapper and the `VP` viewport convention are kept, matching every other marketing section.

### 2. `src/components/marketing/marketing-header.tsx:26`

Link text `Harga` becomes `Gratis`. The `href="/#pricing"` is unchanged.

### 3. `src/components/marketing/marketing-footer.tsx:70`

Same change, same reasoning.

## Deliberate non-changes

Each of these looks like an oversight and is not.

**The file stays named `pricing.tsx` and the anchor stays `#pricing`.** Renaming the file would be more honest to its new content, but the anchor is linked from the header, the footer, and any URL already shared as `kodapos.app/#pricing`. More importantly, `location: 'pricing'` is a value in the `CtaLocation` union (`src/lib/analytics/events.ts:15`) and has been collecting data since 2026-07-24. Renaming it splits the funnel into a before and an after for no user-visible gain. A comment at the top of the file will record that the name outlived the pricing.

**Analytics properties are unchanged:** `track('marketing_cta_clicked', { location: 'pricing', label: 'start_free' })`. Both values are already legal in the `CtaLocation` and `CtaLabel` unions, so no type changes. Tracked CTAs drop from 9 to 8, because the two tier buttons that both reported `start_free` collapse into one. This is expected, and worth knowing when reading the funnel across the deploy boundary.

**Terms of Service is untouched.** It already says core features are provided at no cost during early access, and that paid plans will be announced before that period ends. That text is compatible with being free now and preserves the option to charge later.

**`src/lib/seo.ts` is untouched.** It already advertises price 0.

**The word "selamanya" (forever) is not used.** The Terms state that paid plans will be announced before early access ends. A "free forever" claim on the homepage would contradict the site's own legal page. "Gratis sepenuhnya" is true today and promises nothing about the future.

## Internationalisation

Every string is wrapped in `<Trans>`, as in the current file. New and changed strings require:

1. `pnpm lingui:extract`
2. Fill the English catalog. Extraction alone leaves new strings rendering Indonesian to English readers.
3. `pnpm lingui:compile`

Copy in both locales follows the project rule of no em-dash and no double hyphen, using commas, periods, and parentheses instead.

## Testing

Marketing components are `.tsx`, and vitest runs in `edge-runtime` with no DOM and no testing-library, so there is no way to unit-test this component in this repository. Verification is therefore:

- `pnpm typecheck`, `pnpm test`, `pnpm build` all green, and no new Biome findings.
- `pnpm lingui:compile` green, with the English catalog showing no untranslated new entries.
- Manual: load `/`, confirm the band renders, that the header and footer "Gratis" links scroll to it, and that the layout holds at mobile and desktop widths.
- Manual: confirm no tier, no "Segera" badge, and no rupiah figure remains on the page.

## Risks

- **Low.** The change is presentational, in a component with no callers other than the homepage, and no data flows through it.
- The only durable consequence is the analytics discontinuity noted above, which is a reduction in CTA count rather than a break.
