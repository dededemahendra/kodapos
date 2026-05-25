# tweakcn Minimal Neutral Theme Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bespoke brand-green palette and off-palette amber with the tweakcn "Minimal Neutral" theme. Adopt colors + radius + fonts + tracking + shadows. Refactor 46 files to use only canonical shadcn v5+ token classes.

**Architecture:** Single PR. Run `pnpm dlx shadcn@latest add <tweakcn-url>` to regenerate `src/styles/globals.css`. Preserve the print + density blocks from the old globals.css. Wrap the tweakcn dark vars in `@media (prefers-color-scheme: dark)` instead of `.dark` to keep current OS-auto behavior. Sweep each component/route directory with a Python regex script that does word-boundary-safe class renames. Commit per directory for clean rollback ability.

**Tech Stack:** Tailwind v4 (`@theme inline` pattern) · shadcn v5+ token vocabulary · DM Sans + Geist Mono via Google Fonts CDN · existing TanStack Start / Convex / Vitest / Playwright stack unchanged.

**Spec:** `docs/superpowers/specs/2026-05-25-tweakcn-minimal-neutral-theme-design.md`

**Branch:** create a new branch off `main` named `theme-tweakcn-minimal-neutral`.

---

## File map

**Modified (theme):**
- `src/styles/globals.css` — full rewrite with tweakcn block + preserved print/density blocks
- `src/routes/__root.tsx` — add Google Fonts link for DM Sans + Geist Mono

**Modified (mechanical class renames):**
- `src/components/ui/{button,input}.tsx` (2 files)
- `src/components/sale/*` (7 files)
- `src/components/menu/*` (4 files — `cafe-profile-form.tsx`, `category-table.tsx`, `item-edit-form.tsx`, `modifier-group-form.tsx`, `wizard-stepper.tsx`)
- `src/components/inventory/*` (4 files — slice-4 amber UI dies here)
- `src/components/{staff,shift}/*` (4 files)
- `src/components/pos-nav.tsx`
- `src/routes/__root.tsx`, `src/routes/_pos.tsx`
- `src/routes/_pos/**` (16 files)
- `src/routes/_public/**` (3 files)

**New:** none (no new files).

---

## The sweep script (used by Tasks 5–10)

Multiple sweep tasks invoke this exact script. It does word-boundary-safe regex renames per the spec's token mapping table.

Save once at `/tmp/theme-sweep.py` (it does not need to live in the repo):

```python
#!/usr/bin/env python3
"""Word-boundary-safe class rename per the theme spec mapping table.
Usage: python3 /tmp/theme-sweep.py <file1> <file2> ...
"""
import re
import sys

REPLACEMENTS = [
    # Order matters: more specific patterns FIRST so they don't get
    # double-replaced by later, shorter ones (e.g. text-fg-muted before text-fg).
    (r'\btext-fg-muted\b', 'text-muted-foreground'),
    (r'\btext-fg\b', 'text-foreground'),
    (r'\bbg-bg\b', 'bg-background'),
    (r'\bbg-surface\b', 'bg-muted'),
    # border-border keeps the same class name; underlying var swaps. No-op.
    # Brand 10-step scale collapses to primary / accent.
    (r'\bbg-brand-(50|100)(/\d+)?\b', lambda m: 'bg-accent' + (m.group(2) or '')),
    (r'\btext-brand-(50|100)(/\d+)?\b', lambda m: 'text-accent-foreground' + (m.group(2) or '')),
    (r'\bbg-brand-\d+\b', 'bg-primary'),
    (r'\btext-brand-\d+\b', 'text-primary'),
    (r'\bborder-brand-\d+\b', 'border-ring'),
    (r'\bring-brand-\d+\b', 'ring-ring'),
    # Slice-4 amber low-stock UI -> destructive.
    (r'\bbg-amber-50(/\d+)?\b', 'bg-destructive/10'),
    (r'\btext-amber-\d+\b', 'text-destructive'),
    (r'\bborder-amber-\d+\b', 'border-destructive'),
]

def main() -> int:
    if len(sys.argv) < 2:
        print('usage: theme-sweep.py FILE [FILE ...]', file=sys.stderr)
        return 2
    total_subs = 0
    for fp in sys.argv[1:]:
        with open(fp, encoding='utf-8') as f:
            original = f.read()
        new = original
        file_subs = 0
        for pattern, repl in REPLACEMENTS:
            new, n = re.subn(pattern, repl, new)
            file_subs += n
        if new != original:
            with open(fp, 'w', encoding='utf-8') as f:
                f.write(new)
            print(f'{fp}: {file_subs} substitution(s)')
            total_subs += file_subs
    print(f'TOTAL: {total_subs} substitution(s) across {len(sys.argv) - 1} files')
    return 0

if __name__ == '__main__':
    sys.exit(main())
```

After every sweep task, verify with the zero-hit grep:
```bash
command grep -rE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" <swept-dir> 2>/dev/null
```
Expected: no matches.

---

## Pre-flight

- [ ] **Branch from main.**

```bash
command git checkout main
command git pull
command git checkout -b theme-tweakcn-minimal-neutral
```
Expected: on a fresh branch tracking nothing yet.

- [ ] **Stash the sweep script.**

Save the Python script from "The sweep script" section above to `/tmp/theme-sweep.py`. Verify with:
```bash
python3 /tmp/theme-sweep.py 2>&1 | head -2
```
Expected: `usage: theme-sweep.py FILE [FILE ...]` (exit code 2 — fine, that's the no-arg case).

---

## Task 1: Install tweakcn theme via shadcn CLI

**Files:**
- Modify: `src/styles/globals.css` (full rewrite)
- Possibly modified by CLI: `components.json` (revert if so)

- [ ] **Step 1: Snapshot the current globals.css for reference.**

```bash
cp src/styles/globals.css /tmp/globals.css.pre-theme
```

We'll need lines 56–81 (print stylesheet + density attribute + html/body reset) to re-insert after the CLI overwrites the file.

- [ ] **Step 2: Run the shadcn CLI.**

```bash
pnpm dlx shadcn@latest add https://tweakcn.com/r/themes/cmho4nr9l000h04l1gu419ckw
```

The CLI will prompt to overwrite `src/styles/globals.css`. **Confirm yes.** It may also touch `components.json` — that's fine if it just updates the baseColor field; revert any aliases changes.

Expected: file rewritten with `:root { --background: oklch(...); ... }` light vars, a `.dark { --background: oklch(...); ... }` dark vars block, and an `@theme inline { --color-background: var(--background); ... }` mapping block.

- [ ] **Step 3: Verify the file has the expected structure.**

```bash
command grep -c '\-\-background:' src/styles/globals.css
command grep -c '@theme inline' src/styles/globals.css
command grep -c '\.dark' src/styles/globals.css
```
Expected: `--background:` appears ≥ 2 (light + dark), `@theme inline` block appears (≥ 1), `.dark` block exists (will be replaced in Task 2).

If `@theme inline` is missing (older shadcn CLI), STOP and add it manually mapping every `--<name>` to `--color-<name>` (background, foreground, card, card-foreground, popover, popover-foreground, primary, primary-foreground, secondary, secondary-foreground, muted, muted-foreground, accent, accent-foreground, destructive, destructive-foreground, border, input, ring, chart-1..5, sidebar, sidebar-foreground, sidebar-primary, sidebar-primary-foreground, sidebar-accent, sidebar-accent-foreground, sidebar-border, sidebar-ring).

- [ ] **Step 4: Check `components.json` diff and revert any unrelated changes.**

```bash
command git diff components.json
```

If the CLI changed `baseColor` or anything else, revert the file unless the change is purely additive (e.g. registry url). The components.json baseColor doesn't drive runtime behavior in this project (we use custom CSS vars), so reverting is safe.

```bash
command git checkout -- components.json   # if you want to revert
```

- [ ] **Step 5: Don't commit yet — Task 2 will edit the same file.**

---

## Task 2: Massage globals.css — preserve print + density, wrap dark in @media

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Re-insert the print stylesheet and density attribute blocks at the end of `globals.css`.**

Open `src/styles/globals.css`. Append the following to the end of the file (preserve whatever the CLI generated above):

```css
html, body { margin: 0; padding: 0; min-height: 100vh; }

/* Counter density mode (POS routes will set this) */
[data-density="compact"] {
  --kodapos-touch: 48px;
}
[data-density="comfortable"] {
  --kodapos-touch: 40px;
}

/* Receipt printing. Hides everything except the [data-print-receipt] root. */
@media print {
  body * {
    visibility: hidden;
  }
  [data-print-receipt],
  [data-print-receipt] * {
    visibility: visible;
  }
  [data-print-receipt] {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
  }
}
```

- [ ] **Step 2: Convert the `.dark` block to `@media (prefers-color-scheme: dark)`.**

Find the `.dark { ... }` block the CLI generated. Replace the wrapping selector but keep all the var declarations inside:

Before:
```css
.dark {
  --background: oklch(0.2050 0 0);
  --foreground: oklch(0.9850 0 0);
  /* ... */
}
```

After:
```css
@media (prefers-color-scheme: dark) {
  :root {
    --background: oklch(0.2050 0 0);
    --foreground: oklch(0.9850 0 0);
    /* ... */
  }
}
```

The intent: dark mode is OS-auto on, no theme toggle UI. The `:root` selector inside the `@media` makes the dark values override the light values declared earlier in `:root` when the OS reports dark preference.

- [ ] **Step 3: Add `color-scheme: light dark` to `:root` if the CLI didn't include it.**

```bash
command grep 'color-scheme' src/styles/globals.css
```

If missing, add to the existing `:root { ... }` block (the one with light vars):
```css
:root {
  color-scheme: light dark;
  /* ...existing vars... */
}
```

- [ ] **Step 4: Verify the file is valid CSS.**

Run `pnpm typecheck`. CSS parse errors would surface in the next dev-server boot, not in typecheck, so we'll also test by running the dev server in Task 4. For now:
```bash
pnpm typecheck 2>&1 | tail -5
```
Expected: PASS (typecheck doesn't validate CSS).

- [ ] **Step 5: Stage but don't commit — Task 3 finishes the setup.**

---

## Task 3: Add DM Sans + Geist Mono Google Fonts

**Files:**
- Modify: `src/routes/__root.tsx`

- [ ] **Step 1: Read the current `__root.tsx` to find the `<head>` section.**

```bash
command grep -n 'head\|HeadContent\|meta\|link' src/routes/__root.tsx | head -20
```

TanStack Start uses a `head` function on the root route. Find the existing head returning object/array.

- [ ] **Step 2: Add the Google Fonts link.**

In the `head()` function or wherever links are configured, add:

```ts
links: [
  // ...existing links...
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Geist+Mono:wght@400;500;600&display=swap',
  },
],
```

If the existing pattern uses a different shape (e.g. an array directly returned from `head()`), adapt accordingly — the goal is just to get those two stylesheets loaded on the document.

- [ ] **Step 3: Typecheck.**

```bash
pnpm typecheck 2>&1 | tail -3
```
Expected: PASS.

- [ ] **Step 4: Commit Tasks 1+2+3 together.**

```bash
command git add src/styles/globals.css src/routes/__root.tsx
command git commit -m "feat(theme): install tweakcn Minimal Neutral + DM Sans/Geist Mono fonts"
```

---

## Task 4: Smoke-test the install before sweeping

**Files:** none modified — pure verification.

- [ ] **Step 1: Boot the dev server and ensure the page loads.**

```bash
pnpm dev &
DEV_PID=$!
sleep 8
command curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/
kill $DEV_PID 2>/dev/null
```
Expected: HTTP `200`. (Visual breakage is fine at this stage — `text-fg-muted` etc. classes still resolve to nothing because we haven't swept yet, but the page should not error.)

- [ ] **Step 2: No commit (smoke check only).**

---

## Task 5: Sweep UI primitives

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/input.tsx`

(Other files in `src/components/ui/` were not flagged by the audit; they already use canonical shadcn classes. Verify with the grep below.)

- [ ] **Step 1: Confirm the files to sweep in this directory.**

```bash
command grep -rEl "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" src/components/ui/
```
Expected: `button.tsx`, `input.tsx` (and possibly others — sweep whatever the grep returns).

- [ ] **Step 2: Run the sweep script on flagged files.**

```bash
python3 /tmp/theme-sweep.py $(command grep -rlE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" src/components/ui/)
```
Expected: per-file substitution counts + `TOTAL: N substitution(s)`.

- [ ] **Step 3: Zero-hit grep verification.**

```bash
command grep -rE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" src/components/ui/
```
Expected: empty output.

- [ ] **Step 4: Typecheck.**

```bash
pnpm typecheck 2>&1 | tail -3
```
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
command git add src/components/ui/
command git commit -m "refactor(theme): sweep UI primitives to canonical tokens"
```

---

## Task 6: Sweep components/sale

**Files:** 7 files in `src/components/sale/` per the spec.

- [ ] **Step 1: Sweep.**

```bash
python3 /tmp/theme-sweep.py $(command grep -rlE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" src/components/sale/)
```

- [ ] **Step 2: Zero-hit grep.**

```bash
command grep -rE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" src/components/sale/
```
Expected: empty.

- [ ] **Step 3: Typecheck + commit.**

```bash
pnpm typecheck 2>&1 | tail -3
command git add src/components/sale/
command git commit -m "refactor(theme): sweep sale components to canonical tokens"
```

---

## Task 7: Sweep components/menu

**Files:** 4 files in `src/components/menu/` per the spec.

- [ ] **Step 1: Sweep.**

```bash
python3 /tmp/theme-sweep.py $(command grep -rlE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" src/components/menu/)
```

- [ ] **Step 2: Zero-hit grep.**

```bash
command grep -rE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" src/components/menu/
```
Expected: empty.

- [ ] **Step 3: Typecheck + commit.**

```bash
pnpm typecheck 2>&1 | tail -3
command git add src/components/menu/
command git commit -m "refactor(theme): sweep menu components to canonical tokens"
```

---

## Task 8: Sweep components/inventory (slice-4 amber dies here)

**Files:** 4 files in `src/components/inventory/`. Includes the amber low-stock UI from slice-4 — those become `bg-destructive/10` + `text-destructive` + `border-destructive`.

- [ ] **Step 1: Sweep.**

```bash
python3 /tmp/theme-sweep.py $(command grep -rlE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" src/components/inventory/)
```

- [ ] **Step 2: Zero-hit grep.**

```bash
command grep -rE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" src/components/inventory/
```
Expected: empty.

- [ ] **Step 3: Sanity-check the amber → destructive substitutions specifically.**

```bash
command grep -E 'destructive' src/components/inventory/
```
Expected: at least one match in `src/components/inventory/` (where amber was replaced — most likely in the ingredient list table, but not in this directory if the low-stock UI ended up in routes instead — see Task 11).

Note: the sale `ItemCard` low-stock UI (also slice-4) lives in `src/components/sale/item-card.tsx` and was already swept in Task 6.

- [ ] **Step 4: Typecheck + commit.**

```bash
pnpm typecheck 2>&1 | tail -3
command git add src/components/inventory/
command git commit -m "refactor(theme): sweep inventory components + replace amber low-stock with destructive"
```

---

## Task 9: Sweep remaining components (staff, shift, pos-nav)

**Files:** `src/components/staff/*`, `src/components/shift/*`, `src/components/pos-nav.tsx`.

- [ ] **Step 1: Sweep.**

```bash
python3 /tmp/theme-sweep.py \
  $(command grep -rlE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" \
    src/components/staff/ src/components/shift/ src/components/pos-nav.tsx)
```

- [ ] **Step 2: Zero-hit grep.**

```bash
command grep -rE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" \
  src/components/staff/ src/components/shift/ src/components/pos-nav.tsx
```
Expected: empty.

- [ ] **Step 3: Typecheck + commit.**

```bash
pnpm typecheck 2>&1 | tail -3
command git add src/components/staff/ src/components/shift/ src/components/pos-nav.tsx
command git commit -m "refactor(theme): sweep staff/shift/pos-nav components to canonical tokens"
```

---

## Task 10: Sweep routes/_pos and routes/_public + root

**Files:** `src/routes/__root.tsx` (Google Fonts link already added in Task 3), `src/routes/_pos.tsx`, `src/routes/_pos/**`, `src/routes/_public/**`.

- [ ] **Step 1: Sweep.**

```bash
python3 /tmp/theme-sweep.py \
  $(command grep -rlE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" src/routes/)
```

- [ ] **Step 2: Zero-hit grep (entire `src/routes/`).**

```bash
command grep -rE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" src/routes/
```
Expected: empty.

- [ ] **Step 3: Typecheck.**

```bash
pnpm typecheck 2>&1 | tail -3
```
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
command git add src/routes/
command git commit -m "refactor(theme): sweep all routes to canonical tokens"
```

---

## Task 11: Whole-tree zero-hit verification

- [ ] **Step 1: Run the grep over the entire `src/` tree.**

```bash
command grep -rE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" src/
```
Expected: **empty.** If anything appears, sweep those files manually using the same Python script and commit with `refactor(theme): catch missed file(s)`.

- [ ] **Step 2: Confirm globals.css has no stray brand vars.**

```bash
command grep -E "brand-|color-fg|color-bg|color-surface|color-success|color-warning|color-danger|color-info|Plus Jakarta" src/styles/globals.css
```
Expected: empty.

- [ ] **Step 3: No commit — pure verification.**

---

## Task 12: Run the full unit + integration test suite

- [ ] **Step 1: Run vitest.**

```bash
pnpm test 2>&1 | tail -20
```
Expected: all 144 tests pass. (None assert on color; they should be unaffected.)

If anything fails, investigate — the sweep script may have hit a class-string-in-a-test-snapshot (unlikely but possible).

- [ ] **Step 2: No commit — pure verification.**

---

## Task 13: Run the auth-gated E2E

- [ ] **Step 1: Push functions and run inventory E2E.**

```bash
pnpm exec convex dev --once 2>&1 | tail -3
RUN_AUTH_E2E=1 pnpm test:e2e tests/e2e/inventory.spec.ts 2>&1 | tail -10
```
Expected: PASS (selectors are by role/label/text; no color queries).

If the test fails on a NEW visual selector mismatch (e.g. button color caused Playwright trace selector to break — unlikely), update the spec accordingly and re-run. If it fails for an unrelated reason, investigate.

- [ ] **Step 2: No commit.**

---

## Task 14: Manual visual sweep with screenshots

This is the verification that color-shift work actually looks right. Tests don't catch broken styling.

- [ ] **Step 1: Boot the dev server and Convex backend.**

```bash
pnpm dev:all &
DEV_PID=$!
sleep 12
```

- [ ] **Step 2: Drive every route via Playwright headless + screenshot.**

Use the webapp-testing skill if available, or run a one-off Playwright spec like:

```js
// /tmp/visual-sweep.spec.ts
import { test } from '@playwright/test';
const routes = ['/', '/signin', '/signup', '/pin', '/sale', '/menu', '/menu/categories', '/menu/modifiers', '/inventory', '/history', '/settings/profile', '/settings/staff', '/shift/open', '/shift/close'];
for (const r of routes) {
  test(`screenshot ${r}`, async ({ page }) => {
    await page.goto('http://localhost:5173' + r);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `/tmp/theme-sweep/${r.replace(/\//g, '_') || 'root'}.png`, fullPage: true });
  });
}
```

Some routes require auth — those are expected to redirect to `/signin` or `/pin`. Capture whatever renders. The goal is "no obvious visual breakage, DM Sans rendering, 1rem radii, low-stock UI in destructive red."

- [ ] **Step 3: Scan the screenshots manually.**

Open `/tmp/theme-sweep/`. Look for:
- DM Sans rendering everywhere (not the old Plus Jakarta Sans)
- 1rem radii on cards/buttons/dialogs (noticeably round)
- No greens anywhere
- No ambers anywhere
- Low-stock indicators (if visible without auth) in red
- Text legible against backgrounds (contrast preserved)

Kill the dev server when done: `kill $DEV_PID`.

- [ ] **Step 4: No commit (verification only).**

---

## Task 15: Open the PR

- [ ] **Step 1: Push branch.**

```bash
command git push -u origin theme-tweakcn-minimal-neutral
```

- [ ] **Step 2: Open PR.**

```bash
gh pr create --base main --title "feat(theme): tweakcn Minimal Neutral" --body "$(cat <<'EOF'
## Summary
Replaces the bespoke brand-green palette + slice-4 off-palette amber with the tweakcn "Minimal Neutral" theme. Full adoption: colors, radius (1rem), DM Sans + Geist Mono, tracking, shadows.

## Visual changes
- Brand identity becomes monochrome (primary is near-black, no green anywhere)
- Low-stock indicators move from amber to destructive (red), differentiated from errors by the ⚠ icon
- "Tersimpan" save indicator loses positive-green color cue (accepted casualty per spec)
- All cards/buttons/dialogs get noticeably rounder (1rem vs 0.5rem)

## Dark mode
Dark vars wrapped in `@media (prefers-color-scheme: dark)` instead of the `.dark` class — preserves current OS-auto behavior. No theme toggle UI added.

## Test plan
- [x] `pnpm typecheck` — clean
- [x] `pnpm test` — 144 specs pass (none assert on color)
- [x] `RUN_AUTH_E2E=1 pnpm test:e2e tests/e2e/inventory.spec.ts` — pass
- [x] Visual sweep of every route via Playwright screenshots — no breakage
- [x] `grep -rE "brand-[0-9]|(text|bg|border)-(fg|bg|surface|amber)" src/` returns empty

Spec: `docs/superpowers/specs/2026-05-25-tweakcn-minimal-neutral-theme-design.md`
Plan: `docs/superpowers/plans/2026-05-25-tweakcn-minimal-neutral-theme.md`
EOF
)"
```

- [ ] **Step 3: Return the PR URL.**

---

## After all tasks

Self-review against the spec:

**Spec coverage:**
- ✅ tweakcn theme installed → Task 1
- ✅ globals.css preserves print + density → Task 2
- ✅ Dark mode wired via @media not .dark → Task 2
- ✅ DM Sans + Geist Mono loaded → Task 3
- ✅ All 46 files swept per mapping table → Tasks 5–10
- ✅ Slice-4 amber → destructive → Task 8 (and Task 6 for `item-card.tsx`)
- ✅ "Tersimpan" loses positive cue (accepted) → handled by Task 8 sweep (text-brand-700 → text-primary, then by virtue of context becomes plain text)
- ✅ Zero-hit verification → Task 11
- ✅ Tests still pass → Tasks 12 + 13
- ✅ Manual visual sweep → Task 14

After all tasks complete:

- Use `superpowers:finishing-a-development-branch` to do the final review + merge decision (offer merge-commit explicitly given prior history).
