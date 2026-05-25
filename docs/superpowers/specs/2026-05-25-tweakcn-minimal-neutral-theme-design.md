# Theme replacement — tweakcn "Minimal Neutral"

**Status:** approved 2026-05-25
**Source theme:** https://tweakcn.com/r/themes/cmho4nr9l000h04l1gu419ckw

## Goal

Replace the project's bespoke `brand-*` / `fg` / `surface` palette and the off-palette amber introduced in slice-4 with the **tweakcn "Minimal Neutral"** theme. Adopt the theme in full — colors, radius, fonts, tracking, shadows — and refactor every component/route to use only the canonical shadcn v5+ token classes (`bg-primary`, `text-muted-foreground`, `border-border`, `bg-destructive`, etc.).

## Non-goals

- No new features, no behavioral changes, no component API changes.
- No logo / marketing / favicon updates (the brand identity shift is in-app only for this PR).
- No new theme-toggle UI. Dark mode stays auto-detected from `prefers-color-scheme`.
- No `shadcn add` runs other than the theme registry itself (no UI components added/replaced).
- No font self-hosting infrastructure; use the same CDN/system-font load pattern that's already there.

## Architectural decisions

1. **Strict palette enforcement.** After this PR, no component may reference a color that isn't in the tweakcn token set. The low-stock UI from slice-4 (amber) maps to `destructive`. No `--warning` or other slot is added — the user accepted destructive-red as the low-stock indicator even though it overloads semantics with errors.
2. **Brand identity becomes monochrome.** `primary` is near-black (`oklch(0.205 0 0)`), not green. Buttons go dark. The "Tersimpan." save-confirmation indicator loses its positive-green color and renders as `text-foreground`. Accepted casualty.
3. **Full theme adoption.** Not just colors — also `radius: 1rem`, DM Sans (sans), Geist Mono (mono), `tracking-normal: 0em`, and the shadow scale.
4. **Dark mode wiring via `@media`, not `.dark` class.** tweakcn ships dark vars under `.dark { ... }` (class-based, toggle-driven). We deviate: wrap the tweakcn dark block in `@media (prefers-color-scheme: dark)` to preserve the current OS-auto behavior. No theme toggle UI added.
5. **Single-PR refactor.** Phased rollout was considered and rejected — the in-between commits would have a mixed palette (some brand-green, some grayscale) for no review benefit on a 46-file change.

## Token mapping

| Current class | New class | Notes |
|---|---|---|
| `bg-bg` | `bg-background` | white |
| `text-fg` | `text-foreground` | near-black |
| `text-fg-muted` | `text-muted-foreground` | medium gray |
| `bg-surface` / `hover:bg-surface` | `bg-muted` / `hover:bg-muted` | very light gray |
| `border-border` | `border-border` | **same class name**; underlying CSS var swaps |
| `bg-brand-50` (light highlight tint) | `bg-accent` | subtle highlight |
| `bg-brand-50/N` (opacity modifier) | `bg-accent/N` | preserve opacity |
| `bg-brand-500` / `bg-brand-600` (button bg) | `bg-primary` | dark button |
| `text-brand-500/600/700` | `text-primary` | dark emphasized text |
| `border-brand-500` | `border-ring` | active border |
| `focus:ring-brand-500` | `focus:ring-ring` | focus ring |
| `hover:border-brand-500` | `hover:border-ring` | hover border |
| `bg-amber-50` / `bg-amber-50/N` | `bg-destructive/10` | low-stock tinted bg |
| `text-amber-700` | `text-destructive` | low-stock text |
| `border-amber-400` | `border-destructive` | low-stock border |

### Tokens removed from `globals.css`

- All 10 `--color-brand-*` vars
- `--color-bg`, `--color-surface`, `--color-fg`, `--color-fg-muted`, `--color-border` (classes that survive by name like `border-border` re-bind to the new canonical var automatically)
- `--color-success`, `--color-warning`, `--color-danger`, `--color-info` (CSS-only vars, not used as Tailwind classes today; dropped per the strict rule)
- `--radius-sm/md/lg` (replaced by tweakcn's single `--radius: 1rem` + shadcn's `calc()` derivation pattern)
- The old `--font-sans` (Plus Jakarta Sans) and `--font-mono` declarations

### Tokens added

- Full tweakcn block in `:root` (light) and `@media (prefers-color-scheme: dark) :root` (dark): `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, all `--*-foreground` pairs, `--chart-1..5`, `--sidebar-*`, `--radius: 1rem`, shadow scale, tracking, spacing, `--font-sans: "DM Sans"`, `--font-mono: "Geist Mono"`.
- `@theme inline` mapping block per shadcn v5+ convention (`--color-background: var(--background)` etc.) so Tailwind generates `bg-background`, `text-foreground`, etc.

### Preserved as-is

- Print stylesheet (`@media print { body * { visibility: hidden; } ... }`) — no theme tokens used.
- Density attribute (`[data-density="compact"]`, `[data-density="comfortable"]`) — custom non-color tokens.
- `color-scheme: light dark` declaration on `:root`.

## Files affected (46 total)

- `src/styles/globals.css` — full rewrite (with print + density blocks preserved).
- `src/routes/__root.tsx` — add Google Fonts `<link>` for DM Sans + Geist Mono in `<head>`.
- `src/components/ui/*` (Button, Input, Dialog, Field, Select, etc.) — sweep for remaining `brand-*` / `text-fg-muted` strings; most are already canonical shadcn.
- `src/components/{sale,menu,inventory,staff,shift,onboarding}/*` (22 files) — mechanical class renames per the mapping table.
- `src/routes/{_pos,_public}/**` (16 files) — same mechanical renames.

No file deletes, no new files beyond the regenerated globals.css. Component/route APIs unchanged.

## Execution approach

1. Run `pnpm dlx shadcn@latest add https://tweakcn.com/r/themes/cmho4nr9l000h04l1gu419ckw` and accept the `globals.css` rewrite.
2. Inspect the diff on `globals.css`. Re-insert the print + density blocks. Re-wrap the dark vars in `@media` instead of `.dark`. Drop any tokens that aren't in scope (e.g. components.json edits the CLI may have made).
3. Add the Google Fonts link to `__root.tsx`.
4. Sweep all 46 files per the mapping table. The 4 amber occurrences (all in slice-4 files) get rewritten to destructive variants.
5. Run the verification gate (below).
6. Visual sweep across every route.
7. Single PR against `main`.

## Risks + accepted casualties

| Risk / casualty | Mitigation |
|---|---|
| "Tersimpan." save indicator loses positive-green cue | Accepted. Reads as plain `text-foreground` after swap. |
| Low-stock UI shares red with destructive errors (alarm-fatigue risk) | Accepted per strict palette. The ⚠ icon already differentiates semantically. |
| DM Sans + Geist Mono CDN load adds network dependency | Acceptable. POS app users see splash on cold boot only; subsequent navigations are cache-hit. FOIT possible on first visit. |
| `shadcn add` may modify `components.json` or other config | Verify diff, revert unrelated changes. |
| Receipt print preview color shift | Negligible — thermal printers are monochrome; rules in the print stylesheet override anyway. |
| Hover/focus states that relied on the 10-step brand scale (e.g. `brand-50` vs `brand-100`) collapse to single `accent` | Accepted. Most uses were already `brand-50`; the few `brand-100` uses become `accent` too. Visual difference is minor. |

## Verification

- **Grep zero-hit check:** `grep -rE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" src/` returns no matches outside the spec/plan docs.
- **Typecheck:** `pnpm typecheck` clean.
- **Unit suite:** `pnpm test` — all 144 tests pass (none assert on color).
- **E2E:** `RUN_AUTH_E2E=1 pnpm test:e2e tests/e2e/inventory.spec.ts` — selectors are by role/label/text; should pass untouched.
- **Manual visual sweep:** every route — `/signin`, `/signup`, `/onboarding/*`, `/pin`, `/sale`, `/menu/*`, `/inventory`, `/history`, `/settings/*`, `/shift/*`. Confirm DM Sans rendering, 1rem radii on cards/buttons/dialogs, low-stock UI in destructive red, "Tersimpan" still legible.
