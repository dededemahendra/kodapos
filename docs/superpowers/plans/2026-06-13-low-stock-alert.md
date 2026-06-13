# Proactive Low-Stock Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** A proactive PUSH for low stock: a nightly email digest of ingredients below their reorder threshold, opt-in per cafe. In-app low-stock is already surfaced (`dashboard.lowStock` + inventory views); this adds the "do not make me go look" piece. Reuses the Resend email infra (#71) + the `notifications` settings (#72).

**Copy rules (project):** email content English + off-catalog; UI strings Bahasa via the catalog; **no em-dash `—`/`--` in any copy**; empty states use shadcn `Empty` (icon + heading + description).

---

## File Structure
- **Create:** `convex/lib/lowStockEmail.ts` (pure builder), `convex/alerts.ts` (internal query + digest action), `tests/convex/low-stock-alert.test.ts`.
- **Modify:** `convex/schema.ts` (extend `cafeSettings.notifications`), `convex/settings.ts` (thread `emailLowStockDaily`), `convex/crons.ts` (the daily cron), `convex/_generated/api.d.ts`, `src/routes/_pos/settings/general.tsx` (the toggle).
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — low-stock email builder + digest cron (TDD)
**Files:** create `convex/lib/lowStockEmail.ts`, `convex/alerts.ts`, `tests/convex/low-stock-alert.test.ts`; modify `convex/schema.ts`, `convex/settings.ts`, `convex/crons.ts`, `convex/_generated/api.d.ts`.

READ: `convex/dashboard.ts` `lowStock` (the low-stock computation to mirror: `currentStockQty(ctx, cafeId, ing._id) < ing.reorderThreshold`, the item shape name/currentStockQty/reorderThreshold/unit), `convex/lib/inventory.ts` `currentStockQty`, `convex/forecast.ts` `listCafesForCron` (paginated cafe iteration) + `generateNightly` (the internalAction cafe-loop pattern to mirror), `convex/email.ts` (the Resend POST + env-gate pattern), `convex/settings.ts` `get`/`updateNotifications` + the `notifications` validator (from #72), `convex/crons.ts`.

- [ ] **Step 1: schema** — extend `cafeSettings.notifications` to `{ summaryEmail?, emailSummaryOnClose, emailLowStockDaily: v.optional(v.boolean()) }` (add the optional flag; keep existing fields).
- [ ] **Step 2: settings** — thread `emailLowStockDaily` through `settings.get` (return + validator, default false-ish) and `updateNotifications` (accept it in the `notifications` arg object).
- [ ] **Step 3: pure builder `convex/lib/lowStockEmail.ts`** — `LowStockItem { name; currentStockQty; reorderThreshold; unit }`; `buildLowStockText(cafeName, items): string` + `buildLowStockHtml(cafeName, items): string`, ENGLISH, no em-dash. Render: cafe name; "Low stock alert"; a line per item (`{name}: {current} {unit} (reorder at {threshold})`); a footer. (Assume items is non-empty when called.)
- [ ] **Step 4: FAILING tests** (`tests/convex/low-stock-alert.test.ts`): `buildLowStockText('Kopi Kita', [{name:'Susu', currentStockQty:200, reorderThreshold:1000, unit:'ml'}])` contains "Low stock", "Susu", "200", "1000", "ml"; no `—`/`--`; html has `<table`. `alerts.lowStockForCafe` (internalQuery, step 5): seed an owner + an ingredient with reorderThreshold and movements below it → returns that ingredient in `items` with the right numbers; an above-threshold ingredient is excluded; `settings.updateNotifications` with `emailLowStockDaily: true` persists + `get` returns it. Run → confirm FAIL.
- [ ] **Step 5: `convex/alerts.ts`**:
  - `lowStockForCafe` **internalQuery** (`{ cafeId }` → `{ cafeName: string, items: LowStockItem[] }`; NO auth — system-side; resolve cafe name; mirror `dashboard.lowStock`'s loop but return ALL low items, not sliced).
  - `lowStockDigest` **internalAction** (`{}`): if `!process.env.RESEND_API_KEY` return (no-op). Page through `internal.forecast.listCafesForCron`; for each cafe, `ctx.runQuery(internal.settings.notificationsForCafe, { cafeId })` (add a tiny internalQuery returning the cafe's `notifications`, or read cafeSettings inline via another internalQuery) — if `emailLowStockDaily && summaryEmail`: `const { cafeName, items } = await ctx.runQuery(internal.alerts.lowStockForCafe, { cafeId })`; if `items.length > 0`, build text/html + POST Resend (`from = process.env.RESEND_FROM ?? 'kodapos <onboarding@resend.dev>'`, subject `Low stock alert ${cafeName}`); wrap each cafe send in try/catch that logs + continues (a digest must never throw out of the cron).
- [ ] **Step 6: cron** — `convex/crons.ts`: `crons.cron('daily low-stock alert', '0 1 * * *', internal.alerts.lowStockDigest, {})` (01:00 UTC = 08:00 WIB, morning).
- [ ] **Step 7: register + tests + commit** — confirm api.d.ts gained `alerts`; `pnpm test` + `pnpm typecheck` PASS. Commit:
  `git add convex/lib/lowStockEmail.ts convex/alerts.ts convex/schema.ts convex/settings.ts convex/crons.ts convex/_generated/api.d.ts tests/convex/low-stock-alert.test.ts && git commit -m "feat(alerts): nightly low-stock email digest (opt-in) + builder"`
  > Do NOT run codegen.

---

### Task 2: Frontend — the low-stock toggle in notifications settings
**Files:** modify `src/routes/_pos/settings/general.tsx`.

READ: `src/routes/_pos/settings/general.tsx` — the "Ringkasan email" / `EmailSummarySection` added in #72 (the draft/`useEditableState`/`SaveBar` + `settings.updateNotifications` wiring). Add the new toggle into the SAME notifications draft so it saves together.

- [ ] **Step 1:** in the notifications section, add a `Switch` "Email peringatan stok menipis harian" bound to `notifications.emailLowStockDaily`; include it in the `updateNotifications` payload (`{ emailSummaryOnClose, summaryEmail, emailLowStockDaily }`). A small helper text: it uses the same recipient email as the shift summary. Reuse the existing save UX exactly.
- [ ] **Step 2:** `pnpm typecheck` + `pnpm test` PASS. Commit:
  `git add src/routes/_pos/settings/general.tsx && git commit -m "feat(alerts): daily low-stock email toggle in settings"`

UI strings Bahasa via `<Trans>`/`t\`...\``, no em-dash/`--`.

---

### Task 3: i18n
New BI: `Email peringatan stok menipis harian`, plus a helper line ("Memakai email penerima yang sama."). Server email content is off-catalog.
- [ ] `pnpm lingui:extract`; fill `en` (`Daily low-stock email alert`, `Uses the same recipient email.`) for every new empty (no em-dash); `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 4: Final verification
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; `git status` clean (no route change → no routeTree).
- [ ] **Manual sanity:** enable the toggle + a recipient → run `internal.alerts.lowStockDigest` (or wait for the cron) with `RESEND_API_KEY` set → an email lists the low-stock ingredients; with no low stock → no email; without the key → the digest no-ops (no crash); the existing in-app low-stock views are unaffected.

---

## Self-Review
**Spec coverage:** notifications `emailLowStockDaily` + settings (T1); pure low-stock builder (T1); `lowStockForCafe` internalQuery + `lowStockDigest` cron action (opt-in, env-gated, error-swallowing) + cron registration (T1); settings toggle (T2); tests builder + lowStockForCafe + settings (T1); i18n (T3). ✓
**Placeholder scan:** "mirror dashboard.lowStock / forecast cron / email Resend / notifications section". Else spec code.
**Type consistency:** `buildLowStock*(cafeName, LowStockItem[])` ↔ `lowStockForCafe` return; `notifications.emailLowStockDaily` flows settings.get ↔ updateNotifications ↔ the toggle ↔ the digest gate. English email, Bahasa UI, no em-dash. ✓
