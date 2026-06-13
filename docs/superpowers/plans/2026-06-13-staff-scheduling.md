# Staff Scheduling + Payroll Hours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** (A) Payroll hours: an hourly rate per staff + a per-staff hours×rate pay table (from the time clock) with CSV/PDF export. (B) Scheduling: a shift rota (assign staff to dated shifts) with a week view. Builds on the time clock (#60).

**Copy rules (project):** UI Bahasa via the catalog; **no em-dash `—`/`--`**; empty states use shadcn `Empty` (icon + heading + description).

---

## File Structure
- **Create:** `convex/schedule.ts` (rota CRUD), `src/routes/_pos/schedule.tsx` (week view + dialog), `src/components/schedule/shift-form-dialog.tsx`, `tests/convex/payroll.test.ts`, `tests/convex/schedule.test.ts`.
- **Modify:** `convex/schema.ts` (`cafeStaff.hourlyRateIDR` + `scheduledShifts` table), `convex/staff.ts` (`setHourlyRate`), `convex/timeClock.ts` (`payroll` query), `convex/_generated/api.d.ts`, `src/routes/_pos/time-clock.tsx` (payroll table + export), `src/routes/_pos/settings/staff.tsx` (rate input), `src/components/app-shared.tsx` (Schedule nav), `src/routeTree.gen.ts`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — hourly rate + payroll query + rota CRUD (TDD)
**Files:** create `convex/schedule.ts`, `tests/convex/payroll.test.ts`, `tests/convex/schedule.test.ts`; modify `convex/schema.ts`, `convex/staff.ts`, `convex/timeClock.ts`, `convex/_generated/api.d.ts`.

READ: `convex/timeClock.ts` `report` (the per-cashier `totalMinutes` over a range — `rangeArg`/`resolveRange`/`tzFor`; mirror for `payroll`), `convex/staff.ts` (`updateName`/the mutation pattern + `requireOwned`), `convex/schema.ts` `cafeStaff` (~116) + the `tables`/`reservations` table style for `scheduledShifts`, `convex/lib/auth.ts`, `tests/convex/time-clock.test.ts` (setup: owner + a clocked session).

- [ ] **Step 1: schema** — `cafeStaff`: add `hourlyRateIDR: v.optional(v.number())`. New table `scheduledShifts: defineTable({ cafeId, staffId: v.id('cafeStaff'), date: v.string() /* 'YYYY-MM-DD' */, startTime: v.string() /* 'HH:MM' */, endTime: v.string(), note: v.optional(v.string()), createdAt: v.number() }).index('by_cafe_date', ['cafeId','date'])`.
- [ ] **Step 2: staff rate** — `convex/staff.ts` `setHourlyRate({ id, hourlyRateIDR })` (requireOwnerCafe + requireOwned; validate int≥0; patch). Add `hourlyRateIDR` to the staff doc validator that `staff.list` returns.
- [ ] **Step 3: payroll** — `convex/timeClock.ts` `payroll({ range })` query → reuse the `report` aggregation (per-cashier totalMinutes), join each staff's `hourlyRateIDR` (default 0), return `{ rows: [{ staffId, name, totalMinutes, hours: round(min/60, 2), hourlyRateIDR, payIDR: round(min/60 * rate) }], totalPayIDR, totalMinutes, fromKey, toKey }`.
- [ ] **Step 4: rota** — `convex/schedule.ts` (owner-gated): `list({ from, to })` (by_cafe_date in [from,to], each enriched with staff name, sorted by date+startTime), `create({ staffId, date, startTime, endTime, note? })` (requireOwned staff; validate date `YYYY-MM-DD` + times `HH:MM` + end>start), `update({ id, ... })`, `remove({ id })`.
- [ ] **Step 5: FAILING tests**:
  - `tests/convex/payroll.test.ts`: a staff with a 120-minute clocked session + `setHourlyRate(20000)` → `payroll` row has `hours: 2`, `payIDR: 40000`; total matches; a staff with no rate → payIDR 0.
  - `tests/convex/schedule.test.ts`: `create`/`list`/`update`/`remove`; reject bad date/time format, end ≤ start; `list({from,to})` range filter; owner-scope (foreign staff/shift throws).
  Run → confirm FAIL.
- [ ] **Step 6: implement + register + commit** — confirm api.d.ts gained `schedule`; `pnpm test` + `pnpm typecheck` PASS. Commit:
  `git add convex/schema.ts convex/staff.ts convex/timeClock.ts convex/schedule.ts convex/_generated/api.d.ts tests/convex/payroll.test.ts tests/convex/schedule.test.ts && git commit -m "feat(staff): hourly rate + payroll query + shift schedule CRUD"`
  > Do NOT run codegen.

---

### Task 2: Frontend — payroll table + export, rate input, schedule page
**Files:** create `src/routes/_pos/schedule.tsx`, `src/components/schedule/shift-form-dialog.tsx`; modify `src/routes/_pos/time-clock.tsx`, `src/routes/_pos/settings/staff.tsx`, `src/components/app-shared.tsx`; commit `src/routeTree.gen.ts`.

READ: `src/routes/_pos/time-clock.tsx` (the report table + `useReportRange`; add a payroll section), `src/routes/_pos/settings/staff.tsx` (the staff list rows; add a rate input/edit), `src/lib/csv`+`src/lib/pdf` (`exportTablePdf`), `src/components/reports/range-picker.tsx` (the date picker for the schedule week), `src/components/reservations/reservation-form-dialog.tsx` (a date+time dialog to mirror), `src/components/app-shared.tsx` (nav).

- [ ] **Step 1: payroll** — `time-clock.tsx`: add a "Payroll" table from `api.timeClock.payroll({ range })` (Nama, Jam, Tarif/jam, Bayar) + a total; "Unduh CSV" + "Unduh PDF" (reuse `toCSV`/`exportTablePdf`).
- [ ] **Step 2: rate input** — `settings/staff.tsx`: per-staff an hourly-rate field (an Input + save via `api.staff.setHourlyRate`), or a column with an inline edit.
- [ ] **Step 3: schedule page** — `schedule.tsx`: `createFileRoute('/_pos/schedule')`. A week selector (default this week; prev/next + a date picker); `api.schedule.list({ from, to })` → a list grouped by day (each shift: staff name, `{startTime} - {endTime}` (use a hyphen-free separator like "sampai" or "–"... NO dash: use "s/d" or "ke"), note). A "Tambah jadwal" button → the form dialog (staff Select, date picker, start/end time Inputs, note). Row actions: Ubah / Hapus (ConfirmDialog). `Empty` (icon `CalendarDays`, title + desc) when the week has no shifts. Spinner while loading.
- [ ] **Step 4: nav** — `app-shared.tsx`: a "Jadwal" entry (icon `CalendarDays`) near the time-clock/staff items, gated like the time-clock item.
- [ ] **Step 5: routeTree** — `pnpm build`; confirm `/schedule` present; stage it.
- [ ] **Step 6:** typecheck + test PASS. Commit:
  `git add src/routes/_pos/schedule.tsx src/components/schedule/shift-form-dialog.tsx src/routes/_pos/time-clock.tsx src/routes/_pos/settings/staff.tsx src/components/app-shared.tsx src/routeTree.gen.ts && git commit -m "feat(staff): payroll table + export, hourly rate, schedule week view"`

UI Bahasa via `<Trans>`/`t\`...\``; NO em-dash/`--` (for time ranges use "s/d" or a word, never a dash).

---

### Task 3: i18n
New BI: `Payroll`, `Jam`, `Tarif/jam`, `Bayar`, `Jadwal`, `Tambah jadwal`, `Mulai`, `Selesai`, `Belum ada jadwal minggu ini.`, `Tarif per jam`, etc.
- [ ] `pnpm lingui:extract`; fill `en` (`Payroll`, `Hours`, `Rate/hour`, `Pay`, `Schedule`, `Add shift`, `Start`, `End`, `No shifts this week.`, `Hourly rate`) for every new empty (no em-dash); watch collisions; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 4: Final verification
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; clean tree (routeTree committed).
- [ ] **Manual sanity:** set a staff's hourly rate; the time-clock payroll shows hours×rate + exports CSV/PDF; create a scheduled shift → it shows under its day in the week view; edit/delete works; an empty week shows the Empty state.

---

## Self-Review
**Spec coverage:** hourlyRate + setHourlyRate (T1); payroll query reusing report (T1); scheduledShifts + CRUD (T1); payroll table + export + rate input + schedule week view + nav (T2); tests payroll math + schedule CRUD/scope (T1); i18n (T3). ✓
**Placeholder scan:** "reuse report aggregation / mirror reservation dialog / range-picker". Else spec code.
**Type consistency:** `setHourlyRate({id,hourlyRateIDR})`; `payroll({range}) → rows[{staffId,name,totalMinutes,hours,hourlyRateIDR,payIDR}]`; `schedule.{list,create,update,remove}` with `scheduledShifts`. No em-dash (time ranges use a word/"s/d"). ✓
