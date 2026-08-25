# Marketing feature pages + screenshot pipeline

Date: 2026-08-23
Status: Design approved, ready for implementation planning

## Goal

The landing page sells roughly a third of what kodapos ships. A visitor who
needs to know whether it handles their specific situation (QR ordering, a
kitchen display, table tabs, reservations) cannot find out without signing up.

This design adds deep feature pages whose primary job is to answer "does it do
X?" in depth, backed by real screenshots of the running app.

Primary job: **answer "does it do X?"** — not SEO, not trust-building, not
shareable links. Those are welcome side effects and must not drive decisions
that trade against depth.

## Scope

Target shape: the home page stays an overview; a `/fitur` hub links six
job-based deep pages.

```
/fitur                    hub, all ~30 capabilities in a grid
  /fitur/kasir            kasir · QRIS · struk · printer · shift kas
  /fitur/pesanan          meja · QR self-order · reservasi · dapur
  /fitur/stok             inventaris · resep/HPP · limbah · PO · pemasok
  /fitur/laporan          laporan · asisten AI · prediksi · dasbor
  /fitur/pelanggan        pelanggan · loyalitas · promo · kartu hadiah
  /fitur/tim              staf · peran · jam kerja · shift · multi-outlet
```

This is two subsystems, not one:

- **A — demo data + screenshot pipeline.** Seeded state, an authenticated
  capture script, images on disk.
- **B — the pages.** Hub, template, content, nav, SEO, analytics, tests.

B's value depends on A. A shows the user nothing until B lands.

**This spec covers a vertical slice: subsystem A for the screens one page
needs, plus that one page end to end.** The slice page is `/fitur/pesanan`,
chosen deliberately over `/fitur/kasir`: kasir is the one area the home page
already covers well, so it is the weakest test of whether these pages add
information. Pesanan is absent from the landing page entirely, needs five
distinct screenshots, and includes the KDS — the screen most likely to expose
whether seeded data photographs well. If the pattern survives pesanan, it
survives all six.

The remaining five pages are content work against a proven template and are
out of scope here.

## Verified product truth

Every claim on these pages must trace to code. The capability map below was
produced by reading `convex/` and `src/routes/_pos/`, then adversarially
fact-checked (18 of 20 backend claims confirmed; the 2 rejected had fabricated
evidence citations, though their conclusions held).

### May be claimed (pesanan domain)

| Claim | Evidence |
| --- | --- |
| Server recomputes every price; the client never sends one | `convex/public.ts:236-338` |
| Self-order submission is idempotent per attempt | `convex/public.ts:373-390` |
| Max 8 outstanding pending self-orders per cafe | `convex/public.ts:34` |
| No order reaches the kitchen without staff tapping Accept — even a paid one | `convex/selfOrders.ts:9-13,152-161,187-273` |
| Staff queue and kitchen board are realtime Convex reactive queries | `convex/selfOrders.ts:43-71`, `convex/kitchen.ts` |
| QRIS pay-now is idempotent / TOCTOU-safe; concurrent taps reuse one charge | `convex/public.ts:646-707` |
| Accepting a paid order re-verifies the total and refuses on drift | `convex/selfOrders.ts:187-273` |
| A paid self-order cannot be silently rejected | `convex/selfOrders.ts:163-179` |
| One open tab per table, enforced | `convex/heldOrders.ts:26-34` |
| Per-table QR token is minted once and keeps working | `convex/tables.ts:101-116` |
| Table cards show occupancy with running total and item count | `convex/tables.ts:118-173` |

### Must NOT be claimed

These are all sentences that would write themselves into marketing copy:

- Reservation reminders or confirmations to guests (no SMS/WhatsApp/email code
  touches `reservations.ts`)
- Automatic no-show detection. Note: `convex/crons.ts` **does** exist with four
  jobs (nightly forecast, low-stock digest, QRIS reconcile, rate-limit prune) —
  none reference reservations. The accurate phrasing is "no cron job touches
  reservations", not "there is no scheduling".
- Double-booking prevention — two reservations can overlap on one table with no
  validation error
- A visual/drag-drop floor-plan editor — tables are a flat named list with no
  capacity or coordinates
- Split, merge, or transfer of table orders
- Per-station kitchen routing (bar vs kitchen), ticket printing, or a
  "preparing" intermediate state
- Live "your order is ready" tracking for the customer — they see only
  new/accepted/rejected
- Loyalty points earned on a QR self-order

### The `truth` block

`/fitur/pesanan` states its limits plainly in a dedicated section. A cafe owner
discovering a limit on the page is a far better outcome than discovering it in
week two, it makes every other claim more credible, and it is affordable
precisely because the product is strong where it counts.

## Subsystem A — demo data + screenshot pipeline

### A1. Deployment safety (hard gate)

`CHANGELOG.md:7`: *"Production Convex cutover is still pending (deploy
currently targets the DEV deployment)."* `scripts/cf-deploy.mjs` only runs
`convex deploy` on `main`.

**The deployed app currently runs against the DEV Convex deployment.**
`seed:run` with `purge: true` hard-deletes rows across ~29 tables
(`purgeForCafe`). Running the pipeline against DEV would wipe the data behind
the live site.

Requirements:

1. The capture script MUST refuse to run unless `CONVEX_DEPLOYMENT` matches an
   explicit allowlisted screenshot deployment, read from a dedicated env var
   (e.g. `SHOTS_CONVEX_DEPLOYMENT`). No default, no fallback to whatever is
   configured.
2. `purge: true` is only ever sent to that deployment.
3. The intended target is a **dedicated Convex deployment for screenshots**,
   provisioned separately. Documented in the runbook this design produces.

This is a data-safety gate, not a nicety. It is the first thing to build.

### A2. Seed extensions

`convex/seed.ts` produces rich data for dashboard, reports, inventory, and
customers, and correctly leaves the most recent shift **open**
(`seed.ts:878`, `isOpen = i === shiftCount - 1`). It does not produce what the
pesanan screens need.

| Screen | Needs | Status today |
| --- | --- | --- |
| `/tables` | `heldOrders` on 2-3 tables in the open shift | **Not seeded** — renders 12 empty dashed cards |
| `/self-orders` | `selfOrders` rows, status `new`, mix of paid/unpaid | **Not seeded** — renders the empty state |
| `/order/{token}` | a minted `qrToken` on a table | **Not seeded** — page unreachable |
| `/kitchen` | open-shift orders with `kitchenStatus` new/ready | Seeded but **random** (`new`/`ready`/`done` picked per order across all 60 days) |
| `/reservations` | reservations today, mixed statuses, some with tables | Seeded (15, statuses cycle) — adequate |

Work: extend `seed.ts` with a deterministic block that creates held orders on
named tables, a handful of self-orders (mixed paid/unpaid, at least one with a
customer note and one with variants + modifiers), mints a `qrToken` on one
table, and guarantees at least 3 `new` and 1 `ready` kitchen ticket in the open
shift. Same LCG seed discipline as the rest of the file — no `Math.random`.

### A3. Capture script

`scripts/capture-shots.mjs`, a build tool beside `cf-deploy.mjs`, driving the
Playwright library directly (not the test runner). Screenshots are not tests:
they must not run under `pnpm test:e2e`, must not fail CI on a UI shift, and
"assertion failed" is the wrong failure mode for "the image changed".

Flow:

1. **Guard** — assert `SHOTS_CONVEX_DEPLOYMENT` matches `CONVEX_DEPLOYMENT`
   (A1). Assert `localhost:5173` is reachable; exit with instructions if not.
2. **Authenticate** — Convex Auth stores a client-side JWT in `localStorage`
   (`__convexAuthJWT_*`, see `__root.tsx`'s `AUTH_REDIRECT_SCRIPT`), and
   `_pos.tsx` gates every operational screen behind client-side
   `<Authenticated>`. There is no SSR cookie shortcut: the script must drive a
   real UI login. First run performs signup → onboarding → PIN using the flow
   `tests/e2e/sale.spec.ts` already proves; subsequent runs reuse a persisted
   Playwright `storageState`.
3. **Seed** — `seed:run` is an `internalMutation`, so it is CLI-only:
   `npx convex run seed:run` with an explicit `cafeId`, `purge: true`,
   `seed: 12345`. The `cafeId` comes from a new internal query resolving a cafe
   by name, so the `.first()` fallback can never pick the wrong cafe.
4. **Capture** — per route from a manifest:
   - `addInitScript` pins `kodapos.theme` and `kodapos.locale` before first
     paint (both are pre-paint `localStorage` reads), so no toggle clicks and
     no flash
   - browser context `reducedMotion: 'reduce'` so `MotionConfig
     reducedMotion="user"` sections settle instead of being caught mid-animation
   - `networkidle`, then a per-route `waitFor` selector so Convex data has
     painted
   - `await page.evaluate(() => document.fonts.ready)` — Geist loads remotely
     from Google Fonts with `display=swap` and no font-ready gate exists
     anywhere in the repo. Without this, captures race the font swap.
   - viewport 1440×900, `deviceScaleFactor: 2`
5. **Output** — `public/shots/<id>-{light,dark}.webp`.

Failure mode: a route that fails logs and is skipped, remaining routes
continue, script exits non-zero with a summary. Never a silent half-empty
folder.

### A4. Determinism, fidelity, and file size

Known limits, named rather than hidden:

- **Dates drift.** The seed builds data relative to `Date.now()`, so relative
  timestamps shift day to day even with a fixed LCG seed. The image diff is a
  coarse signal, not byte-exact. Accepted.
- **Dev-server fidelity.** Captures run against `pnpm dev` (Vite dev server),
  as the whole e2e suite does — unminified, HMR-instrumented. Production is
  `pnpm build && wrangler dev`. For UI screenshots the visual delta is
  negligible; recorded here so nobody is surprised. Not worth a second
  webServer wiring for the slice.
- **Format and git history.** There is no `.gitattributes` and no git-lfs; the
  only binary precedent in `public/` is a 32KB `og-image.png`. Full-screen PNGs
  at 2× run 300-800KB each, and every regeneration re-diffs the full binary
  into history permanently. Therefore: capture PNG, convert to **WebP** via a
  `sharp` devDependency, delete the PNG, and set a per-image budget (~150KB)
  the script enforces with a warning. Revisit LFS only if the set grows beyond
  the six pages.
- **Deploy path.** `wrangler.jsonc` has no explicit `assets` block;
  `@cloudflare/vite-plugin` synthesises one pointing at the client build
  output, so `public/shots/` ships as static assets with no config change.
  ~12 WebP files is far below any Cloudflare Workers asset limit.

### A5. CI

Out of scope. `.github/workflows/ci.yml` runs only `typecheck`, `test`, and
`lingui:compile` — Playwright is never invoked in CI. This pipeline needs a
live Convex backend and a real login, exactly why `RUN_AUTH_E2E` is opt-in. It
is a local, on-demand tool, run when the UI changes.

## Subsystem B — the pages

### B1. Content model

Copy lives **outside** the Lingui catalog, following `src/content/legal/`:

```
src/content/marketing/types.ts      FeaturePageContent + section union
src/content/marketing/pesanan.ts    id + en side by side
```

Uses `Localized = { id, en }` from `src/lib/localized.ts`, rendered with
`localized(value, locale)` and `useLocale()` — exactly what
`src/routes/_public/changelog.tsx` does.

Rationale: marketing prose is document-shaped. `src/content/legal/terms.ts`
carries a comment stating precisely why it opted out of the catalog ("so the
full document stays readable for legal review"). The catalog route would bury
paragraphs in a 7,970-line `.po` where `fallbackLocales.default = 'id'` makes a
forgotten English string render Indonesian silently and indefinitely.

The template's own chrome (buttons, nav labels, "Mulai gratis") stays
`<Trans>` — those are UI strings and belong in the catalog.

Note for any data-module strings that do go through Lingui: use ``msg`...` ``
from `@lingui/core/macro` (the `app-shared.tsx` precedent) rendered via
`useLingui()` from `@lingui/react`. A ``t`...` `` at module scope is a hard
ESLint error (`lingui/t-call-in-function`).

### B2. Template

`src/components/marketing/feature-page.tsx` renders a fixed shell
(`MarketingHeader` / `main` / `MarketingFooter`) plus an ordered section array.

Section kinds:

| kind | purpose |
| --- | --- |
| `hero` | eyebrow, h1, lede, CTA, one screenshot |
| `capability` | heading + body + screenshot, alternating sides, optional bullets |
| `flow` | numbered end-to-end walkthrough |
| `truth` | what it does / what it deliberately doesn't |
| `faq` | page-scoped Q&A |
| `related` | links to sibling feature pages |
| `cta` | reuses `CtaBand` |

House style must be matched exactly or the pages read as foreign:

- Extract `VP = { once: true, margin: '-80px' }` into a shared module. It is
  copy-pasted verbatim into **10 files** today; the template must not add an
  11th copy.
- `MotionConfig reducedMotion="user"` wraps nearly every animated section (12
  duplicates). Guarantee it still wraps each animated block.
- Container widths are not uniform: `max-w-5xl` for content-dense sections,
  `max-w-6xl` for hero/pricing/faq, `max-w-4xl` for testimonials. Expose per
  section.
- `Card` is only ever used as `Card` + `CardContent` with manual padding.
  `CardHeader`/`CardTitle`/`CardFooter` are never used and would break the look.
- `SectionHeading` is centre-aligned only; `why-indonesia.tsx` skips it to go
  left-aligned. Add an `align` prop rather than a second heading component.
- Factor the framed-screenshot wrapper out of `hero.tsx` and `ai-spotlight.tsx`
  into `<ScreenshotFrame>`. They differ only in fade stop (`from-55%` vs
  `from-60%`); treat that as possibly intentional and keep it a prop.
- Do not reuse the anchor ids `#features`, `#how-it-works`, `#pricing`, `#faq`
  — they are hardcoded across four files and point at the home page.

`<Shot id="..." />` renders the light/dark pair (`dark:hidden` /
`hidden dark:block`), explicit width/height to avoid layout shift,
`loading="lazy"` below the hero.

**Alt text**: no convention exists — the only two `<img>` tags in `marketing/`
are decorative avatars with `alt=""`. A UI screenshot here is *evidence for a
claim*, not decoration, so it needs real, specific alt text authored per shot
in the content module (localized like the rest of the copy), describing what
the screen shows rather than naming the feature.

### B3. Routing

Follow the directory + `route.tsx` convention used by all 7 existing multi-page
features (`_pos/menu`, `_pos/inventory`, …):

```
src/routes/_public/fitur/route.tsx    layout, must literally render <Outlet />
src/routes/_public/fitur/index.tsx    the /fitur hub
src/routes/_public/fitur/pesanan.tsx  the slice page
```

`createFileRoute` paths: `'/_public/fitur'` (layout, no trailing slash),
`'/_public/fitur/'` (index, trailing slash), `'/_public/fitur/pesanan'`.

`tests/routes/route-outlet.test.ts` fails CI if a layout sets `component:`
without `<Outlet` appearing in the source. Note it is a naive substring check,
not an AST check — satisfying the regex is not the same as satisfying the
intent. `routeTree.gen.ts` is generated by the Vite plugin; never hand-edit.

### B4. `/fitur/pesanan` content

1. **Hero** — "Dari meja ke dapur, tanpa kertas." Shot: `/tables`.
2. **Flow** — scan table QR → pick items with variants/modifiers → pay QRIS now
   or at the counter → **staff taps Terima** → ticket appears in the kitchen.
   The approval step is stated, not hidden: no order reaches the kitchen
   unattended, paid or not.
3. **Capability: QR self-order** — server recomputes prices, idempotent
   submission, sold-out items show `Habis`. Shot: `/order/{token}`.
4. **Capability: incoming queue** — realtime, live count badge in the register
   bar, accept-into-register or reject, paid orders cannot be silently dropped.
   Shot: `/self-orders`.
5. **Capability: kitchen board** — realtime, FIFO within status, `Siap` →
   `Selesai`, modifiers under each line. Shot: `/kitchen`.
6. **Capability: tables & reservations** — occupancy with running total, one tab
   per table (enforced), per-table QR printing, today's-reservation badge.
   Shots: `/tables`, `/reservations`.
7. **Truth block** — the "must not be claimed" list, stated plainly.
8. **FAQ, related, CTA.**

## Integration

### Navigation

- `MarketingHeader`'s `Fitur` link repoints from `/#features` to `/fitur`.
- `MarketingFooter`'s Produk column gains the feature pages.
- Home `FeatureSection` gains "Lihat semua fitur" → `/fitur`; pesanan-related
  cards deep-link to `/fitur/pesanan`.

### SEO

- `seo()` per page with its own `path`.
- `public/sitemap.xml` is hand-maintained and currently omits `/changelog`
  entirely. Add `/fitur`, `/fitur/pesanan`, and fix `/changelog`.
- **Structured data**: no `BreadcrumbList` or `FAQPage` JSON-LD exists anywhere
  today. Add both for child pages (breadcrumbs so search shows
  `kodapos › Fitur › Pesanan`; `FAQPage` for the page-scoped Q&A). Builders go
  in `src/lib/seo.ts` beside `HOMEPAGE_JSON_LD` to establish one convention.
- `seo({ noindex: true })` still emits canonical + OG; only `privatePage()`
  suppresses them. Not needed here, but a known footgun.

### Analytics — two independent registries, both mandatory

1. `CtaLocation` in `src/lib/analytics/events.ts` — add `'feature_page'`. These
   literals are permanent once shipped (see the comment atop `pricing.tsx`
   explaining why a rename splits the funnel). Use one shared literal and let
   the pathname super-property separate pages, rather than minting a permanent
   literal per page as the set grows to seven.
2. `MARKETING_PATHS` in `src/lib/analytics/policy.ts` — a **default-deny**
   allowlist gating every pageview capture. **Without this the new pages record
   zero pageviews**, while CTA clicks still fire, which looks like working
   analytics. Add `/fitur` and `/fitur/pesanan`.

`tests/lib/analytics-policy.test.ts` hard-codes a duplicate of the path list;
update it too. Its existing assertions only check that unknown routes stay
excluded, so a missing addition fails nothing.

## Testing

Vitest collects only `*.test.ts`, so `.tsx` components cannot be unit tested.
That is a constraint, not a choice.

New tests:

- **Content integrity** (`src/content/marketing/*.ts` is plain `.ts`): every
  section has non-empty `id` *and* `en`; every `shotId` exists in the manifest.
  Catches the silent Indonesian-fallback failure.
- **Shot manifest ↔ disk**: every manifest id has both `-light` and `-dark`
  files in `public/shots/`. Guards against shipping broken images.
- **Sitemap coverage**: parse `public/sitemap.xml`, assert every public
  marketing route appears. Would have caught the `/changelog` omission.
- **Analytics parity**: assert `MARKETING_PATHS` contains the new paths, not
  merely that unknown ones are excluded.

Free: `tests/routes/route-outlet.test.ts` covers the new layout automatically.

E2E: extend `tests/e2e/smoke.spec.ts` to load `/fitur/pesanan` and assert the
h1 and CTA render. No auth needed, so it runs in the default suite.

Not automatable: screenshot correctness, alt-text quality, JSON-LD validity.
These are review-time checks. There is no existing coverage for `seo()`,
sitemap, or robots either.

## Risks

| Risk | Mitigation |
| --- | --- |
| Seeding/purging the deployment behind the live site | A1 hard gate: explicit allowlisted deployment env var, no fallback |
| Kitchen/tables photograph as empty states | A2 deterministic seed extensions |
| Font swap race producing inconsistent captures | `document.fonts.ready` wait in the capture script |
| Screenshot binaries bloating git history forever | WebP + per-image size budget; revisit LFS if the set grows |
| New pages silently record zero pageviews | `MARKETING_PATHS` + a test asserting inclusion |
| Marketing copy claiming unimplemented behavior | The verified truth table above; the `truth` block |
| Screenshots going stale as the UI changes | Regeneration is one command; deterministic seed makes the diff meaningful |

## Out of scope

- The other five feature pages (content work against a proven template)
- CI integration for the capture pipeline
- Real cafe photography, video, or animated captures
- Fixing the dead `href="#"` social links in `MarketingFooter` (noted, unrelated)
- Restructuring the home page beyond adding links to the new pages
