# Design: App-wide i18n (Indonesian + English)

**Date:** 2026-05-29
**Status:** Approved (pending spec review)

## Goal

Make the kodapos UI translatable and switchable between **Indonesian (`id`, source)** and **English (`en`)**, retrofitting the whole existing app and establishing i18n as the standard for all new features/pages going forward.

Out of scope: wiring real dashboard data (deferred separately).

## Current state

Lingui v6 is already installed and minimally wired:

- `lingui.config.ts` — `locales: ['id', 'en']`, `sourceLocale: 'id'`, `fallbackLocales.default: 'id'`, PO format, `compileNamespace: 'es'`.
- `@lingui/vite-plugin`, `@lingui/format-po`, babel macro all present.
- `src/lib/i18n.ts` — loads both catalogs but **hardcodes `i18n.activate('id')`** (no switching/persistence).
- `src/routes/__root.tsx` — wraps the app in `<I18nProvider i18n={i18n}>`.
- `src/locales/{id,en}/messages.po` exist but only the **public landing** (`_public/index.tsx`) uses `<Trans>` (3 strings).
- Everything else (all POS pages + the new sidebar/header/dashboard) is **hardcoded Indonesian**; no language switcher.

## Decisions

| Topic | Decision |
|---|---|
| Coverage | Full-app retrofit now; macros are the convention for all new work |
| Locales | `id` (source) + `en`; both catalogs statically imported (only 2) |
| Persistence | `localStorage` key `kodapos.locale`, default `id`; clean seam to move to a cafe setting later |
| Switcher | `/settings/language` (Pengaturan); reachable from sidebar Pengaturan submenu + settings side-nav |
| Currency | Always IDR (`Rp`) regardless of UI language |
| Date/number formatting | Driven by active locale via `Intl` |
| Convention guard | Add `eslint-plugin-lingui` to flag unwrapped JSX text |
| Rejected | Per-locale dynamic chunk loading (unneeded for 2 locales); runtime machine translation (wrong tool) |

## Components

### 1. Locale runtime — `src/lib/i18n.ts`
- Load both catalogs (unchanged).
- `getStoredLocale()`: read `localStorage['kodapos.locale']`; validate against `['id','en']`; default `'id'`.
- Activate the stored locale at startup instead of the hardcoded `'id'`.
- Export `type Locale = 'id' | 'en'`, `LOCALES` (with display labels), and `setLocale(locale)` → persist to `localStorage` + `i18n.activate(locale)`.
- SSR note: `localStorage` is browser-only. Reads must be guarded (`typeof window`), defaulting to `id` on the server so SSR and first client render agree (avoids hydration mismatch).

### 2. Re-render on switch — `__root.tsx`
- Keep `<I18nProvider i18n={i18n}>`. Hold the active locale in React state at the root; `setLocale` updates that state so the provider subtree re-renders with the new catalog (Lingui's documented dynamic-activation pattern). A small `useLocale()` hook exposes `{ locale, setLocale }`.

### 3. Switcher UI — `src/routes/_pos/settings/language.tsx`
- A "Bahasa / Language" card with a `ToggleGroup` (Indonesia / English) bound to `useLocale()`.
- Add **"Bahasa"** to the sidebar Pengaturan submenu (`app-shared.tsx`) and to the settings side-nav (`settings/route.tsx`).

### 4. String retrofit
- Replace hardcoded UI text with `<Trans>…</Trans>` (JSX) and the `t` macro (`useLingui()` → `` t`…` ``) for attributes/dynamic strings, across: `_public/*`, all `_pos/*` pages, and the new `app-sidebar`, `app-header`, `nav-group`, `nav-user`, `app-breadcrumbs`, `latest-change`, dashboard widgets, `coming-soon`, and nav labels in `app-shared.tsx`.
- Source text stays Indonesian (sourceLocale `id`).
- Run `pnpm lingui:extract` → populates `id` + `en` catalogs; fill English translations in `en/messages.po`; `pnpm lingui:compile`.

### 5. Formatting — `src/lib/formater.ts`
- `formatDate` and number helpers use the active locale via `Intl` / `i18n.date`. Currency formatter stays IDR (`Rp`).
- Replace the hardcoded Indonesian month-name array with locale-aware `Intl.DateTimeFormat`.

### 6. Convention guard
- Add `eslint-plugin-lingui` with the rules that flag unwrapped JSX text / string literals in UI, wired into the existing lint setup. Document in the spec/README that new strings must use macros + re-extract.

## Risks / notes

- **Volume:** the retrofit touches many files and extracts a large catalog; English translations are authored by us. Mechanical but sizable — implementation plan should batch by area (public → shell/nav → dashboard → sale → menu → inventory → settings → history).
- **Hydration:** server defaults to `id`; if a user's stored locale is `en`, the first paint is `id` then switches on hydration. Acceptable; alternative (cookie-based SSR locale) is a future enhancement.
- **`nav-group` active text:** labels come from `app-shared.tsx` data, not JSX — these need the `t` macro at render time (in `nav-group`/`app-sidebar`), not in the data module, so they react to locale changes.
- **Biome:** lint currently OOMs in the dev env (node 25 / biome 2.4); the `eslint-plugin-lingui` guard runs under ESLint, independent of Biome.

## Verification

- `pnpm typecheck` clean.
- `pnpm lingui:extract` + `pnpm lingui:compile` run clean; `en` catalog has no missing translations.
- Switch id↔en in Settings → sidebar, header breadcrumb, and dashboard labels re-translate live without reload.
- Playwright screenshots in both locales.
- New ESLint guard reports zero unwrapped strings after the retrofit.

## Convention (going forward)

All new UI strings use `<Trans>` / `t`. After adding strings, run `pnpm lingui:extract` and provide `en` translations. The ESLint guard enforces this in CI/local lint.
