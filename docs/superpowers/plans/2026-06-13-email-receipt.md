# Email Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Send an order receipt to a customer email address (complements the existing WhatsApp send). A pure English receipt builder + a Convex action that posts to Resend, plus a small send form on the receipt preview.

**Copy rules (project):** receipt content is always English and off-catalog (memory); UI strings are Bahasa via the catalog; **no em-dash `—` or `--` in any user-facing copy** (use commas/periods/parentheses); empty states use shadcn `Empty` (icon + heading + description).

**External dependency:** Resend. The deployment needs `RESEND_API_KEY` (and optionally `RESEND_FROM`, a verified sender, default `kodapos <onboarding@resend.dev>`) set in the Convex env. Without the key the action throws a clear, user-facing error and the UI toasts it (the feature degrades gracefully, it does not crash).

---

## File Structure
- **Create:** `convex/lib/receipt.ts` (pure builders), `convex/email.ts` (the action), `tests/convex/receipt-builder.test.ts`.
- **Modify:** `convex/_generated/api.d.ts`, `src/components/sale/receipt-preview.tsx`.
- **i18n:** `src/locales/{id,en}/messages.po`.

---

### Task 1: Pure receipt builder + Resend action (TDD)
**Files:** create `convex/lib/receipt.ts`, `tests/convex/receipt-builder.test.ts`, `convex/email.ts`; modify `convex/_generated/api.d.ts`.

READ: `src/components/sale/receipt-preview.tsx` (the exact receipt layout/labels to mirror in plain text/HTML — subtotal, discount, service charge, tax, total, payments, points, refunded), `convex/orders.ts` `getById` (the `orderDetail` shape the builder consumes: `lines[{nameSnapshot, qty, lineTotalIDR, modifiersSnapshot, variantName?}]`, `subtotalIDR`, `discountIDR`, `serviceChargeIDR?`/`serviceChargeName?`/`serviceChargePct?`, `taxIDR`/`taxRatePct`, `totalIDR`, `payments`, `pointsEarned?`, `refundedIDR?`, `createdAtClient`, `cashierName`, `orderType?`), `convex/cafes.ts` `myCafe` (name/address/phone), `convex/payments/providers/xendit.ts` (the action `fetch` + error pattern to mirror), `~/lib/money` `formatIDR` (or replicate a pure IDR formatter in the builder — keep the builder dependency-free of client code; a small local formatter is fine).

- [ ] **Step 1: pure builder `convex/lib/receipt.ts`** — `buildReceiptText(order, cafe): string` and `buildReceiptHtml(order, cafe): string`, both ENGLISH, no em-dash. Take plain typed inputs (define `ReceiptOrder`/`ReceiptCafe` interfaces matching the `getById`/`myCafe` fields used). Render: cafe name + address line; date; cashier; order type; each line (`{qty}x {name}{variant} ........ {IDR}` + modifier sub-lines); subtotal; discount (if >0); service charge (name + pct, if >0); tax (pct, if >0); total; payment method(s); points earned (if any); a "REFUNDED {IDR}" line (if refundedIDR>0); a short footer ("Thank you"). A pure `formatIDR(n)` local helper (e.g. `Rp ` + thousands-separated).
- [ ] **Step 2: FAILING tests** (`tests/convex/receipt-builder.test.ts`): feed a representative order (2 lines, one with a modifier + variant, a service charge, tax, a cash payment, points) → `buildReceiptText` contains the item names, the formatted line totals, "Subtotal", "Service", "Tax", "Total", the IDR total, "Thank you"; a refunded order includes "REFUNDED"; assert NO `—`/`--` in the output. `buildReceiptHtml` returns a string containing `<table`/`<td` and the total. Run → confirm FAIL.
- [ ] **Step 3: implement** the builders to pass.
- [ ] **Step 4: `convex/email.ts` action** — `sendReceipt = action({ args: { orderId: v.id('orders'), to: v.string() }, returns: v.null(), handler })`:
  - validate `to` with a simple email regex, else throw `'Alamat email tidak valid.'`.
  - `const key = process.env.RESEND_API_KEY; if (!key) throw new Error('Email belum dikonfigurasi.');`
  - `const order = await ctx.runQuery(api.orders.getById, { id: orderId }); if (!order) throw new Error('Pesanan tidak ditemukan.');` and `const cafe = await ctx.runQuery(api.cafes.myCafe, {});` (auth carries from the action caller; getById is owner-gated → owner-scoped).
  - build `text`/`html` via the builders; `from = process.env.RESEND_FROM ?? 'kodapos <onboarding@resend.dev>'`; subject `Receipt ${cafe?.name ?? 'kodapos'}` (no dash).
  - `fetch('https://api.resend.com/emails', { method:'POST', headers:{ Authorization:\`Bearer ${key}\`, 'Content-Type':'application/json' }, body: JSON.stringify({ from, to, subject, html, text }) })`; on `!res.ok` throw `\`Gagal mengirim email (${res.status}).\`` + detail (mirror xendit). Return null.
- [ ] **Step 5: register + tests + commit** — confirm api.d.ts gained `email`; `pnpm test` (the builder tests + an action test asserting the no-key path throws `/belum dikonfigurasi/i`) + full PASS; `pnpm typecheck` PASS. Commit:
  `git add convex/lib/receipt.ts convex/email.ts convex/_generated/api.d.ts tests/convex/receipt-builder.test.ts && git commit -m "feat(receipt): email receipt builder + Resend send action"`
  > Do NOT run codegen.

---

### Task 2: Frontend — email send form on the receipt preview
**Files:** modify `src/components/sale/receipt-preview.tsx`.

READ: `receipt-preview.tsx` (the footer action row where Cetak/Selesai + the void/refund buttons live; `useAction` from convex/react; `toast`/`useLingui`; the order/customer fields — prefill `to` from a linked customer email if available, else blank).

- [ ] **Step 1:** add an email send control to the receipt footer: an email `Input` (placeholder `email@contoh.com`) + a "Kirim email" `Button`. On submit → `const send = useAction(api.email.sendReceipt); await send({ orderId, to })`; disable while sending (a `sending` state); `toast.success(t\`Struk dikirim ke email.\`)`; on error `toast.error(err.message ?? t\`Gagal mengirim email.\`)`. Keep it compact (a small inline row or a popover) so it does not crowd the existing actions; only show it for a real order (`order` loaded).
- [ ] **Step 2:** `pnpm typecheck` + `pnpm test` PASS. Commit:
  `git add src/components/sale/receipt-preview.tsx && git commit -m "feat(receipt): send-receipt-by-email control on the receipt preview"`

UI strings Bahasa via `<Trans>`/`t\`...\``, no em-dash/`--`. The receipt EMAIL content stays English (built server-side).

---

### Task 3: i18n + env note
New BI UI: `Kirim email`, `Struk dikirim ke email.`, `Gagal mengirim email.`, `Email struk` (label), `email@contoh.com` (placeholder, can stay literal). Server-thrown (`'Email belum dikonfigurasi.'`, `'Alamat email tidak valid.'`) are off-catalog.
- [ ] `pnpm lingui:extract`; fill `en` (`Send email`, `Receipt sent to email.`, `Could not send the email.`, `Email receipt`) for every new empty (no em-dash); `pnpm lingui:compile` → en 0 missing. Commit `src/locales`.
- [ ] Add a one-line env note to the integrations settings page or a `docs/` note: set `RESEND_API_KEY` (+ optional `RESEND_FROM`) in the Convex deployment env to enable email receipts. (A short comment/doc, no secret committed.)

---

### Task 4: Final verification
- [ ] `pnpm typecheck` PASS; `pnpm test` PASS; `pnpm lingui:compile` en 0 missing; `git status` clean (no route change → no routeTree).
- [ ] **Manual sanity:** with `RESEND_API_KEY` set, open a paid order receipt → enter an email → Kirim email → success toast + the email arrives (English receipt). Without the key → a clear "Email belum dikonfigurasi" toast (no crash). An invalid email is rejected.

---

## Self-Review
**Spec coverage:** pure English builder text+html (T1); Resend action env-gated + owner-scoped (T1); send form on receipt preview (T2); tests builder + no-key guard (T1); i18n + env note (T3). ✓
**Placeholder scan:** "mirror receipt-preview layout / xendit fetch". Else spec code.
**Type consistency:** `buildReceiptText/Html(order, cafe)` consume the `getById`/`myCafe` fields; `sendReceipt({orderId, to})` ↔ the receipt-preview `useAction` call. Receipt content English; UI BI; no em-dash. ✓
