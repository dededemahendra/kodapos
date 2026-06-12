# Employee Time Clock Design Spec

**Date:** 2026-06-11
**Branch:** `feat/time-clock` (off `main`)

## Context

Staff hours are not tracked. Sales shifts (`shifts`) are about the cash drawer, not work
time. This slice adds a **time clock**: staff clock in/out (independent of sales shifts), and
the owner sees an hours-per-staff report for payroll. Entirely **off the money/sale path** —
a new `timeClock` table with no links to orders.

## Data model — new `timeClock` table
```ts
timeClock: defineTable({
  cafeId: v.id('cafes'),
  cashierId: v.id('cafeStaff'),
  clockInAt: v.number(),
  clockOutAt: v.optional(v.number()), // unset == currently clocked in
})
  .index('by_cafe_clockin', ['cafeId', 'clockInAt'])
  .index('by_cafe_cashier', ['cafeId', 'cashierId']),
```
A row = one work session. An **open** session has no `clockOutAt`. One open session per staff
at a time.

## Backend — `convex/timeClock.ts` (new, owner-gated)
- **`clockIn({ cashierId })`** (mutation): `requireOwned` the cashier; reject if an open
  session exists for that cashier (`by_cafe_cashier` + no `clockOutAt` → `'Sudah clock in.'`);
  insert `{ cafeId, cashierId, clockInAt: Date.now() }`. Returns id.
- **`clockOut({ cashierId })`** (mutation): find the cashier's open session; if none →
  `'Belum clock in.'`; patch `clockOutAt: Date.now()`. Returns null.
- **`currentlyIn({})`** (query): the staff with an open session now → `[{ cashierId,
  cashierName, clockInAt }]` (resolve names from `cafeStaff`). For the clock UI's live status.
- **`report({ range })`** (query, `range: rangeArg`): sessions whose `clockInAt` is in the
  resolved `[startMs, endMs]`; per cashier → `{ cashierId, cashierName, sessionCount,
  totalMinutes }` where each session's minutes = `Math.round(((clockOutAt ?? now) − clockInAt)/60000)`
  (an open session counts up to now). Sorted by `cashierName`. Returns `{ rows, totalMinutes,
  fromKey, toKey }` (mirror the reports range pattern: `tzFor` + `resolveRange`).

(`convex/timeClock.ts` is a NEW function module → register in `api.d.ts`.)

## Frontend — `src/routes/_pos/time-clock.tsx` (new route)

A single page with two sections:
1. **Clock in/out (operational — all staff):** a list of active staff (`api.staff.list`)
   each showing their status from `api.timeClock.currentlyIn` — **"Masuk sejak HH:MM"** (clocked
   in) with a **"Clock out"** button, or **"Belum masuk"** with a **"Clock in"** button. Toast
   on success/error. (Live via the reactive `currentlyIn` query.)
2. **Hours report (owner only — `usePermissions().isOwner`):** a small preset range `Select`
   (Hari ini / 7 hari / 30 hari → `{ preset: 'today' | 'last7' | 'last30' }`), then
   `api.timeClock.report({ range })` rendered as a table: Staff, Sesi (sessionCount), Jam
   (totalMinutes → `Hh Mm`), with a total. A "Unduh CSV" button. Empty → shadcn `Empty`
   ("Belum ada jam kerja pada rentang ini." + a hint).

Nav: a **"Jam Kerja"** entry (a `Clock`/`Timer` icon). Operational (cashier-accessible) — NOT
owner-gated at the route level (clock-in/out is for staff); the report section self-gates to
owners. (Mirror how `/tables` is ungated but its management is owner-only.)

> **New route** → commit the regenerated `src/routeTree.gen.ts`.

A small `formatMinutes(m)` helper (`${Math.floor(m/60)}j ${m%60}m`) — put it in the route file
or `~/lib/time`-adjacent; keep it local for now.

## Testing
**`tests/convex/time-clock.test.ts`** (new; mirror the staff/cashier-sessions test setup):
- `clockIn` then `currentlyIn` lists the cashier; a second `clockIn` for the same cashier is
  rejected (`/sudah/i`).
- `clockOut` closes the session; `currentlyIn` no longer lists them; `clockOut` with no open
  session throws (`/belum/i`).
- `report`: two sessions (one closed 60 min, one closed 30 min) for a cashier in range →
  `totalMinutes` 90, `sessionCount` 2; an open session counts up to "now"; sessions outside
  the range excluded; owner-scoped.
- A second cashier appears as a separate row; sorted by name.
> Use `t.run` to insert `timeClock` rows with fixed `clockInAt`/`clockOutAt` for deterministic
> durations, or use the mutations + control time via fixed inserts. Owner-scope: a foreign
> cashier id in `clockIn`/`clockOut` throws via `requireOwned`.

Frontend (status list, clock buttons, report table, CSV) by typecheck + smoke.

## i18n
New BI: `Jam Kerja`, `Clock in`, `Clock out`, `Masuk sejak {0}`, `Belum masuk`, `Sudah clock in.`
(server), `Belum clock in.` (server), `Staf`, `Sesi`, `Jam`, `Belum ada jam kerja pada rentang
ini.`, `Hari ini`/`7 hari`/`30 hari` (reuse if present). Run extract, fill `en` (`Work hours`,
`Clock in`, `Clock out`, `In since {0}`, `Not clocked in`, `Staff`, `Sessions`, `Hours`, …),
compile.

## Conventions
- Run CI locally: `pnpm typecheck`, `pnpm test`, `pnpm lingui:compile`; clean tree.
- Do NOT run codegen — `timeClock` is a NEW module (register in `api.d.ts`; dev watcher does
  it — commit). **New route** → commit `routeTree.gen.ts`.
- Small conventional commits; PR → review → merge commit.

## Out of scope
- PIN re-auth on clock in/out (clock by selecting the staff; PIN-gated clock is a later
  refinement); overtime rules / pay rates / payroll export to accounting; break tracking;
  editing/deleting a session; geofencing; scheduled shifts/rosters; linking work sessions to
  sales shifts.
