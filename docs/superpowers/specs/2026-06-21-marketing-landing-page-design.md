# Marketing landing page design

Date: 2026-06-21
Status: Approved (design), pending spec review

## Goal

Replace the bare placeholder landing page (`src/routes/_public/index.tsx`, currently
logo + tagline + two buttons) with a clean, responsive marketing page that converts
Indonesian cafe and QSR owners into sign-ups. Copy must be clear, concise, and
persuasive, with no `--` or em-dash characters anywhere (per project convention).

## Audience and positioning

- **Audience:** owners and managers of cafes and quick-service restaurants in Indonesia.
- **Positioning:** kodapos is an AI-native, all-in-one POS built for Indonesian cafes:
  selling (register, tables, kitchen display, QR self-order), cost control (inventory,
  recipes, COGS, margins), and understanding the business (reports, P&L, AI assistant,
  weather-aware demand forecast). Local fit: QRIS, Bahasa Indonesia, WhatsApp receipts.
- **Voice:** plain, confident, benefit-led. Short sentences. No jargon, no hype, no dashes.

## Decisions from brainstorm

1. **Visual direction:** A, minimal and editorial. Centered hero, generous whitespace,
   monochrome using the existing theme tokens (works in light and dark). Product shown
   via a lightweight CSS register preview, not a screenshot asset.
2. **Language:** bilingual via the existing `lingui` i18n. Indonesian is the source;
   English translations are filled. The page respects the app language toggle.
3. **Sections (in order):** sticky header, hero, features (3 pillars + 12-item grid),
   how it works (3 steps), why kodapos for Indonesia (4 points), testimonials (3
   placeholder cards), pricing (single early-access card), FAQ (5 items), final CTA
   band, footer.
4. **Honesty constraints:**
   - Testimonials are clearly-marked placeholders for the owner to replace with real
     quotes. We do not present invented quotes as real.
   - There is no SaaS pricing model in the codebase. Pricing is framed as "free during
     early access" with a note that pricing will be announced later. No invented tiers.

## Technical approach

### Route and files

- Rewrite `src/routes/_public/index.tsx` to compose the marketing sections and to set
  basic SEO head tags (title + description). The `_public` layout wrapper stays as is.
- New folder `src/components/marketing/` with one focused component per section:
  - `marketing-header.tsx` (sticky nav: logo, anchor links, a compact ID/EN language
    toggle via `useLocale`, and Masuk and Daftar). The toggle gives public visitors a
    way to switch language, since the existing toggle only lives in the authenticated menu.
  - `hero.tsx` (eyebrow, headline, subhead, CTAs, microcopy, register preview, capability strip)
  - `feature-section.tsx` (3 benefit pillars + 12-item feature grid)
  - `how-it-works.tsx` (3 numbered steps)
  - `why-indonesia.tsx` (4 local-fit points)
  - `testimonials.tsx` (3 placeholder cards + a "placeholder" note)
  - `pricing.tsx` (single early-access card)
  - `faq.tsx` (5 question and answer rows)
  - `cta-band.tsx` (final inverted CTA)
  - `marketing-footer.tsx` (brand, link columns, copyright)
  - `register-preview.tsx` (decorative CSS mock of the register, `aria-hidden`)
- Feature, step, why, and FAQ items live as small arrays inside their own section
  components (each item still wrapped in `Trans` for i18n).

### Design system

- Typeface: Geist (already global). shadcn `Button` for all CTAs: `default` variant for
  primary ("Mulai gratis", "Daftar"), `outline` for secondary ("Lihat fitur", "Masuk").
  The embossed button styling is already in place.
- Brand: reuse `BrandMark` (`~/components/brand-mark`) in header and footer.
- Colors: theme tokens only (`bg-background`, `text-foreground`, `text-muted-foreground`,
  `border-border`, `bg-muted` for alternating sections, `bg-primary`/`text-primary-foreground`
  for the final CTA band). No hardcoded hex, so the page adapts to light and dark.
- Radius and shadows follow existing token scale (`rounded-lg`/`rounded-xl`).

### Responsiveness

- Mobile-first. Container max width ~`max-w-6xl`, horizontal padding `px-6`.
- Grids collapse to one column under `md`. Header anchor links hide under `md`; the
  Masuk and Daftar buttons remain visible at all sizes.
- Register preview collapses to a single column on small screens.

### Internationalization

- All visible copy wrapped in `<Trans>` (or `t` for attributes), Indonesian source.
- After implementation: run `pnpm lingui:extract`, fill the English catalog, then
  `pnpm lingui:compile`. English values are listed in the content section below.
- No `--` or em-dash in either language. Use commas, periods, and parentheses. The
  capability strip uses the middot `·` separator, which is not a dash.

### Links and behavior

- "Daftar" and "Mulai gratis" link to `/signup`. "Masuk" links to `/signin`.
- Header nav anchors scroll to `#fitur`, `#cara`, `#harga`, `#faq` with smooth scroll.
  Anchored sections get `scroll-mt` so the sticky header does not cover their headings.
- Language toggle uses `useLocale` (`~/components/locale-provider`) to switch ID and EN
  in place; the choice persists the same way the in-app toggle does.
- No new backend, queries, or mutations.

### SEO

- Route `head()` sets `title` ("kodapos, POS pintar untuk kafe dan resto") and a
  meta description. Open Graph tags are out of scope for this pass.

## Content (Indonesian source and English fill)

Header nav: Fitur / Features, Cara kerja / How it works, Harga / Pricing, FAQ / FAQ.
Buttons: Masuk / Sign in, Daftar / Sign up, Mulai gratis / Start free, Lihat fitur / See features.

### Hero
- Eyebrow: "POS untuk kafe dan resto" / "POS for cafes and restaurants"
- Headline: "Jalankan kafe Anda, bukan kasirnya." / "Run your cafe, not the register."
- Subhead: "Satu aplikasi untuk kasir, stok, dan laporan. Jual lebih cepat, jaga margin, dan ambil keputusan dengan bantuan AI." / "One app for the register, stock, and reports. Sell faster, protect your margins, and decide with help from AI."
- Microcopy: "Gratis selama akses awal. Tanpa kartu kredit." / "Free during early access. No credit card."
- Capability strip: Kasir, Meja, Layar dapur, Pesan mandiri QR, Stok dan resep, QRIS, Loyalitas, Laporan / Register, Tables, Kitchen display, QR self-order, Stock and recipes, QRIS, Loyalty, Reports.

### Features
- Section title: "Semua yang dibutuhkan kafe Anda, dalam satu tempat" / "Everything your cafe needs, in one place"
- Section sub: "Dari pesanan pertama sampai laporan akhir bulan." / "From the first order to the month-end report."
- Pillars:
  1. "Jual lebih cepat" / "Sell faster" — "Kasir, meja, layar dapur, dan pesan mandiri lewat QR. Terima QRIS, tunai, atau split tanpa ribet." / "Register, tables, kitchen display, and QR self-order. Take QRIS, cash, or split with no hassle."
  2. "Jaga margin" / "Protect your margins" — "Lacak stok bahan dan resep, hitung harga pokok otomatis, dan lihat margin tiap menu." / "Track ingredient stock and recipes, calculate cost of goods automatically, and see the margin on every item."
  3. "Pahami bisnis Anda" / "Understand your business" — "Laporan penjualan dan laba rugi yang jelas, plus asisten AI dan prakiraan permintaan." / "Clear sales and profit and loss reports, plus an AI assistant and demand forecast."
- Feature grid (title, desc):
  1. Kasir cepat / Fast register — "Antarmuka ringan yang siap dipakai di tablet, HP, atau laptop." / "A light interface ready on a tablet, phone, or laptop."
  2. Manajemen meja / Table management — "Buka, gabung, dan pindah meja. Pantau status tiap pesanan." / "Open, merge, and move tables. Track the status of every order."
  3. Layar dapur / Kitchen display — "Pesanan langsung tampil di dapur, rapi dan urut." / "Orders appear in the kitchen instantly, tidy and in order."
  4. Pesan mandiri QR / QR self-order — "Pelanggan memesan dari meja lewat kode QR." / "Customers order from the table with a QR code."
  5. Stok dan resep / Stock and recipes — "Stok bahan berkurang otomatis dari resep tiap menu." / "Ingredient stock drops automatically from each item recipe."
  6. QRIS dinamis / Dynamic QRIS — "Terima pembayaran QRIS langsung dari kasir." / "Take QRIS payments straight from the register."
  7. Loyalitas dan poin / Loyalty and points — "Kumpulkan pelanggan dan beri poin serta hadiah." / "Grow your customer base and reward them with points."
  8. Kartu hadiah / Gift cards — "Jual dan tukarkan saldo kartu hadiah." / "Sell and redeem gift card balances."
  9. Shift dan absensi / Shifts and time clock — "Buka tutup shift, jam kerja, dan serah terima kas." / "Open and close shifts, track hours, and hand over cash."
  10. Promo dan diskon / Promos and discounts — "Atur promo, diskon manual, dan biaya layanan." / "Set promos, manual discounts, and service charges."
  11. Laporan dan laba rugi / Reports and profit and loss — "Penjualan, produk, kasir, dan laba rugi harian." / "Sales, products, cashiers, and daily profit and loss."
  12. Asisten AI / AI assistant — "Tanya data Anda dan dapatkan saran stok dengan kunci API sendiri." / "Ask your data and get restock advice with your own API key."

### How it works
- Title: "Mulai dalam tiga langkah" / "Get started in three steps"
- Sub: "Tanpa pelatihan panjang, tanpa pemasangan rumit." / "No long training, no complex install."
- Steps:
  1. "Daftar dan atur menu" / "Sign up and set your menu" — "Buat akun, lalu tambahkan menu, harga, dan stok dalam hitungan menit." / "Create an account, then add your menu, prices, and stock in minutes."
  2. "Mulai berjualan" / "Start selling" — "Terima pesanan di kasir, meja, atau lewat QR. Bayar dengan QRIS atau tunai." / "Take orders at the register, at tables, or by QR. Pay with QRIS or cash."
  3. "Pantau dan kembangkan" / "Track and grow" — "Lihat laporan harian dan biarkan AI menyarankan stok serta menu terlaris." / "See daily reports and let AI suggest restock and your best sellers."

### Why kodapos for Indonesia
- Title: "Dibuat untuk kafe dan resto di Indonesia" / "Built for cafes and restaurants in Indonesia"
- Sub: "Bukan sekadar terjemahan. kodapos paham cara kerja usaha lokal." / "Not just a translation. kodapos understands how local businesses work."
- Points:
  1. "QRIS bawaan" / "QRIS built in" — "Statis dan dinamis, langsung dari kasir tanpa alat tambahan." / "Static and dynamic, straight from the register with no extra device."
  2. "Bahasa Indonesia" / "Bahasa Indonesia" — "Seluruh aplikasi dalam Bahasa Indonesia, mudah dipakai semua staf." / "The whole app in Bahasa Indonesia, easy for every staff member."
  3. "Prakiraan sadar cuaca" / "Weather-aware forecast" — "AI membaca pola cuaca lokal untuk memperkirakan permintaan harian." / "AI reads local weather patterns to estimate daily demand."
  4. "Struk digital" / "Digital receipts" — "Kirim struk lewat email atau WhatsApp ke pelanggan Anda." / "Send receipts by email or WhatsApp to your customers."

### Testimonials
- Title: "Dipakai pemilik kafe seperti Anda" / "Used by cafe owners like you"
- Three cards, each quote: "[Contoh testimoni. Ganti dengan kutipan pelanggan asli sebelum tayang.]" / "[Sample testimonial. Replace with a real customer quote before launch.]" Name: "Nama Pemilik" / "Owner name", place: "Nama Kafe, Kota" / "Cafe name, City".
- Note under the grid: "Placeholder. Akan diganti dengan testimoni pelanggan asli." / "Placeholder. To be replaced with real customer testimonials."

### Pricing
- Title: "Harga sederhana" / "Simple pricing"
- Sub: "Mulai sekarang tanpa biaya selama masa akses awal." / "Start now at no cost during early access."
- Badge: "Akses awal" / "Early access". Amount: "Gratis" / "Free". Under amount: "untuk saat ini" / "for now".
- List: "Semua fitur terbuka" / "All features unlocked"; "Tanpa biaya pemasangan" / "No setup fee"; "Tanpa kartu kredit" / "No credit card"; "Dukungan lewat WhatsApp" / "Support over WhatsApp".
- CTA: "Mulai gratis" / "Start free". Note: "Harga akan diumumkan sebelum masa akses awal berakhir." / "Pricing will be announced before early access ends."

### FAQ
1. "Apakah perlu perangkat khusus?" / "Do I need special hardware?" — "Tidak. kodapos berjalan di browser, jadi bisa dipakai di tablet, HP, atau laptop yang sudah Anda punya." / "No. kodapos runs in the browser, so it works on the tablet, phone, or laptop you already own."
2. "Bagaimana cara pindah dari sistem lama?" / "How do I move from my old system?" — "Anda cukup membuat menu dan stok awal. Tim kami siap membantu proses perpindahan lewat WhatsApp." / "You just set up your initial menu and stock. Our team can help you move over WhatsApp."
3. "Apakah mendukung QRIS?" / "Does it support QRIS?" — "Ya. kodapos mendukung QRIS statis dan dinamis, plus tunai, split, dan kartu hadiah." / "Yes. kodapos supports static and dynamic QRIS, plus cash, split, and gift cards."
4. "Apakah data saya aman?" / "Is my data safe?" — "Data tersimpan aman di cloud dan hanya bisa diakses oleh akun kafe Anda." / "Your data is stored securely in the cloud and only your cafe account can access it."
5. "Bisakah dipakai banyak kasir?" / "Can multiple cashiers use it?" — "Bisa. Atur staf, peran, dan shift, lalu pantau aktivitas tiap kasir." / "Yes. Set up staff, roles, and shifts, then track each cashier activity."

### Final CTA
- Title: "Siap mempercepat kafe Anda?" / "Ready to speed up your cafe?"
- Sub: "Coba kodapos gratis hari ini. Tanpa kartu kredit." / "Try kodapos free today. No credit card."
- Buttons: "Lihat fitur" / "See features", "Mulai gratis" / "Start free".

### Footer
- Tagline: "POS pintar untuk kafe dan resto di Indonesia." / "Smart POS for cafes and restaurants in Indonesia."
- Columns: Produk / Product (Fitur, Harga, FAQ), Akun / Account (Masuk, Daftar), Legal / Legal (Privasi / Privacy, Ketentuan / Terms).
- Bottom: "© 2026 kodapos" and "Dibuat untuk kafe Indonesia" / "Built for Indonesian cafes".

## Accessibility

- Single `<h1>` (hero), section headings as `<h2>`, card titles as `<h3>`.
- Decorative preview and emoji icons are `aria-hidden`. Links and buttons have text labels.
- Color contrast meets AA against both light and dark tokens.
- Anchor links are real `<a href="#...">` so keyboard and screen reader users can navigate.

## Testing and acceptance

- `pnpm typecheck` passes.
- `pnpm lingui:extract` then fill English, then `pnpm lingui:compile`; no missing English.
- `pnpm test` passes (no logic changes expected).
- Visual check on the running dev server with Playwright at `/` (public, no auth needed):
  desktop and mobile widths, light and dark, both languages.
- Acceptance: page renders at `/`, is responsive, bilingual, dash-free, uses Geist plus
  shadcn Button plus BrandMark plus theme tokens, testimonials are visibly placeholder,
  pricing is early-access framing.

## Out of scope

- Real testimonials and real pricing tiers or billing.
- Backend changes, analytics, A/B testing, Open Graph and structured data.
- Changes to `/signin` and `/signup` beyond linking to them.
