# Terms of Service & Privacy Policy Pages — Design

**Date:** 2026-06-21
**Status:** Approved (brainstorming)

## Goal

Replace the placeholder `/terms` and `/privacy` pages with comprehensive,
bilingual (Indonesian + English), Indonesian-law-aware legal pages tailored to
kodapos's real data practices, presented honestly as a draft pending legal
review.

## Decisions

- **Language:** Bilingual (ID source of truth, EN translation), selected by the
  app's existing `useLocale()`.
- **Governing law / privacy law:** Indonesia. Privacy Policy framed around UU PDP
  No. 27 of 2022 (Undang-Undang Pelindungan Data Pribadi).
- **Content depth + honesty:** Comprehensive, tailored draft with a VISIBLE
  amber notice on both pages stating the text is a template, not yet reviewed by
  legal counsel, and bracketed placeholders must be completed before launch.

## Architecture

- `src/components/legal/legal-page.tsx` — shared `LegalPage` layout:
  `MarketingHeader` + a review-notice banner + page title + "Last updated" +
  anchored table of contents + prose sections + `MarketingFooter`. Renders
  sections from structured content.
- `src/content/legal/terms.ts`, `src/content/legal/privacy.ts` — per-locale
  structured content: `Record<Locale, LegalDoc>` where
  `LegalDoc = { title; effectiveDate; sections: { id; heading; body }[] }`.
  Long-form legal prose lives in one readable file per language (reviewable by a
  lawyer), kept out of the lingui `.po` catalog (same precedent as the
  English-only receipt content). UI chrome stays in `<Trans>`.
- `src/routes/_public/terms.tsx`, `privacy.tsx` — thin routes that pick the doc
  for the active locale and render `<LegalPage>`. Each sets `head()` (title +
  description, noindex optional) for SEO.
- **Anchor fix:** `MarketingHeader` and `MarketingFooter` section links become
  absolute (`/#features`, `/#how-it-works`, `/#pricing`, `/#faq`) so they work
  from any route, including the legal pages.

## Content outline

### Terms of Service (~13 sections)
1. Acceptance of terms
2. About the service (POS; AI features carry the "AI can be wrong" disclaimer)
3. Accounts & security
4. Acceptable use
5. Your content and data (the cafe owns its data; limited license to operate)
6. Pricing (early access is free now; paid plans announced later)
7. Third-party services (QRIS/payments, etc.)
8. Service availability (no uptime warranty)
9. Disclaimers & limitation of liability
10. Termination
11. Changes to the terms
12. Governing law (Indonesia)
13. Contact

### Privacy Policy (~15 sections, UU PDP)
1. Introduction (who we are; controller vs processor roles)
2. Data we collect (account, cafe profile, transactions, end-customer/loyalty,
   technical/usage)
3. How we use data (purposes)
4. Legal basis (UU PDP)
5. Controller vs processor (kodapos processes the cafe's customer data on the
   cafe's behalf)
6. Sharing & sub-processors (Convex, Resend, Cloudflare, AI provider, QRIS)
7. Retention
8. Security
9. Your rights under UU PDP (access, correction, deletion, withdraw consent,
   object, portability, complaint)
10. AI features (what is sent to the AI provider; not used to train public models)
11. Cookies & similar (localStorage for theme/locale; minimal)
12. Children
13. International transfers (sub-processors outside Indonesia)
14. Changes to this policy
15. Contact / data protection contact

## Honesty constraints

- Visible amber review-notice banner on both pages, bilingual.
- Bracketed placeholders for unknowable facts: `[legal entity name]`,
  `[registered address]`, `[contact email]`, `[DPO contact]`.
- Not legal advice; AI-drafted template requiring counsel review before launch.

## Global constraints (inherited)

- No `--` or em-dash in any user-facing copy (ID + EN). Use commas/periods/parens.
- Theme tokens only (the amber notice may use `amber-*` utilities for the warning
  affordance, consistent with how warnings read in light/dark).
- All UI chrome strings wrapped in `<Trans>`; EN catalog filled (en Missing = 0).
- SSR-safe; reduced motion honored.
- Verify: `pnpm typecheck`, `pnpm build`, `pnpm test`, lingui extract/fill/compile,
  Playwright screenshots (light/dark, both locales, mobile).
