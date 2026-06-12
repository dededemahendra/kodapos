# Employee Time Clock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Staff clock in/out (independent of sales shifts) + an owner hours-per-staff report. Off the money/sale path.

**Architecture:** New `timeClock` table (work sessions) + `convex/timeClock.ts` (clockIn/clockOut/currentlyIn/report). A `/time-clock` route with an operational clock-in/out list + an owner-only hours report (preset range).

---

## File Structure
- **Create:** `convex/timeClock.ts`, `tests/convex/time-clock.test.ts`, `src/routes/_pos/time-clock.tsx`.
- **Modify:** `convex/schema.ts`, `convex/_generated/api.d.ts`, `src/components/app-shared.tsx`, `src/routeTree.gen.ts`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Backend — timeClock table + functions (TDD)
**Files:** create `convex/timeClock.ts`, `tests/convex/time-clock.test.ts`; modify `convex/schema.ts`, `convex/_generated/api.d.ts`.

READ: `convex/cashierSessions.ts` (the analog: cafeId/cashierId/at + name resolution + owner-gating), `convex/staff.ts` (`requireOwned` on a cashier, name lookup), `convex/cashMovements.ts` (`requireOwnerCafe`), `convex/lib/time.ts` (`rangeArg`/`resolveRange`/`tzFor`), `tests/convex/cashier-sessions.test.ts` / `staff.test.ts` (setup helper: owner + a created cashier).

- [ ] **Step 1: schema** — add the `timeClock` table (spec shape) with `by_cafe_clockin` + `by_cafe_cashier` indexes.
- [ ] **Step 2: FAILING tests** (`tests/convex/time-clock.test.ts`, mirror staff/cashier setup):
  - `clockIn` → `currentlyIn` lists the cashier; second `clockIn` same cashier rejected (`/sudah/i`).
  - `clockOut` closes it; `currentlyIn` excludes them; `clockOut` with no open session throws (`/belum/i`).
  - `report`: insert (via `t.run`) two CLOSED sessions for a cashier (durations 60 + 30 min within a deterministic range) → `report({ range })` row `totalMinutes` 90, `sessionCount` 2; an OPEN session counts up to now (≥0); sessions outside the range excluded; a 2nd cashier is a separate row, sorted by name.
  - owner-scope: a foreign cashier id in `clockIn`/`clockOut` throws.
  Run → confirm FAIL.
- [ ] **Step 3: implement `convex/timeClock.ts`** — `clockIn`/`clockOut`/`currentlyIn`/`report` per the spec. `clockIn` rejects an existing open session (query `by_cafe_cashier` filter `clockOutAt === undefined`). `report` resolves the range (`tzFor` + `resolveRange`), filters `by_cafe_clockin` `gte(startMs).lte(endMs)`, groups per cashier with `minutes = Math.round(((clockOutAt ?? Date.now()) - clockInAt)/60000)`, resolves names, sorts by name, returns `{ rows, totalMinutes, fromKey, toKey }`.
- [ ] **Step 4: register + tests + commit** — api.d.ts (`timeClock`); `pnpm test tests/convex/time-clock.test.ts` + full PASS; `pnpm typecheck` PASS. Commit:
  `git add convex/timeClock.ts convex/schema.ts convex/_generated/api.d.ts tests/convex/time-clock.test.ts && git commit -m "feat(timeclock): work sessions + clock in/out + hours report"`
  > Do NOT run codegen.

---

### Task 2: Frontend — clock page + report + nav
**Files:** create `src/routes/_pos/time-clock.tsx`; modify `src/components/app-shared.tsx`; commit `src/routeTree.gen.ts`.

READ: `src/routes/_pos/tables.tsx` (an operational route, ungated, with an owner-only section pattern via `usePermissions().isOwner`), `src/routes/_pos/suppliers.tsx` (list/table pattern), `~/lib/csv` (`toCSV`/`downloadCSV`), `src/components/ui/{select,empty,badge,button,data-table}.tsx`, `app-shared.tsx` nav shape.

- [ ] **Step 1: `time-clock.tsx`** — `createFileRoute('/_pos/time-clock')`, NOT owner-gated.
  - **Clock section:** `const staff = useQuery(api.staff.list, {})`; `const inNow = useQuery(api.timeClock.currentlyIn, {})`; `clockIn`/`clockOut` mutations. For each active staff, a row: name + status ("Masuk sejak {time}" if in `inNow`, else "Belum masuk") + a Clock in / Clock out `Button` (call the mutation with `{ cashierId }`; toast). 
  - **Report section (owner only):** `const { isOwner } = usePermissions()`; when owner, a preset range `Select` (`today`/`last7`/`last30` → `{ preset }` state) + `const report = useQuery(api.timeClock.report, { range })`. Render a DataTable/list: Staf, Sesi, Jam (`formatMinutes(totalMinutes)` = `${Math.floor(m/60)}j ${m%60}m`) + a total row; a "Unduh CSV" button (`toCSV`/`downloadCSV`, filename `jam-kerja.csv`); empty → `Empty` ("Belum ada jam kerja pada rentang ini." + hint).
  - `PageHeader` titled "Jam Kerja".
- [ ] **Step 2: nav** — add `{ title: msg\`Jam Kerja\`, path: '/time-clock', icon: <Clock /> }` (import `Clock` from lucide; ungated; operational group) in `app-shared.tsx`.
- [ ] **Step 3: routeTree** — `pnpm build`; confirm `grep "PosTimeClockRoute" src/routeTree.gen.ts`; stage it.
- [ ] **Step 4:** `pnpm typecheck` + `pnpm test` PASS. Commit:
  `git add src/routes/_pos/time-clock.tsx src/components/app-shared.tsx src/routeTree.gen.ts && git commit -m "feat(timeclock): clock in/out page + hours report + nav"`

---

### Task 3: i18n
New: `Jam Kerja`, `Clock in`, `Clock out`, `Masuk sejak {0}`, `Belum masuk`, `Staf`, `Sesi`, `Jam`, `Belum ada jam kerja pada rentang ini.` (+ reuse `Hari ini`/`7 hari`/`30 hari`/`Unduh CSV`).
- [ ] `pnpm lingui:extract`; fill `en` (`Work hours`, `Clock in`, `Clock out`, `In since {0}`, `Not clocked in`, `Staff`, `Sessions`, `Hours`, `No work hours in this range.`) + any others; `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.

---

### Task 4: Final verification
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; `git status` clean — **routeTree.gen.ts committed**.
- [ ] **Manual sanity:** `/time-clock` shows each staff with Clock in/out; clocking in flips the status to "Masuk sejak …"; an owner sees an hours table that totals correctly for the preset range + CSV; a cashier sees only the clock controls.

---

## Self-Review
**Spec coverage:** table + clockIn/out (open-session guard) + currentlyIn + report (range, per-staff minutes incl open) (T1); clock page + owner report + nav + routeTree (T2); tests clockin/out/dup/report/scope (T1); i18n (T3). ✓
**Placeholder scan:** test seeding "copy from staff/cashier-sessions tests"; report durations via `t.run` fixed timestamps. Else spec code.
**Type consistency:** `timeClock.report` returns `{ rows:[{cashierId,cashierName,sessionCount,totalMinutes}], totalMinutes, fromKey, toKey }` consumed by the page; `clockIn`/`clockOut` take `{ cashierId }` matching the buttons; `currentlyIn` → `[{cashierId,cashierName,clockInAt}]`. ✓
