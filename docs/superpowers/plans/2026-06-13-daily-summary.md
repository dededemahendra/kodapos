# Daily Summary (Shift-Close Email) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** At shift close, email the owner an end-of-day recap (sales, payment split, cash expected/counted/variance). Auto-send when enabled in settings, plus a manual "Email ringkasan" on the shift history. Reuses the Resend email infra (#71).

**Copy rules (project):** email content English + off-catalog; UI strings Bahasa via the catalog; **no em-dash `—`/`--` in any copy**; empty states use shadcn `Empty` (icon + heading + description).

---

## File Structure
- **Create:** `convex/lib/shiftSummary.ts` (pure builders), `tests/convex/shift-summary.test.ts`.
- **Modify:** `convex/schema.ts` (`cafeSettings` notification fields), `convex/settings.ts` (`updateNotifications` + merge into `get`), `convex/shifts.ts` (an internal summary-data query + the auto-send hook in `close`), `convex/email.ts` (`sendShiftSummary` action + `sendShiftSummaryScheduled` internalAction), `convex/_generated/api.d.ts`, `src/routes/_pos/settings/general.tsx` (or a settings section — a notifications toggle + email), `src/routes/_pos/shifts.tsx` (manual send button).
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — settings + summary builder + send action + auto-send on close (TDD)
**Files:** create `convex/lib/shiftSummary.ts`, `tests/convex/shift-summary.test.ts`; modify `convex/schema.ts`, `convex/settings.ts`, `convex/shifts.ts`, `convex/email.ts`, `convex/_generated/api.d.ts`.

READ: `convex/shifts.ts` `shiftCashBreakdown`/`summarizeShift`/`close`/`closeoutSummary`/`listClosed` (the numbers: `salesTotalIDR`, `cashSalesIDR`, `qrisSalesIDR`, `openingFloatIDR`, `expectedCashIDR`, `countedCashIDR`, `varianceIDR`, `openedAt`/`closedAt`), `convex/settings.ts` `get` + `updatePayment` (mirror for `updateNotifications`) + `getOrCreateSettingsId`, `convex/email.ts` (the Resend action pattern + the `buildReceipt*` builders for style), `convex/cafes.ts` `myCafe` (name).

- [ ] **Step 1: schema** — add to `cafeSettings`: `notifications: v.optional(v.object({ summaryEmail: v.optional(v.string()), emailSummaryOnClose: v.boolean() }))`. (Optional object, default off.)
- [ ] **Step 2: settings** — `settings.updateNotifications({ notifications })` mutation (mirror `updatePayment`); merge `notifications` (default `{ emailSummaryOnClose: false }`) into the `settings.get` return + its validator.
- [ ] **Step 3: pure builder `convex/lib/shiftSummary.ts`** — `ShiftSummaryData` interface + `buildShiftSummaryText(d): string` and `buildShiftSummaryHtml(d): string`, ENGLISH, no em-dash, a local `formatIDR`. Render: cafe name; "Shift summary"; date + opened/closed times; Sales total; Cash sales; QRIS sales; Opening float; Expected cash; Counted cash; Variance (with Over/Short wording, no dash); a footer. (Mirror the receipt builder's structure.)
- [ ] **Step 4: FAILING tests** (`tests/convex/shift-summary.test.ts`): feed a representative `ShiftSummaryData` → `buildShiftSummaryText` contains "Shift summary", "Sales", "Cash", "QRIS", "Expected", "Variance", the formatted IDR figures; a negative variance says "Short", a positive says "Over"; assert NO `—`/`--`. `buildShiftSummaryHtml` contains `<table` + the total. Also: `settings.updateNotifications` persists + `get` returns it; `shifts.summaryData` (internal query, step 5) returns the right numbers for a closed shift. Run → confirm FAIL.
- [ ] **Step 5: shifts** — add `summaryData` as an **internalQuery** (`{ shiftId }` → the `ShiftSummaryData` shape, resolving cafe name from the shift's `cafeId`; NO `requireOwnerCafe` since the scheduler invokes it system-side; reuse `summarizeShift`/`shiftCashBreakdown` logic). In `close`, after the patch, read the cafe's `cafeSettings.notifications`; if `emailSummaryOnClose && summaryEmail`, `ctx.scheduler.runAfter(0, internal.email.sendShiftSummaryScheduled, { shiftId: id, to: summaryEmail })`.
- [ ] **Step 6: email** — in `convex/email.ts` add `sendShiftSummary = action({ args:{ shiftId, to }, ... })` (owner-scoped: `ctx.runQuery(api.shifts.summaryDataOwned, {shiftId})` — add a thin owner-gated public `summaryDataOwned` query too, or reuse an owner query; build + Resend send, env-gated like `sendReceipt`) and `sendShiftSummaryScheduled = internalAction({ args:{ shiftId, to } })` (calls `ctx.runQuery(internal.shifts.summaryData, {shiftId})`, builds, sends; if no `RESEND_API_KEY` just return — a scheduled job must not throw uncaught, log and no-op).
- [ ] **Step 7: register + tests + commit** — confirm api.d.ts updated; `pnpm test` + `pnpm typecheck` PASS. Commit:
  `git add convex/lib/shiftSummary.ts convex/schema.ts convex/settings.ts convex/shifts.ts convex/email.ts convex/_generated/api.d.ts tests/convex/shift-summary.test.ts && git commit -m "feat(shifts): shift-summary email builder + send action + auto-send on close"`
  > Do NOT run codegen.

---

### Task 2: Frontend — notifications setting + manual send on shift history
**Files:** modify `src/routes/_pos/settings/general.tsx` (or wherever a settings section fits), `src/routes/_pos/shifts.tsx`.

READ: `src/routes/_pos/settings/general.tsx` (the settings section pattern, `Switch`, `Input`, the save flow + which `settings.update*` it calls), `src/routes/_pos/shifts.tsx` (the closed-shift list from `listClosed` + row actions), `src/components/ui/{switch,input,button}`, `useAction`/`toast`.

- [ ] **Step 1: settings** — add a "Ringkasan email" section: a `Switch` "Kirim ringkasan saat tutup shift" (bound to `notifications.emailSummaryOnClose`) + an email `Input` "Email penerima ringkasan" (bound to `notifications.summaryEmail`); save via `settings.updateNotifications`. Mirror the existing settings save UX.
- [ ] **Step 2: manual send** — `shifts.tsx`: on each closed-shift row, a "Email ringkasan" action/button → an email prompt (a small popover/dialog with an email `Input`, prefilled from `notifications.summaryEmail` if set) → `useAction(api.email.sendShiftSummary)({ shiftId, to })`; toast success ("Ringkasan dikirim.") / error. Disable while sending.
- [ ] **Step 3:** `pnpm typecheck` + `pnpm test` PASS. Commit:
  `git add src/routes/_pos/settings/general.tsx src/routes/_pos/shifts.tsx && git commit -m "feat(shifts): notifications setting + manual email-summary on shift history"`

UI strings Bahasa via `<Trans>`/`t\`...\``, no em-dash/`--`.

---

### Task 3: i18n
New BI: `Ringkasan email`, `Kirim ringkasan saat tutup shift`, `Email penerima ringkasan`, `Email ringkasan`, `Ringkasan dikirim.`, `Gagal mengirim ringkasan.` Server-thrown email errors are off-catalog.
- [ ] `pnpm lingui:extract`; fill `en` (`Email summary`, `Email the summary when a shift closes`, `Summary recipient email`, `Email summary`, `Summary sent.`, `Could not send the summary.`) for every new empty (no em-dash); watch collisions; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 4: Final verification
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; `git status` clean (no route change → no routeTree).
- [ ] **Manual sanity:** enable the setting + set an email → close a shift → the recap email arrives (with `RESEND_API_KEY` set); the shift-history "Email ringkasan" sends on demand; without the key, the manual send toasts "Email belum dikonfigurasi" and the auto-send no-ops (no crash).

---

## Self-Review
**Spec coverage:** notifications setting + update + get (T1); pure summary builder (T1); internal summaryData + owner summary + send action + scheduled internalAction + auto-send hook in close (T1); settings UI + manual send (T2); tests builder + settings + summaryData (T1); i18n (T3). ✓
**Placeholder scan:** "mirror receipt builder / updatePayment / xendit fetch / settings section". Else spec code.
**Type consistency:** `buildShiftSummary*(ShiftSummaryData)` consumes the shift numbers; `updateNotifications({notifications})` ↔ the settings UI; `sendShiftSummary({shiftId,to})` ↔ the manual button; `close` schedules `internal.email.sendShiftSummaryScheduled`. English email, Bahasa UI, no em-dash. ✓
