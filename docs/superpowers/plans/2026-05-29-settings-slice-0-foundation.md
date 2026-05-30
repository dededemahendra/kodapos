# Settings Slice 0 — Foundation (backend + shared UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the server-side `cafeSettings` model with a defaults-merging `settings.get` query, plus the reusable `src/components/settings/` UI primitives every settings page will share.

**Architecture:** A single `cafeSettings` table holds one document per cafe (Approach A from the spec), lazily created. `settings.get` reads that row, merges it over a hardcoded `DEFAULT_SETTINGS` object so the client always receives a complete shape, and folds in the cafe's core tax fields (`taxRatePct`/`taxEnabled`). The page-specific mutations land in their respective slice plans. Shared presentational primitives (`SettingsPageHeader`, `SettingsSection`, `SettingRow`, `RowSep`, `SaveBar`) standardize the look extracted from `general.tsx`.

**Tech Stack:** Convex (`query`/`mutation`, `convex-test` + Vitest on `edge-runtime`), TanStack Router, React, shadcn/ui (`Card`, `Field`, `Button`, `Spinner`), Tailwind v4, `@lingui/react/macro`.

**Reference spec:** `docs/superpowers/specs/2026-05-29-settings-pages-design.md`

> **Testing note:** This repo has no React component test harness (Vitest runs on `edge-runtime`, no jsdom/RTL). TDD steps below cover the Convex backend. The UI-primitive tasks are verified with `pnpm typecheck` and (optionally) a manual run — there is no component unit test to write, and you must NOT scaffold a new test environment for them.

---

## File Structure

- **Create** `convex/settings.ts` — `DEFAULT_SETTINGS`, the settings validator, and the `get` query.
- **Modify** `convex/schema.ts` — add the `cafeSettings` table.
- **Create** `tests/convex/settings.test.ts` — backend tests for `get`.
- **Create** `src/components/settings/primitives.tsx` — `SettingsPageHeader`, `SettingsSection`, `SettingRow`, `RowSep`.
- **Create** `src/components/settings/save-bar.tsx` — `SaveBar` sticky footer.
- **Create** `src/components/settings/use-editable-state.ts` — draft/dirty/reset hook for server-backed forms.

---

## Task 1: Add the `cafeSettings` table to the schema

**Files:**
- Modify: `convex/schema.ts` (insert a new table after the `cafeStaff` table, around line 80)

- [ ] **Step 1: Add the table definition**

Insert this block immediately after the `cafeStaff` table's closing `,` (after line 80, before the `shifts` table):

```ts
  cafeSettings: defineTable({
    cafeId: v.id('cafes'),

    payment: v.optional(
      v.object({
        methods: v.object({
          cash: v.boolean(),
          qrisStatic: v.boolean(),
          qrisDynamic: v.boolean(),
          card: v.boolean(),
          ewallet: v.boolean(),
          transfer: v.boolean(),
        }),
        defaultMethod: v.union(
          v.literal('cash'),
          v.literal('qris_static'),
          v.literal('qris_dynamic'),
          v.literal('card'),
          v.literal('ewallet'),
          v.literal('transfer')
        ),
        cashRounding: v.union(
          v.literal('none'),
          v.literal('nearest_100'),
          v.literal('nearest_500'),
          v.literal('nearest_1000')
        ),
        quickCashButtons: v.array(v.number()),
        serviceChargeEnabled: v.boolean(),
        serviceChargePct: v.number(),
        serviceChargeName: v.string(),
        qrisMerchantName: v.optional(v.string()),
        qrisNmid: v.optional(v.string()),
        qrisImageStorageId: v.optional(v.id('_storage')),
      })
    ),

    receipt: v.optional(
      v.object({
        headerText: v.optional(v.string()),
        footerText: v.optional(v.string()),
        orderNumberPrefix: v.optional(v.string()),
        showLogo: v.boolean(),
        showAddress: v.boolean(),
        showPhone: v.boolean(),
        showCashier: v.boolean(),
        showOrderNumber: v.boolean(),
        showItemModifiers: v.boolean(),
        showTaxBreakdown: v.boolean(),
        paperSize: v.union(v.literal('58mm'), v.literal('80mm')),
        fontSize: v.union(
          v.literal('small'),
          v.literal('normal'),
          v.literal('large')
        ),
        autoPrint: v.boolean(),
        printCopies: v.number(),
        printerType: v.union(
          v.literal('bluetooth'),
          v.literal('usb'),
          v.literal('network')
        ),
        openDrawer: v.boolean(),
      })
    ),

    integrations: v.optional(
      v.array(
        v.object({
          key: v.string(),
          connected: v.boolean(),
          connectedAt: v.optional(v.number()),
          config: v.optional(v.any()),
        })
      )
    ),

    // Tax extras. Core rate/enabled stay on `cafes` (orders + onboarding
    // depend on them); these enrich the Tax & Payment page.
    taxName: v.optional(v.string()),
    taxInclusive: v.optional(v.boolean()),
    npwp: v.optional(v.string()),

    updatedAt: v.number(),
  }).index('by_cafe', ['cafeId']),
```

- [ ] **Step 2: Regenerate Convex types and typecheck**

Run: `pnpm convex:dev --once 2>/dev/null; pnpm typecheck`
Expected: PASS (the new table appears in `convex/_generated/dataModel`; no type errors). If `convex:dev --once` is unavailable offline, the generated types update on the next `convex dev`; `pnpm typecheck` against the current generated types should still pass since nothing references the table yet.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(settings): add cafeSettings table"
```

---

## Task 2: `settings.get` returns defaults for a cafe with no settings row

**Files:**
- Create: `convex/settings.ts`
- Create: `tests/convex/settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/convex/settings.test.ts`:

```ts
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function seedOwner(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' });
  });
  await t
    .withIdentity({ subject: `${userId}|test_session` })
    .mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  return userId;
}

describe('settings.get', () => {
  it('returns full defaults when no settings row exists', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    const s = await asOwner.query(api.settings.get);

    // payment defaults
    expect(s.payment.defaultMethod).toBe('cash');
    expect(s.payment.methods.cash).toBe(true);
    expect(s.payment.methods.qrisDynamic).toBe(false);
    expect(s.payment.cashRounding).toBe('none');
    expect(s.payment.quickCashButtons).toEqual([20000, 50000, 100000]);
    expect(s.payment.serviceChargeEnabled).toBe(false);

    // receipt defaults
    expect(s.receipt.paperSize).toBe('80mm');
    expect(s.receipt.fontSize).toBe('normal');
    expect(s.receipt.autoPrint).toBe(false);
    expect(s.receipt.printCopies).toBe(1);
    expect(s.receipt.showLogo).toBe(true);

    // integrations + tax extras
    expect(s.integrations).toEqual([]);
    expect(s.taxName).toBe('PB1');
    expect(s.taxInclusive).toBe(false);

    // core tax folded in from the cafe (createForOwner sets 11 / true)
    expect(s.taxRatePct).toBe(11);
    expect(s.taxEnabled).toBe(true);
  });

  it('throws when not authenticated', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.settings.get)).rejects.toThrow(/not authenticated/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/convex/settings.test.ts`
Expected: FAIL — `api.settings` is undefined / module `convex/settings.ts` not found.

- [ ] **Step 3: Write `convex/settings.ts`**

Create `convex/settings.ts`:

```ts
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { query } from './_generated/server';
import { requireOwnerCafe } from './lib/auth';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Default settings used whenever a cafe has no `cafeSettings` row yet, or a
 * group within it is unset. `settings.get` merges the stored row over this so
 * the client always receives a complete shape.
 */
export const DEFAULT_SETTINGS = {
  payment: {
    methods: {
      cash: true,
      qrisStatic: true,
      qrisDynamic: false,
      card: false,
      ewallet: false,
      transfer: false,
    },
    defaultMethod: 'cash' as const,
    cashRounding: 'none' as const,
    quickCashButtons: [20000, 50000, 100000],
    serviceChargeEnabled: false,
    serviceChargePct: 0,
    serviceChargeName: 'Biaya Layanan',
  },
  receipt: {
    showLogo: true,
    showAddress: true,
    showPhone: true,
    showCashier: true,
    showOrderNumber: true,
    showItemModifiers: true,
    showTaxBreakdown: true,
    paperSize: '80mm' as const,
    fontSize: 'normal' as const,
    autoPrint: false,
    printCopies: 1,
    printerType: 'bluetooth' as const,
    openDrawer: false,
  },
  integrations: [] as Doc<'cafeSettings'>['integrations'],
  taxName: 'PB1',
  taxInclusive: false,
};

// ---------------------------------------------------------------------------
// Return validator
// ---------------------------------------------------------------------------

const paymentValidator = v.object({
  methods: v.object({
    cash: v.boolean(),
    qrisStatic: v.boolean(),
    qrisDynamic: v.boolean(),
    card: v.boolean(),
    ewallet: v.boolean(),
    transfer: v.boolean(),
  }),
  defaultMethod: v.union(
    v.literal('cash'),
    v.literal('qris_static'),
    v.literal('qris_dynamic'),
    v.literal('card'),
    v.literal('ewallet'),
    v.literal('transfer')
  ),
  cashRounding: v.union(
    v.literal('none'),
    v.literal('nearest_100'),
    v.literal('nearest_500'),
    v.literal('nearest_1000')
  ),
  quickCashButtons: v.array(v.number()),
  serviceChargeEnabled: v.boolean(),
  serviceChargePct: v.number(),
  serviceChargeName: v.string(),
  qrisMerchantName: v.optional(v.string()),
  qrisNmid: v.optional(v.string()),
  qrisImageStorageId: v.optional(v.id('_storage')),
});

const receiptValidator = v.object({
  headerText: v.optional(v.string()),
  footerText: v.optional(v.string()),
  orderNumberPrefix: v.optional(v.string()),
  showLogo: v.boolean(),
  showAddress: v.boolean(),
  showPhone: v.boolean(),
  showCashier: v.boolean(),
  showOrderNumber: v.boolean(),
  showItemModifiers: v.boolean(),
  showTaxBreakdown: v.boolean(),
  paperSize: v.union(v.literal('58mm'), v.literal('80mm')),
  fontSize: v.union(v.literal('small'), v.literal('normal'), v.literal('large')),
  autoPrint: v.boolean(),
  printCopies: v.number(),
  printerType: v.union(
    v.literal('bluetooth'),
    v.literal('usb'),
    v.literal('network')
  ),
  openDrawer: v.boolean(),
});

const integrationsValidator = v.array(
  v.object({
    key: v.string(),
    connected: v.boolean(),
    connectedAt: v.optional(v.number()),
    config: v.optional(v.any()),
  })
);

const settingsValidator = v.object({
  payment: paymentValidator,
  receipt: receiptValidator,
  integrations: integrationsValidator,
  taxName: v.string(),
  taxInclusive: v.boolean(),
  npwp: v.optional(v.string()),
  // Core tax, folded in from the `cafes` row.
  taxRatePct: v.number(),
  taxEnabled: v.boolean(),
});

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export const get = query({
  args: {},
  returns: settingsValidator,
  handler: async (ctx) => {
    const { cafeId } = await requireOwnerCafe(ctx);
    const cafe = await ctx.db.get(cafeId);
    const row = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();

    return {
      payment: row?.payment ?? DEFAULT_SETTINGS.payment,
      receipt: row?.receipt ?? DEFAULT_SETTINGS.receipt,
      integrations: row?.integrations ?? DEFAULT_SETTINGS.integrations,
      taxName: row?.taxName ?? DEFAULT_SETTINGS.taxName,
      taxInclusive: row?.taxInclusive ?? DEFAULT_SETTINGS.taxInclusive,
      ...(row?.npwp ? { npwp: row.npwp } : {}),
      taxRatePct: cafe?.taxRatePct ?? 11,
      taxEnabled: cafe?.taxEnabled ?? true,
    };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/convex/settings.test.ts`
Expected: PASS (both `returns full defaults...` and `throws when not authenticated`).

- [ ] **Step 5: Commit**

```bash
git add convex/settings.ts tests/convex/settings.test.ts convex/_generated
git commit -m "feat(settings): add settings.get returning defaults-merged config"
```

---

## Task 3: `settings.get` merges a stored row over defaults

**Files:**
- Modify: `tests/convex/settings.test.ts` (add one test)

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe('settings.get', ...)` block in `tests/convex/settings.test.ts`:

```ts
  it('merges a stored settings row over defaults', async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const asOwner = t.withIdentity({ subject: `${userId}|test_session` });

    // Find the cafe id, then insert a partial cafeSettings row directly.
    const cafeId = await t.run(async (ctx) => {
      const cafe = await ctx.db
        .query('cafes')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
        .first();
      return cafe!._id;
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('cafeSettings', {
        cafeId,
        receipt: {
          showLogo: false,
          showAddress: true,
          showPhone: true,
          showCashier: true,
          showOrderNumber: true,
          showItemModifiers: true,
          showTaxBreakdown: true,
          paperSize: '58mm',
          fontSize: 'large',
          autoPrint: true,
          printCopies: 2,
          printerType: 'usb',
          openDrawer: true,
        },
        taxName: 'PPN',
        updatedAt: 0,
      });
    });

    const s = await asOwner.query(api.settings.get);
    // stored receipt group wins
    expect(s.receipt.paperSize).toBe('58mm');
    expect(s.receipt.printCopies).toBe(2);
    expect(s.taxName).toBe('PPN');
    // unset payment group falls back to defaults
    expect(s.payment.defaultMethod).toBe('cash');
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm test -- tests/convex/settings.test.ts`
Expected: PASS. (The `get` handler from Task 2 already implements group-level merge, so this test confirms it; no new implementation needed. If it fails, the merge in `get` is wrong — fix `convex/settings.ts` so each group uses `row?.<group> ?? DEFAULT_SETTINGS.<group>`.)

- [ ] **Step 3: Commit**

```bash
git add tests/convex/settings.test.ts
git commit -m "test(settings): cover stored-row merge in settings.get"
```

---

## Task 4: Shared layout primitives

**Files:**
- Create: `src/components/settings/primitives.tsx`

- [ ] **Step 1: Create the primitives file**

Create `src/components/settings/primitives.tsx`:

```tsx
import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Field, FieldDescription, FieldTitle } from '~/components/ui/field';
import { Separator } from '~/components/ui/separator';

/** Page-level title + description shown at the top of each settings page. */
export function SettingsPageHeader({
  title,
  description,
}: {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">{title}</h1>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
    </div>
  );
}

/** A titled Card wrapping a group of setting rows. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-1">{children}</CardContent>
    </Card>
  );
}

/** A horizontal row: label + description on the left, control on the right. */
export function SettingRow({
  label,
  description,
  control,
}: {
  label: ReactNode;
  description?: ReactNode;
  control: ReactNode;
}) {
  return (
    <Field orientation="horizontal" className="items-start gap-4">
      <div className="flex-1 min-w-0">
        <FieldTitle>{label}</FieldTitle>
        {description && (
          <FieldDescription className="mt-0.5">{description}</FieldDescription>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </Field>
  );
}

/** Thin separator between rows inside a SettingsSection. */
export function RowSep() {
  return <Separator className="my-1" />;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors; imports resolve against existing `card.tsx`, `field.tsx`, `separator.tsx`).

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/primitives.tsx
git commit -m "feat(settings): add shared settings layout primitives"
```

---

## Task 5: `useEditableState` hook for server-backed forms

**Files:**
- Create: `src/components/settings/use-editable-state.ts`

- [ ] **Step 1: Create the hook**

Create `src/components/settings/use-editable-state.ts`:

```ts
import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a local editable draft synced to a server value. When the server
 * value changes (e.g. the Convex query resolves or another device writes),
 * the draft re-syncs only if the user hasn't diverged. Exposes `dirty`
 * (draft differs from the last server snapshot) and `reset`.
 *
 * Equality uses JSON serialization — settings values are plain JSON.
 */
export function useEditableState<T>(serverValue: T | undefined) {
  const [draft, setDraft] = useState<T | undefined>(serverValue);
  const lastServer = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (serverValue === undefined) return;
    const key = JSON.stringify(serverValue);
    // Sync down only when the server snapshot itself changed.
    if (key !== lastServer.current) {
      lastServer.current = key;
      setDraft(serverValue);
    }
  }, [serverValue]);

  const dirty =
    draft !== undefined &&
    lastServer.current !== undefined &&
    JSON.stringify(draft) !== lastServer.current;

  const reset = () => {
    if (lastServer.current !== undefined) {
      setDraft(JSON.parse(lastServer.current) as T);
    }
  };

  return { draft, setDraft, dirty, reset };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/use-editable-state.ts
git commit -m "feat(settings): add useEditableState draft/dirty hook"
```

---

## Task 6: `SaveBar` sticky footer

**Files:**
- Create: `src/components/settings/save-bar.tsx`

- [ ] **Step 1: Create the SaveBar**

Create `src/components/settings/save-bar.tsx`:

```tsx
import { Trans } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { cn } from '~/lib/utils';

/**
 * Sticky footer shown while a settings form is dirty. Renders Cancel + Save,
 * a saving spinner, and a transient "Tersimpan ✓" confirmation after a
 * successful save. `onSave` should resolve once the mutation completes.
 */
export function SaveBar({
  dirty,
  onSave,
  onReset,
}: {
  dirty: boolean;
  onSave: () => Promise<void>;
  onReset: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  // Clear the "saved" confirmation after a few seconds.
  useEffect(() => {
    if (savedAt === 0) return;
    const id = setTimeout(() => setSavedAt(0), 2500);
    return () => clearTimeout(id);
  }, [savedAt]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave();
      setSavedAt((n) => n + 1);
    } finally {
      setSaving(false);
    }
  }

  const visible = dirty || saving || savedAt > 0;

  return (
    <div
      className={cn(
        'sticky bottom-0 mt-6 flex items-center justify-end gap-3 border-t border-border bg-background/95 py-3 backdrop-blur transition-opacity',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      )}
    >
      {savedAt > 0 && !dirty && (
        <span className="text-sm text-muted-foreground">
          <Trans>Tersimpan ✓</Trans>
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={onReset}
        disabled={!dirty || saving}
      >
        <Trans>Batal</Trans>
      </Button>
      <Button type="button" onClick={handleSave} disabled={!dirty || saving}>
        {saving && <Spinner data-icon="inline-start" />}
        <Trans>Simpan perubahan</Trans>
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (If `Button` has no `variant="ghost"`, open `src/components/ui/button.tsx`, confirm the available variants, and use an existing one such as `"outline"`.)

- [ ] **Step 3: Verify the i18n catalog still compiles**

Run: `pnpm lingui:compile`
Expected: PASS (new `<Trans>` strings — "Tersimpan ✓", "Batal", "Simpan perubahan" — extract/compile without error).

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/save-bar.tsx
git commit -m "feat(settings): add SaveBar sticky footer"
```

---

## Task 7: Full local CI gate

- [ ] **Step 1: Run the full local CI**

Run: `pnpm typecheck && pnpm test && pnpm lingui:compile`
Expected: all PASS. This is the gate before opening the Slice 0 PR (matches the project's "run CI locally before push" rule).

- [ ] **Step 2: Push the branch and open the PR (only when the user asks)**

Do not push or open a PR until the user confirms. When they do:

```bash
git push -u origin feat/dashboard-real-data
```

Then open a PR via `gh` summarizing Slice 0 (the `cafeSettings` table, `settings.get`, and shared settings UI primitives).

---

## Self-Review

**Spec coverage (Slice 0 scope):**
- `cafeSettings` table (Approach A) → Task 1. ✓
- `settings.get` defaults-merge → Tasks 2–3. ✓
- Core tax (`taxRatePct`/`taxEnabled`) folded into `get` → Task 2 handler + test. ✓
- Shared primitives `SettingsPageHeader`/`SettingsSection`/`SettingRow`/`RowSep` → Task 4. ✓
- `SaveBar` + dirty-form pattern → Tasks 5–6. ✓
- Page-specific mutations (`updatePayment`, `updateReceipt`, `updateTaxPayment`, `connect/disconnectIntegration`) are intentionally **out of this slice** — each lands in its page's slice plan, alongside the `patchSettings` helper it first needs. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step shows complete content. ✓

**Type consistency:** The table's nested object shapes (Task 1), the `settingsValidator`/`DEFAULT_SETTINGS` in `convex/settings.ts` (Task 2), and the test assertions (Tasks 2–3) use the same field names and literal unions. `get` returns `npwp` only when present (matches `v.optional`). `integrations` default is typed via `Doc<'cafeSettings'>['integrations']` so it stays in sync with the schema. ✓

---

## Next slices (separate plans, written just-in-time)

1. **Profile** — extend `cafes` (businessType, contacts, city/postal, logo upload, operatingHours) + expand `profile.tsx`.
2. **Staff** — extend `cafeStaff` (phone/email/permissions) + expand `staff.tsx`.
3. **Tax & Payment** — `settings.updateTaxPayment` + `updatePayment` + `tax.tsx`. Introduces the shared `patchSettings` helper.
4. **Receipt & Printer** — `settings.updateReceipt` + `receipt.tsx` with live preview.
5. **Integrations** — `settings.connectIntegration`/`disconnectIntegration` + `integrations.tsx` catalog.
6. **Cleanup** — remove overlapping Receipt/Payment sections from `general.tsx`.
